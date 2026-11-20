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
import kotlin.math.roundToInt

/**
 * Draws a picture's marks onto an `android.graphics.Canvas` [width] × [height] px that holds the whole picture. The one
 * routine for both: the editor's canvas while marks are made, and the photo they are drawn into before it posts. So
 * what the author sees is what uploads. Lines are smoothed and capped as the card signature's ink is; labels are laid
 * out by [layout], the same in both.
 */
object MomentMarksPainter {
    /**
     * Labels are laid out on a picture this many units wide and then scaled, so their lines break the same at every
     * size: on the editor's screen, in the text field and in the 2048-px photo (iPhone lays out at 1000 units too).
     */
    private const val LAYOUT_WIDTH = 1000f

    /** Plain letters' thin edge, in letter sizes (an edge scales with the picture; a shadow's blur doesn't). */
    const val EDGE = 0.08f

    /** A plain label's box around its words (it has no plate), in letter sizes. */
    private const val PLAIN_ACROSS = 0.12f
    private const val PLAIN_DOWN = 0.06f

    /** How many times [keptIn] shrinks a label's letters to fit. */
    private const val FIT_PASSES = 4

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
            canvas.scale(laid.scale, laid.scale)
            edgeColor(label)?.let { edge ->
                // Plain letters: the edge first, then the letters over it.
                laid.text.paint.apply {
                    style = Paint.Style.STROKE
                    strokeWidth = EDGE * laid.text.paint.textSize
                    strokeJoin = Paint.Join.ROUND
                    color = edge.toArgb()
                }
                laid.text.draw(canvas)
                laid.text.paint.apply {
                    style = Paint.Style.FILL
                    color = letterColor(label).toArgb()
                }
            }
            laid.text.draw(canvas)
            canvas.restoreToCount(restore)
        }
    }

    /**
     * A label laid out on a picture [width] px wide: its words (laid out at [LAYOUT_WIDTH] units and drawn at [scale]),
     * and its box around them in px, centred on its middle; [letters] and [wrap] are the letter size and line width
     * in px.
     */
    class LabelLayout(
        val text: StaticLayout,
        val box: RectF,
        val corner: Float,
        val padAcross: Float,
        val padDown: Float,
        val scale: Float,
        /** The longest word over the line width: above 1, a word had to break in the middle. */
        val wordOverflow: Float = 0f,
    ) {
        val letters: Float get() = text.paint.textSize * scale
        val wrap: Float get() = text.width * scale
    }

    fun layout(
        label: MomentLabel,
        width: Float,
        height: Float,
    ): LabelLayout {
        val scale = width / LAYOUT_WIDTH
        val letters = label.size * LAYOUT_WIDTH
        val paint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                textSize = letters
                typeface = Typeface.DEFAULT_BOLD
                color = letterColor(label).toArgb()
                isLinearText = true
                isSubpixelText = true
            }
        val words = label.text.ifEmpty { " " }
        val metrics = paint.fontMetrics
        val (across, down) = padding(label, letters)
        // Lines break at 13.1 letter sizes, or at the width a label may take (less its padding) where that's narrower:
        // a landscape picture shows only its middle third.
        val room = MomentMarkRules.labelBox(width.roundToInt(), height.roundToInt()).width * LAYOUT_WIDTH - across * 2
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
        val boxWidth = (widest + across * 2) * scale
        val boxHeight = (text.height + down * 2) * scale
        val centreX = label.x * width
        val centreY = label.y * height
        val box = RectF(centreX - boxWidth / 2, centreY - boxHeight / 2, centreX + boxWidth / 2, centreY + boxHeight / 2)
        val longestWord = words.split(' ', '\n').maxOf { paint.measureText(it) }
        return LabelLayout(
            text = text,
            box = box,
            corner = MomentMarkRules.CORNER * letters * scale,
            padAcross = (across - (text.width - widest) / 2) * scale,
            padDown = down * scale,
            scale = scale,
            wordOverflow = longestWord / wrap,
        )
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

    /** Plain letters' edge: black 45%, or white 70% under black ink (iPhone's look); none on a plate. */
    fun edgeColor(label: MomentLabel): Color? =
        when {
            label.style != MomentLabelStyle.Plain -> null
            label.ink == MomentInk.Black -> PantopusColors.momentMarksEdgeLight
            else -> PantopusColors.momentMarksEdgeDark
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
        var laid = layout(sized, width.toFloat(), height.toFloat())
        // Smaller letters wrap differently, so a few passes settle it; a word is never broken in the middle to fit.
        var passes = 0
        while (passes++ < FIT_PASSES) {
            val box = laid.box
            val fits = minOf(allowed.width * width / box.width(), allowed.height * height / box.height(), 1f / laid.wordOverflow)
            if (fits >= 1f || sized.size <= smallest) break
            sized = sized.copy(size = (sized.size * fits).coerceAtLeast(smallest))
            laid = layout(sized, width.toFloat(), height.toFloat())
        }
        val box = laid.box
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
