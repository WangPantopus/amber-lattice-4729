@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.compose.marks

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.ui.screens.mailbox.cards.table.CardSignatureInk
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.Spacing
import kotlin.math.hypot
import kotlin.math.max

/*
 * "Pulse, reinvented"'s Studio, phase 0 step 4: Draw's pens (iPhone #4958). A highlighter, an arrow and an eraser beside
 * today's pen. Like every mark they are drawn into the picture on the phone before it goes up, so the server and every
 * app see an ordinary picture. Only the Studio picks a pen: today's composer draws every line with [MomentPen.Marker],
 * exactly as before.
 */

/** What drew a line (iPhone's `MomentMarks.Pen`). [Marker] is today's pen, the only one outside the Studio. */
enum class MomentPen(
    val key: String,
    val spoken: String,
    val icon: PantopusIcon,
    /** A highlighter and an eraser are wider than the width picked: a highlighter covers words, an eraser is easy to aim. */
    val widthFactor: Float,
) {
    Marker("marker", "Pen", PantopusIcon.Pencil, 1f),
    Highlighter("highlighter", "Highlighter", PantopusIcon.Highlighter, 2.6f),
    Arrow("arrow", "Arrow", PantopusIcon.ArrowUpRight, 1f),
    Eraser("eraser", "Eraser", PantopusIcon.Eraser, 2.4f),
}

/**
 * A line drawn with what Draw has picked: the ink or the photo's colour, and the pen (today's everywhere outside the
 * Studio, at the width picked).
 */
internal fun MomentMarksEditing.line(
    points: List<Float>,
    width: Float,
): MomentStroke = MomentStroke(points, ink, width * pen.widthFactor, tint = drawTint, pen = pen)

/** Draw's pen picked; the eyedropper goes back. */
internal fun MomentMarksEditing.penned(pen: MomentPen): MomentMarksEditing = copy(pen = pen, dropping = false)

/** One of the six inks for lines (the photo's colour goes); with the eraser out, the pen comes back. */
internal fun MomentMarksEditing.inkedLines(ink: MomentInk): MomentMarksEditing =
    copy(ink = ink, drawTint = null, pen = pen.afterColour(), dropping = false)

/** A colour from the photo for the next lines; with the eraser out, the pen comes back. */
internal fun MomentMarksEditing.tintedLines(color: Int): MomentMarksEditing =
    copy(drawTint = color, pen = pen.afterColour(), dropping = false)

/** The eyedropper let go on [color]: the words in Text (the picked label and the next ones), the next lines in Draw. */
internal fun MomentMarksEditing.dropped(color: Int): MomentMarksEditing =
    if (tool == MomentMarksTool.Text) tinted(color).copy(dropping = false) else tintedLines(color)

private fun MomentPen.afterColour(): MomentPen = if (this == MomentPen.Eraser) MomentPen.Marker else this

/** Lines with a Studio pen among them, drawn on a layer of their own so the eraser takes out lines, never the picture. */
internal object MomentPensPainter {
    /** A highlighter's ink shows the picture through it (iPhone's 42%). */
    private const val HIGHLIGHTER_ALPHA = 107

    /** An arrow's head: this many line widths long, and never shorter than this share of the picture's width. */
    private const val HEAD_WIDTHS = 3.2f
    private const val HEAD_LEAST = 0.03f

    fun draw(
        canvas: Canvas,
        strokes: List<MomentStroke>,
        width: Float,
        height: Float,
    ) {
        val layer = canvas.saveLayer(0f, 0f, width, height, null)
        for (stroke in strokes) {
            if (stroke.points.size < 2) continue
            val pixels = ArrayList<Float>(stroke.points.size)
            stroke.points.forEachIndexed { at, value -> pixels += value * if (at % 2 == 0) width else height }
            val ink = CardSignatureInk.paint(multiply = false)
            ink.color = stroke.tint ?: stroke.ink.color.toArgb()
            // Never thinner than a pixel, even on a small picture.
            ink.strokeWidth = (stroke.width * width).coerceAtLeast(1f)
            when (stroke.pen) {
                MomentPen.Marker -> canvas.drawPath(CardSignatureInk.path(listOf(pixels)), ink)
                MomentPen.Highlighter -> {
                    // See-through with flat ends, and even where the line crosses itself, as a felt highlighter.
                    ink.strokeCap = Paint.Cap.BUTT
                    ink.alpha = HIGHLIGHTER_ALPHA
                    canvas.drawPath(CardSignatureInk.path(listOf(pixels)), ink)
                }
                MomentPen.Arrow -> arrow(canvas, pixels, ink, max(ink.strokeWidth * HEAD_WIDTHS, width * HEAD_LEAST))
                MomentPen.Eraser -> {
                    ink.xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
                    canvas.drawPath(CardSignatureInk.path(listOf(pixels)), ink)
                }
            }
        }
        canvas.restoreToCount(layer)
    }

    /** A line with a filled head [head] px long where the finger lifted, pointing the way it last went. A tap is a dot. */
    private fun arrow(
        canvas: Canvas,
        pixels: List<Float>,
        ink: Paint,
        head: Float,
    ) {
        val count = pixels.size / 2
        val tipX = pixels[pixels.size - 2]
        val tipY = pixels[pixels.size - 1]
        // The direction from a point at least one head back, so a wobble at the end doesn't turn the head.
        var backX = pixels[0]
        var backY = pixels[1]
        for (at in count - 2 downTo 0) {
            if (hypot(tipX - pixels[2 * at], tipY - pixels[2 * at + 1]) >= head) {
                backX = pixels[2 * at]
                backY = pixels[2 * at + 1]
                break
            }
        }
        val length = hypot(tipX - backX, tipY - backY)
        if (count < 2 || length <= 0.5f) {
            canvas.drawPath(CardSignatureInk.path(listOf(pixels)), ink)
            return
        }
        val alongX = (tipX - backX) / length
        val alongY = (tipY - backY) / length
        // The line stops inside the head, so its round end never shows past the tip.
        val inside = head * 0.7f
        val body = pixels.toMutableList()
        while (body.size > 2 && hypot(tipX - body[body.size - 2], tipY - body[body.size - 1]) < inside) {
            body.removeAt(body.lastIndex)
            body.removeAt(body.lastIndex)
        }
        body += tipX - alongX * inside
        body += tipY - alongY * inside
        canvas.drawPath(CardSignatureInk.path(listOf(body)), ink)
        val half = head * 0.62f
        val baseX = tipX - alongX * head
        val baseY = tipY - alongY * head
        val triangle =
            Path().apply {
                moveTo(tipX, tipY)
                lineTo(baseX - alongY * half, baseY + alongX * half)
                lineTo(baseX + alongY * half, baseY - alongX * half)
                close()
            }
        ink.style = Paint.Style.FILL_AND_STROKE
        ink.strokeWidth = max(ink.strokeWidth * 0.35f, 1f)
        canvas.drawPath(triangle, ink)
    }
}

/** Draw's four pens over the inks, each its icon and name; the picked one is filled (none while the eyedropper is out). */
@Composable
internal fun StudioPens(
    picked: MomentPen,
    dropping: Boolean,
    onPick: (MomentPen) -> Unit,
) {
    // Scrolls on a narrow phone; centred when the four fit.
    LazyRow(
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Pens" },
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2, Alignment.CenterHorizontally),
    ) {
        items(MomentPen.entries, key = { it.key }) { pen ->
            val on = pen == picked && !dropping
            Row(
                modifier =
                    Modifier
                        .height(36.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(if (on) Color.White else PantopusColors.studioPillFill)
                        .then(if (on) Modifier else Modifier.border(1.dp, PantopusColors.studioPillOutline, RoundedCornerShape(18.dp)))
                        .clickable(role = Role.RadioButton) { onPick(pen) }
                        .padding(horizontal = 10.dp)
                        .testTag("moments.marks.pen.${pen.key}")
                        .clearAndSetSemantics {
                            contentDescription = pen.spoken
                            role = Role.RadioButton
                            selected = on
                        },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                val ink = if (on) PantopusColors.appText else Color.White
                PantopusIconImage(icon = pen.icon, contentDescription = null, size = 16.dp, tint = ink)
                Text(text = pen.spoken, fontSize = 13.sp, color = ink)
            }
        }
    }
}
