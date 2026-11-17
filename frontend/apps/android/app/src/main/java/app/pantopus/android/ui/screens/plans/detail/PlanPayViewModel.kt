package app.pantopus.android.ui.screens.plans.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.payments.PaymentIntentSheetParamsDto
import app.pantopus.android.data.api.models.plans.AskToJoinBody
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanQuoteBody
import app.pantopus.android.data.api.models.plans.PlanQuoteDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlansRepository
import app.pantopus.android.data.plans.planCode
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.screens.plans.PlansRoutes
import app.pantopus.android.ui.screens.settings.payments.CheckoutOutcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

/** P1's state: the party, the server's quote for it, and where paying stands. */
data class PlanPayUi(
    val partySize: Int = 1,
    val quote: PlanQuoteDto? = null,
    val quoteLoading: Boolean = false,
    /** The quote couldn't be read: the server's words. */
    val quoteError: String? = null,
    /** Join, the payment sheet or the confirm is on its way. */
    val paying: Boolean = false,
    /** Under the button: a declined card, "That took a while. Start again.", "This payment hasn't gone through yet." */
    val error: String? = null,
)

/** What the page does next, once. */
sealed interface PlanPayEvent {
    /** Open the shipped payment sheet. */
    data class PresentCheckout(
        val params: PaymentIntentSheetParamsDto,
    ) : PlanPayEvent

    /** Done: in ([reveal]) or not ([notice], the server's sentence: "This filled while you were paying. …"). */
    data class Done(
        val reveal: Boolean,
        val notice: String?,
    ) : PlanPayEvent
}

/**
 * Plans for the holidays, the business track, B2 and B4: P1, paying to join a business's plan (07-screens P1, contract
 * 10.2). The amounts are the server's quote, asked again whenever the party changes; joining answers the payment for
 * the shipped payment sheet; when it closes, `requests/mine/confirm` lets the guest in once the payment went through.
 * The app never sends an amount and never multiplies one.
 */
@HiltViewModel
class PlanPayViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: PlansRepository,
    ) : ViewModel() {
        private val planId: String = savedStateHandle.get<String>(PlansRoutes.PLAN_ID_KEY).orEmpty()

        /** How the person came to the plan, when the app knows (`business_page`), sent with the join. */
        private val via: String? = savedStateHandle.get<String>(PlansRoutes.VIA_KEY)?.takeIf { it == PlansRoutes.VIA_BUSINESS_PAGE }

        private val _ui = MutableStateFlow(PlanPayUi())
        val ui: StateFlow<PlanPayUi> = _ui.asStateFlow()
        private val _events = MutableSharedFlow<PlanPayEvent>(extraBufferCapacity = 1)
        val events: SharedFlow<PlanPayEvent> = _events.asSharedFlow()

        private var quoteJob: Job? = null

        /** When the payment's held spot runs out (10 minutes from joining). */
        private var holdExpiresAt: Instant? = null

        /** P1 opens: the party a held spot was for (or one), and its quote. */
        fun start(plan: PlanDto) {
            val party = plan.myRequest?.partySize?.coerceAtLeast(1) ?: 1
            holdExpiresAt = PlanFormat.instant(plan.myRequest?.holdExpiresAt)
            _ui.value = PlanPayUi(partySize = party)
            readQuote(party)
        }

        /** Another party: the server quotes it again. */
        fun setParty(size: Int) {
            if (size == _ui.value.partySize || _ui.value.paying) return
            _ui.update { it.copy(partySize = size, error = null) }
            readQuote(size)
        }

        private fun readQuote(size: Int) {
            quoteJob?.cancel()
            _ui.update { it.copy(quoteLoading = true, quoteError = null) }
            quoteJob =
                viewModelScope.launch {
                    when (val result = repository.quote(planId, PlanQuoteBody(partySize = size))) {
                        is NetworkResult.Success -> _ui.update { it.copy(quote = result.data, quoteLoading = false) }
                        is NetworkResult.Failure ->
                            _ui.update { it.copy(quote = null, quoteLoading = false, quoteError = result.error.planMessage) }
                    }
                }
        }

        /** "Pay {amount}": join (a held spot and its payment; the same payment while one is held), then the sheet. */
        fun pay(plan: PlanDto) {
            val ui = _ui.value
            if (ui.paying || ui.quote == null) return
            _ui.update { it.copy(paying = true, error = null) }
            viewModelScope.launch {
                val body = AskToJoinBody(partySize = ui.partySize, via = via.takeIf { plan.business != null })
                when (val result = repository.ask(planId, body)) {
                    is NetworkResult.Success -> {
                        val payment = result.data.payment
                        holdExpiresAt = PlanFormat.instant(result.data.request?.holdExpiresAt) ?: holdExpiresAt
                        if (payment?.clientSecret == null) {
                            // Nothing to pay (the waitlist, or already in): the page reads the plan again.
                            _ui.update { it.copy(paying = false) }
                            _events.tryEmit(PlanPayEvent.Done(reveal = false, notice = null))
                            return@launch
                        }
                        _events.tryEmit(
                            PlanPayEvent.PresentCheckout(
                                PaymentIntentSheetParamsDto(
                                    clientSecret = payment.clientSecret,
                                    paymentIntentId = payment.paymentId,
                                    customer = payment.customerId,
                                    ephemeralKey = payment.ephemeralKey,
                                    publishableKey = payment.publishableKey,
                                ),
                            ),
                        )
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(paying = false, error = result.error.planMessage) }
                }
            }
        }

        /** The payment sheet closed. Paid: confirm with the server. Cancelled: back on P1. Declined: why, under the button. */
        fun onCheckoutOutcome(outcome: CheckoutOutcome) {
            when (outcome) {
                CheckoutOutcome.Paid -> confirm()
                CheckoutOutcome.Canceled -> _ui.update { it.copy(paying = false, error = heldTooLong()) }
                is CheckoutOutcome.Declined ->
                    _ui.update { it.copy(paying = false, error = heldTooLong() ?: outcome.message ?: "Your card was declined.") }
            }
        }

        /** "That took a while. Start again." once the held spot ran out (the next "Pay" starts a new hold). */
        private fun heldTooLong(): String? = holdExpiresAt?.takeIf { Instant.now().isAfter(it) }?.let { HELD_TOO_LONG }

        private fun confirm() {
            viewModelScope.launch {
                when (val result = repository.confirmMine(planId)) {
                    is NetworkResult.Success -> {
                        _ui.update { it.copy(paying = false) }
                        _events.tryEmit(PlanPayEvent.Done(reveal = true, notice = null))
                    }
                    is NetworkResult.Failure ->
                        when (result.error.planCode) {
                            // The hold ran out and the plan filled, or it takes nobody now: the payment goes back by itself.
                            "full", "ended" -> {
                                _ui.update { it.copy(paying = false) }
                                _events.tryEmit(PlanPayEvent.Done(reveal = false, notice = result.error.planMessage))
                            }
                            else -> _ui.update { it.copy(paying = false, error = result.error.planMessage) }
                        }
                }
            }
        }

        private companion object {
            const val HELD_TOO_LONG = "That took a while. Start again."
        }
    }
