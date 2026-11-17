package app.pantopus.android.ui.screens.plans.checks

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.PlanChecksDto
import app.pantopus.android.data.api.models.plans.PlanChecksRowDto
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanSendCheckBody
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanChecksRepository
import app.pantopus.android.data.plans.PlansRepository
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.screens.plans.PlansRoutes
import app.pantopus.android.ui.screens.plans.host.centsOf
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

/** C3's filter: "All", "Not paid", "Paid". */
enum class PlanChecksFilter(
    val wire: String,
    val label: String,
) {
    ALL("all", "All"),
    NOT_PAID("not_paid", "Not paid"),
    PAID("paid", "Paid"),
}

/** C3's state. */
data class PlanChecksUi(
    val loading: Boolean = true,
    val failed: String? = null,
    val plan: PlanDto? = null,
    val list: PlanChecksDto? = null,
    val filter: PlanChecksFilter = PlanChecksFilter.ALL,
    /** "Send a check" is open for this guest. */
    val sendingTo: PlanChecksRowDto? = null,
    /** The paid guest whose refund sheet is open. */
    val refunding: PlanChecksRowDto? = null,
    val busy: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
) {
    /** The rows the filter keeps, in the server's order. */
    val rows: List<PlanChecksRowDto>
        get() =
            list?.rows.orEmpty().filter { row ->
                when (filter) {
                    PlanChecksFilter.ALL -> true
                    PlanChecksFilter.NOT_PAID -> row.state == STATE_NONE || row.state == STATE_SENT
                    PlanChecksFilter.PAID -> row.state == STATE_PAID || row.state == STATE_REFUNDED
                }
            }
}

internal const val STATE_NONE = "none"
internal const val STATE_SENT = "sent"
internal const val STATE_PAID = "paid"
internal const val STATE_REFUNDED = "refunded"

/**
 * Plans for the holidays, the business track, B5: C3, the business's guest list with money (07-screens, picture 14), for
 * staff with plans.manage. The totals, the rows' words and the note are the server's (`GET …/checks`), read again every 5
 * seconds while the list is open (the payment reaches staff without a socket). "Send a check" and "Refund" post to the
 * server and show its answer.
 */
@HiltViewModel
class PlanChecksViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: PlansRepository,
        private val checksRepository: PlanChecksRepository,
    ) : ViewModel() {
        private val planId: String = savedStateHandle.get<String>(PlansRoutes.PLAN_ID_KEY).orEmpty()
        private val _ui = MutableStateFlow(PlanChecksUi())
        val ui: StateFlow<PlanChecksUi> = _ui.asStateFlow()
        private var polling: Job? = null

        /** While the list is on screen: read it now and every 5 seconds. */
        fun startPolling() {
            if (polling?.isActive == true) return
            polling =
                viewModelScope.launch {
                    if (_ui.value.plan == null) {
                        (repository.plan(planId) as? NetworkResult.Success)?.data?.let { plan -> _ui.update { it.copy(plan = plan) } }
                    }
                    while (isActive) {
                        read()
                        delay(POLL_MS)
                    }
                }
        }

        fun stopPolling() {
            polling?.cancel()
            polling = null
        }

        private suspend fun read() {
            when (val result = checksRepository.checks(planId)) {
                is NetworkResult.Success -> _ui.update { it.copy(loading = false, failed = null, list = result.data) }
                // A failed read after a good one keeps the list on screen; the next read tries again.
                is NetworkResult.Failure ->
                    _ui.update { it.copy(loading = false, failed = if (it.list != null) null else result.error.planMessage) }
            }
        }

        fun setFilter(filter: PlanChecksFilter) = _ui.update { it.copy(filter = filter) }

        /** "Send a check" for [row] (or the footer's, for the first guest without one). */
        fun openSend(row: PlanChecksRowDto?) {
            val target = row ?: _ui.value.list?.rows?.firstOrNull { it.state == STATE_NONE }
            if (target == null) {
                _ui.update { it.copy(notice = "Everyone who's in has a check.") }
                return
            }
            _ui.update { it.copy(sendingTo = target, error = null) }
        }

        fun closeSend() = _ui.update { it.copy(sendingTo = null, error = null) }

        /** Sends the check: the amount on the bill and the part the deal doesn't cover, as typed in dollars. */
        fun send(
            amount: String,
            noDeal: String,
        ) {
            val row = _ui.value.sendingTo ?: return
            val cents = centsOf(amount)
            val noDealCents = if (noDeal.isBlank()) 0 else centsOf(noDeal)
            if (cents == null || cents <= 0 || noDealCents == null) {
                _ui.update { it.copy(error = "Type the amount on the bill.") }
                return
            }
            if (_ui.value.busy) return
            _ui.update { it.copy(busy = true, error = null) }
            viewModelScope.launch {
                val body = PlanSendCheckBody(requestId = row.requestId, amountCents = cents, noDealCents = noDealCents)
                when (val result = checksRepository.sendCheck(planId, body)) {
                    is NetworkResult.Success -> {
                        _ui.update { it.copy(busy = false, sendingTo = null) }
                        read()
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(busy = false, error = result.error.planMessage) }
                }
            }
        }

        fun openRefund(row: PlanChecksRowDto) = _ui.update { it.copy(refunding = row, error = null) }

        fun closeRefund() = _ui.update { it.copy(refunding = null, error = null) }

        /** Refunds the guest's paid check: all of it ([dollars] null), or a part typed in dollars. */
        fun refund(dollars: String?) {
            val row = _ui.value.refunding ?: return
            val checkId = row.check?.id ?: return
            val cents = dollars?.let(::centsOf)
            if (dollars != null && cents == null) {
                _ui.update { it.copy(error = "Type the amount in dollars.") }
                return
            }
            if (_ui.value.busy) return
            _ui.update { it.copy(busy = true, error = null) }
            viewModelScope.launch {
                when (val result = checksRepository.refundCheck(planId, checkId, cents)) {
                    is NetworkResult.Success -> _ui.update { it.copy(busy = false, refunding = null, list = result.data) }
                    is NetworkResult.Failure -> _ui.update { it.copy(busy = false, error = result.error.planMessage) }
                }
            }
        }

        fun noticeShown() = _ui.update { it.copy(notice = null) }

        private companion object {
            const val POLL_MS = 5_000L
        }
    }
