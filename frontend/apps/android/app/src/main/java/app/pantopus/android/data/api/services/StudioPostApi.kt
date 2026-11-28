package app.pantopus.android.data.api.services

import app.pantopus.android.data.api.models.posts.PostCreateResponse
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * "Pulse, reinvented" phase 1, one camera (CONTRACT 6d): a Pulse post made in the Studio. It is today's request,
 * `POST /api/posts`, with exactly the body today's composer sends (`PostCreateRequest`) plus one optional field only the
 * Studio sends, `studio` (where the stamps sit, the height for an elevation stamp, "Also show in Explore", and what
 * decides whether the "now" stamps may be kept). Sent while the switch is off for the author: `403
 * PULSE_REINVENTED_OFF` and nothing is posted. Route `backend/routes/posts.js` (create).
 */
interface StudioPostApi {
    /** The body is today's `PostCreateRequest` as JSON with `studio` beside its keys (`StudioPostRepository`). */
    @POST("api/posts")
    suspend fun create(
        @Body body: Map<String, @JvmSuppressWildcards Any>,
    ): PostCreateResponse
}
