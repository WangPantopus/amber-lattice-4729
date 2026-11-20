package app.pantopus.android.ui.screens.moments.compose.marks

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import app.pantopus.android.ui.screens.mailbox.cards.table.CardSignatureInk
import app.pantopus.android.ui.theme.PantopusColors
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Draws a picture's marks onto an `android.graphics.Canvas` [width] × [height] px that holds the whole picture. The one
 * routine for both: the editor's canvas while marks are made, and the photo they are drawn into before it posts. So
 * what the author sees is what uploads. Lines are smoothed and capped as the card signature's ink is; labels are laid
 * out by [layout], the same in both.
 */
object MomentMarksPainter {
    /** Plain letters' soft shadow, in letter sizes. */
    private const val SHADOW_BLUR = 0.12f
    private const val SHADOW_DROP = 0.04f

    /** A plain label's box around its words (it has no plate), in letter sizes. */
    private const val PLAIN_ACROSS = 0.12f
    private const val PLAIN_DOWN = 0.06f

    /** How many times [keptIn] shrinks a label's letters to fit. */
    private const val FIT_PASSES = 3

    /** [skip]: a label the editor draws itself while its words are typed. */
    fun draw(
        canvas: Canvas,
        marks: MomentMarks,
        width: Float,
        height: Float,
        skip: Int? = null,
    ) {
        val ink = CardSignatureInk.paint(multiply = false)
        for (stroke in marks.strokes) {
            val pixels = ArrayList<Float>(stroke.points.size)
            stroke.points.forEachIndexed { at, value -> pixels += value * if (at % 2 == 0) width else height }
            ink.color = stroke.ink.color.toArgb()
            // Never thinner than a pixel, even on a small picture.
            ink.strokeWidth = (stroke.width * width).coerceAtLeast(1f)
            canvas.drawPath(CardSignatureInk.path(listOf(pixels)), ink)
        }
        val box = Paint(Paint.ANTI_ALIAS_FLAG)
        for (label in marks.labels) {
            if (label.id == skip || label.text.isBlank()) continue
            val laid = layout(label, width, height)
            boxColor(label)?.let { fill ->
                box.color = fill.toArgb()
                canvas.drawRoundRect(laid.box, laid.corner, laid.corner, box)
            }
            val restore = canvas.save()
            canvas.translate(laid.box.left + laid.padAcross, laid.box.top + laid.padDown)
            laid.text.draw(canvas)
            canvas.restoreToCount(restore)
        }
    }

    /** A label laid out on a picture [width] px wide: its words, and its box around them, centred on its middle. */
    class LabelLayout(
        val text: StaticLayout,
        val box: RectF,
        val corner: Float,
        val padAcross: Float,
        val padDown: Float,
    )

    fun layout(
        label: MomentLabel,
        width: Float,
        height: Float,
    ): LabelLayout {
        val letters = label.size * width
        val paint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                textSize = letters
                typeface = Typeface.DEFAULT_BOLD
                color = letterColor(label).toArgb()
                if (label.style == MomentLabelStyle.Plain) {
                    setShadowLayer(SHADOW_BLUR * letters, 0f, SHADOW_DROP * letters, PantopusColors.momentMarksShadow.toArgb())
                }
            }
        val words = label.text.ifEmpty { " " }
        val metrics = paint.fontMetrics
        val (across, down) = padding(label, letters)
        // Lines break at 13.1 letter sizes, or at the width a label may take (less its padding) where that's narrower:
        // a landscape picture shows only its middle third.
        val room = MomentMarkRules.labelBox(width.roundToInt(), height.roundToInt()).width * width - across * 2
        val wrap = minOf(MomentMarkRules.WRAP_LETTERS * letters, room).roundToInt().coerceAtLeast(letters.roundToInt().coerceAtLeast(1))
        val text =
            StaticLayout.Builder
                .obtain(words, 0, words.length, paint, wrap)
                .setAlignment(Layout.Alignment.ALIGN_CENTER)
                .setLineSpacing(MomentMarkRules.LINE_HEIGHT * letters - (metrics.descent - metrics.ascent), 1f)
                .setIncludePad(false)
                .build()
        // The box hugs the widest line; the lines are centred in the layout's own width, so the drawing shifts by half
        // of what's left over.
        val widest = (0 until text.lineCount).maxOf { text.getLineWidth(it) }
        val boxWidth = widest + across * 2
        val boxHeight = text.height + down * 2
        val centreX = label.x * width
        val centreY = label.y * height
        val box = RectF(centreX - boxWidth / 2, centreY - boxHeight / 2, centreX + boxWidth / 2, centreY + boxHeight / 2)
        return LabelLayout(text, box, MomentMarkRules.CORNER * letters, across - (text.width - widest) / 2, down)
    }

    /** A label's padding around its words, across and down, for letters [letters] px tall (a plain label has no plate). */
    fun padding(
        label: MomentLabel,
        letters: Float,
    ): Pair<Float, Float> =
        if (label.style == MomentLabelStyle.Plain) {
            PLAIN_ACROSS * letters to PLAIN_DOWN * letters
        } else {
            MomentMarkRules.PAD_ACROSS * letters to MomentMarkRules.PAD_DOWN * letters
        }

    /** The label's letters: the ink, or on a sign dark letters (white ones on a black or red sign, which read better). */
    fun letterColor(label: MomentLabel): Color =
        when {
            label.style != MomentLabelStyle.Sign -> label.ink.color
            label.ink == MomentInk.Black || label.ink == MomentInk.Red -> PantopusColors.momentInkWhite
            else -> PantopusColors.momentInkBlack
        }

    /** The plate behind the letters: none for plain words; dark for a label (light under black ink); the ink for a sign. */
    fun boxColor(label: MomentLabel): Color? =
        when (label.style) {
            MomentLabelStyle.Plain -> null
            MomentLabelStyle.Label ->
                if (label.ink == MomentInk.Black) PantopusColors.momentMarksLabelPlate else PantopusColors.momentMarksLabelBox
            MomentLabelStyle.Sign -> label.ink.color
        }

    /**
     * [label] kept where a label may go on a picture [width] × [height] px ([MomentMarkRules.labelBox]): its letters no
     * larger than lets its box fit there (and between the smallest the picture check reads and the largest), its whole
     * box inside it (its middle on that part's middle if even the smallest letters don't fit).
     */
    fun keptIn(
        label: MomentLabel,
        width: Int,
        height: Int,
    ): MomentLabel {
        val allowed = MomentMarkRules.labelBox(width, height)
        val smallest = MomentMarkRules.smallestLetters(width, height)
        var sized = label.copy(size = label.size.coerceIn(smallest, MomentMarkRules.LARGEST_LETTERS))
        var box = layout(sized, width.toFloat(), height.toFloat()).box
        // Smaller letters wrap differently, so a couple of passes settle it.
        var passes = 0
        while (passes++ < FIT_PASSES) {
            val fits = min(allowed.width * width / box.width(), allowed.height * height / box.height())
            if (fits >= 1f || sized.size <= smallest) break
            sized = sized.copy(size = (sized.size * fits).coerceAtLeast(smallest))
            box = layout(sized, width.toFloat(), height.toFloat()).box
        }
        return sized.copy(
            x = kept(sized.x, box.width() / width / 2, allowed.left, allowed.right),
            y = kept(sized.y, box.height() / height / 2, allowed.top, allowed.bottom),
        )
    }

    /** A middle at [at] with [half] of the box each side, inside [from] to [to] (all shares of 1). */
    private fun kept(
        at: Float,
        half: Float,
        from: Float,
        to: Float,
    ): Float {
        val low = from + half
        val high = to - half
        return if (low > high) (from + to) / 2 else at.coerceIn(low, high)
    }
}
