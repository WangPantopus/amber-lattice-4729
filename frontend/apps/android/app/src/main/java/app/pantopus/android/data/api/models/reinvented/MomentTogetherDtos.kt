package app.pantopus.android.data.api.models.reinvented

import app.pantopus.android.data.api.models.moments.MomentAuthorDto
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * "Pulse, reinvented" phase 3 on a Moment (CONTRACT 8), read only while the switch is on for the reader. Every phase-3
 * field of a Moment answer lives here, so today's Moment file is touched once per field.
 */

/** CONTRACT 8a: whether replies show on a Moment, how many this reader may see, and whether they may reply. */
@JsonClass(generateAdapter = true)
data class MomentRepliesStateDto(
    val shown: Boolean = false,
    val count: Int = 0,
    val pins: Int = 0,
    @Json(name = "can_reply") val canReply: Boolean = false,
)

/** One reply people can see under a Moment (CONTRACT 8a). */
@JsonClass(generateAdapter = true)
data class MomentReplyDto(
    val id: String,
    val text: String = "",
    val at: String? = null,
    val author: MomentAuthorDto? = null,
    val mine: Boolean = false,
    @Json(name = "can_remove") val canRemove: Boolean = false,
)

/** `GET /api/reinvented/moments/:id/replies`: oldest first, 30 a page. */
@JsonClass(generateAdapter = true)
data class MomentRepliesResponse(
    @Lossy val replies: List<MomentReplyDto> = emptyList(),
    @Json(name = "next_cursor") val nextCursor: String? = null,
)

@JsonClass(generateAdapter = true)
data class MomentReplyEnvelope(
    val reply: MomentReplyDto,
)

@JsonClass(generateAdapter = true)
data class MomentReplyBody(
    val text: String,
)

@JsonClass(generateAdapter = true)
data class MomentReplyReportBody(
    val reason: String,
    val details: String? = null,
)

@JsonClass(generateAdapter = true)
data class MomentRepliesShownBody(
    val shown: Boolean,
)
