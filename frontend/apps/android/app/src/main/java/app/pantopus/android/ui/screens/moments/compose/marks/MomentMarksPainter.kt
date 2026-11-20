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

    /** The middle of the picture, across or down. */
    private const val MIDDLE = 0.5f

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
            ink.strokeWidth = stroke.width * width
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
        val text =
            StaticLayout.Builder
                .obtain(words, 0, words.length, paint, (MomentMarkRules.WRAP_LETTERS * letters).roundToInt().coerceAtLeast(1))
                .setAlignment(Layout.Alignment.ALIGN_CENTER)
                .setLineSpacing(MomentMarkRules.LINE_HEIGHT * letters - (metrics.descent - metrics.ascent), 1f)
                .setIncludePad(false)
                .build()
        // The box hugs the widest line; the lines are centred in the layout's own width, so the drawing shifts by half
        // of what's left over.
        val widest = (0 until text.lineCount).maxOf { text.getLineWidth(it) }
        val across = MomentMarkRules.PAD_ACROSS * letters
        val down = MomentMarkRules.PAD_DOWN * letters
        val boxWidth = widest + across * 2
        val boxHeight = text.height + down * 2
        val centreX = label.x * width
        val centreY = label.y * height
        val box = RectF(centreX - boxWidth / 2, centreY - boxHeight / 2, centreX + boxWidth / 2, centreY + boxHeight / 2)
        return LabelLayout(text, box, MomentMarkRules.CORNER * letters, across - (text.width - widest) / 2, down)
    }

    /** The label's letters: the ink, or on a sign dark letters (white ones on a black sign). */
    fun letterColor(label: MomentLabel): Color =
        when {
            label.style != MomentLabelStyle.Sign -> label.ink.color
            label.ink == MomentInk.Black -> PantopusColors.momentInkWhite
            else -> PantopusColors.momentInkBlack
        }

    /** The box behind the letters: none for plain words, dark for a label, the ink for a sign. */
    fun boxColor(label: MomentLabel): Color? =
        when (label.style) {
            MomentLabelStyle.Plain -> null
            MomentLabelStyle.Label -> PantopusColors.momentMarksLabelBox
            MomentLabelStyle.Sign -> label.ink.color
        }

    /**
     * [label] kept inside the part of a picture [width] × [height] px every phone shows: its letters no larger than lets
     * its box fit there (and between the smallest the picture check reads and the largest), its whole box inside it
     * (its middle on that part's middle if even the smallest letters don't fit).
     */
    fun keptIn(
        label: MomentLabel,
        width: Int,
        height: Int,
    ): MomentLabel {
        val (shownWidth, shownHeight) = MomentMarkRules.everyPhoneShows(width, height)
        var sized = label.copy(size = label.size.coerceIn(MomentMarkRules.SMALLEST_LETTERS, MomentMarkRules.LARGEST_LETTERS))
        var box = layout(sized, width.toFloat(), height.toFloat()).box
        // Smaller letters wrap differently, so a couple of passes settle it.
        var passes = 0
        while (passes++ < FIT_PASSES) {
            val fits = min(shownWidth * width / box.width(), shownHeight * height / box.height())
            if (fits >= 1f || sized.size <= MomentMarkRules.SMALLEST_LETTERS) break
            sized = sized.copy(size = (sized.size * fits).coerceAtLeast(MomentMarkRules.SMALLEST_LETTERS))
            box = layout(sized, width.toFloat(), height.toFloat()).box
        }
        return sized.copy(
            x = kept(sized.x, box.width() / width / 2, shownWidth),
            y = kept(sized.y, box.height() / height / 2, shownHeight),
        )
    }

    /** A middle at [at] with [half] of the box each side, inside a centred part [shown] wide (all shares of 1). */
    private fun kept(
        at: Float,
        half: Float,
        shown: Float,
    ): Float {
        val low = (1f - shown) / 2 + half
        val high = (1f + shown) / 2 - half
        return if (low > high) MIDDLE else at.coerceIn(low, high)
    }
}
