package app.pantopus.android.data.plans

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import app.pantopus.android.data.api.models.plans.PlanPhotosResponse
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.PlanExtrasApi
import app.pantopus.android.data.moments.MomentMedia
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The holidays' photos afterwards (08-extras section 5): a picked picture, turned upright and made a JPEG of at most
 * 4096 px on its long side in memory (so no location or other EXIF leaves the phone; the server cleans it again), sent
 * as its own `POST /api/plans/:id/photos`. The picked original is copied into the cache only while it is read and is
 * gone before the upload; nothing of a plan's pictures is written to disk.
 */
@Singleton
class PlanPhotoUploads
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val api: PlanExtrasApi,
    ) {
        /** Uploads [jpeg] (from [prepare]) to [planId]: the server's grid, or its refusal. */
        suspend fun add(
            planId: String,
            jpeg: ByteArray,
        ): NetworkResult<PlanPhotosResponse> {
            val part = MultipartBody.Part.createFormData("file", "photo.jpg", jpeg.toRequestBody(JPEG))
            return safeApiCall { api.addPhoto(planId, part) }
        }

        /** The picked picture as the JPEG to send, in memory; null when the phone can't read it ([UNREADABLE]). */
        suspend fun prepare(uri: Uri): ByteArray? =
            withContext(Dispatchers.IO) {
                val folder = File(context.cacheDir, FOLDER).apply { mkdirs() }
                val picked = File(folder, "picked-${UUID.randomUUID()}")
                try {
                    context.contentResolver.openInputStream(uri)?.use { input -> FileOutputStream(picked).use { input.copyTo(it) } }
                        ?: return@withContext null
                    val bitmap = MomentMedia.decodeUpright(picked, LONG_SIDE) ?: return@withContext null
                    val out = ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.JPEG, QUALITY, out)
                    bitmap.recycle()
                    out.toByteArray()
                } catch (_: Exception) {
                    null
                } finally {
                    picked.delete()
                }
            }

        companion object {
            /** A picture the phone couldn't read: nothing is sent. */
            const val UNREADABLE = "This picture couldn't be read. Try another."
            private const val FOLDER = "plan-photos"
            private const val LONG_SIDE = 4096
            private const val QUALITY = 90
            private val JPEG = "image/jpeg".toMediaType()
        }
    }
