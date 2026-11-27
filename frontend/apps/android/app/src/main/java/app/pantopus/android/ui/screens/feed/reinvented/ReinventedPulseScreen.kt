@file:Suppress("MagicNumber")
@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package app.pantopus.android.ui.screens.feed.reinvented

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material3.FloatingActionButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.moments.MomentRingDto
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow

/** The three heights the list rests at over the map (PHASE-1 §2 piece 2). */
enum class ReinventedHeight {
    /** The map across the top third, the list below: how Pulse opens. */
    Middle,

    /** The list, full screen, for reading. */
    List,

    /** The map, full screen. */
    Map,
}

/** Where the new Pulse's taps go. */
data class ReinventedPulseActions(
    val onOpenMenu: () -> Unit,
    val onOpenPost: (String) -> Unit,
    /** The viewer, once a Moment or a ring is queued in it. */
    val onWatch: () -> Unit,
    /** + : the Studio, as the Moments tab's + opens it. */
    val onCompose: () -> Unit,
    /** A plan's own screen in Plans. */
    val onOpenPlan: (String) -> Unit,
    /** "Repost with your words": the composer with the post quoted; null leaves it out. */
    val onQuotePost: ((String) -> Unit)? = null,
)

/**
 * "Pulse, reinvented" phase 1 (PHASE-1 §2 pieces 2 to 5; board B1): Pulse as it opens while `pulse_reinvented` is on.
 * The top row (the side menu, the scope pill with the town's name, the chat button), the List | Map switch, the chips
 * the place has, and the list resting over the live map at three heights: the middle (the map across the top third,
 * the list below: how it opens), List (full screen) and Map (full screen). Pull the handle up or down, or tap the
 * switch. Built beside today's feed (`FeedScreen`), which shows whenever the switch is off.
 */
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun ReinventedPulseScreen(
    actions: ReinventedPulseActions,
    scrollToTop: Flow<Unit>? = null,
    viewModel: ReinventedPulseViewModel = hiltViewModel(),
    mapModel: ReinventedMapViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val cards by viewModel.cards.cards.collectAsStateWithLifecycle()
    val firstPage by viewModel.firstPage.collectAsStateWithLifecycle()
    val toast by viewModel.toast.collectAsStateWithLifecycle()
    // The same timing line as today's Pulse ("pulse"), so the two open times can be laid side by side.
    app.pantopus.android.core.perf.ReportContentShown(
        "pulse",
        state.load == ReinventedPulseState.Load.Loaded || state.load == ReinventedPulseState.Load.NeedsPlace,
    )
    // The list is read once when the tab first opens (it stays while the person visits other tabs) and when pulled.
    LaunchedEffect(Unit) { if (state.items.isEmpty()) viewModel.refresh() }
    // Nothing else is read before the first page has arrived.
    LaunchedEffect(firstPage) { if (firstPage) mapModel.allow() }
    var height by rememberSaveable { mutableStateOf(ReinventedHeight.Middle) }
    BackHandler(enabled = height != ReinventedHeight.Middle) { height = ReinventedHeight.Middle }
    val listState = rememberLazyListState()
    LaunchedEffect(scrollToTop) {
        scrollToTop?.collect {
            listState.scrollToItem(0)
            height = ReinventedHeight.Middle
        }
    }
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(MINUTE_MS)
            nowMs = System.currentTimeMillis()
        }
    }
    val openMoment: (MomentDto) -> Unit = { moment ->
        viewModel.watch(moment)
        actions.onWatch()
    }
    val pull =
        rememberPullRefreshState(refreshing = state.refreshing, onRefresh = {
            viewModel.refresh()
            mapModel.refresh()
        })
    val listActions =
        ReinventedListActions(
            cards = reinventedCardActions(viewModel.cards, actions.onOpenPost),
            onOpenMoment = openMoment,
            onRefresh = viewModel::refresh,
            onLoadMore = viewModel::loadMore,
            onShowCircle = { viewModel.pickReach(ReinventedPulseViewModel.CLOSE, state.miles) },
        )
    val list: @Composable (Modifier) -> Unit = { modifier ->
        Box(modifier.pullRefresh(pull)) {
            ReinventedPulseList(state, cards, nowMs, listState, listActions)
            PullRefreshIndicator(state.refreshing, pull, Modifier.align(Alignment.TopCenter))
        }
    }
    ReinventedPulseLayout(
        height = height,
        onHeight = { height = it },
        state = state,
        actions = actions,
        onPickChip = viewModel::pickChip,
        onPickReach = viewModel::pickReach,
        mapModel = mapModel,
        onOpenMoment = openMoment,
        onOpenRing = { ring ->
            viewModel.watch(ring)
            actions.onWatch()
        },
        list = list,
    )
    ReinventedCardSheets(viewModel.cards, cards, actions.onQuotePost)
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        ReinventedToast(toast, onDismiss = viewModel::dismissToast)
    }
}

/** The map behind, the list over it at its height, the header over both, and +. */
@Composable
@Suppress("LongParameterList") // What the layout shows, its height, and where each part's taps go.
private fun ReinventedPulseLayout(
    height: ReinventedHeight,
    onHeight: (ReinventedHeight) -> Unit,
    state: ReinventedPulseState,
    actions: ReinventedPulseActions,
    onPickChip: (String) -> Unit,
    onPickReach: (String, Int) -> Unit,
    mapModel: ReinventedMapViewModel,
    onOpenMoment: (MomentDto) -> Unit,
    onOpenRing: (MomentRingDto) -> Unit,
    list: @Composable (Modifier) -> Unit,
) {
    val mapState by mapModel.state.collectAsStateWithLifecycle()
    val camera = rememberReinventedCamera()
    val density = LocalDensity.current
    BoxWithConstraints(
        modifier =
            Modifier.fillMaxSize().background(
                PantopusColors.appBg,
            ).semantics { testTagsAsResourceId = true }.testTag("reinventedPulse"),
    ) {
        var headerPx by remember { mutableIntStateOf(0) }
        val header = with(density) { headerPx.toDp() }
        val full = maxHeight
        val rest = restOf(height, header, full)
        var draggedPx by remember { mutableFloatStateOf(0f) }
        val target = (rest + with(density) { draggedPx.toDp() }).coerceIn(header, full - PEEK)
        val top by animateDpAsState(
            target,
            if (draggedPx != 0f) spring(stiffness = 10_000f) else spring(dampingRatio = 0.85f),
            label = "panel",
        )
        ReinventedPulseMap(
            state = mapState,
            camera = camera,
            bottomPadding = if (height == ReinventedHeight.Map) PEEK else full - rest,
            onMoved = mapModel::moved,
            onOpen = { item -> openMapItem(item, actions, onOpenMoment, onOpenRing) },
        )
        Panel(
            top = top,
            full = full,
            height = height,
            onDrag = { draggedPx += it },
            onSettle = {
                val now = rest + with(density) { draggedPx.toDp() }
                draggedPx = 0f
                onHeight(ReinventedHeight.entries.minBy { (restOf(it, header, full) - now).value.let { d -> if (d < 0) -d else d } })
            },
            onTapHandle = { onHeight(if (height == ReinventedHeight.Middle) ReinventedHeight.List else ReinventedHeight.Middle) },
            list = list,
        )
        ReinventedPulseHeader(
            height = height,
            state = state,
            onOpenMenu = actions.onOpenMenu,
            onHeight = onHeight,
            onPickChip = onPickChip,
            onPickReach = onPickReach,
            modifier = Modifier.onSizeChanged { headerPx = it.height },
        )
        if (height != ReinventedHeight.Map) {
            FloatingActionButton(
                onClick = actions.onCompose,
                containerColor = PantopusColors.primary600,
                shape = CircleShape,
                modifier =
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = Spacing.s4, bottom = Spacing.s4)
                        .size(58.dp)
                        .testTag("reinventedPulse.add")
                        .semantics { contentDescription = "Add a Moment" },
            ) {
                PantopusIconImage(icon = PantopusIcon.Plus, contentDescription = null, size = 26.dp, strokeWidth = 2.6f, tint = Color.White)
            }
        }
    }
}

/** The list's sheet, its top at [top]: a handle to pull it, and the list. Square-cornered and flat at the List height. */
@Composable
@Suppress("LongParameterList") // Where it rests, the handle's three gestures, and the list inside.
private fun Panel(
    top: Dp,
    full: Dp,
    height: ReinventedHeight,
    onDrag: (Float) -> Unit,
    onSettle: () -> Unit,
    onTapHandle: () -> Unit,
    list: @Composable (Modifier) -> Unit,
) {
    val corner = if (height == ReinventedHeight.List) 0.dp else 22.dp
    val shape = RoundedCornerShape(topStart = corner, topEnd = corner)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .height((full - top).coerceAtLeast(0.dp))
                .offset(y = top)
                .shadow(if (height == ReinventedHeight.List) 0.dp else 8.dp, shape)
                .clip(shape)
                .background(PantopusColors.appBg),
    ) {
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(HANDLE)
                    .draggable(rememberDraggableState(onDrag), Orientation.Vertical, onDragStopped = { onSettle() })
                    .semantics {
                        contentDescription = if (height == ReinventedHeight.Map) "Show the list" else "List height"
                        onClick(label = "Change the list's height") {
                            onTapHandle()
                            true
                        }
                    }.testTag("reinventedPulse.handle"),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(width = 40.dp, height = 5.dp).clip(CircleShape).background(PantopusColors.appBorder))
        }
        // The list takes the rest of the sheet, so its last rows stay above the screen's bottom however high it rests.
        list(Modifier.fillMaxWidth().weight(1f))
    }
}

/** Where the sheet's top rests for a height: under the header, a third of the way down, or near the bottom. */
private fun restOf(
    height: ReinventedHeight,
    header: Dp,
    full: Dp,
): Dp =
    when (height) {
        ReinventedHeight.List -> header
        ReinventedHeight.Middle -> header + full / 3
        ReinventedHeight.Map -> full - PEEK
    }

/** A pin on the map: a ring plays its Moments, a mark opens its post, a kept Moment plays, a ticket opens its plan. */
private fun openMapItem(
    item: ReinventedMapItem,
    actions: ReinventedPulseActions,
    onOpenMoment: (MomentDto) -> Unit,
    onOpenRing: (MomentRingDto) -> Unit,
) {
    when (item) {
        is ReinventedMapItem.Ring -> onOpenRing(item.ring)
        is ReinventedMapItem.Mark -> actions.onOpenPost(item.mark.post.id)
        is ReinventedMapItem.Kept -> onOpenMoment(item.kept.moment)
        is ReinventedMapItem.Ticket -> actions.onOpenPlan(item.ticket.id)
    }
}

private val PEEK = 64.dp
private val HANDLE = 22.dp
private const val MINUTE_MS = 60_000L
