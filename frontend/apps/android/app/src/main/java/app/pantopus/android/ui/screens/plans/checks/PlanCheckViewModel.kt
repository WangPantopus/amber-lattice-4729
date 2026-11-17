package app.pantopus.android.ui.screens.plans.checks

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.payments.PaymentIntentSheetParamsDto
import app.pantopus.android.data.api.models.plans.PlanCheckDto
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanChecksRepository
import app.pantopus.android.data.plans.PlansRepository
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.screens.plans.PlansRoutes
import app.pantopus.android.ui.screens.plans.host.centsOf
import app.pantopus.android.ui.screens.settings.payments.CheckoutOutcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** C1's tip: none chosen yet, one of the server's percents, "Another amount", or "No tip". */
sealed interface PlanTip {
    data object Unchosen : PlanTip

    data class Percent(
        val index: Int,
        val cents: Int,
    ) : PlanTip

    data class Other(
        val cents: Int,
    ) : PlanTip

    data object NoTip : PlanTip
}

/** C1 and C2's state. */
data class PlanCheckUi(
    val loading: Boolean = true,
    val failed: String? = null,
    val plan: PlanDto? = null,
    /** The check as the server last answered it; with a tip chosen, its quote with that tip (the lines and the total). */
    val check: PlanCheckDto? = null,
    /** No check yet and the guest may start one ("What's your total?", no deal on the bill). */
    val canStart: Boolean = false,
    val tip: PlanTip = PlanTip.Unchosen,
    val quoting: Boolean = false,
    val paying: Boolean = false,
    val error: String? = null,
)

/** What the screen does next, once. */
sealed interface PlanCheckEvent {
    data class PresentCheckout(
        val params: PaymentIntentSheetParamsDto,
    ) : PlanCheckEvent
}

/**
 * Plans for the holidays, the business track, B5: C1, the check, and C2, paid (07-screens, pictures 12 and 13). The lines,
 * the tip choices and every total are the server's: a tip is quoted by the server (`…/quote`) before the button shows
 * what it costs, and `…/pay` answers the payment and the check as it will be paid. The app never adds a tip or takes
 * off a discount.
 */
@HiltViewModel
class PlanCheckViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: PlansRepository,
        private val checksRepository: PlanChecksRepository,
    ) : ViewModel() {
        private val planId: String = savedStateHandle.get<String>(PlansRoutes.PLAN_ID_KEY).orEmpty()
        private val _ui = MutableStateFlow(PlanCheckUi())
        val ui: StateFlow<PlanCheckUi> = _ui.asStateFlow()
        private val _events = MutableSharedFlow<PlanCheckEvent>(extraBufferCapacity = 1)
        val events: SharedFlow<PlanCheckEvent> = _events.asSharedFlow()
        private var quoteJob: Job? = null

        /** Reads the plan (for the business's name) and the guest's check. */
        fun load() {
            viewModelScope.launch {
                val plan = async { repository.plan(planId) }
                val mine = async { checksRepository.myCheck(planId) }
                val planResult = plan.await()
                when (val result = mine.await()) {
                    is NetworkResult.Success ->
                        _ui.update { current ->
                            val fresh = result.data.check
                            current.copy(
                                loading = false,
                                failed = null,
                                plan = (planResult as? NetworkResult.Success)?.data ?: current.plan,
                                // A tip chosen on this visit keeps its quote while the same check is open.
                                check = if (keepsQuote(current, fresh)) current.check else fresh,
                                tip = if (current.check?.id == fresh?.id) current.tip else PlanTip.Unchosen,
                                canStart = result.data.canStart,
                            )
                        }
                    is NetworkResult.Failure -> _ui.update { it.copy(loading = false, failed = result.error.planMessage) }
                }
            }
        }

        /** The same open check with a tip chosen on this visit keeps its quote (the lines with that tip). */
        private fun keepsQuote(
            current: PlanCheckUi,
            fresh: PlanCheckDto?,
        ): Boolean = fresh != null && current.check?.id == fresh.id && current.tip != PlanTip.Unchosen && fresh.state == OPEN

        /** "What's your total?": the guest starts their own check (no deal on the bill). */
        fun start(dollars: String) {
            val cents = centsOf(dollars)
            if (cents == null || cents <= 0) {
                _ui.update { it.copy(error = "Type the total on your bill.") }
                return
            }
            if (_ui.value.quoting) return
            _ui.update { it.copy(quoting = true, error = null) }
            viewModelScope.launch {
                when (val result = checksRepository.startCheck(planId, cents)) {
                    is NetworkResult.Success -> _ui.update { it.copy(quoting = false, check = result.data.check, tip = PlanTip.Unchosen) }
                    is NetworkResult.Failure -> _ui.update { it.copy(quoting = false, error = result.error.planMessage) }
                }
            }
        }

        /** A tip choice: the server quotes the check with it (the "Tip, 18%" line and "You pay"). */
        fun chooseTip(tip: PlanTip) {
            val check = _ui.value.check ?: return
            if (_ui.value.paying) return
            val cents =
                when (tip) {
                    is PlanTip.Percent -> tip.cents
                    is PlanTip.Other -> tip.cents
                    PlanTip.NoTip -> 0
                    PlanTip.Unchosen -> return
                }
            _ui.update { it.copy(tip = tip, quoting = true, error = null) }
            quoteJob?.cancel()
            quoteJob =
                viewModelScope.launch {
                    when (val result = checksRepository.quoteCheck(planId, check.id, cents)) {
                        is NetworkResult.Success -> _ui.update { it.copy(quoting = false, check = result.data.check ?: it.check) }
                        is NetworkResult.Failure ->
                            _ui.update { it.copy(quoting = false, tip = PlanTip.Unchosen, error = result.error.planMessage) }
                    }
                }
        }

        /** "Another amount": dollars typed in the dialog. */
        fun chooseOther(dollars: String) {
            val cents = centsOf(dollars)
            if (cents == null || cents <= 0) {
                _ui.update { it.copy(error = "Type the tip in dollars.") }
                return
            }
            chooseTip(PlanTip.Other(cents))
        }

        /** "Pay {amount}": the server answers the payment and the check as it will be paid; then the shipped sheet. */
        fun pay() {
            val ui = _ui.value
            val check = ui.check ?: return
            val needsTip = check.tipsOn && ui.tip == PlanTip.Unchosen
            if (ui.paying || ui.quoting || needsTip) return
            val tipCents =
                when (val tip = ui.tip) {
                    is PlanTip.Percent -> tip.cents
                    is PlanTip.Other -> tip.cents
                    else -> 0
                }
            _ui.update { it.copy(paying = true, error = null) }
            viewModelScope.launch {
                when (val result = checksRepository.payCheck(planId, check.id, tipCents)) {
                    is NetworkResult.Success -> {
                        val payment = result.data.payment
                        _ui.update { it.copy(check = result.data.check ?: it.check) }
                        if (payment?.clientSecret == null) {
                            _ui.update { it.copy(paying = false, error = "This check can't be paid right now.") }
                            return@launch
                        }
                        _events.tryEmit(
                            PlanCheckEvent.PresentCheckout(
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

        /** The sheet closed. Paid: the server confirms and answers the paid check (C2). */
        fun onCheckoutOutcome(outcome: CheckoutOutcome) {
            val check = _ui.value.check ?: return
            when (outcome) {
                CheckoutOutcome.Paid ->
                    viewModelScope.launch {
                        when (val result = checksRepository.confirmCheck(planId, check.id)) {
                            is NetworkResult.Success -> _ui.update { it.copy(paying = false, check = result.data.check ?: it.check) }
                            is NetworkResult.Failure -> _ui.update { it.copy(paying = false, error = result.error.planMessage) }
                        }
                    }
                CheckoutOutcome.Canceled -> _ui.update { it.copy(paying = false) }
                is CheckoutOutcome.Declined -> _ui.update { it.copy(paying = false, error = outcome.message ?: "Your card was declined.") }
            }
        }

        private companion object {
            const val OPEN = "open"
        }
    }
