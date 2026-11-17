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
import app.pantopus.android.BuildConfig
import app.pantopus.android.core.LaunchFeatures
import app.pantopus.android.core.routing.DeepLinkRouter
import app.pantopus.android.core.security.AppLockManager
import app.pantopus.android.data.guidance.GuidanceRepository
import app.pantopus.android.data.moments.MomentsFeature
import app.pantopus.android.data.plans.PlansFeature
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
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
    ) : ViewModel() {
        val locked = appLock.isLocked
        val anchors = GuidanceAnchors()

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
            return token
        }

        fun updateSpot(
            token: Int,
            facts: GuidanceSpotFacts,
        ) {
            if (spotOwner == token && spot != facts) spot = facts
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
            )
        }

        fun show(card: GuidanceCard) {
            if (showing == null) showing = GuidanceShowing(card)
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
                    GuidanceCentreCardView(card = shown, onClose = viewModel::close)
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
