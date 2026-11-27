@file:Suppress("MagicNumber")

package app.pantopus.android.data.moments

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import java.io.File
import java.io.FileOutputStream
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * "Pulse, reinvented"'s Studio, phase 0 step 5: the photostrip (iPhone #5019). The photo in the Studio and up to three
 * photos picked with it, each cropped 4:3, one under the other on white, written as one picture that posts as one
 * Moment. Made on the phone; the server gets an ordinary photo.
 */
internal object MomentPhotostrip {
    /** This photo and up to three more. */
    const val MOST = 4

    /** The strip's long side, as a photo's ([MomentMarksFlatten]'s 2048). */
    private const val LONG_EDGE = 2048

    /** The white around and between the photos, in pixels. */
    private const val GAP = 24

    /** Near-lossless: the upload encodes it again at 85. */
    private const val QUALITY = 95

    /** [photos] (two to four, read upright) as one strip in a new JPEG; null when fewer than two can be read. */
    fun make(
        context: Context,
        photos: List<File>,
    ): File? {
        val pictures = photos.take(MOST).mapNotNull { MomentMedia.decodeUpright(it, LONG_EDGE) }
        if (pictures.size < 2) return null
        // The strip is 2048 px tall: each photo's 4:3 frame shares that height, with the white around them.
        val frameHeight = (LONG_EDGE - GAP) / pictures.size - GAP
        val frameWidth = frameHeight * 4 / 3
        val strip = Bitmap.createBitmap(frameWidth + 2 * GAP, LONG_EDGE, Bitmap.Config.ARGB_8888)
        val out = MomentMedia.newFile(context, "jpg")
        var written = false
        try {
            val canvas = Canvas(strip)
            canvas.drawColor(Color.WHITE)
            val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
            pictures.forEachIndexed { at, picture ->
                val top = GAP + at * (frameHeight + GAP)
                canvas.drawBitmap(picture, crop43(picture), Rect(GAP, top, GAP + frameWidth, top + frameHeight), paint)
            }
            written = FileOutputStream(out).use { strip.compress(Bitmap.CompressFormat.JPEG, QUALITY, it) }
        } finally {
            strip.recycle()
            pictures.forEach { it.recycle() }
            if (!written) out.delete()
        }
        return out.takeIf { written }
    }

    /** The middle of [picture] at 4:3 (a wide crop of a tall photo, as a print in a strip). */
    private fun crop43(picture: Bitmap): Rect {
        val width = min(picture.width, (picture.height * 4f / 3f).roundToInt())
        val height = min(picture.height, (width * 3f / 4f).roundToInt())
        val left = (picture.width - width) / 2
        val top = (picture.height - height) / 2
        return Rect(left, top, left + width, top + height)
    }
}
