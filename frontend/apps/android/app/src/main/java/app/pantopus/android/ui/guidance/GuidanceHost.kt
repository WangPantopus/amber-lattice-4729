package app.pantopus.android.ui.guidance

import android.os.SystemClock
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.BuildConfig
import app.pantopus.android.core.LaunchFeatures
import app.pantopus.android.core.routing.DeepLinkRouter
import app.pantopus.android.core.security.AppLockManager
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.guidance.GuidanceRepository
import app.pantopus.android.data.homes.HomeMembersRepository
import app.pantopus.android.data.homes.HomesRepository
import app.pantopus.android.data.moments.MomentPostingOutcome
import app.pantopus.android.data.moments.MomentsFeature
import app.pantopus.android.data.moments.MomentsPosting
import app.pantopus.android.data.plans.PlansFeature
import app.pantopus.android.data.relationships.RelationshipsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import javax.inject.Inject

/** The guidance host below [GuidanceRoot]; null in previews and tests, where every report is a no-op. */
val LocalGuidance = staticCompositionLocalOf<GuidanceViewModel?> { null }

/**
 * Debug builds only: `PANTOPUS_DEBUG_GUIDANCE=<card id>` (an intent extra, spec §8) shows that card at once on the
 * screen on top, whatever the rules say. MainActivity reads the extra only when `BuildConfig.DEBUG`; a release build
 * can't set it.
 */
object GuidanceDebug {
    const val EXTRA = "PANTOPUS_DEBUG_GUIDANCE"
    private val _forced = MutableStateFlow<String?>(null)
    val forced: StateFlow<String?> = _forced.asStateFlow()

    fun take(id: String?) {
        if (!BuildConfig.DEBUG) return
        _forced.value = id?.trim()?.takeIf { it.isNotEmpty() }
    }

    internal fun clear() {
        _forced.value = null
    }
}

/** What a reminder's button opens besides closing it (spec §5, cards 24–27). The screen on top takes it. */
enum class GuidanceAction {
    /** 24: focus Place's address box. */
    AddAddress,

    /** 25: the set-up flow for the saved address. */
    SetUpHome,

    /** 26: the verify flow for the Home on Place. */
    Verify,

    /** 27: the Members invite for the Home on Place. */
    Invite,
}

/** A card on screen; [replay] is one opened again from the Tips list, which doesn't count as seen. */
data class GuidanceShowing(
    val card: GuidanceCard,
    val replay: Boolean = false,
)

/**
 * The guidance cards' host: what the screens report (the tab's first screen on top and its facts, the controls a
 * pointer may ring, what else is up), the decision ([GuidanceEngine]) and the card on screen. One per activity, reached
 * through [LocalGuidance].
 */
@HiltViewModel
@Suppress("TooManyFunctions")
class GuidanceViewModel
    @Inject
    constructor(
        val repository: GuidanceRepository,
        appLock: AppLockManager,
        private val moments: MomentsFeature,
        private val plans: PlansFeature,
        private val homes: HomesRepository,
        private val members: HomeMembersRepository,
        private val relationships: RelationshipsRepository,
        momentsPosting: MomentsPosting,
    ) : ViewModel() {
        val locked = appLock.isLocked
        val anchors = GuidanceAnchors()

        init {
            // A Moment of the person's went live: Moments then has card 19.
            viewModelScope.launch {
                momentsPosting.outcomes.collect { if (it is MomentPostingOutcome.Live) note(GuidanceFlags.MOMENT_POSTED) }
            }
        }

        /** Your Place's own word on the Home it shows: verified, and whether it offers “Verify address”. */
        private var placeHome by mutableStateOf<GuidanceHomeFacts?>(null)

        /** The Home's record for the cards (who set it up, since when, how many live there), read on each Place visit. */
        private var homeRecord by mutableStateOf<GuidanceHomeFacts?>(null)
        private var homeJob: Job? = null

        /** Messages: the person has a connection (card 21), read on each visit while the card is unseen. */
        private var connected by mutableStateOf<Boolean?>(null)
        private var connectedJob: Job? = null

        /** The visit (spot token) a card last showed on: no reminder, introduction or pointer right after it. */
        private var shownOnVisit: Int? = null

        /** A reminder's button asked for its next step; the screen on top takes it ([takeAction]). */
        var action by mutableStateOf<GuidanceAction?>(null)
            private set

        private var spotToken = 0
        private var spotOwner by mutableStateOf<Int?>(null)

        /** The tab's first screen on top, as it reported itself; null on any other screen. */
        var spot by mutableStateOf<GuidanceSpotFacts?>(null)
            private set

        /** RootTabScreen: the side menu is open. */
        var drawerOpen by mutableStateOf(false)
            private set

        /** RootTabScreen: the briefings notice, the Suggestions notice or the name question is showing or deciding. */
        var noticesBusy by mutableStateOf(true)
            private set

        var showing by mutableStateOf<GuidanceShowing?>(null)
            private set

        /** A finger is on the screen, and when one last moved (the cards wait for quiet). */
        internal var touching = false
        internal var lastTouchAt = 0L

        /** A tab's first screen came on top: one more visit to it. Returns the token for [updateSpot] and [leaveSpot]. */
        fun enterSpot(facts: GuidanceSpotFacts): Int {
            val token = ++spotToken
            spotOwner = token
            spot = facts
            repository.visit(facts.screen.key)
            readFacts(facts, visit = true)
            return token
        }

        fun updateSpot(
            token: Int,
            facts: GuidanceSpotFacts,
        ) {
            if (spotOwner != token || spot == facts) return
            val before = spot
            spot = facts
            if (before?.homeId != facts.homeId) readFacts(facts, visit = false)
        }

        /** Your Place reports the Home it shows: [verified] (“Verified home”) and [canVerify] (it offers “Verify address”). */
        fun reportHome(
            homeId: String,
            verified: Boolean,
            canVerify: Boolean,
        ) {
            val facts = GuidanceHomeFacts(homeId, verified = verified, canVerify = canVerify)
            if (placeHome != facts) placeHome = facts
        }

        /** The screen asking takes a reminder's next step once: true when [kind] was waiting. */
        fun takeAction(kind: GuidanceAction): Boolean {
            if (action != kind) return false
            action = null
            return true
        }

        /** What the after-action cards and reminders need beyond the screen's own facts, while one may still show. */
        private fun readFacts(
            facts: GuidanceSpotFacts,
            visit: Boolean,
        ) {
            // Before the first profile read the account may still be new: read anyway (the Home's from the kept copies).
            val state = repository.state.value ?: return
            if (state.loaded && (!state.enabled || !state.newAccount)) return
            val homeId = facts.homeId?.takeIf { facts.screen == GuidanceScreen.Place }
            val staleHome = visit || homeRecord?.homeId != homeId
            if (homeId != null && staleHome) readHome(homeId)
            if (facts.screen == GuidanceScreen.Messages && visit && !state.hasSeen(GuidanceIds.DONE_CONNECTED)) readConnected()
        }

        private fun readHome(homeId: String) {
            homeJob?.cancel()
            homeJob =
                viewModelScope.launch {
                    val home = homes.myHomesStored(false).data?.homes?.firstOrNull { it.id == homeId } ?: return@launch
                    val occupancy = home.occupancy
                    val roster = members.listOccupantsStored(homeId).data?.occupants
                    homeRecord =
                        GuidanceHomeFacts(
                            homeId = homeId,
                            invited = occupancy?.verificationSource == JOINED_BY_HOUSEHOLD,
                            setUpAt = occupancy?.startAt ?: home.createdAt,
                            members = roster?.count { it.isActive && it.role !in NOT_HOUSEHOLD },
                        )
                }
        }

        private fun readConnected() {
            connectedJob?.cancel()
            connectedJob =
                viewModelScope.launch {
                    val result = relationships.list(status = ACCEPTED, limit = 1)
                    if (result is NetworkResult.Success) connected = result.data.relationships.isNotEmpty()
                }
        }

        /** Place's Home with both halves known: the screen's word and the record. */
        private fun homeFacts(homeId: String?): GuidanceHomeFacts? {
            val shown = placeHome?.takeIf { it.homeId == homeId } ?: return null
            val record = homeRecord?.takeIf { it.homeId == homeId } ?: return null
            return record.copy(verified = shown.verified, canVerify = shown.canVerify)
        }

        fun leaveSpot(token: Int) {
            if (spotOwner != token) return
            spotOwner = null
            spot = null
        }

        fun reportRoot(
            drawerOpen: Boolean,
            noticesBusy: Boolean,
        ) {
            if (this.drawerOpen != drawerOpen) this.drawerOpen = drawerOpen
            if (this.noticesBusy != noticesBusy) this.noticesBusy = noticesBusy
        }

        /** The person did [flag] here (a glance row opened, a post made). */
        fun note(flag: String) = repository.note(flag)

        /** The decision for the screen on top now. */
        fun candidate(): GuidanceCard? {
            val input = input() ?: return null
            return GuidanceEngine.next(input)
        }

        internal fun forcedCard(id: String): GuidanceCard? {
            val input = input()?.takeIf { it.spot.ready } ?: return null
            return GuidanceEngine.forced(id, input)
        }

        private fun input(): GuidanceInput? {
            val state = repository.state.value ?: return null
            val facts = spot ?: return null
            return GuidanceInput(
                state = state,
                spot = facts,
                anchors = anchors.onScreen(),
                otherCardThisOpen = repository.otherCardShownThisOpen(),
                mailbox = LaunchFeatures.mailbox,
                writesLetters = LaunchFeatures.mailExtras,
                shownThisVisit = spotOwner != null && shownOnVisit == spotOwner,
                home = homeFacts(facts.homeId).takeIf { facts.screen == GuidanceScreen.Place },
                connected = connected.takeIf { facts.screen == GuidanceScreen.Messages },
                appVersion = BuildConfig.VERSION_CODE,
            )
        }

        fun show(card: GuidanceCard) {
            if (showing != null) return
            showing = GuidanceShowing(card)
            shownOnVisit = spotOwner
        }

        /** The card's button: it closes the card, and a reminder's also opens its next step. */
        fun primary() {
            val current = showing ?: return
            close()
            if (!current.replay) action = REMINDER_ACTIONS[current.card.id]
        }

        /** The Tips list: [card] again, which doesn't change its count. */
        fun replay(card: GuidanceCentre) {
            showing = GuidanceShowing(card, replay = true)
        }

        /** The card on screen closed, by any of its ways: it counts as seen (a replay doesn't). */
        fun close() {
            val current = showing ?: return
            showing = null
            if (current.replay) return
            val id = current.card.id
            repository.markSeen(id)
            if (id !in GuidanceIds.tabCards) repository.markOtherCardShown()
            if (current.card is GuidanceCentre) repository.markCentreCardDay()
            // At most one introduction per app update.
            if (GuidanceIntroductions.card(id) != null) repository.note(GuidanceFlags.introducedIn(BuildConfig.VERSION_CODE))
        }

        /** The Tips list's cards (spec §4): the tab cards on for this account. */
        fun tipsCards(): List<GuidanceCentre> {
            val state = repository.state.value
            return GuidanceEngine.tipsCards(
                hasSavedAddress =
                    state != null &&
                        (GuidanceFlags.SAVED_ADDRESS in state.flags || state.hasSeen(GuidanceIds.PLACE_SAVED)),
                mailbox = LaunchFeatures.mailbox,
                writesLetters = LaunchFeatures.mailExtras,
                moments = moments.on.value,
                plans = plans.flags.value.plans,
            )
        }

        /** The Tips row shows while the server's switch is on for this account. */
        fun tipsAvailable(): Boolean = repository.state.value?.let { it.enabled && !it.business } == true

        private companion object {
            const val ACCEPTED = "accepted"

            /** An occupancy let in by the household (an invitation): the person didn't set the Home up. */
            const val JOINED_BY_HOUSEHOLD = "household"

            /** Occupants who don't live there. */
            val NOT_HOUSEHOLD = setOf("guest", "service_provider")

            val REMINDER_ACTIONS =
                mapOf(
                    GuidanceIds.NEXT_ADD_ADDRESS to GuidanceAction.AddAddress,
                    GuidanceIds.NEXT_SETUP_HOME to GuidanceAction.SetUpHome,
                    GuidanceIds.NEXT_VERIFY to GuidanceAction.Verify,
                    GuidanceIds.NEXT_INVITE to GuidanceAction.Invite,
                )
        }
    }

/**
 * Hosts the guidance cards over the signed-in app ([content] is RootTabScreen): provides [LocalGuidance], watches for
 * fingers on the screen without taking any touch, decides when a card may show, and draws it.
 */
@Composable
fun GuidanceRoot(
    content: @Composable () -> Unit,
    viewModel: GuidanceViewModel = hiltViewModel(),
) {
    val calm = rememberGuidanceCalm(viewModel)
    GuidanceScheduler(viewModel, calm)
    CompositionLocalProvider(LocalGuidance provides viewModel) {
        Box(modifier = Modifier.fillMaxSize().watchTouches(viewModel)) {
            content()
            when (val shown = viewModel.showing?.card) {
                is GuidanceCentre -> {
                    GuidanceDim()
                    GuidanceCentreCardView(card = shown, onClose = viewModel::close, onPrimary = viewModel::primary)
                }
                is GuidancePointer -> GuidancePointerView(pointer = shown, anchors = viewModel.anchors, onClose = viewModel::close)
                null -> Unit
            }
        }
    }
}

/**
 * Nothing else is up (spec §2): signed in and loaded, no app lock, no link or notification opening (and 1.5 s more for
 * it to land), the window focused (no dialog, sheet, BiometricPrompt or system question over it), no keyboard, the app
 * in front, the side menu closed and the briefings and name notices done.
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun rememberGuidanceCalm(viewModel: GuidanceViewModel): Boolean {
    val state by viewModel.repository.state.collectAsStateWithLifecycle()
    val locked by viewModel.locked.collectAsStateWithLifecycle()
    val pendingLink by DeepLinkRouter.pending.collectAsStateWithLifecycle()
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsStateWithLifecycle()
    val focused = LocalWindowInfo.current.isWindowFocused
    val keyboard = WindowInsets.isImeVisible
    var linkSettling by remember { mutableStateOf(false) }
    LaunchedEffect(pendingLink) {
        if (pendingLink != null) {
            linkSettling = true
        } else if (linkSettling) {
            delay(LINK_SETTLE_MS)
            linkSettling = false
        }
    }
    val inFront = lifecycleState.isAtLeast(Lifecycle.State.RESUMED) && focused && !keyboard
    val nothingOpening = state != null && !locked && pendingLink == null && !linkSettling
    return inFront && nothingOpening && !viewModel.drawerOpen && !viewModel.noticesBusy
}

/** Shows the decided card about half a second after the screen settled, never while a finger is on it (spec §2). */
@Composable
private fun GuidanceScheduler(
    viewModel: GuidanceViewModel,
    calm: Boolean,
) {
    val forced by GuidanceDebug.forced.collectAsStateWithLifecycle()
    val state by viewModel.repository.state.collectAsStateWithLifecycle()
    val calmNow by rememberUpdatedState(calm)
    val forcedNow by rememberUpdatedState(forced)
    val stateNow by rememberUpdatedState(state)
    LaunchedEffect(viewModel) {
        snapshotFlow {
            if (stateNow == null || !calmNow || viewModel.showing != null) {
                null
            } else {
                forcedNow?.let { id -> viewModel.forcedCard(id)?.let { it to true } } ?: viewModel.candidate()?.let { it to false }
            }
        }.distinctUntilChanged().collectLatest { found ->
            val (card, isForced) = found ?: return@collectLatest
            delay(SETTLE_MS)
            while (viewModel.touching || SystemClock.uptimeMillis() - viewModel.lastTouchAt < SETTLE_MS) delay(POLL_MS)
            val still = if (isForced) forcedNow?.let { viewModel.forcedCard(it) } else viewModel.candidate()
            if (calmNow && viewModel.showing == null && still == card) {
                if (isForced) GuidanceDebug.clear()
                viewModel.show(card)
            }
        }
    }
}

/** Notes every finger on the screen, in the initial pass and never consumed, so every tap still reaches its control. */
private fun Modifier.watchTouches(viewModel: GuidanceViewModel): Modifier =
    pointerInput(viewModel) {
        awaitPointerEventScope {
            while (true) {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                viewModel.lastTouchAt = SystemClock.uptimeMillis()
                val down = event.changes.any { it.pressed }
                // A pointer closes at the first touch anywhere (its control's tap still goes through).
                if (down && !viewModel.touching && viewModel.showing?.card is GuidancePointer) viewModel.close()
                viewModel.touching = down
            }
        }
    }

/**
 * A tab's first screen reports itself while it is on top: which tab, whether it finished loading, and the facts its
 * cards need. Each arrival counts one visit (pointers 11, 13, 14 and 15 wait for later visits).
 */
@Composable
fun GuidanceSpot(facts: GuidanceSpotFacts) {
    val host = LocalGuidance.current ?: return
    // Only while its page is the one on top: navigating away pauses the page at once, before its exit animation ends.
    val entry by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val onTop = entry.isAtLeast(Lifecycle.State.RESUMED)
    val reported = if (onTop) facts else facts.copy(ready = false)
    val latest by rememberUpdatedState(reported)
    val token = remember { mutableStateOf<Int?>(null) }
    DisposableEffect(host, facts.screen) {
        val entered = host.enterSpot(latest)
        token.value = entered
        onDispose { host.leaveSpot(entered) }
    }
    SideEffect { token.value?.let { host.updateSpot(it, reported) } }
}

private const val SETTLE_MS = 500L
private const val POLL_MS = 100L
private const val LINK_SETTLE_MS = 1500L
