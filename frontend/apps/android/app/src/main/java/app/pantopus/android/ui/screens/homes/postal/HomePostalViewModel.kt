package app.pantopus.android.ui.screens.homes.postal

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.homes.HomeResidencyAddressSnapshot
import app.pantopus.android.data.api.models.homes.PersonalHomeResidencyProgress
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.homes.HomeFastVerifyRepository
import app.pantopus.android.data.homes.HomePostalKind
import app.pantopus.android.data.homes.HomePostalOutcome
import app.pantopus.android.data.homes.HomePostalStatus
import app.pantopus.android.data.homes.HomeResidencyProgressRepository
import app.pantopus.android.data.homes.PendingHomePostalCommand
import app.pantopus.android.ui.screens.homes.claim_review.HomeClaimSessionScopeFactory
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import javax.inject.Inject

enum class HomePostalNavigation { Home, Residency, Ownership, AddHome, Document, AddressWrong }

enum class HomePostalAddressField { Line1, Line2, City, State, Zip, Country }

data class HomePostalAddressForm(
    val line1: String = "",
    val line2: String = "",
    val city: String = "",
    val state: String = "",
    val zip: String = "",
    val country: String = "US",
) {
    constructor(address: HomeResidencyAddressSnapshot) :
        this(address.line1, address.line2, address.city, address.state, address.postalCode, address.country)

    val snapshot: HomeResidencyAddressSnapshot get() = HomeResidencyAddressSnapshot(line1, line2, city, state, zip, country)

    val isBlank: Boolean get() = listOf(line1, line2, city, state, zip).all(String::isBlank)

    fun changing(
        field: HomePostalAddressField,
        value: String,
    ): HomePostalAddressForm =
        when (field) {
            HomePostalAddressField.Line1 -> copy(line1 = value)
            HomePostalAddressField.Line2 -> copy(line2 = value)
            HomePostalAddressField.City -> copy(city = value)
            HomePostalAddressField.State -> copy(state = value)
            HomePostalAddressField.Zip -> copy(zip = value)
            HomePostalAddressField.Country -> copy(country = value)
        }
}

data class HomePostalUiState(
    val working: Boolean = false,
    val opened: Boolean = false,
    val status: HomePostalStatus? = null,
    val progress: PersonalHomeResidencyProgress? = null,
    val pending: PendingHomePostalCommand? = null,
    val outcome: HomePostalOutcome? = null,
    val storageFailed: Boolean = false,
    val error: String? = null,
    val address: HomePostalAddressForm = HomePostalAddressForm(),
    val codeInput: String = "",
    val confirmsMail: Boolean = false,
    val confirmsCancellation: Boolean = false,
    /** Faster home verification is on here (`verify-options` answered): the request is one tap ("Mail my postcard"). */
    val oneTap: Boolean = false,
    /** The card's QR picture and "This wasn't me" are on (`home_postcard_scan`). */
    val postcardScan: Boolean = false,
    /** A scanned card's code that this account has no card to enter it on: "Did you ask for this card?". */
    val unmatchedScan: Boolean = false,
    /**
     * The server answered that this account has no card or place at the scanned card's home: the status can't be read
     * by design, so the page shows no status error and no "Try again" (a failed connection still does).
     */
    val scanNotMine: Boolean = false,
    /** "This wasn't me" went through. */
    val reported: Boolean = false,
    val reporting: Boolean = false,
) {
    /** One tap: the Home's saved address goes back as it came, with no form to fill. */
    val showsOneTap: Boolean get() = oneTap && status?.canRequest == true && status.mailingAddress != null
}

@HiltViewModel
@Suppress("TooManyFunctions") // Today's postal steps plus the one tap and the scanned card's report.
class HomePostalViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val factory: HomePostalFactory,
        private val residency: HomeResidencyProgressRepository,
        sessions: HomeClaimSessionScopeFactory,
        private val fastVerify: HomeFastVerifyRepository,
    ) : ViewModel() {
        val homeId = savedStateHandle.get<String>("homeId").orEmpty().lowercase()
        private val session = sessions.create(viewModelScope)
        private val coordinator = factory.create(session, homeId)
        private var generation = 0L
        private var visible = false
        private var job: Job? = null

        /** The code a scanned card's link carried (FASTVERIFY): filled in while this account has that card to enter. */
        private var scannedCode: String? = ScannedPostcardCode.take(homeId)

        /** "This wasn't me" went through. Kept here, as the scanned code is: the screen's state is cleared whenever it is left. */
        private var scanReported = false
        private val _state = MutableStateFlow(HomePostalUiState())
        val state = _state.asStateFlow()
        val originalMailAddress: HomeResidencyAddressSnapshot? get() =
            _state.value.pending?.takeIf { it.kind == HomePostalKind.Mail }?.let { factory.codec.mailing(it).address }

        init {
            viewModelScope.launch {
                session.invalidated.collect { if (it) suspendContent() }
            }
        }

        val canAcknowledge: Boolean get() =
            current(generation) && !_state.value.working &&
                _state.value.pending?.outcome?.isTerminal == true && !_state.value.storageFailed
        val canRequestMail: Boolean get() = ready && _state.value.status?.canRequest == true && _state.value.address.snapshot.isValid()
        val canResumeMail: Boolean get() = ready && _state.value.status?.canResume == true
        val canVerifyCode: Boolean get() =
            ready && _state.value.status?.canVerify == true &&
                _state.value.codeInput.matches(Regex("^[a-zA-Z0-9]{6,8}$"))
        private val ready: Boolean get() =
            current(generation) && _state.value.opened && !_state.value.working &&
                _state.value.pending == null && !_state.value.storageFailed && _state.value.status != null && _state.value.progress != null

        fun suspendContent() {
            generation++
            visible = false
            job?.cancel()
            job = null
            coordinator.hide()
            _state.value = HomePostalUiState()
        }

        fun open() {
            if (_state.value.working) return
            visible = true
            _state.update { it.copy(status = null, progress = null) }
            perform { revision ->
                coordinator.restore()
                publishOriginal(revision)
                _state.update { it.copy(opened = true) }
                if (coordinator.pending != null) coordinator.resolve(HomePostalAction.Check) else loadCurrent(revision)
            }
        }

        fun updateAddress(
            field: HomePostalAddressField,
            value: String,
        ) {
            if (ready && _state.value.status?.canRequest == true) _state.update { it.copy(address = it.address.changing(field, value)) }
        }

        fun updateCode(value: String) {
            if (ready && _state.value.status?.canVerify == true) _state.update { it.copy(codeInput = value) }
        }

        fun reviewMail() {
            if (canRequestMail) _state.update { it.copy(confirmsMail = true) }
        }

        /** "Mail my postcard": the saved address, sent as it came, with no second question (FASTVERIFY one tap). */
        fun requestMailOneTap() {
            if (!_state.value.showsOneTap || !canRequestMail) return
            _state.update { it.copy(confirmsMail = true) }
            requestMail()
        }

        /** "This wasn't me" for the scanned card: it is stopped and looked into; the answer says the same whatever. */
        fun reportScannedCard() {
            val code = scannedCode ?: return
            if (_state.value.reporting || _state.value.reported) return
            _state.update { it.copy(reporting = true) }
            viewModelScope.launch {
                val recorded = fastVerify.reportPostcard(homeId, code)
                if (recorded) {
                    scannedCode = null
                    scanReported = true
                }
                _state.update {
                    it.copy(
                        reporting = false,
                        reported = recorded,
                        error = if (recorded) it.error else "Couldn't send that. Try again.",
                    )
                }
            }
        }

        fun dismissConfirmation() {
            _state.update { it.copy(confirmsMail = false, confirmsCancellation = false) }
        }

        fun requestMail() {
            if (!canRequestMail || !_state.value.confirmsMail) return
            val selected = _state.value.address.snapshot
            dismissConfirmation()
            perform { revision ->
                clearCurrent()
                coordinator.prepareMail(selected)
                publishOriginal(revision)
                coordinator.resolve(HomePostalAction.Submit)
            }
        }

        fun resumeMail() {
            if (!canResumeMail) return
            val original = _state.value.status?.request ?: return
            val selected = original.address ?: return
            perform { revision ->
                clearCurrent()
                coordinator.prepareMail(selected, original.command.requestId)
                publishOriginal(revision)
                coordinator.resolve(HomePostalAction.Submit)
            }
        }

        fun verifyCode() {
            if (!canVerifyCode) return
            val postcard = _state.value.status?.postcard ?: return
            val code = _state.value.codeInput
            // The scanned code is used once; a wrong one is typed again by hand.
            scannedCode = null
            _state.update { it.copy(codeInput = "") }
            perform { revision ->
                clearCurrent()
                coordinator.prepareCode(code, postcard.id)
                publishOriginal(revision)
                coordinator.resolve(HomePostalAction.Submit)
            }
        }

        fun reviewCancellation() {
            if (current(generation) && !_state.value.working && _state.value.pending != null) {
                _state.update { it.copy(confirmsCancellation = true) }
            }
        }

        fun confirmCancellation() {
            if (!_state.value.confirmsCancellation) return
            dismissConfirmation()
            recover(HomePostalAction.Cancel)
        }

        fun recover(action: HomePostalAction) {
            if (_state.value.pending == null) {
                open()
                return
            }
            perform { coordinator.resolve(action) }
        }

        fun acknowledge() {
            if (!canAcknowledge) return
            perform { revision ->
                val original = coordinator.acknowledge()
                if (original.kind == HomePostalKind.Mail) {
                    val address = factory.codec.mailing(original).address
                    _state.update {
                        it.copy(
                            address =
                                HomePostalAddressForm(
                                    address.line1,
                                    address.line2,
                                    address.city,
                                    address.state,
                                    address.postalCode,
                                    address.country,
                                ),
                        )
                    }
                }
                publishOriginal(revision)
                loadCurrent(revision)
            }
        }

        fun permits(destination: HomePostalNavigation): Boolean {
            if (!ready) return false
            val progress = _state.value.progress ?: return false
            return when (destination) {
                HomePostalNavigation.Home -> progress.nextStep == "home" && progress.currentAccess == "shared"
                HomePostalNavigation.Residency -> true
                HomePostalNavigation.Ownership -> progress.nextStep == "ownership_verification"
                HomePostalNavigation.AddHome -> progress.nextStep == "resubmit"
                HomePostalNavigation.Document -> mailEnded || _state.value.status?.postcard?.mailState == "delayed"
                HomePostalNavigation.AddressWrong -> mailEnded
            }
        }

        /** The mail couldn't prove this address, so the screen offers the ways on. */
        val mailEnded: Boolean
            get() {
                val status = _state.value.status
                val mailState = status?.postcard?.mailState
                return mailState in setOf("returned", "rerouted", "failed") || status?.restriction == "POSTCARD_RETURNED_LIMIT"
            }

        private fun current(revision: Long): Boolean = visible && generation == revision && session.isCurrent

        private fun clearCurrent() {
            _state.update { it.copy(status = null, progress = null) }
        }

        private suspend fun loadCurrent(revision: Long) {
            clearCurrent()
            val postal = factory.current(coordinator.scope)
            session.requireCurrent()
            check(current(revision))
            val progress = residency.progress(homeId)
            session.requireCurrent()
            check(current(revision) && progress is NetworkResult.Success)
            // A request must repeat the Home's saved address, so an empty form starts from it.
            val saved = postal.mailingAddress?.takeIf { postal.canRequest }
            // Faster home verification: one tap, and the scanned card's QR answers. Null keeps today's screen.
            val options = fastVerify.refresh(homeId)
            session.requireCurrent()
            check(current(revision))
            val scanned = scannedCode
            _state.update {
                val address = if (saved != null && it.address.isBlank) HomePostalAddressForm(saved) else it.address
                it.copy(
                    status = postal,
                    progress = progress.data,
                    address = address,
                    oneTap = options != null,
                    postcardScan = options?.postcardScan == true,
                    // A scanned card fills the code field when this account has a card to enter it on.
                    codeInput = if (scanned != null && postal.canVerify && it.codeInput.isEmpty()) scanned else it.codeInput,
                    unmatchedScan = (scanned != null && !postal.canVerify) || scanReported,
                    scanNotMine = false,
                    reported = scanReported,
                )
            }
        }

        private fun publishOriginal(revision: Long) {
            if (!current(revision)) return
            _state.update {
                it.copy(
                    pending = coordinator.pending,
                    outcome = coordinator.outcome,
                    storageFailed = coordinator.storageFailed,
                )
            }
        }

        /**
         * An action failed. A scanned card this account can't open still offers "This wasn't me", and keeps its thanks
         * after it. When the server [answered] (anything but a failed connection), the card's status is kept from this
         * account on purpose, so there is no status error to show and nothing to try again.
         */
        private fun actionFailed(
            revision: Long,
            answered: Boolean,
        ) {
            if (!visible || revision != generation) return
            _state.update {
                val scan = (scannedCode != null || scanReported) && it.status == null
                // Only the plain status error is left out: a changed sign-in, a storage failure or an attempt of
                // this account's own still says so.
                val plain = session.isCurrent && !coordinator.storageFailed && coordinator.pending == null
                val notMine = scan && answered && plain
                val words = HomePostalMessages.recovery(session.isCurrent, coordinator.storageFailed, coordinator.pending != null)
                it.copy(unmatchedScan = scan, scanNotMine = notMine, reported = scanReported, error = words.takeUnless { notMine })
            }
        }

        private fun perform(action: suspend (Long) -> Unit) {
            if (!visible || _state.value.working) return
            val revision = generation
            _state.update { it.copy(working = true, error = null) }
            job =
                viewModelScope.launch {
                    try {
                        session.requireCurrent()
                        check(coordinator.scope.isValid())
                        action(revision)
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (_: IOException) {
                        actionFailed(revision, answered = false)
                    } catch (_: Exception) {
                        actionFailed(revision, answered = true)
                    } finally {
                        if (visible && revision == generation) {
                            publishOriginal(revision)
                            _state.update { it.copy(working = false) }
                        }
                    }
                }
        }
    }
