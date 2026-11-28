@file:Suppress("MagicNumber", "TooGenericExceptionCaught")

package app.pantopus.android.ui.screens.moments.compose.marks

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import androidx.compose.runtime.Immutable
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/*
 * "Pulse, reinvented"'s Studio, phase 0 step 4: cutouts (iPhone #4985, board B5). A long press on the Studio's photo lifts
 * the thing under the finger, on the phone ([MomentSubjects]' model), as an object on the picture where it was; each one
 * lifted is kept on this phone in "Your cutouts" (the 24 newest, in the app's own folder, never uploaded), and a tap there
 * puts one in the middle of the picture. Like every mark, cutouts are drawn into the picture before it goes up.
 */

/** One cutout on the picture: its image, its middle (shares of the picture), its width (a share), its turn in degrees. */
@Immutable
class MomentCutout(
    val id: Int,
    val image: Bitmap,
    val x: Float,
    val y: Float,
    val width: Float,
    val turn: Float = 0f,
) {
    /** Drawn over a picture [pictureWidth] × [pictureHeight] px, at its place, size and turn. */
    fun draw(
        canvas: Canvas,
        pictureWidth: Float,
        pictureHeight: Float,
    ) {
        val w = width * pictureWidth
        val h = w * image.height / image.width.coerceAtLeast(1)
        val restore = canvas.save()
        canvas.translate(x * pictureWidth, y * pictureHeight)
        if (turn != 0f) canvas.rotate(turn)
        canvas.drawBitmap(image, null, RectF(-w / 2, -h / 2, w / 2, h / 2), Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
        canvas.restoreToCount(restore)
    }
}

/** The cutouts on a picture, in the order they were added. */
internal fun List<MomentCutout>.drawAll(
    canvas: Canvas,
    width: Float,
    height: Float,
) = forEach { it.draw(canvas, width, height) }

/** Lifting the thing under a finger, with the same on-phone model as the subject (fetched on first use, in the Studio). */
internal object MomentCutoutLift {
    /**
     * The thing at ([x], [y]) (shares of the picture as the marks are on it: the photo, or its canvas when [placement] is
     * set) of [picture], as a cutout where it was; null when nothing is there or the model can't run.
     */
    suspend fun at(
        context: Context,
        picture: Bitmap,
        placement: MomentPlacement?,
        x: Float,
        y: Float,
        id: Int,
    ): MomentCutout? =
        withContext(Dispatchers.Default) {
            val segmenter =
                SubjectSegmentation.getClient(
                    SubjectSegmenterOptions
                        .Builder()
                        .enableMultipleSubjects(SubjectSegmenterOptions.SubjectResultOptions.Builder().enableSubjectBitmap().build())
                        .build(),
                )
            try {
                val surface = MomentSubjects.surface(picture, placement)
                if (!MomentSubjects.ready(context.applicationContext, segmenter)) return@withContext standIn(surface, x, y, id)
                val px = (x * surface.width).toInt()
                val py = (y * surface.height).toInt()
                val subjects = segmenter.process(InputImage.fromBitmap(surface, 0)).await().subjects
                // The smallest thing whose box holds the finger.
                val hit =
                    subjects
                        .filter { px in it.startX until it.startX + it.width && py in it.startY until it.startY + it.height }
                        .minByOrNull { it.width * it.height }
                val image = hit?.bitmap ?: return@withContext null
                MomentCutout(
                    id = id,
                    image = image,
                    x = (hit.startX + hit.width / 2f) / surface.width,
                    y = (hit.startY + hit.height / 2f) / surface.height,
                    width = hit.width.toFloat() / surface.width,
                )
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                timber.log.Timber.tag("Moments").w(failure, "couldn't lift a cutout")
                null
            } finally {
                segmenter.close()
            }
        }
}

/**
 * Debug builds on an emulator only ([MomentStandIn]): an oval of the picture around the finger stands in for the thing
 * the model would lift there; null everywhere else.
 */
private fun standIn(
    surface: Bitmap,
    x: Float,
    y: Float,
    id: Int,
): MomentCutout? {
    if (!MomentStandIn.active) return null
    val size = 0.3f
    val left = (x - size / 2).coerceIn(0f, 1f - size)
    val top = (y - size / 2).coerceIn(0f, 1f - size)
    val shape = MomentStandIn.oval(surface, left, top, size, size * surface.width / surface.height)
    val box =
        android.graphics.Rect(
            (left * surface.width).toInt(),
            (top * surface.height).toInt(),
            ((left + size) * surface.width).toInt(),
            ((top + size * surface.width / surface.height) * surface.height).toInt().coerceAtMost(surface.height),
        )
    val image = Bitmap.createBitmap(shape, box.left, box.top, box.width(), box.height())
    return MomentCutout(id, image, (box.exactCenterX()) / surface.width, box.exactCenterY() / surface.height, size)
}

/** "Your cutouts": the 24 newest cutouts lifted on this phone, as PNGs in the app's own folder (never uploaded). */
internal object MomentCutoutStore {
    private const val KEPT = 24

    private fun folder(context: Context): File = File(context.filesDir, "studio-cutouts").apply { mkdirs() }

    /** Newest first. */
    fun list(context: Context): List<File> =
        folder(context).listFiles { file -> file.extension == "png" }.orEmpty().sortedByDescending { it.lastModified() }

    fun keep(
        context: Context,
        image: Bitmap,
    ) {
        val file = File(folder(context), "${System.currentTimeMillis()}.png")
        runCatching { FileOutputStream(file).use { image.compress(Bitmap.CompressFormat.PNG, 100, it) } }
            .onFailure { file.delete() }
        list(context).drop(KEPT).forEach { it.delete() }
    }

    fun remove(file: File) {
        runCatching { file.delete() }
    }

    fun read(file: File): Bitmap? = runCatching { BitmapFactory.decodeFile(file.path) }.getOrNull()
}
