package app.pantopus.android.ui.guidance

import android.view.ViewGroup
import android.view.WindowManager
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import app.pantopus.android.ui.theme.rememberReduceMotion
import kotlin.math.roundToInt

/** The app is drawing its dark palette (it is light-only today; the cards follow it if that changes). */
@Composable
private fun guidanceDark(): Boolean = MaterialTheme.colorScheme.background.luminance() < DARK_LUMINANCE

/**
 * The centre card (spec §1): in the middle of the screen over a dimmed, untappable screen; a title with an X, up to three
 * icon rows, one full-width primary button. The button, the X, a tap on the dim and Back all close it ([onClose]); the
 * button may also act ([onPrimary], cards 24–27). It fades and scales in from 96 % over 200 ms (only fades with
 * animations off). In its own dialog window, so TalkBack reads it as a dialog: title, each row, then the button.
 */
@Composable
@OptIn(ExperimentalComposeUiApi::class)
@Suppress("LongMethod")
fun GuidanceCentreCardView(
    card: GuidanceCentre,
    onClose: () -> Unit,
    onPrimary: () -> Unit = onClose,
) {
    val dark = guidanceDark()
    val reduceMotion = rememberReduceMotion()
    Dialog(
        onDismissRequest = onClose,
        properties =
            DialogProperties(
                dismissOnBackPress = true,
                dismissOnClickOutside = false,
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false,
            ),
    ) {
        // The card draws its own dim (spec colours), over the whole screen.
        val window = (LocalView.current.parent as? DialogWindowProvider)?.window
        SideEffect {
            window?.let { w ->
                // No platform dim: a window that dims behind makes the phone draw white status icons, as if the strip
                // were dimmed, and the strip stays white (the app draws it outside the dim), so they vanished.
                w.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
                w.setDimAmount(0f)
                w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                // The status strip above the app stays light (the app draws it outside the tabs): dark icons there; the
                // navigation bar sits on the dim: light icons.
                @Suppress("DEPRECATION")
                w.statusBarColor = android.graphics.Color.TRANSPARENT
                @Suppress("DEPRECATION")
                w.navigationBarColor = android.graphics.Color.TRANSPARENT
                WindowCompat.getInsetsController(w, w.decorView).apply {
                    isAppearanceLightStatusBars = true
                    isAppearanceLightNavigationBars = false
                }
            }
        }
        val shown = remember { Animatable(0f) }
        LaunchedEffect(Unit) { shown.animateTo(1f, tween(APPEAR_MS)) }
        val surface = if (dark) PantopusColors.appSurfaceRaisedDark else PantopusColors.appSurface
        val ink = if (dark) PantopusColors.appTextDark else PantopusColors.appText
        val rowInk = if (dark) PantopusColors.appTextStrongDark else PantopusColors.appTextStrong
        Box(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .graphicsLayer { alpha = shown.value }
                        // A tap on the dim closes the card. No accessibility node: TalkBack starts on the title and
                        // closes with the button, the X or Back.
                        .pointerInput(onClose) { detectTapGestures { onClose() } },
            )
            Column(
                modifier =
                    Modifier
                        .align(Alignment.Center)
                        .systemBarsPadding()
                        .padding(horizontal = Spacing.s5, vertical = Spacing.s6)
                        .fillMaxWidth()
                        .graphicsLayer {
                            alpha = shown.value
                            val scale = if (reduceMotion) 1f else START_SCALE + (1f - START_SCALE) * shown.value
                            scaleX = scale
                            scaleY = scale
                        }.shadow(CARD_SHADOW, RoundedCornerShape(CARD_RADIUS))
                        .clip(RoundedCornerShape(CARD_RADIUS))
                        .background(surface)
                        // Taps on the card itself don't reach the dim behind it.
                        .pointerInput(Unit) { detectTapGestures { } }
                        .semantics {
                            paneTitle = card.title
                            isTraversalGroup = true
                            testTagsAsResourceId = true
                        }.testTag("guidance.card.${card.id}")
                        .padding(start = Spacing.s6, end = Spacing.s6, top = 26.dp, bottom = 22.dp),
                verticalArrangement = Arrangement.spacedBy(Spacing.s5),
            ) {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(Spacing.s3)) {
                    Text(
                        text = card.title,
                        color = ink,
                        fontSize = 25.sp,
                        lineHeight = 28.sp,
                        fontWeight = FontWeight.Bold,
                        modifier =
                            Modifier
                                .weight(1f)
                                .semantics {
                                    heading()
                                    traversalIndex = TITLE_ORDER
                                },
                    )
                    // The drawing's 32 dp X, nudged up and out; its 44 dp touch area overhangs without growing the row.
                    Box(
                        modifier =
                            Modifier
                                .offset(x = 6.dp, y = (-2).dp)
                                .size(Spacing.s8)
                                .wrapContentSize(unbounded = true),
                    ) {
                        Box(
                            modifier =
                                Modifier
                                    .size(44.dp)
                                    .clip(RoundedCornerShape(Radii.pill))
                                    .clickable(onClick = onClose)
                                    .semantics {
                                        contentDescription = "Close"
                                        role = Role.Button
                                        // After the button: the title, each row and the button come first.
                                        traversalIndex = CLOSE_ORDER
                                    }.testTag("guidance.card.${card.id}.close"),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(GuidanceIcon.X.vector, contentDescription = null, tint = ink, modifier = Modifier.size(Spacing.s6))
                        }
                    }
                }
                // At large text sizes the rows scroll inside the card; the title and the button stay in view.
                Column(
                    modifier =
                        Modifier
                            .weight(1f, fill = false)
                            .verticalScroll(rememberScrollState())
                            .semantics { traversalIndex = ROWS_ORDER },
                    verticalArrangement = Arrangement.spacedBy(Spacing.s4),
                ) {
                    card.lines.forEach { line ->
                        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            Icon(
                                line.icon.vector,
                                contentDescription = null,
                                tint = ink,
                                modifier = Modifier.padding(top = 1.dp).size(26.dp),
                            )
                            Text(text = line.text, color = rowInk, fontSize = 16.sp, lineHeight = 22.7.sp, modifier = Modifier.weight(1f))
                        }
                    }
                }
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 52.dp)
                            .clip(RoundedCornerShape(Radii.lg))
                            .background(PantopusColors.primary600)
                            .clickable(role = Role.Button) {
                                onPrimary()
                            }.semantics { traversalIndex = BUTTON_ORDER }
                            .testTag("guidance.card.${card.id}.primary")
                            .padding(horizontal = Spacing.s4, vertical = 14.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = card.button,
                        color = PantopusColors.appTextInverse,
                        fontSize = 16.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.Medium,
                        letterSpacing = 0.01.em,
                    )
                }
            }
        }
    }
}

/**
 * The centre card's dim, drawn in the app's own window under the card's dialog window, so it also covers the status and
 * navigation bars (a dialog window stops at them). It fades in with the card and takes no touches of its own.
 */
@Composable
fun GuidanceDim() {
    val dark = guidanceDark()
    val shown = remember { Animatable(0f) }
    LaunchedEffect(Unit) { shown.animateTo(1f, tween(APPEAR_MS)) }
    val dim = if (dark) Color.Black.copy(alpha = DIM_DARK) else PantopusColors.appText.copy(alpha = DIM_LIGHT)
    Box(modifier = Modifier.fillMaxSize().graphicsLayer { alpha = shown.value }.background(dim))
}

/**
 * The pointer (spec §1): a ring around the control and a blue bubble attached to it, below the control or above it when
 * the control is in the lower half of the screen, 12 dp from the screen's sides. The screen is not dimmed and still
 * works: “Got it”, a tap anywhere or a tap on the ringed control close it (the host watches the taps). If the control
 * leaves the screen the pointer closes.
 */
@Composable
@OptIn(ExperimentalComposeUiApi::class)
@Suppress("LongMethod")
fun GuidancePointerView(
    pointer: GuidancePointer,
    anchors: GuidanceAnchors,
    onClose: () -> Unit,
) {
    val dark = guidanceDark()
    val density = LocalDensity.current
    var origin by remember { mutableStateOf(Offset.Zero) }
    // Read so the ring follows the control when it moves.

    @Suppress("UNUSED_VARIABLE")
    val revision = anchors.revision
    val anchor = anchors.find(pointer.target)
    val control = anchor?.bounds()
    LaunchedEffect(control == null) { if (control == null) onClose() }
    if (control == null || anchor == null) return
    val ring = if (dark) PantopusColors.primary300 else PantopusColors.primary600
    val halo = ring.copy(alpha = if (dark) HALO_DARK else HALO_LIGHT)
    val local = control.translate(-origin.x, -origin.y)
    BoxWithConstraints(
        modifier =
            Modifier
                .fillMaxSize()
                .onGloballyPositioned { origin = it.positionInWindow() },
    ) {
        val width = constraints.maxWidth.toFloat()
        val height = constraints.maxHeight.toFloat()
        with(density) {
            val pad = RING_GAP.toPx()
            val stroke = RING_STROKE.toPx()
            val haloWidth = HALO.toPx()
            val radius = anchor.cornerRadius?.toPx() ?: (minOf(local.width, local.height) / 2f)
            // The ring and its halo: drawn only, never a touch target, so the control under it still takes its tap.
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .drawBehind {
                            val ringRect = local.inflate(pad + stroke / 2f)
                            val haloRect = local.inflate(pad + stroke + haloWidth / 2f)
                            drawRoundRect(
                                color = halo,
                                topLeft = haloRect.topLeft,
                                size = haloRect.size,
                                cornerRadius = CornerRadius(radius + pad + stroke + haloWidth / 2f),
                                style = Stroke(width = haloWidth),
                            )
                            drawRoundRect(
                                color = ring,
                                topLeft = ringRect.topLeft,
                                size = ringRect.size,
                                cornerRadius = CornerRadius(radius + pad + stroke / 2f),
                                style = Stroke(width = stroke),
                            )
                        },
            )
            val edge = EDGE.toPx()
            val bubbleWidth = minOf(BUBBLE_WIDTH.toPx(), width - 2 * edge)
            val centreX = local.center.x
            val left = (centreX - bubbleWidth / 2f).coerceIn(edge, maxOf(edge, width - edge - bubbleWidth))
            val below = local.center.y < height / 2f
            val gap = (RING_GAP + BUBBLE_GAP).toPx()
            val arrowX = (centreX - left).coerceIn(ARROW_INSET.toPx(), bubbleWidth - ARROW_INSET.toPx())
            PointerBubble(
                pointer = pointer,
                below = below,
                arrowX = arrowX,
                onClose = onClose,
                modifier = Modifier.width(with(density) { bubbleWidth.toDp() }),
                place = { bubbleHeight ->
                    val top =
                        if (below) {
                            local.bottom + gap
                        } else {
                            local.top - gap - bubbleHeight
                        }
                    IntOffset(left.roundToInt(), top.coerceIn(edge, maxOf(edge, height - edge - bubbleHeight)).roundToInt())
                },
            )
        }
    }
}

/** The pointer's bubble: primary blue, white text, a bold title, one sentence and the “Got it” pill. */
@Composable
@OptIn(ExperimentalComposeUiApi::class)
private fun PointerBubble(
    pointer: GuidancePointer,
    below: Boolean,
    arrowX: Float,
    onClose: () -> Unit,
    place: (bubbleHeight: Float) -> IntOffset,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    Layout(
        content = {
            Column(
                modifier =
                    modifier
                        .shadow(BUBBLE_SHADOW, RoundedCornerShape(BUBBLE_RADIUS), clip = false)
                        .drawBehind {
                            val arrow = with(density) { ARROW.toPx() }
                            val corner = with(density) { ARROW_CORNER.toPx() }
                            val tuck = with(density) { 1.dp.toPx() }
                            val y = if (below) -arrow / 2f + tuck else size.height - arrow / 2f - tuck
                            rotate(degrees = 45f, pivot = Offset(arrowX, y)) {
                                drawRoundRect(
                                    color = PantopusColors.primary600,
                                    topLeft = Offset(arrowX - arrow / 2f, y - arrow / 2f),
                                    size = Size(arrow, arrow),
                                    cornerRadius = CornerRadius(corner),
                                )
                            }
                            drawRoundRect(
                                color = PantopusColors.primary600,
                                size = size,
                                cornerRadius = CornerRadius(with(density) { BUBBLE_RADIUS.toPx() }),
                            )
                        }.pointerInput(Unit) { detectTapGestures { onClose() } }
                        .semantics {
                            paneTitle = pointer.title
                            isTraversalGroup = true
                            testTagsAsResourceId = true
                        }.testTag("guidance.pointer.${pointer.id}")
                        .padding(start = Spacing.s4, end = Spacing.s4, top = 15.dp, bottom = Spacing.s3),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    pointer.title,
                    color = PantopusColors.appTextInverse,
                    fontSize = 17.sp,
                    lineHeight = 22.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.01).em,
                    modifier = Modifier.semantics { heading() },
                )
                Text(pointer.sentence, color = PantopusColors.appTextInverse, fontSize = 15.5.sp, lineHeight = 21.4.sp)
                Row(modifier = Modifier.fillMaxWidth().padding(top = Spacing.s1), horizontalArrangement = Arrangement.End) {
                    Text(
                        "Got it",
                        color = PantopusColors.appTextInverse,
                        fontSize = 15.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier =
                            Modifier
                                .clip(RoundedCornerShape(Radii.pill))
                                .background(Color.White.copy(alpha = PILL_ALPHA))
                                .clickable(role = Role.Button, onClick = onClose)
                                .testTag("guidance.pointer.${pointer.id}.ok")
                                .padding(horizontal = Spacing.s4, vertical = 7.dp),
                    )
                }
            }
        },
    ) { measurables, constraints ->
        val placeable = measurables.first().measure(constraints.copy(minWidth = 0, minHeight = 0))
        layout(constraints.maxWidth, constraints.maxHeight) {
            placeable.place(place(placeable.height.toFloat()))
        }
    }
}

private const val DARK_LUMINANCE = 0.5f

/** TalkBack reads the title, then each row, then the button, and the X last. */
private const val TITLE_ORDER = 0f
private const val ROWS_ORDER = 1f
private const val BUTTON_ORDER = 2f
private const val CLOSE_ORDER = 3f
private const val DIM_LIGHT = 0.52f
private const val DIM_DARK = 0.62f
private const val START_SCALE = 0.96f
private const val APPEAR_MS = 200
private const val HALO_LIGHT = 0.2f
private const val HALO_DARK = 0.28f
private const val PILL_ALPHA = 0.2f
private val CARD_RADIUS = 28.dp
private val CARD_SHADOW = 24.dp
private val RING_GAP = 4.dp
private val RING_STROKE = 2.5.dp
private val HALO = 6.dp
private val BUBBLE_WIDTH = 272.dp
private val BUBBLE_GAP = 14.dp
private val BUBBLE_RADIUS = 18.dp
private val BUBBLE_SHADOW = 14.dp
private val EDGE = 12.dp
private val ARROW = 16.dp
private val ARROW_CORNER = 3.dp
private val ARROW_INSET = 24.dp
