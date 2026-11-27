package app.pantopus.android.data.pulse

import app.pantopus.android.data.api.models.posts.PostCreateRequest
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.StudioPostApi
import app.pantopus.android.data.moments.serverCode
import app.pantopus.android.data.upload.UploadRepository
import com.squareup.moshi.Moshi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A Pulse post made in the Studio (CONTRACT 6d): today's `POST /api/posts` with the `studio` field, then the photo as
 * today's post photo (`POST /api/upload/post-media/:id`). A 403 `PULSE_REINVENTED_OFF` turns the switch off at once.
 */
@Singleton
class StudioPostRepository
    @Inject
    constructor(
        private val api: StudioPostApi,
        private val uploads: UploadRepository,
        private val feature: PulseReinventedFeature,
        private val moshi: Moshi,
    ) {
        /** Makes the post; the answer is its id (null when the server didn't say one). */
        suspend fun create(
            request: PostCreateRequest,
            studio: Map<String, Any?>,
        ): NetworkResult<String?> {
            @Suppress("UNCHECKED_CAST")
            val base = moshi.adapter(PostCreateRequest::class.java).toJsonValue(request) as Map<String, Any?>
            val body = (base + ("studio" to studio.withoutNulls())).withoutNulls()
            val answer = safeApiCall { api.create(body) }
            if (answer is NetworkResult.Failure && answer.error.serverCode == StudioRepository.SWITCH_OFF) feature.refusedOff()
            return when (answer) {
                is NetworkResult.Success -> NetworkResult.Success((answer.data.post?.id ?: answer.data.postId)?.takeIf { it.isNotBlank() })
                is NetworkResult.Failure -> answer
            }
        }

        /** The photo, marks drawn in, as the post's photo. */
        suspend fun sendPhoto(
            postId: String,
            photo: File,
        ): Boolean {
            val bytes = withContext(Dispatchers.IO) { runCatching { photo.readBytes() }.getOrNull() } ?: return false
            return uploads.uploadPostMedia(postId, listOf(bytes)) is NetworkResult.Success
        }

        private fun Map<String, Any?>.withoutNulls(): Map<String, Any> =
            buildMap { this@withoutNulls.forEach { (key, value) -> if (value != null) put(key, value) } }
    }
