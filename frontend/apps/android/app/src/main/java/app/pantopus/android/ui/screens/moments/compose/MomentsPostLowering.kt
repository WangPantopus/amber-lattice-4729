@file:Suppress("MagicNumber", "LongMethod")

package app.pantopus.android.ui.screens.moments.compose

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Spacing
import app.pantopus.android.ui.theme.rememberReduceMotion
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The Post sheet pulled down to see the photo or video being posted (founder, 2026-11-24). A drag down on the sheet (its
 * grab handle, Post's row, or past the top of its options) lowers it to a strip at the bottom of the screen, and the
 * picture shows whole and no longer darkened, as it will post. A drag up on the strip, or a tap on it, brings the sheet
 * back as it was; a tap on the grab handle lowers it. The sheet follows the finger on the same frame and springs to the
 * end the drag aims at, at the finger's speed (as the Plans sheet does, `PlanSheet.kt`): it is laid out once and slides
 * by an offset, so a drag frame measures nothing and recomposes nothing but the strip.
 */
@Stable
class MomentsPostLowering {
    /** How far below its place the sheet stands, in px. */
    var offsetPx by mutableFloatStateOf(0f)
        private set

    /** Lowered: only the strip shows. */
    var isLowered by mutableStateOf(false)
        private set

    /** The sheet's height, measured. */
    internal var sheetPx by mutableFloatStateOf(0f)

    /** What the lowered sheet shows: the strip. */
    internal var stripPx by mutableFloatStateOf(0f)

    internal var resistPx = 0f
    internal var dragging = false
        private set
    private var finger = 0f
    private var startedLowered = false
    private var animation: Job? = null

    /** How far down the lowered sheet stands: all of it but the strip. */
    val travel: Float
        get() = (sheetPx - stripPx).coerceAtLeast(0f)

    /** 0 with the sheet up, 1 lowered. */
    val progress: Float
        get() = if (travel > 0f) (offsetPx / travel).coerceIn(0f, 1f) else 0f

    internal fun dragBy(delta: Float) {
        if (!dragging) {
            animation?.cancel()
            dragging = true
            finger = offsetPx
            startedLowered = isLowered
        }
        finger += delta
        offsetPx = resisted(finger)
    }

    /**
     * A release: the end the drag aims at, and after a flick the way it was going. A third of the way from where it rested
     * is enough to go to the other end, so a short pull down shows the picture and a short push up brings the options
     * back (as on iOS).
     */
    internal fun settle(
        scope: CoroutineScope,
        velocity: Float,
        flickPx: Float,
        spec: AnimationSpec<Float>,
    ) {
        if (!dragging) return
        dragging = false
        val aimed = offsetPx + velocity * 0.18f
        val line = travel * if (startedLowered) 1f - REACH else REACH
        val lower = velocity > flickPx || (velocity >= -flickPx && aimed > line)
        glide(scope, lower, velocity, spec)
    }

    /** A tap on the handle or the strip, or TalkBack's action. */
    internal fun setLowered(
        scope: CoroutineScope,
        lowered: Boolean,
        spec: AnimationSpec<Float>,
    ) {
        if (dragging || travel <= 0f) return
        // Already there and not on its way: nothing to do.
        if (lowered == isLowered && animation?.isActive != true) return
        glide(scope, lowered, 0f, spec)
    }

    private fun glide(
        scope: CoroutineScope,
        lowered: Boolean,
        velocity: Float,
        spec: AnimationSpec<Float>,
    ) {
        animation?.cancel()
        isLowered = lowered
        val target = if (lowered) travel else 0f
        if (abs(offsetPx - target) < 0.5f) {
            offsetPx = target
            return
        }
        animation = scope.launch { animate(offsetPx, target, velocity, spec) { value, _ -> offsetPx = value } }
    }

    /** The sheet's height changed (an error line, the keyboard): a lowered sheet keeps only its strip showing. */
    internal fun measured(height: Float) {
        if (abs(height - sheetPx) < 0.5f) return
        sheetPx = height
        if (isLowered && !dragging && animation?.isActive != true) offsetPx = travel
    }

    /** Past the top and the bottom the sheet gives less and less, as a scroll view's rubber band does. */
    private fun resisted(position: Float): Float =
        when {
            position < 0f -> -resist(-position)
            position > travel -> travel + resist(position - travel)
            else -> position
        }

    private fun resist(distance: Float): Float {
        val limit = resistPx.coerceAtLeast(1f)
        return limit * (1f - 1f / (distance * 0.55f / limit + 1f))
    }
}

/**
 * What makes the Post sheet pull down: it slides by [lowering]'s offset, a drag anywhere on it that its options don't
 * scroll moves it, and a pull down at the options' top (or up while it is partly down) moves it before they scroll. A
 * little surface hangs below it, so a pull up past its place never shows the picture under it. No [lowering], no drag.
 */
@Composable
fun rememberMomentsPostDrag(lowering: MomentsPostLowering?): Modifier {
    if (lowering == null) return Modifier
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    val spec = momentsPostLoweringSpec()
    val latestSpec by rememberUpdatedState(spec)
    val flickPx = with(density) { FLICK_DP.toPx() }
    val resistPx = with(density) { RESIST_DP.toPx() }
    // The Post screen stands above the navigation bar, so the strip needs no room for it.
    val stripPx = with(density) { STRIP_DP.toPx() }
    SideEffect {
        lowering.resistPx = resistPx
        lowering.stripPx = stripPx
    }
    val surface = PantopusColors.appSurface
    val nested =
        remember(lowering) {
            object : NestedScrollConnection {
                override fun onPreScroll(
                    available: Offset,
                    source: NestedScrollSource,
                ): Offset {
                    if (source != NestedScrollSource.UserInput || available.y >= 0f) return Offset.Zero
                    // Pulling up while the sheet is partly down raises it first; at its place the options scroll.
                    if (lowering.offsetPx <= 0.5f) return Offset.Zero
                    val move = maxOf(available.y, -lowering.offsetPx)
                    lowering.dragBy(move)
                    return Offset(0f, move)
                }

                override fun onPostScroll(
                    consumed: Offset,
                    available: Offset,
                    source: NestedScrollSource,
                ): Offset {
                    if (source != NestedScrollSource.UserInput || available.y <= 0f) return Offset.Zero
                    // The options are at their top and still pulled down: the sheet comes down with the finger.
                    if (!lowering.dragging) focus.clearFocus()
                    lowering.dragBy(available.y)
                    return Offset(0f, available.y)
                }

                override suspend fun onPreFling(available: Velocity): Velocity {
                    if (!lowering.dragging) return Velocity.Zero
                    lowering.settle(scope, available.y, flickPx, latestSpec)
                    return available
                }
            }
        }
    return Modifier
        .onSizeChanged { lowering.measured(it.height.toFloat()) }
        // Placement only: a drag frame moves the sheet and measures nothing.
        .offset { IntOffset(0, lowering.offsetPx.roundToInt()) }
        .drawBehind {
            drawRect(surface, topLeft = Offset(0f, size.height - 1f), size = Size(size.width, OVERHANG_DP.toPx()))
        }.nestedScroll(nested)
        .draggable(
            state =
                rememberDraggableState { delta ->
                    if (!lowering.dragging && delta > 0f) focus.clearFocus()
                    lowering.dragBy(delta)
                },
            orientation = Orientation.Vertical,
            onDragStopped = { velocity -> lowering.settle(scope, velocity, flickPx, latestSpec) },
        )
}

/** The spring of the Plans sheet (about 0.35 s); a short ease with animations off. */
@Composable
private fun momentsPostLoweringSpec(): AnimationSpec<Float> {
    val reduceMotion = rememberReduceMotion()
    return if (reduceMotion) tween(150) else spring(dampingRatio = 0.86f, stiffness = Spring.StiffnessMediumLow)
}

/** Lowers or raises the sheet from a tap: the grab handle's, the strip's or TalkBack's. */
@Composable
fun rememberMomentsPostLower(lowering: MomentsPostLowering?): (Boolean) -> Unit {
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    val spec = momentsPostLoweringSpec()
    val latestSpec by rememberUpdatedState(spec)
    return remember(lowering, scope) {
        { lowered ->
            if (lowered) focus.clearFocus()
            lowering?.setLowered(scope, lowered, latestSpec)
        }
    }
}

/**
 * The lowered sheet's strip, over the sheet's top: the grab handle and "Swipe up to finish posting". It fades in as the
 * sheet goes down; a tap brings the sheet back, and a drag on it moves the sheet (the sheet's own drag). Nothing of it
 * is there while the sheet is up.
 */
@Composable
fun MomentsPostStrip(
    lowering: MomentsPostLowering,
    onRaise: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (lowering.offsetPx <= 0.5f && !lowering.isLowered) return
    val density = LocalDensity.current
    val height = with(density) { lowering.stripPx.toDp() }
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .height(height)
                .graphicsLayer { alpha = lowering.progress }
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(PantopusColors.appSurface)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = lowering.isLowered,
                    onClick = onRaise,
                ).testTag("moments.post.strip")
                .semantics(mergeDescendants = true) {
                    contentDescription = "Post options. Shows the options and Post again"
                    role = Role.Button
                    onClick(label = "Show the options") {
                        onRaise()
                        true
                    }
                },
    ) {
        Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier =
                    Modifier
                        .padding(top = Spacing.s2)
                        .size(width = 36.dp, height = 5.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(PantopusColors.appBorder),
            )
            Text(
                text = "Swipe up to finish posting",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = PantopusColors.appTextSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = Spacing.s3, start = Spacing.s4, end = Spacing.s4),
            )
        }
    }
}

/** What the lowered sheet shows: the grab handle and its line. */
private val STRIP_DP = 64.dp

/** How far toward the other end a release must aim to go there. */
private const val REACH = 0.3f

/** Faster than this a release goes the way it was going (as on iOS, and the Plans sheet). */
private val FLICK_DP = 300.dp

/** How far past its ends the sheet can be pulled, at most. */
private val RESIST_DP = 80.dp

/** The surface below the sheet, for a pull up past its place. */
private val OVERHANG_DP = 120.dp
