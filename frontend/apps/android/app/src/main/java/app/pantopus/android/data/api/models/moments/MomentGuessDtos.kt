package app.pantopus.android.data.api.models.moments

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * Guess the spot ("Pulse, reinvented" step 8; CONTRACT 5), only for a reader whose switch is on: a Moment its author
 * made as "Guess the spot" leaves out its spot until the reader guessed; they drop a pin and learn how far off they
 * were. Distance only: no points, no ranks.
 */

/** On a guess-the-spot Moment: how many guessed, and the reader's own guess (null until they guessed, and on one's own). */
@JsonClass(generateAdapter = true)
data class MomentGuessStateDto(
    val count: Int = 0,
    val mine: MomentGuessResultDto? = null,
)

/** How far off a guess was: "1.2 mi off". */
@JsonClass(generateAdapter = true)
data class MomentGuessResultDto(
    @Json(name = "distance_m") val distanceM: Double? = null,
    val label: String? = null,
)

/** `POST /api/moments/:id/guess`: the one guess. */
@JsonClass(generateAdapter = true)
data class MomentGuessBody(
    val latitude: Double,
    val longitude: Double,
)

/** The answer: how far off, and the Moment now in full (its place and stamps). */
@JsonClass(generateAdapter = true)
data class MomentGuessResponse(
    val guess: MomentGuessResultDto? = null,
    val moment: MomentDto? = null,
)

/**
 * A live guess-the-spot Moment on the map's read (CONTRACT 5d, `guess_spots`), with no point: who made it, a small
 * picture, whether the reader guessed, and whether it is today's spot.
 */
@JsonClass(generateAdapter = true)
data class MomentGuessSpotDto(
    @Json(name = "moment_id") val momentId: String? = null,
    val author: MomentAuthorDto? = null,
    val kind: String? = null,
    @Json(name = "thumb_url") val thumbUrl: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "expires_at") val expiresAt: String? = null,
    val guessed: Boolean = false,
    val daily: Boolean = false,
)

/** Today's spot for a town (CONTRACT 5d): the same for everyone that day, with no storage. */
@JsonClass(generateAdapter = true)
data class MomentDailySpotDto(
    @Json(name = "moment_id") val momentId: String? = null,
    val town: String? = null,
    val day: String? = null,
    val guessed: Boolean = false,
)

/** `GET /api/moments/daily-spot`: today's spot, or null. */
@JsonClass(generateAdapter = true)
data class MomentDailySpotResponse(
    @Json(name = "daily_spot") val dailySpot: MomentDailySpotDto? = null,
)
