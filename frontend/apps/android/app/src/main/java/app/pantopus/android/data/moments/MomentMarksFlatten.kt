package app.pantopus.android.data.moments

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import app.pantopus.android.ui.screens.moments.compose.marks.MomentMarks
import app.pantopus.android.ui.screens.moments.compose.marks.MomentMarksPainter
import java.io.File
import java.io.FileOutputStream

/**
 * Text and Draw drawn into a Moment's photo on the phone (plan part 1): the server and every app receive an ordinary
 * JPEG. The editor works on one upright copy at most 2048 px on its long side, the size a photo uploads at.
 */
object MomentMarksFlatten {
    /** The editor's copy's long side: what a photo uploads at. */
    private const val LONG_EDGE = 2048

    /** Near-lossless: the upload encodes it again at 85. */
    private const val QUALITY = 95

    /** The photo upright, at most 2048 px on its long side; null when it can't be read. */
    fun picture(file: File): Bitmap? = MomentMedia.decodeUpright(file, LONG_EDGE)

    /** [marks] drawn over a copy of [picture] (as the editor drew them), written as a new JPEG in the Moments folder. */
    fun flatten(
        context: Context,
        picture: Bitmap,
        marks: MomentMarks,
    ): File {
        val drawn = picture.copy(Bitmap.Config.ARGB_8888, true) ?: error("Couldn't copy the photo.")
        val out = MomentMedia.newFile(context, "jpg")
        var written = false
        try {
            MomentMarksPainter.draw(Canvas(drawn), marks, drawn.width.toFloat(), drawn.height.toFloat())
            written = FileOutputStream(out).use { drawn.compress(Bitmap.CompressFormat.JPEG, QUALITY, it) }
        } finally {
            drawn.recycle()
            // Half a file never stays behind.
            if (!written) out.delete()
        }
        if (!written) error("Couldn't write the photo.")
        return out
    }
}
