@file:Suppress("TooManyFunctions")

package app.pantopus.android.ui.screens.plans.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.AskToJoinBody
import app.pantopus.android.data.api.models.plans.PlanBringResponse
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanInviteListDto
import app.pantopus.android.data.api.models.plans.PlanRequestsResponse
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.blocks.BlocksRepository
import app.pantopus.android.data.homes.HomesRepository
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlanKind
import app.pantopus.android.data.plans.PlanLocationResolver
import app.pantopus.android.data.plans.PlanOrigin
import app.pantopus.android.data.plans.PlanRead
import app.pantopus.android.data.plans.PlanRepeatWords
import app.pantopus.android.data.plans.PlanRequestStatus
import app.pantopus.android.data.plans.PlanViewerStanding
import app.pantopus.android.data.plans.PlansEvents
import app.pantopus.android.data.plans.PlansFeature
import app.pantopus.android.data.plans.PlansRepository
import app.pantopus.android.data.plans.hasPrivatePart
import app.pantopus.android.data.plans.isDrawable
import app.pantopus.android.data.plans.planCode
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.data.plans.standing
import app.pantopus.android.data.plans.takesKids
import app.pantopus.android.ui.screens.place.HubVerificationTarget
import app.pantopus.android.ui.screens.plans.PlansRoutes
import app.pantopus.android.ui.screens.plans.plansVerificationTarget
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** What the plan page shows. */
sealed interface PlanDetailUiState {
    data object Loading : PlanDetailUiState

    /** [fresh] is false while only the card from the map or a list is on screen. */
    data class Ready(
        val plan: PlanDto,
        val fresh: Boolean,
    ) : PlanDetailUiState

    /** A playdate shared with someone who can't see it yet (board J9); [invitedBy] is the host's first name when they invited them. */
    data class PlaydateLocked(
        val city: String?,
        val invitedBy: String? = null,
    ) : PlanDetailUiState

    /** Removed, cancelled and hidden, or blocked: nothing to show. */
    data object Gone : PlanDetailUiState

    data class Failed(
        val message: String,
    ) : PlanDetailUiState
}

/** The "Ask to join" sheet (J3, J4). */
data class AskDraft(
    val partySize: Int = 1,
    val note: String = "",
    val kidsCount: Int = 1,
    val ageBands: Set<String> = emptySet(),
    /** "I'll stay with my kids": the parent ticks it for a new ask (as on iOS); an edited ask kept it. */
    val staysWithKids: Boolean = false,
    /** Plans for the holidays (A7): kids coming, 0 to 10, on a plan with kids welcome ([partySize] is then the adults). */
    val kids: Int = 0,
    val sending: Boolean = false,
    val error: String? = null,
)

/** The whole page. */
data class PlanDetailUi(
    val state: PlanDetailUiState = PlanDetailUiState.Loading,
    val askOpen: Boolean = false,
    val ask: AskDraft = AskDraft(),
    val busy: Boolean = false,
    val notice: String? = null,
    val reveal: Boolean = false,
    val cancelOpen: Boolean = false,
    val cancelNote: String = "",
    val others: List<PlanDto> = emptyList(),
    /** The host's view of who asked (H9's requests card, the waitlist). */
    val requests: PlanRequestsResponse? = null,
    /** The person looking, to tell "you" apart in the people going. */
    val viewerId: String? = null,
    /** "Bring a friend" (Plans step 1): the guest's one link, ready for their share sheet. */
    val friendLink: PlanTextInvite? = null,
    /** The guest made their friend link on this visit (the card's `used` says so after the next read too). */
    val friendInvited: Boolean = false,
    val makingFriendLink: Boolean = false,
    /** A repeating plan's next date to open in this one's place, once skipping it posted one (Plans step 2). */
    val nextPlanId: String? = null,
    /** Plans for the holidays (A6): the host's answers, read when the card carries `answers` (H1 is on for them). */
    val guests: PlanInviteListDto? = null,
    /** "Remind the {n} who haven't answered" is on its way. */
    val reminding: Boolean = false,
    /** Today's reminder went (one a plan a day). */
    val remindedToday: Boolean = false,
    /** Plans for the holidays (A8): a claim, a give back or an added item is on its way. */
    val bringBusy: Boolean = false,
    /** The line under the bring list ("Sam got to that one first."). */
    val bringNotice: String? = null,
)

/**
 * One plan, as the person looking at it stands (boards J1 to J9 and H9). The page shows the public card from the
 * map at once when it has one, then reads the plan fresh: its private part (exact place, note, people, chat) is
 * never stored, so a guest who was removed sees none of it after the next read.
 */
@HiltViewModel
class PlanDetailViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: PlansRepository,
        private val events: PlansEvents,
        private val blocks: BlocksRepository,
        private val homes: HomesRepository,
        private val locations: PlanLocationResolver,
        feature: PlansFeature,
    ) : ViewModel() {
        val planId: String = savedStateHandle.get<String>(PlansRoutes.PLAN_ID_KEY).orEmpty()
        private val askOnOpen: Boolean = savedStateHandle.get<Boolean>(PlansRoutes.ASK_KEY) ?: false
        private val revealOnOpen: Boolean = savedStateHandle.get<Boolean>(PlansRoutes.REVEAL_KEY) ?: false

        /** An email or text invitation's token (`?invite=`): the plan opens it for this account first. */
        private val inviteToken: String? = savedStateHandle.get<String>(PlansRoutes.INVITE_KEY)?.takeIf(String::isNotBlank)

        /** The plan's one link for everyone (`?open=`, Plans for the holidays, contract 6.9): claimed for this account first. */
        private val openToken: String? = savedStateHandle.get<String>(PlansRoutes.OPEN_KEY)?.takeIf(String::isNotBlank)

        /** How the person came to a business's plan, when the app knows (`business_page`), sent with the ask. */
        private val via: String? = savedStateHandle.get<String>(PlansRoutes.VIA_KEY)?.takeIf { it == PlansRoutes.VIA_BUSINESS_PAGE }
        private var inviteClaimed = false

        private val _ui = MutableStateFlow(PlanDetailUi(viewerId = feature.viewerId))
        val ui: StateFlow<PlanDetailUi> = _ui.asStateFlow()

        private var loadJob: Job? = null
        private var requestsJob: Job? = null
        private var guestsJob: Job? = null
        private var askedOnOpen = false
        private var active = true
        private var readGeneration = 0L

        /** Only the stored public card is on screen: its actions wait for a fresh read, so a failed read offers Retry. */
        private var storedCardOnly = false

        init {
            repository.card(planId)?.let { card ->
                storedCardOnly = true
                _ui.update { it.copy(state = PlanDetailUiState.Ready(card, fresh = false)) }
            }
            // Opened in place of a date its host skipped (Plans step 2): this page says so.
            events.takeArrivalNote(planId)?.let { note -> _ui.update { it.copy(notice = note) } }
        }

        /** Every appearance: read the plan fresh (opening an invitation first, once). */
        fun load() {
            if (!active || loadJob?.isActive == true) return
            loadJob =
                viewModelScope.launch {
                    val missed = claimInviteOnce()
                    read()
                    if (missed) inviteMissedNotice()
                }
        }

        /**
         * Opened from an email or text invitation: it becomes this account's. Someone else already used it, or the host
         * took it back: the plan opens as any shared plan does, with a sentence saying so (as on iOS). True when the
         * invitation wasn't found. The plan's one link for everyone is claimed the same way (contract 6.9): the person
         * is invited as themselves, and every refusal (removed, turned down, a block, the link off) is a 404.
         */
        private suspend fun claimInviteOnce(): Boolean {
            if (inviteClaimed) return false
            val token = inviteToken
            val open = openToken
            val generation = readGeneration
            val result =
                when {
                    token != null -> repository.claimInvite(planId, token)
                    open != null -> repository.claimOpenLink(planId, open)
                    else -> return false
                }
            if (!active || generation != readGeneration) return false
            inviteClaimed = true
            return when (result) {
                is NetworkResult.Success -> {
                    result.data.plan?.let { plan ->
                        storedCardOnly = false
                        // A plan of a kind or place this app can't draw (a later server's) isn't available here, as a
                        // read of it says (Plans steps 3 and 4): never drawn wrong for a moment.
                        val state = if (plan.isDrawable) PlanDetailUiState.Ready(plan, fresh = false) else PlanDetailUiState.Gone
                        _ui.update { it.copy(state = state) }
                    }
                    false
                }
                is NetworkResult.Failure -> {
                    if (result.error.planCode == "invite_used") _ui.update { it.copy(notice = result.error.planMessage) }
                    // Taken back, or never this plan's: said once the plan is read (see [inviteMissedNotice]).
                    result.error == NetworkError.NotFound
                }
            }
        }

        /**
         * The invitation isn't there anymore. A plan the person can still see takes requests as any shared plan does; a
         * private plan (Plans step 1) shows nothing without its invitation, so nothing is offered.
         */
        private fun inviteMissedNotice() {
            val canAsk = _ui.value.state is PlanDetailUiState.Ready
            val line =
                if (canAsk) {
                    "This invitation isn't available anymore. You can still ask to join."
                } else {
                    "This invitation isn't available anymore."
                }
            _ui.update { it.copy(notice = line) }
        }

        /** "Can't make it" to an invitation (someone already in or waiting is taken out first). */
        fun declineInvite() =
            act(done = "We told ${hostFirst()}") {
                when (val result = repository.declineInvite(planId)) {
                    is NetworkResult.Success -> NetworkResult.Success(Unit)
                    is NetworkResult.Failure -> result
                }
            }

        private suspend fun read() {
            if (!active) return
            val generation = readGeneration
            val read = repository.read(planId)
            if (!active || generation != readGeneration) return
            when (read) {
                is PlanRead.Found -> show(read.plan)
                is PlanRead.Locked -> _ui.update { it.copy(state = PlanDetailUiState.PlaydateLocked(read.city, read.invitedBy)) }
                PlanRead.Missing -> _ui.update { it.copy(state = PlanDetailUiState.Gone) }
                is PlanRead.Failed ->
                    _ui.update {
                        val refused = read.error is NetworkError.Forbidden || read.error == NetworkError.Unauthorized
                        if (it.state is PlanDetailUiState.Ready && !refused && !storedCardOnly) {
                            it.copy(notice = read.error.planMessage)
                        } else {
                            it.copy(
                                state = PlanDetailUiState.Failed(read.error.planMessage),
                                requests = null,
                                others = emptyList(),
                                reveal = false,
                            )
                        }
                    }
            }
        }

        private fun show(plan: PlanDto) {
            val before = (_ui.value.state as? PlanDetailUiState.Ready)?.plan?.standing
            val nowIn = plan.standing == PlanViewerStanding.IN && plan.hasPrivatePart
            val wasWaiting = before == PlanViewerStanding.REQUESTED || before == PlanViewerStanding.WAITLISTED
            val reveal = nowIn && (revealOnOpen || wasWaiting || events.shouldReveal(plan.id))
            if (nowIn) events.revealed(plan.id)
            storedCardOnly = false
            _ui.update {
                it.copy(
                    state = PlanDetailUiState.Ready(plan, fresh = true),
                    reveal = it.reveal || reveal,
                    others = repository.lastList.filter { it.id != plan.id && it.standing == PlanViewerStanding.NONE }.take(2),
                )
            }
            val canAskNow = plan.standing == PlanViewerStanding.NONE && plan.viewer?.canAsk == true
            if (askOnOpen && !askedOnOpen && canAskNow) {
                askedOnOpen = true
                openAsk()
            }
            if (plan.standing == PlanViewerStanding.HOSTING) loadRequests()
            if (plan.standing == PlanViewerStanding.HOSTING && plan.answers != null) loadGuests()
        }

        /** The host's answers for the counts, the people line and Remind (Plans for the holidays, A6). */
        private fun loadGuests() {
            guestsJob?.cancel()
            val generation = readGeneration
            guestsJob =
                viewModelScope.launch {
                    val reply = (repository.invites(planId) as? NetworkResult.Success)?.data ?: return@launch
                    if (active && generation == readGeneration) _ui.update { it.copy(guests = reply) }
                }
        }

        /** "Remind the {n} who haven't answered": once a plan a day, the way each was invited. */
        fun remind() {
            if (_ui.value.reminding || _ui.value.remindedToday) return
            _ui.update { it.copy(reminding = true) }
            viewModelScope.launch {
                val result = repository.remind(planId)
                _ui.update {
                    when (result) {
                        is NetworkResult.Success -> {
                            val n = result.data.reminded
                            val notice = if (n == 1) "Reminded 1 person." else "Reminded $n people."
                            it.copy(reminding = false, remindedToday = true, notice = notice)
                        }
                        is NetworkResult.Failure ->
                            if (result.error.planCode in setOf("reminded_today", "too_many")) {
                                it.copy(reminding = false, remindedToday = true)
                            } else {
                                it.copy(reminding = false, notice = result.error.planMessage)
                            }
                    }
                }
            }
        }

        /** "I'll bring it" (Plans for the holidays, A8); someone first: the row shows them and the line says so. */
        fun claimBring(itemId: String) = bringAction { repository.claimBring(planId, itemId) }

        /** "Give back". */
        fun giveBackBring(itemId: String) = bringAction { repository.giveBackBring(planId, itemId) }

        /** "Bring something else": added and claimed by this person. */
        fun addBring(label: String) = bringAction { repository.addBring(planId, label) }

        private fun bringAction(call: suspend () -> NetworkResult<PlanBringResponse>) {
            if (_ui.value.bringBusy) return
            _ui.update { it.copy(bringBusy = true, bringNotice = null) }
            viewModelScope.launch {
                val result = call()
                _ui.update { current ->
                    val ready = current.state as? PlanDetailUiState.Ready
                    when (result) {
                        is NetworkResult.Success -> {
                            val plan = ready?.plan?.copy(bring = result.data.bring)
                            current.copy(
                                bringBusy = false,
                                state = if (plan != null && ready != null) ready.copy(plan = plan) else current.state,
                            )
                        }
                        // "Sam got to that one first." (409 taken) or another refusal, under the list.
                        is NetworkResult.Failure -> current.copy(bringBusy = false, bringNotice = result.error.planMessage)
                    }
                }
                if (result is NetworkResult.Failure) read()
            }
        }

        /** "Maybe" to an invitation (Plans for the holidays, A7): the host sees it; I'm in or Can't make it replaces it. */
        fun maybeInvite() {
            _ui.update { it.copy(askOpen = false) }
            act(done = "${hostFirst()} sees your maybe") {
                when (val result = repository.maybeInvite(planId)) {
                    is NetworkResult.Success -> NetworkResult.Success(Unit)
                    is NetworkResult.Failure -> result
                }
            }
        }

        private fun loadRequests() {
            requestsJob?.cancel()
            _ui.update { it.copy(requests = null) }
            val generation = readGeneration
            requestsJob =
                viewModelScope.launch {
                    val reply = (repository.requests(planId) as? NetworkResult.Success)?.data
                    if (active && generation == readGeneration) _ui.update { it.copy(requests = reply) }
                }
        }

        fun hasLocationPermission(): Boolean = locations.hasLocationPermission()

        /** "Share your location to join" (J1): ask again with a fresh fix as the person's location. */
        fun useMyLocation() {
            viewModelScope.launch {
                val fix = locations.gpsFix()
                if (fix == null) {
                    _ui.update { it.copy(notice = "Couldn't find your location. Check that location is on.") }
                    return@launch
                }
                repository.setOrigin(PlanOrigin(fix.latitude, fix.longitude, fix.at))
                read()
            }
        }

        /** "Report this plan": files a report on the post in the admin queue. */
        fun report(reason: String) {
            viewModelScope.launch {
                val result = repository.report(planId, reason)
                _ui.update {
                    it.copy(
                        notice =
                            when (result) {
                                is NetworkResult.Success -> "Thanks. We'll look into it."
                                is NetworkResult.Failure -> result.error.planMessage
                            },
                    )
                }
            }
        }

        /** "Verify your address" (J9, a plan for verified neighbors): the Home waiting on verification, or Add Home. */
        suspend fun verificationTarget(): HubVerificationTarget = plansVerificationTarget(homes)

        /** "Block {host}": hides their plans and requests both ways. */
        fun blockHost() {
            val hostId = (_ui.value.state as? PlanDetailUiState.Ready)?.plan?.host?.userId ?: return
            viewModelScope.launch {
                when (val result = blocks.block(hostId)) {
                    is NetworkResult.Success -> {
                        repository.changed()
                        _ui.update { it.copy(state = PlanDetailUiState.Gone, notice = "Blocked. You won't see each other's plans.") }
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(notice = result.error.planMessage) }
                }
            }
        }

        /** The page is on screen (resumed) or not: a plain push about this plan stays quiet meanwhile. */
        fun onScreen(visible: Boolean) {
            active = visible
            if (visible) {
                events.viewedPlanId = planId
            } else {
                if (events.viewedPlanId == planId) events.viewedPlanId = null
                readGeneration += 1
                loadJob?.cancel()
                loadJob = null
                requestsJob?.cancel()
                requestsJob = null
                val card = repository.card(planId)
                storedCardOnly = card != null
                _ui.update {
                    it.copy(
                        state = card?.let { plan -> PlanDetailUiState.Ready(plan, fresh = false) } ?: PlanDetailUiState.Loading,
                        requests = null,
                        others = emptyList(),
                        reveal = false,
                    )
                }
            }
        }

        fun revealShown() {
            _ui.update { it.copy(reveal = false) }
        }

        /** An online plan's "Join" couldn't open its link (no browser): say so (Plans step 3). */
        fun linkUnopened() {
            _ui.update { it.copy(notice = PLAN_LINK_UNOPENED) }
        }

        fun noticeShown() {
            _ui.update { it.copy(notice = null) }
        }

        // ---- Ask (J3, J4) ----

        fun openAsk() {
            val ready = _ui.value.state as? PlanDetailUiState.Ready ?: return
            if (!ready.fresh) return
            val plan = ready.plan
            // Only a request still waiting fills the sheet ("Change who's coming"); a withdrawn or declined one starts fresh.
            // With Plans for the holidays a guest who is in changes their numbers here too ("Change", A8).
            val changing = plan.standing == PlanViewerStanding.IN && plan.kidsWelcome != null
            val mine = plan.myRequest?.takeIf { plan.standing == PlanViewerStanding.REQUESTED || changing }
            _ui.update {
                it.copy(
                    askOpen = true,
                    ask =
                        AskDraft(
                            partySize = mine?.partySize ?: 1,
                            note = mine?.note.orEmpty(),
                            kidsCount = mine?.kidsCount ?: 1,
                            ageBands = mine?.kidsAgeBands.orEmpty().toSet(),
                            staysWithKids = mine != null && plan.kind == PlanKind.PLAYDATE.wire,
                            kids = mine?.kidsCount?.takeIf { plan.takesKids } ?: 0,
                        ),
                )
            }
        }

        fun closeAsk() {
            _ui.update { it.copy(askOpen = false) }
        }

        fun editAsk(transform: (AskDraft) -> AskDraft) {
            _ui.update { it.copy(ask = transform(it.ask).copy(error = null)) }
        }

        fun sendAsk() {
            val plan = (_ui.value.state as? PlanDetailUiState.Ready)?.plan ?: return
            val draft = _ui.value.ask
            val playdate = plan.kind == PlanKind.PLAYDATE.wire
            if (playdate && (!draft.staysWithKids || draft.ageBands.isEmpty())) {
                _ui.update { it.copy(ask = draft.copy(error = "Add your kids' ages and confirm you'll stay with them.")) }
                return
            }
            _ui.update { it.copy(ask = draft.copy(sending = true, error = null)) }
            val generation = readGeneration
            viewModelScope.launch {
                val asked =
                    if (playdate) {
                        AskToJoinBody(
                            partySize = 1,
                            note = draft.note.trim().takeIf(String::isNotEmpty),
                            kidsCount = draft.kidsCount,
                            kidsAgeBands = draft.ageBands.toList(),
                            staysWithKids = true,
                        )
                    } else if (plan.takesKids) {
                        // Plans for the holidays (A7): adults as the party, kids beside them (none sent as no kids).
                        AskToJoinBody(
                            partySize = draft.partySize,
                            note = draft.note.trim().takeIf(String::isNotEmpty),
                            kidsCount = draft.kids.takeIf { it > 0 },
                        )
                    } else {
                        AskToJoinBody(partySize = draft.partySize, note = draft.note.trim().takeIf(String::isNotEmpty))
                    }
                // A business's plan opened from its page says so (`via: business_page`); nothing else is sent.
                val body = asked.copy(via = via.takeIf { plan.business != null })
                when (val result = repository.ask(planId, body)) {
                    is NetworkResult.Success -> {
                        val status = PlanRequestStatus.from(result.data.request?.status)
                        _ui.update { it.copy(askOpen = false, ask = it.ask.copy(sending = false)) }
                        if (!active || generation != readGeneration) return@launch
                        result.data.plan?.let { reply ->
                            storedCardOnly = false
                            _ui.update { it.copy(state = PlanDetailUiState.Ready(reply, fresh = false)) }
                        }
                        if (status == PlanRequestStatus.ACCEPTED) _ui.update { it.copy(reveal = true) }
                        read()
                    }
                    is NetworkResult.Failure -> {
                        val inAlready = plan.standing == PlanViewerStanding.IN
                        _ui.update { it.copy(ask = it.ask.copy(sending = false, error = askError(result.error, inAlready))) }
                    }
                }
            }
        }

        /**
         * The server's own sentence for a refused ask, as iOS shows it; the 10-request limit says what to do. Someone
         * already in who asked for more seats than are left keeps their answer (Plans for the holidays, "Change"): the
         * server says so.
         */
        private fun askError(
            error: NetworkError,
            inAlready: Boolean,
        ): String =
            when {
                error.planCode == "too_many_requests" -> "You have 10 open requests. Withdraw one to ask here."
                error.planCode == "full" && !inAlready -> "It just filled up. You can join the waitlist."
                else -> error.planMessage
            }

        // ---- Your request (J5, J6, J7) ----

        /** Withdraw a request, leave the waitlist, or leave the plan ("Can't make it"); [done] says it went through. */
        fun withdraw(done: String? = null) = act(done = done) { repository.withdraw(planId) }

        fun onMyWay() = act(done = "We told the group you're on the way.") { repository.onMyWay(planId) }

        fun stillComing(coming: Boolean) =
            act(done = if (coming) "Thanks. The host knows you're still coming." else "We told ${hostFirst()}") {
                repository.stillComing(planId, coming)
            }

        /** The host's first name for a line ("We told Sam"), from the plan on screen. */
        private fun hostFirst(): String =
            (_ui.value.state as? PlanDetailUiState.Ready)
                ?.plan
                ?.host
                ?.displayName
                ?.takeIf { it.isNotBlank() }
                ?.let(PlanFormat::firstName) ?: "the host"

        // ---- Host (H9, H12) ----

        fun openCancel() {
            _ui.update { it.copy(cancelOpen = true) }
        }

        fun closeCancel() {
            _ui.update { it.copy(cancelOpen = false, cancelNote = "") }
        }

        fun editCancelNote(text: String) {
            _ui.update { it.copy(cancelNote = text.take(CANCEL_NOTE_MAX)) }
        }

        fun cancelPlan() {
            val note = _ui.value.cancelNote
            _ui.update { it.copy(cancelOpen = false) }
            act(done = "Plan cancelled. Everyone has been told.") { repository.cancel(planId, note) }
        }

        fun removeGuest(requestId: String) = act(done = "Removed. They no longer see the plan.") { repository.remove(planId, requestId) }

        // ---- A repeating plan (Plans step 2, board Regulars) ----

        /** "Skip Thursday": cancels this date only; the next date, posted at once, opens in its place and says so. */
        fun skipDate() = cancelOneDate(note = null, opensNext = true)

        /** "Cancel this date" on the cancel sheet: the same, with the host's note, staying on this (now cancelled) date. */
        fun cancelThisDate() {
            val note = _ui.value.cancelNote
            _ui.update { it.copy(cancelOpen = false) }
            cancelOneDate(note = note, opensNext = false)
        }

        private fun cancelOneDate(
            note: String?,
            opensNext: Boolean,
        ) {
            if (_ui.value.busy) return
            _ui.update { it.copy(busy = true) }
            viewModelScope.launch {
                when (val result = repository.cancelThisDate(planId, note)) {
                    is NetworkResult.Success -> {
                        val next = result.data
                        if (opensNext && next != null) {
                            events.noteOnArrival(next, PlanRepeatWords.SKIPPED_NEXT)
                            _ui.update { it.copy(busy = false, nextPlanId = next) }
                        } else {
                            val said = if (next != null) PlanRepeatWords.CANCELLED_NEXT else PlanRepeatWords.CANCELLED_NO_NEXT
                            _ui.update { it.copy(busy = false, notice = said) }
                        }
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(busy = false, notice = result.error.planMessage) }
                }
                read()
            }
        }

        /** The next date opened in this one's place. */
        fun nextDateOpened() {
            _ui.update { it.copy(nextPlanId = null) }
        }

        /** "Stop repeating": `repeat: null`; this date stays and none follows. */
        fun stopRepeating() =
            act(done = PlanRepeatWords.STOPPED) {
                when (val result = repository.stopRepeating(planId)) {
                    is NetworkResult.Success -> NetworkResult.Success(Unit)
                    is NetworkResult.Failure -> result
                }
            }

        // ---- Bring a friend (a guest on a private plan, Plans step 1) ----

        /** Makes the guest's one friend link (`POST /:id/invites/link`), for their phone's share sheet. */
        fun bringFriend() {
            if (_ui.value.makingFriendLink) return
            _ui.update { it.copy(makingFriendLink = true) }
            viewModelScope.launch {
                when (val result = repository.inviteLink(planId, confirmSharesAddress = false)) {
                    is NetworkResult.Success ->
                        _ui.update {
                            it.copy(
                                makingFriendLink = false,
                                friendInvited = true,
                                friendLink = PlanTextInvite(result.data.message, result.data.url),
                            )
                        }
                    is NetworkResult.Failure -> {
                        // Already made (on another phone, say): the row says so, and the server's sentence says why.
                        val used = result.error.planCode == "friend_invite_used"
                        _ui.update {
                            it.copy(makingFriendLink = false, friendInvited = it.friendInvited || used, notice = result.error.planMessage)
                        }
                    }
                }
                read()
            }
        }

        /** The share sheet opened with the friend link. */
        fun friendLinkShared() {
            _ui.update { it.copy(friendLink = null, notice = "Done. That link works for one person.") }
        }

        private fun act(
            done: String? = null,
            block: suspend () -> NetworkResult<Unit>,
        ) {
            if (_ui.value.busy) return
            _ui.update { it.copy(busy = true) }
            viewModelScope.launch {
                val result = block()
                _ui.update {
                    it.copy(
                        busy = false,
                        notice =
                            when (result) {
                                is NetworkResult.Success -> done
                                is NetworkResult.Failure -> result.error.planMessage
                            },
                    )
                }
                read()
            }
        }

        private companion object {
            const val CANCEL_NOTE_MAX = 280
        }
    }
