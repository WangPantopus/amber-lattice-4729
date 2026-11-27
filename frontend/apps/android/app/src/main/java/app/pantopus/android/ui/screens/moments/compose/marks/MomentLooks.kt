@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.moments.compose.marks

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember

/*
 * "Pulse, reinvented"'s Studio, phase 0 step 5: film looks over a whole photo (iPhone #5019). A look changes colour and
 * tone only, the same over every pixel: it never finds, smooths or reshapes a face. It is drawn into the photo on the
 * phone with the marks (from the photo as it came, so another look, or Original, starts from it again), so the server
 * and every app see an ordinary picture. Today's composer never sets one: its photos are [MomentLook.Original].
 */

/** The eight looks, as on iPhone; [Original] is the photo as it came. */
enum class MomentLook(
    val key: String,
    val spoken: String,
) {
    Original("original", "Original"),
    Warm("warm", "Warm"),
    Cool("cool", "Cool"),
    Fade("fade", "Fade"),
    Chrome("chrome", "Chrome"),
    Instant("instant", "Instant"),
    Mono("mono", "Mono"),
    Noir("noir", "Noir"),
}

object MomentLooks {
    /** [picture] with [look] over it: a new bitmap, or [picture] itself for [MomentLook.Original]. */
    fun applied(
        picture: Bitmap,
        look: MomentLook,
    ): Bitmap {
        val matrix = matrix(look) ?: return picture
        val out = Bitmap.createBitmap(picture.width, picture.height, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.FILTER_BITMAP_FLAG).apply { colorFilter = ColorMatrixColorFilter(matrix) }
        Canvas(out).drawBitmap(picture, 0f, 0f, paint)
        return out
    }

    /** Each look's colour matrix: channel scales, saturation and contrast only. */
    private fun matrix(look: MomentLook): ColorMatrix? =
        when (look) {
            MomentLook.Original -> null
            MomentLook.Warm -> channels(1.08f, 1.02f, 0.88f)
            MomentLook.Cool -> channels(0.9f, 1f, 1.1f)
            MomentLook.Fade -> saturation(0.72f).then(contrast(0.8f, lift = 20f))
            MomentLook.Chrome -> saturation(1.3f).then(contrast(1.12f))
            MomentLook.Instant -> saturation(0.85f).then(channels(1.06f, 1f, 0.88f)).then(contrast(0.9f, lift = 12f))
            MomentLook.Mono -> saturation(0f)
            MomentLook.Noir -> saturation(0f).then(contrast(1.35f))
        }

    private fun ColorMatrix.then(next: ColorMatrix): ColorMatrix = apply { postConcat(next) }

    private fun saturation(amount: Float): ColorMatrix = ColorMatrix().apply { setSaturation(amount) }

    private fun channels(
        red: Float,
        green: Float,
        blue: Float,
    ): ColorMatrix = ColorMatrix().apply { setScale(red, green, blue, 1f) }

    /** Contrast about the middle grey, and the blacks lifted by [lift] (0 to 255). */
    private fun contrast(
        amount: Float,
        lift: Float = 0f,
    ): ColorMatrix {
        val shift = 128f * (1f - amount) + lift
        return ColorMatrix(
            floatArrayOf(
                amount, 0f, 0f, 0f, shift,
                0f, amount, 0f, 0f, shift,
                0f, 0f, amount, 0f, shift,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
    }
}

/** The marks editor's picture with the photo's look over it (the same bitmap with none). */
@Composable
internal fun rememberLooked(
    picture: Bitmap?,
    look: MomentLook,
): Bitmap? = remember(picture, look) { picture?.let { MomentLooks.applied(it, look) } }
