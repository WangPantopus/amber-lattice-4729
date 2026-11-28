@file:Suppress("MagicNumber")

package app.pantopus.android.data.moments

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * "Pulse, reinvented"'s Studio, phase 0 step 5: before and after (CONTRACT 7g; LEAD 05:19 answer 1; as on iPhone). The
 * photo in the Studio (the before, with its words and drawings drawn in) on the left and the next photo picked with it
 * (the after, cut to the before's size and shape, filling it, centred) on the right, written as ONE picture that posts
 * as one Moment with a `before_after` play item. No second upload: today's screens, the apps in the stores and anyone
 * whose switch is off see that side-by-side picture as it is.
 */
internal object MomentBeforeAfterPicture {
    /** Both halves together fit a photo's long side ([MomentMarksFlatten]'s 2048), so it isn't scaled again. */
    private const val LONG_EDGE = 2048

    /** Near-lossless: the upload encodes it again at 85. */
    private const val QUALITY = 95

    /** [before] and [after] side by side in a new JPEG; null when either can't be read. */
    fun make(
        context: Context,
        before: File,
        after: File,
    ): File? {
        val left = MomentMedia.decodeUpright(before, LONG_EDGE) ?: return null
        val right =
            MomentMedia.decodeUpright(after, LONG_EDGE) ?: run {
                left.recycle()
                return null
            }
        val shrink = min(1f, min(LONG_EDGE / max(left.width * 2f, 1f), LONG_EDGE / max(left.height.toFloat(), 1f)))
        val halfWidth = max(1, (left.width * shrink).roundToInt())
        val height = max(1, (left.height * shrink).roundToInt())
        val picture = Bitmap.createBitmap(halfWidth * 2, height, Bitmap.Config.ARGB_8888)
        val out = MomentMedia.newFile(context, "jpg")
        var written = false
        try {
            val canvas = Canvas(picture)
            val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
            canvas.drawBitmap(left, null, Rect(0, 0, halfWidth, height), paint)
            // The after fills its half, centred: cut to the before's shape.
            val fill = max(halfWidth / max(right.width.toFloat(), 1f), height / max(right.height.toFloat(), 1f))
            val w = right.width * fill
            val h = right.height * fill
            val middleX = halfWidth * 1.5f
            val middleY = height / 2f
            canvas.save()
            canvas.clipRect(halfWidth, 0, halfWidth * 2, height)
            canvas.drawBitmap(right, null, RectF(middleX - w / 2, middleY - h / 2, middleX + w / 2, middleY + h / 2), paint)
            canvas.restore()
            written = FileOutputStream(out).use { picture.compress(Bitmap.CompressFormat.JPEG, QUALITY, it) }
        } finally {
            picture.recycle()
            left.recycle()
            right.recycle()
            if (!written) out.delete()
        }
        return out.takeIf { written }
    }
}
