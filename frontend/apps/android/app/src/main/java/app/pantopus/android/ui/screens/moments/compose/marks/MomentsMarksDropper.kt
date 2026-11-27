@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.compose.marks

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.components.keepsKeyboard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/*
 * "Pulse, reinvented"'s Studio, phase 0 step 4: the eyedropper (iPhone's `MomentsStudioDropper`). While it's out it lies
 * over the picture in the Studio's Text and Draw: a finger on the photo shows the colour under it in a loupe above the
 * finger, and letting go takes it (for the words in Text, for the next lines in Draw). Nothing is drawn while it's out.
 * The colours are read from the picture on the phone; nothing is sent anywhere.
 */

/** Text's hint while the eyedropper is out (Draw's too). */
internal const val DROPPER_HINT = "Touch the photo to take its color."

/** Draw's hint: the eyedropper's, the eraser's, or today's. */
internal fun drawHint(editing: MomentMarksEditing): String =
    when {
        editing.dropping -> DROPPER_HINT
        editing.pen == MomentPen.Eraser -> "Rub out lines with your finger."
        else -> "Draw with your finger."
    }

/** The longest side the picture is read at for the eyedropper: plenty for a finger's colour. */
private const val SAMPLE_SIDE = 480f

/**
 * The picture as the editor shows it, small: the picture itself, or once Resize placed it, its 9:16 canvas drawn by
 * [MomentPlacementPainter] (the routine the photo that posts is drawn with). [surface] is what the marks are on.
 */
private fun dropperSample(
    picture: Bitmap,
    placement: MomentPlacement?,
    backdrop: MomentPlacementPainter.Backdrop,
    surface: IntSize,
): Bitmap {
    val scale = min(1f, SAMPLE_SIDE / max(surface.width, surface.height).coerceAtLeast(1))
    val width = (surface.width * scale).roundToInt().coerceAtLeast(1)
    val height = (surface.height * scale).roundToInt().coerceAtLeast(1)
    val sample = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(sample)
    if (placement == null) {
        canvas.drawBitmap(picture, null, Rect(0, 0, width, height), Paint(Paint.FILTER_BITMAP_FLAG))
    } else {
        MomentPlacementPainter.draw(canvas, picture, placement, backdrop, width.toFloat(), height.toFloat())
    }
    return sample
}

/**
 * The eyedropper over the picture, filling the editor's box of the picture ([drawn] px, showing [surface]). [onTake]
 * gets the colour (opaque ARGB) where the finger lifted.
 */
@Composable
internal fun MarksDropper(
    picture: Bitmap,
    placement: MomentPlacement?,
    backdrop: MomentPlacementPainter.Backdrop,
    surface: IntSize,
    drawn: Size,
    onTake: (Int) -> Unit,
) {
    val sample = remember(picture, placement, backdrop, surface) { dropperSample(picture, placement, backdrop, surface) }
    val take by rememberUpdatedState(onTake)
    var finger by remember { mutableStateOf<Offset?>(null) }

    fun colourAt(at: Offset): Int {
        val x = (at.x / drawn.width * sample.width).toInt().coerceIn(0, sample.width - 1)
        val y = (at.y / drawn.height * sample.height).toInt().coerceIn(0, sample.height - 1)
        return sample.getPixel(x, y) or (0xFF shl 24)
    }
    val middle = Offset(drawn.width / 2, drawn.height / 2)
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                // A touch here keeps the label being typed, so it takes the colour.
                .keepsKeyboard()
                .pointerInput(sample) {
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        down.consume()
                        finger = down.position
                        do {
                            val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id }
                            change?.let {
                                finger = it.position
                                it.consume()
                            }
                        } while (change?.pressed == true)
                        val last = finger
                        finger = null
                        last?.let { take(colourAt(it)) }
                    }
                }.testTag("moments.marks.dropper")
                .semantics {
                    contentDescription = "The photo. Touch it to take its color."
                    customActions =
                        listOf(
                            CustomAccessibilityAction("Take the color in the middle") {
                                take(colourAt(middle))
                                true
                            },
                        )
                },
    ) {
        finger?.let { at -> Loupe(Color(colourAt(at)), at) }
    }
}

/** A 56-dp disc of the colour in a white ring, with a dark edge so it shows on any picture, above the finger at [at]. */
@Composable
private fun Loupe(
    colour: Color,
    at: Offset,
) {
    val density = LocalDensity.current
    val half = with(density) { 28.dp.roundToPx() }
    val above = with(density) { 70.dp.roundToPx() }
    val least = with(density) { 36.dp.roundToPx() }
    Box(
        modifier =
            Modifier
                .offset { IntOffset(at.x.roundToInt() - half, max(at.y.roundToInt() - above, least) - half) }
                .size(56.dp)
                .shadow(4.dp, CircleShape)
                .clip(CircleShape)
                .background(colour)
                .border(4.dp, Color.White, CircleShape)
                .border(1.dp, PantopusColors.momentMarksShadow, CircleShape),
    )
}

/** The eyedropper's button after the photo's colours: out, it is ringed; tapped again, it goes back. */
@Composable
internal fun DropperButton(
    out: Boolean,
    onTap: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(if (out) Color.White else PantopusColors.studioPillFill)
                .border(if (out) 3.dp else 1.5.dp, if (out) PantopusColors.momentInkBlack else Color.White, CircleShape)
                .clickable(role = Role.Button, onClick = onTap)
                .testTag("moments.marks.eyedropper")
                .clearAndSetSemantics {
                    contentDescription = "Eyedropper"
                    role = Role.Button
                    stateDescription = if (out) "Out. Touch the photo to take its color." else "Takes a color from the photo"
                },
        contentAlignment = Alignment.Center,
    ) {
        PantopusIconImage(
            icon = PantopusIcon.Pipette,
            contentDescription = null,
            size = 20.dp,
            tint = if (out) PantopusColors.appText else Color.White,
        )
    }
}
