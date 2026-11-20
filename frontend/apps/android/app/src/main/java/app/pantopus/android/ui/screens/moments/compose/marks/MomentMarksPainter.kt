package app.pantopus.android.ui.screens.moments.compose.marks

import android.graphics.Canvas
import androidx.compose.ui.graphics.toArgb
import app.pantopus.android.ui.screens.mailbox.cards.table.CardSignatureInk

/**
 * Draws a picture's marks onto an `android.graphics.Canvas` [width] × [height] px that holds the whole picture. The one
 * routine for both: the editor's canvas while marks are made, and the photo they are drawn into before it posts. So
 * what the author sees is what uploads. Lines are smoothed and capped as the card signature's ink is.
 */
object MomentMarksPainter {
    fun draw(
        canvas: Canvas,
        marks: MomentMarks,
        width: Float,
        height: Float,
    ) {
        val ink = CardSignatureInk.paint(multiply = false)
        for (stroke in marks.strokes) {
            val pixels = ArrayList<Float>(stroke.points.size)
            stroke.points.forEachIndexed { at, value -> pixels += value * if (at % 2 == 0) width else height }
            ink.color = stroke.ink.color.toArgb()
            ink.strokeWidth = stroke.width * width
            canvas.drawPath(CardSignatureInk.path(listOf(pixels)), ink)
        }
    }
}
