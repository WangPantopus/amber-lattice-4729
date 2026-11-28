@file:Suppress("MagicNumber", "TooGenericExceptionCaught")

package app.pantopus.android.ui.screens.moments.compose.marks

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.os.Build
import androidx.compose.runtime.Immutable
import app.pantopus.android.BuildConfig
import com.google.android.gms.common.moduleinstall.InstallStatusListener
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.android.gms.common.moduleinstall.ModuleInstallStatusUpdate
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/*
 * "Pulse, reinvented"'s Studio, phase 0 step 4: the photo's subject (the people, animals and things in front), lifted on
 * the phone with Google's ML Kit Subject Segmentation (iPhone #4985 uses Apple's Vision), for words set behind it. It is
 * the picture the marks are on (the photo, or its 9:16 canvas once placed) with everything but the subject clear, so it
 * lines up with the marks wherever they are drawn. Nothing is sent anywhere: the photo goes only to the on-phone model,
 * and like every mark the result is drawn into the picture that goes up.
 *
 * The model is Google Play services' own: it is fetched once, the first time a person in the Studio asks for a lift,
 * never at install or app start and never with the switch off (LEAD-3's conditions, 2026-11-27). Where it can't run (no
 * Play services, no network for the first fetch, nothing in front) there is no lift and the Studio says so in words.
 */

/**
 * A picture's subject: its shape (opaque where the subject is, clear elsewhere) over the picture it was lifted from, and
 * where that picture sat. Words behind it have that shape taken out of them, so the picture under them shows there,
 * whatever look the photo has.
 */
@Immutable
class MomentSubject(
    val shape: Bitmap,
    /** Where the picture sat on its canvas when it was lifted (null: as taken). Placed again, it is lifted again. */
    val placement: MomentPlacement?,
) {
    /** [words] drawn on a layer of their own over a picture [width] × [height] px, with the subject's shape taken out. */
    fun behind(
        canvas: Canvas,
        width: Float,
        height: Float,
        words: () -> Unit,
    ) {
        val layer = canvas.saveLayer(0f, 0f, width, height, null)
        words()
        val cut = Paint(Paint.FILTER_BITMAP_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_OUT) }
        canvas.drawBitmap(shape, null, RectF(0f, 0f, width, height), cut)
        canvas.restoreToCount(layer)
    }
}

/**
 * The marks to draw on a picture at [placement]: as they are, or with a subject lifted at another placement left out
 * (its words then show in front), so a stale shape is never cut from them.
 */
internal fun MomentMarks.inStep(placement: MomentPlacement?): MomentMarks =
    if (subject == null || subject.placement == placement) this else copy(subject = null)

/**
 * Debug builds on an emulator only (LEAD-3, 2026-11-27): an emulator image without the Play Store can't fetch the model,
 * so to try the rest of the Studio there an oval in the middle of the picture stands in for what it would lift, as
 * iPhone's simulator does. Never on a phone, never in a release build ([BuildConfig.DEBUG] is false there).
 */
internal object MomentStandIn {
    /** This is a debug build running on an emulator. */
    val active: Boolean get() = BuildConfig.DEBUG && onEmulator

    private val onEmulator: Boolean
        get() = Build.HARDWARE in EMULATOR_HARDWARE || Build.FINGERPRINT.startsWith("generic") || "sdk_gphone" in Build.MODEL

    private val EMULATOR_HARDWARE = setOf("ranchu", "goldfish")

    /** The stand-in's shape over [surface]: an oval in its middle; null outside a debug emulator build. */
    fun subject(
        surface: Bitmap,
        placement: MomentPlacement?,
    ): MomentSubject? = if (active) MomentSubject(oval(surface, 0.3f, 0.3f, 0.4f, 0.45f), placement) else null

    /** [surface] with everything but the oval ([left], [top], [width], [height] as shares) clear. */
    fun oval(
        surface: Bitmap,
        left: Float,
        top: Float,
        width: Float,
        height: Float,
    ): Bitmap {
        val out = Bitmap.createBitmap(surface.width, surface.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val shape =
            RectF(left * surface.width, top * surface.height, (left + width) * surface.width, (top + height) * surface.height)
        canvas.drawOval(shape, Paint(Paint.ANTI_ALIAS_FLAG))
        canvas.drawBitmap(surface, 0f, 0f, Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN) })
        return out
    }
}

/** The words the Studio shows about a lift (iPhone's). */
internal object MomentSubjectWords {
    const val FINDING = "Finding the subject…"
    const val NONE = "There's no clear subject in this photo to go behind."
}

/** Lifting a picture's subject on the phone. */
internal object MomentSubjects {
    /** The longest side a picture is lifted at: the photo's own size (2048 px at most), as it is drawn. */
    private const val LONGEST = 2048

    /** Waiting for Play services to fetch the model the first time. */
    private const val FETCH_WAIT_MS = 90_000L
    private const val STAND_IN_WAIT_MS = 5_000L

    /** Less than this share of the picture in front: nothing clear to go behind. */
    private const val LEAST_SUBJECT = 0.005f

    /**
     * The subject of [picture] (drawn on its canvas when [placement] is set, with [backdrop] around it), or null when
     * there is none or the model can't run here. Runs off the main thread.
     */
    suspend fun lift(
        context: Context,
        picture: Bitmap,
        placement: MomentPlacement?,
    ): MomentSubject? =
        withContext(Dispatchers.Default) {
            val segmenter =
                SubjectSegmentation.getClient(SubjectSegmenterOptions.Builder().enableForegroundBitmap().build())
            try {
                val surface = surface(picture, placement)
                if (!ready(context.applicationContext, segmenter)) return@withContext MomentStandIn.subject(surface, placement)
                val front = segmenter.process(InputImage.fromBitmap(surface, 0)).await().foregroundBitmap
                front?.takeIf { hasSubject(it) }?.let { MomentSubject(it, placement) }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                timber.log.Timber.tag("Moments").w(failure, "couldn't lift the subject")
                null
            } finally {
                segmenter.close()
            }
        }

    /** The model is on the phone: asked for from Play services now if it isn't (the one time it is fetched). */
    private suspend fun ready(
        context: Context,
        segmenter: SubjectSegmenter,
    ): Boolean {
        val installer = ModuleInstall.getClient(context)
        if (installer.areModulesAvailable(segmenter).await().areModulesAvailable()) return true
        val done = CompletableDeferred<Boolean>()
        val listener =
            InstallStatusListener { update ->
                when (update.installState) {
                    ModuleInstallStatusUpdate.InstallState.STATE_COMPLETED -> done.complete(true)
                    ModuleInstallStatusUpdate.InstallState.STATE_FAILED,
                    ModuleInstallStatusUpdate.InstallState.STATE_CANCELED,
                    -> done.complete(false)
                    else -> Unit
                }
            }
        return try {
            val request = ModuleInstallRequest.newBuilder().addApi(segmenter).setListener(listener).build()
            if (installer.installModules(request).await().areModulesAlreadyInstalled()) {
                true
            } else {
                // A debug emulator build doesn't wait long: its stand-in takes over (MomentStandIn).
                withTimeoutOrNull(if (MomentStandIn.active) STAND_IN_WAIT_MS else FETCH_WAIT_MS) { done.await() } ?: false
            }
        } finally {
            installer.unregisterListener(listener)
        }
    }

    /** What the marks are on, as one upright picture: the photo, or its canvas when placed. */
    private fun surface(
        picture: Bitmap,
        placement: MomentPlacement?,
    ): Bitmap {
        if (placement == null) {
            val scale = min(1f, LONGEST.toFloat() / max(picture.width, picture.height).coerceAtLeast(1))
            if (scale >= 1f) return picture
            return Bitmap.createScaledBitmap(
                picture,
                (picture.width * scale).roundToInt().coerceAtLeast(1),
                (picture.height * scale).roundToInt().coerceAtLeast(1),
                true,
            )
        }
        val canvas = Bitmap.createBitmap(MomentPlacement.CANVAS_WIDTH, MomentPlacement.CANVAS_HEIGHT, Bitmap.Config.ARGB_8888)
        MomentPlacementPainter.draw(
            Canvas(canvas),
            picture,
            placement,
            MomentPlacementPainter.backdrop(picture),
            canvas.width.toFloat(),
            canvas.height.toFloat(),
        )
        return canvas
    }

    /** Enough of the picture is in front (read on a grid, not every pixel). */
    private fun hasSubject(front: Bitmap): Boolean {
        val step = max(1, max(front.width, front.height) / 200)
        var seen = 0
        var opaque = 0
        val row = IntArray(front.width)
        var y = 0
        while (y < front.height) {
            front.getPixels(row, 0, front.width, 0, y, front.width, 1)
            var x = 0
            while (x < front.width) {
                seen++
                if ((row[x] ushr 24) > 128) opaque++
                x += step
            }
            y += step
        }
        return seen > 0 && opaque.toFloat() / seen >= LEAST_SUBJECT
    }
}
