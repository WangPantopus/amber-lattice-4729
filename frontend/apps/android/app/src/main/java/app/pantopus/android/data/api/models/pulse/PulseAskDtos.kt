package app.pantopus.android.data.api.models.pulse

import app.pantopus.android.data.api.models.posts.PostSource
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * The marks in a legacy post's `post_metadata`: the lifecycle marker, the mark Plans puts on a plan's own post, and
 * where its story was published (only the server sets `source_url` and `source_name`). All other metadata stays unread.
 */
@JsonClass(generateAdapter = true)
data class PostLifecycleMetadata(
    @Json(name = "kept_open_at") val keptOpenAt: String? = null,
    /** True on a plan's own post (Plans sets it): its event times are real moments, not the composer's wall clock. */
    val plan: Boolean? = null,
    @Json(name = "source_url") val sourceUrl: String? = null,
    @Json(name = "source_name") val sourceName: String? = null,
) {
    /** Where the post's story was published; null on most posts. */
    val source: PostSource? get() = PostSource.of(sourceUrl, sourceName)
}

/** Where an Ask stands after the asker kept it open or closed it (contract section 2.12). */
@JsonClass(generateAdapter = true)
data class PulsePostStatusDto(
    /** `open` or `resolved`. */
    val state: String? = null,
    /** `closed` or `closed_unanswered` once closed; null while open. */
    val resolution: String? = null,
    /** When the Ask now ends. */
    @Json(name = "ends_at") val endsAt: String? = null,
)

/** `POST /api/pulse/posts/:postId/keep-open` and `…/close` reply. */
@JsonClass(generateAdapter = true)
data class PulsePostStatusResponse(
    @Json(name = "post_status") val postStatus: PulsePostStatusDto? = null,
)
