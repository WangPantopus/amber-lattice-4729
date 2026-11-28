package app.pantopus.android.data.api.models.reinvented

import app.pantopus.android.data.api.models.moments.MomentAuthorDto
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * "Pulse, reinvented" phase 3, strands (CONTRACT 8c): "Went because of you". Told to the first person only, between
 * people only, never shown to anyone else; read only while the switch is on for the reader.
 */

/** The post or Moment that led somewhere: the app opens it by id, as its reader may. */
@JsonClass(generateAdapter = true)
data class ReinventedStrandSourceDto(
    val id: String,
    /** `moment` or `post`. */
    val type: String = "moment",
    val caption: String? = null,
)

/** One person who went, inside a group. */
@JsonClass(generateAdapter = true)
data class ReinventedStrandItemDto(
    val id: String,
    val follower: MomentAuthorDto? = null,
    @Json(name = "follower_post_id") val followerPostId: String? = null,
    val at: String? = null,
)

/** One group: a source and a day, with the server's own words ("Dana went because of your Moment."). */
@JsonClass(generateAdapter = true)
data class ReinventedStrandGroupDto(
    val source: ReinventedStrandSourceDto,
    /** `went`, `retake` or `passed`. */
    val kind: String = "went",
    /** The author's own day, Pacific (`2026-11-27`). */
    val day: String? = null,
    val count: Int = 0,
    @Lossy val people: List<MomentAuthorDto> = emptyList(),
    val label: String = "",
    val unseen: Boolean = false,
    @Lossy val items: List<ReinventedStrandItemDto> = emptyList(),
)

/** `GET /api/reinvented/strands`: newest first, grouped by source and day. */
@JsonClass(generateAdapter = true)
data class ReinventedStrandsResponse(
    @Lossy val strands: List<ReinventedStrandGroupDto> = emptyList(),
    @Json(name = "unseen_count") val unseenCount: Int = 0,
    @Json(name = "next_cursor") val nextCursor: String? = null,
)

/** `POST /api/reinvented/strands/seen`. */
@JsonClass(generateAdapter = true)
data class ReinventedStrandsSeenBody(
    val ids: List<String>? = null,
    val all: Boolean? = null,
)
