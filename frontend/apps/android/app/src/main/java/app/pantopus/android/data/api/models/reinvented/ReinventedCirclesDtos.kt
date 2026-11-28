package app.pantopus.android.data.api.models.reinvented

import app.pantopus.android.data.api.models.moments.MomentAuthorDto
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * "Pulse, reinvented" phase 3, circles and the weekly magazine (CONTRACT 8d): circles of 2 to 8 close people, nobody in
 * one without their own yes, and nobody outside it learns it exists. Read only while the switch is on for the reader.
 */

@JsonClass(generateAdapter = true)
data class ReinventedCircleMemberDto(
    val person: MomentAuthorDto,
    /** `in` or `invited`. */
    val state: String = "in",
)

@JsonClass(generateAdapter = true)
data class ReinventedCircleDto(
    val id: String,
    val name: String = "",
    val owner: MomentAuthorDto? = null,
    @Lossy val members: List<ReinventedCircleMemberDto> = emptyList(),
    val mine: Boolean = false,
    @Json(name = "week_day") val weekDay: Int? = null,
    @Json(name = "magazine_ready") val magazineReady: Boolean = false,
    @Json(name = "my_state") val myState: String? = null,
    @Json(name = "my_keep_faded") val myKeepFaded: Boolean = false,
)

/** `GET /api/reinvented/circles`: the circles the reader is in, and the ones they are invited to. */
@JsonClass(generateAdapter = true)
data class ReinventedCirclesResponse(
    @Lossy val circles: List<ReinventedCircleDto> = emptyList(),
    @Lossy val invites: List<ReinventedCircleDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class ReinventedCircleEnvelope(
    val circle: ReinventedCircleDto? = null,
)

@JsonClass(generateAdapter = true)
data class ReinventedCircleMakeBody(
    val name: String,
    val people: List<String>,
)

@JsonClass(generateAdapter = true)
data class ReinventedCircleChangeBody(
    val name: String? = null,
    val add: List<String>? = null,
    val remove: List<String>? = null,
)

@JsonClass(generateAdapter = true)
data class ReinventedCircleKeepBody(
    @Json(name = "keep_faded") val keepFaded: Boolean,
)

@JsonClass(generateAdapter = true)
data class ReinventedMagazineItemDto(
    val type: String = "moment",
    val id: String,
    val author: MomentAuthorDto? = null,
    val at: String? = null,
    val caption: String? = null,
    @Json(name = "thumb_url") val thumbUrl: String? = null,
    val ended: Boolean = false,
)

@JsonClass(generateAdapter = true)
data class ReinventedMagazinePageDto(
    /** `cover`, `one`, `two` or `grid`. */
    val layout: String = "grid",
    @Lossy val items: List<ReinventedMagazineItemDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class ReinventedMagazinePersonDto(
    val person: MomentAuthorDto,
    val count: Int = 0,
)

@JsonClass(generateAdapter = true)
data class ReinventedMagazineWeekDto(
    val from: String,
    val to: String,
)

@JsonClass(generateAdapter = true)
data class ReinventedMagazineCircleDto(
    val id: String,
    val name: String = "",
)

/** `GET /api/reinvented/circles/:id/magazine`: the circle's week, laid out, made on read. */
@JsonClass(generateAdapter = true)
data class ReinventedMagazineResponse(
    val circle: ReinventedMagazineCircleDto? = null,
    val week: ReinventedMagazineWeekDto? = null,
    @Lossy val pages: List<ReinventedMagazinePageDto> = emptyList(),
    @Lossy val people: List<ReinventedMagazinePersonDto> = emptyList(),
    val empty: Boolean = false,
)
