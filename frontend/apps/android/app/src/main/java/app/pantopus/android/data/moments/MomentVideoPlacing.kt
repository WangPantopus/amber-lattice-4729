package app.pantopus.android.data.moments

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import androidx.annotation.OptIn
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.MatrixTransformation
import app.pantopus.android.ui.screens.moments.compose.marks.MomentMarks
import app.pantopus.android.ui.screens.moments.compose.marks.MomentMarksPainter
import app.pantopus.android.ui.screens.moments.compose.marks.MomentPlacement
import app.pantopus.android.ui.screens.moments.compose.marks.MomentPlacementPainter
import java.io.File

/**
 * A video Resize placed (shared rules, step R2): the export's frame becomes the 9:16 canvas, each frame drawn at the
 * placement ([frame]), then one picture laid over every frame ([overlay]): the background from the video's first frame
 * with a clear hole where the frame sits, and the marks. Every part of a long video gets the same two.
 */
internal object MomentVideoPlacing {
    /** Every placed video exports onto a 720 × 1280 canvas, whatever its own shape or size (the same on iPhone). */
    private const val CANVAS_WIDTH = 720
    private const val CANVAS_HEIGHT = 1280

    /** Each frame of a video drawn at [placement] on the canvas. */
    @OptIn(UnstableApi::class)
    fun frame(placement: MomentPlacement): MatrixTransformation = PlacedFrame(CANVAS_WIDTH, CANVAS_HEIGHT, placement)

    /**
     * The picture laid over every frame of [file] (shown [width] × [height]): its background around the frame at
     * [placement], then [marks], drawn at the canvas's exact size. Labels break their lines for the canvas's shape, as in
     * the editor.
     */
    fun overlay(
        file: File,
        width: Int,
        height: Int,
        marks: MomentMarks,
        placement: MomentPlacement,
    ): Bitmap {
        val overlay = Bitmap.createBitmap(CANVAS_WIDTH, CANVAS_HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(overlay)
        // The same background the editor showed, from the video's first frame (black if it can't be read).
        val still = MomentMedia.videoStill(file)
        val backdrop = still?.let { MomentPlacementPainter.backdrop(it) } ?: MomentPlacementPainter.Backdrop(Color.BLACK, Color.BLACK)
        still?.recycle()
        val w = CANVAS_WIDTH.toFloat()
        val h = CANVAS_HEIGHT.toFloat()
        MomentPlacementPainter.drawBackdropAround(canvas, width, height, placement, backdrop, w, h)
        MomentMarksPainter.draw(canvas, marks, w, h, shape = MomentPlacement.CANVAS_SHAPE)
        return overlay
    }
}

/**
 * Draws each frame at its placement on a [width] × [height] canvas: a frame that's (as it plays) w × h px is scaled to
 * the placement's share of the canvas's width, turned and moved; the rest of the canvas is left clear for the overlay.
 * Media3 applies the matrix in normalised device coordinates (−1 to 1, y up), so it maps those to the frame's pixels,
 * places them on the canvas, and maps back.
 */
@OptIn(UnstableApi::class)
private class PlacedFrame(
    private val width: Int,
    private val height: Int,
    private val placement: MomentPlacement,
) : MatrixTransformation {
    private var matrix = Matrix()

    override fun configure(
        inputWidth: Int,
        inputHeight: Int,
    ): Size {
        val scale = placement.width * width / inputWidth
        matrix =
            Matrix().apply {
                setScale(inputWidth / 2f, inputHeight / 2f)
                postScale(scale, scale)
                // y runs up here: a clockwise turn on the screen is a negative angle.
                postRotate(-placement.turn)
                postTranslate((placement.x - MIDDLE) * width, (MIDDLE - placement.y) * height)
                postScale(2f / width, 2f / height)
            }
        return Size(width, height)
    }

    override fun getMatrix(presentationTimeUs: Long): Matrix = matrix

    private companion object {
        /** The canvas's middle, where normalised coordinates are 0. */
        const val MIDDLE = 0.5f
    }
}
