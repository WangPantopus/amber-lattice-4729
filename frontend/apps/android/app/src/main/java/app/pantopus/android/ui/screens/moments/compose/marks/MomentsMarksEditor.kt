@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.compose.marks

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.screens.mailbox.cards.sign
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Where the viewer's top bar ends, below the status bar: its progress bars (9 + 3 dp) and its header (48 dp), in
 * `MomentsViewerScreen`. The editor marks that line so nothing important goes under it.
 */
private val VIEWER_TOP_BAR = 60.dp

/** The viewer's reply bar under the picture: its frame stops above it, with rounded corners (`MomentsViewerScreen`). */
private val VIEWER_REPLY_BAR = 68.dp
private val VIEWER_CORNER = 18.dp

/**
 * The Post screen's Text and Draw pills (board T1), in Retake's style, at its top right, for a photo; off while a Post
 * is in flight.
 */
@Composable
internal fun MomentsMarksPills(
    enabled: Boolean,
    onOpen: (MomentMarksTool) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        MarksPill(
            label = "Draw",
            spoken = "Draw on the photo",
            enabled = enabled,
            onClick = { onOpen(MomentMarksTool.Draw) },
            modifier = Modifier.testTag("moments.post.draw"),
        ) {
            PantopusIconImage(icon = PantopusIcon.Pencil, contentDescription = null, size = 18.dp, tint = Color.White)
        }
    }
}

@Composable
private fun MarksPill(
    label: String,
    spoken: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leading: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier =
            modifier
                .height(40.dp)
                .alpha(if (enabled) 1f else 0.5f)
                .clip(RoundedCornerShape(Radii.xl2))
                .background(PantopusColors.momentCameraChip)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(start = Spacing.s3, end = 14.dp)
                .clearAndSetSemantics {
                    contentDescription = spoken
                    role = Role.Button
                    if (!enabled) disabled()
                },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        leading()
        Text(text = label, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * Text and Draw on the photo (boards T2 and T3): the picture fills the screen as the viewer shows it, the marks over it,
 * a line where the viewer's top bar ends. Draw: a finger draws in the ink and width picked; Undo takes the last line
 * back. Done keeps the marks; the X (and Back) drops what changed in this visit, asking first when something did.
 */
@Composable
internal fun MomentsMarksEditor(
    picture: Bitmap?,
    editing: MomentMarksEditing,
    onEdit: ((MomentMarksEditing) -> MomentMarksEditing) -> Unit,
    onClose: (keep: Boolean) -> Unit,
) {
    var asksDiscard by remember { mutableStateOf(false) }
    val cancel = { if (editing.changed) asksDiscard = true else onClose(false) }
    BackHandler(onBack = cancel)
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(PantopusColors.momentStage)
                // Nothing on the Post screen under it takes a touch while it's up.
                .pointerInput(Unit) { detectTapGestures { } }
                .testTag("moments.marks"),
    ) {
        if (picture != null) MarksCanvas(picture, editing, onStroke = { points, width -> onEdit { it.drawn(points, width) } })
        // The viewer's own top fade, over the strip its top bar covers and a little below.
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(PantopusColors.momentTopFade, Color.Transparent)))
                    .statusBarsPadding()
                    .height(VIEWER_TOP_BAR + 90.dp)
                    .clearAndSetSemantics {},
        )
        Box(
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(240.dp)
                    .background(Brush.verticalGradient(listOf(Color.Transparent, PantopusColors.momentMarksBottomFade)))
                    .clearAndSetSemantics {},
        )
        ViewerTopBarLine()
        TopButtons(editing = editing, onCancel = cancel, onUndo = { onEdit { it.undone() } }, onDone = { onClose(true) })
        if (editing.tool == MomentMarksTool.Draw) {
            Widths(
                picked = editing.width,
                onPick = { width -> onEdit { it.copy(width = width) } },
                modifier = Modifier.align(Alignment.CenterEnd).padding(end = Spacing.s3),
            )
        }
        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(start = Spacing.s4, end = Spacing.s4, bottom = Spacing.s6),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Draw with your finger.",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                style = TextStyle(shadow = Shadow(Color.Black.copy(alpha = 0.6f), offset = Offset(0f, 1f), blurRadius = 2f)),
            )
            Spacer(Modifier.height(Spacing.s3))
            Inks(picked = editing.ink, onPick = { ink -> onEdit { it.copy(ink = ink) } })
        }
    }
    if (asksDiscard) {
        DiscardChanges(
            onKeep = { asksDiscard = false },
            onDiscard = {
                asksDiscard = false
                onClose(false)
            },
        )
    }
}

/** The X with changes made in this visit: "Discard your changes?" */
@Composable
private fun DiscardChanges(
    onKeep: () -> Unit,
    onDiscard: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onKeep,
        title = { Text("Discard your changes?") },
        confirmButton = {
            TextButton(onClick = onDiscard, modifier = Modifier.testTag("moments.marks.discard")) {
                Text("Discard", color = PantopusColors.error)
            }
        },
        dismissButton = {
            TextButton(onClick = onKeep, modifier = Modifier.testTag("moments.marks.keep")) { Text("Keep editing") }
        },
    )
}

/**
 * The picture filling the viewer's frame (the whole width, above its reply bar), cropped as the viewer crops it, with
 * its marks drawn by [MomentMarksPainter] (the routine the photo that posts is drawn with). Each finger down to up is
 * a line, in the picture's own coordinates.
 */
@Composable
private fun MarksCanvas(
    picture: Bitmap,
    editing: MomentMarksEditing,
    onStroke: (List<Float>, Float) -> Unit,
) {
    val image = remember(picture) { picture.asImageBitmap() }
    val live = remember { mutableStateListOf<Float>() }
    BoxWithConstraints(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(bottom = VIEWER_REPLY_BAR)
                .clip(RoundedCornerShape(bottomStart = VIEWER_CORNER, bottomEnd = VIEWER_CORNER)),
        contentAlignment = Alignment.Center,
    ) {
        val frameWidth = constraints.maxWidth.toFloat()
        val frameHeight = constraints.maxHeight.toFloat()
        val scale = max(frameWidth / picture.width, frameHeight / picture.height)
        val density = LocalDensity.current
        // The width picked is in dp on this screen; the line keeps it as a share of the picture's width as shown.
        val lineWidth = with(density) { editing.width.points.dp.toPx() } / (picture.width * scale)
        val stroke by rememberUpdatedState { points: List<Float> -> onStroke(points, lineWidth) }
        Canvas(
            modifier =
                Modifier
                    .requiredSize(with(density) { (picture.width * scale).toDp() }, with(density) { (picture.height * scale).toDp() })
                    .testTag("moments.marks.picture")
                    .semantics { contentDescription = "The photo you're posting. Draw on it with one finger." }
                    .pointerInput(Unit) { sign(live, onInk = {}, box = Size(1f, 1f)) { stroke(it) } },
        ) {
            drawImage(
                image,
                dstSize = IntSize(size.width.roundToInt(), size.height.roundToInt()),
                filterQuality = FilterQuality.Medium,
            )
            val marks =
                if (live.isEmpty()) {
                    editing.marks
                } else {
                    editing.marks.copy(strokes = editing.marks.strokes + MomentStroke(live.toList(), editing.ink, lineWidth))
                }
            drawIntoCanvas { MomentMarksPainter.draw(it.nativeCanvas, marks, size.width, size.height) }
        }
    }
}

/** A dashed line where the viewer's top bar ends (it covers the picture above it). */
@Composable
private fun ViewerTopBarLine() {
    Canvas(
        modifier =
            Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(top = VIEWER_TOP_BAR)
                .height(1.dp)
                .clearAndSetSemantics {},
    ) {
        val dash = 5.dp.toPx()
        drawLine(
            PantopusColors.momentMarksGuide,
            start = Offset(0f, 0f),
            end = Offset(size.width, 0f),
            strokeWidth = 1.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(dash, dash)),
        )
    }
}

/** The X, Undo (Draw) and Done (board T3). */
@Composable
private fun TopButtons(
    editing: MomentMarksEditing,
    onCancel: () -> Unit,
    onUndo: () -> Unit,
    onDone: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(start = Spacing.s3, end = Spacing.s3, top = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        RoundButton(icon = PantopusIcon.X, spoken = "Cancel", onClick = onCancel, modifier = Modifier.testTag("moments.marks.cancel"))
        Spacer(Modifier.weight(1f))
        if (editing.tool == MomentMarksTool.Draw) {
            RoundButton(
                icon = PantopusIcon.Undo,
                spoken = "Undo",
                onClick = onUndo,
                enabled = editing.marks.strokes.isNotEmpty(),
                modifier = Modifier.testTag("moments.marks.undo"),
            )
        }
        Text(
            text = "Done",
            color = PantopusColors.appText,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier =
                Modifier
                    .height(40.dp)
                    .clip(RoundedCornerShape(Radii.xl2))
                    .background(Color.White)
                    .clickable(role = Role.Button, onClick = onDone)
                    .padding(horizontal = 18.dp, vertical = 10.dp)
                    .testTag("moments.marks.done"),
        )
    }
}

@Composable
private fun RoundButton(
    icon: PantopusIcon,
    spoken: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Box(
        modifier =
            modifier
                .size(44.dp)
                .alpha(if (enabled) 1f else 0.5f)
                .clip(CircleShape)
                .background(PantopusColors.momentCameraChip)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .clearAndSetSemantics {
                    contentDescription = spoken
                    role = Role.Button
                    if (!enabled) disabled()
                },
        contentAlignment = Alignment.Center,
    ) {
        PantopusIconImage(icon = icon, contentDescription = null, size = 22.dp, tint = Color.White)
    }
}

/** Draw's three line widths, down the right edge (board T3). */
@Composable
private fun Widths(
    picked: MomentLineWidth,
    onPick: (MomentLineWidth) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.semantics { contentDescription = "Line width" },
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        MomentLineWidth.entries.forEach { width ->
            val on = width == picked
            Box(
                modifier =
                    Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(PantopusColors.momentCameraChip)
                        .border(if (on) 2.dp else 1.dp, if (on) Color.White else PantopusColors.momentReplyOutline, CircleShape)
                        .clickable(role = Role.RadioButton) { onPick(width) }
                        .testTag("moments.marks.width.${width.key}")
                        .clearAndSetSemantics {
                            contentDescription = width.spoken
                            role = Role.RadioButton
                            selected = on
                        },
                contentAlignment = Alignment.Center,
            ) {
                val dot =
                    when (width) {
                        MomentLineWidth.Thin -> 6.dp
                        MomentLineWidth.Medium -> 11.dp
                        MomentLineWidth.Thick -> 17.dp
                    }
                Box(Modifier.size(dot).clip(CircleShape).background(Color.White))
            }
        }
    }
}

/** The six inks (boards T2 and T3): the one picked is ringed. */
@Composable
private fun Inks(
    picked: MomentInk,
    onPick: (MomentInk) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Ink color" },
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
    ) {
        MomentInk.entries.forEach { ink ->
            val on = ink == picked
            Box(
                modifier =
                    Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .clickable(role = Role.RadioButton) { onPick(ink) }
                        .testTag("moments.marks.color.${ink.key}")
                        .clearAndSetSemantics {
                            contentDescription = ink.spoken
                            role = Role.RadioButton
                            selected = on
                        },
                contentAlignment = Alignment.Center,
            ) {
                if (on) {
                    Box(
                        modifier =
                            Modifier
                                .size(38.dp)
                                .border(2.dp, Color.White, CircleShape)
                                .padding(2.dp)
                                .clip(CircleShape)
                                .background(ink.color)
                                .border(3.dp, PantopusColors.momentInkBlack, CircleShape),
                    )
                } else {
                    val edge =
                        if (ink == MomentInk.White) PantopusColors.momentInkBlack.copy(alpha = 0.5f) else Color.White.copy(alpha = 0.8f)
                    Box(Modifier.size(30.dp).clip(CircleShape).background(ink.color).border(1.5.dp, edge, CircleShape))
                }
            }
        }
    }
}
