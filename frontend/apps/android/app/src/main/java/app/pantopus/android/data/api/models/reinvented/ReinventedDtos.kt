package app.pantopus.android.data.api.models.reinvented

import app.pantopus.android.data.api.models.feed.FeedPost
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.moments.MomentGuessSpotDto
import app.pantopus.android.data.api.models.moments.MomentRingDto
import app.pantopus.android.data.api.models.plans.PlanPinDto
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * "Pulse, reinvented" phase 1, the one Pulse tab (CONTRACT 6, `~/pantopus-moments/pulse-reinvented/coord/CONTRACT.md`,
 * owned by the server session): the routes only the new Pulse tab reads, under `/api/reinvented/`, and only while
 * `pulse_reinvented` is on for the person (else `403 PULSE_REINVENTED_OFF`; an older server answers 404 and the app
 * goes back to today's Pulse). Every list is read item by item ([Lossy]), so one item this app can't read never costs
 * the screen. Moments and posts are the objects today's screens already decode.
 */

/** The reader's town, to the reader only ("Camas"). */
@JsonClass(generateAdapter = true)
data class ReinventedPlaceDto(
    val label: String? = null,
)

/** A distance band and its words: `{ "band": "town", "label": "Camas" }`. Nothing finer is ever sent. */
@JsonClass(generateAdapter = true)
data class ReinventedBandDto(
    val band: String,
    val label: String,
)

/**
 * One item of the list or of Explore: a Moment that fades (`type: "moment"`), or a post that stays (`type: "post"`).
 * A Moment its author kept ("Keep this?") is a Moment with [kept] true, drawn as a post that stays. Explore says why
 * the item is there in one line ([why]).
 */
@JsonClass(generateAdapter = true)
data class ReinventedListItemDto(
    val type: String,
    val id: String,
    val band: String? = null,
    val kept: Boolean = false,
    val moment: MomentDto? = null,
    val post: FeedPost? = null,
    val why: String? = null,
)

/** `GET /api/reinvented/list` (CONTRACT 6a): one page, by reach, chip and cursor. */
@JsonClass(generateAdapter = true)
data class ReinventedListResponse(
    val reach: String = "around",
    val miles: Int? = null,
    val place: ReinventedPlaceDto? = null,
    /** The chips this reach and place have something for, `all` first; null on later pages. */
    val chips: List<String>? = null,
    @Lossy val bands: List<ReinventedBandDto> = emptyList(),
    @Lossy val items: List<ReinventedListItemDto> = emptyList(),
    @Json(name = "next_cursor") val nextCursor: String? = null,
    /** "Caught up on your circle. Keep exploring?" on the last page. */
    val end: String? = null,
    /** Around me with no place at all: ask for one, as today's Pulse does. */
    @Json(name = "needs_place") val needsPlace: Boolean = false,
)

/** A post that stays, at the point everyone sees; a Heads-up is drawn red, pulsing and on top. */
@JsonClass(generateAdapter = true)
data class ReinventedMarkDto(
    val id: String,
    val latitude: Double,
    val longitude: Double,
    @Json(name = "heads_up") val headsUp: Boolean = false,
    val post: FeedPost,
)

/** A Moment its author kept as a post that stays, drawn as a mark with its picture. */
@JsonClass(generateAdapter = true)
data class ReinventedKeptDto(
    val id: String,
    val latitude: Double,
    val longitude: Double,
    val moment: MomentDto,
)

/**
 * `GET /api/reinvented/map` (CONTRACT 6b): for a box and a time, rings (Moments, today's rings), marks (posts that
 * stay), tickets (plans, today's plan pins) and the kept Moments.
 */
@JsonClass(generateAdapter = true)
data class ReinventedMapResponse(
    val time: String = "live",
    @Lossy val rings: List<MomentRingDto> = emptyList(),
    @Lossy val marks: List<ReinventedMarkDto> = emptyList(),
    @Lossy val tickets: List<PlanPinDto> = emptyList(),
    @Lossy val kept: List<ReinventedKeptDto> = emptyList(),
    /** CONTRACT 5d/6b: the live guess-the-spot Moments the reader may see in the area, with no point: a list, never marks. */
    @Json(name = "guess_spots") @Lossy val guessSpots: List<MomentGuessSpotDto> = emptyList(),
)

/** A Moment live from here, with its band. */
@JsonClass(generateAdapter = true)
data class ReinventedLiveHereDto(
    val band: String? = null,
    val moment: MomentDto,
)

/**
 * `GET /api/reinvented/strip` (CONTRACT 6c), Alive right now: Moments live from here, plans on now or within the hour,
 * and one ring per person the reader knows with a live Moment.
 */
@JsonClass(generateAdapter = true)
data class ReinventedStripResponse(
    @Lossy @Json(name = "live_here") val liveHere: List<ReinventedLiveHereDto> = emptyList(),
    @Lossy @Json(name = "plans_soon") val plansSoon: List<PlanPinDto> = emptyList(),
    @Lossy val people: List<MomentRingDto> = emptyList(),
) {
    val isEmpty: Boolean get() = liveHere.isEmpty() && plansSoon.isEmpty() && people.isEmpty()
}

/**
 * `GET /api/reinvented/explore` (CONTRACT 6f): "Today, elsewhere" ([picked], the first page only), then every other one
 * newest first with variety ([items]), pausing at "Keep exploring?" ([pause]).
 */
@JsonClass(generateAdapter = true)
data class ReinventedExploreResponse(
    @Lossy val picked: List<ReinventedListItemDto> = emptyList(),
    @Lossy val items: List<ReinventedListItemDto> = emptyList(),
    @Json(name = "next_cursor") val nextCursor: String? = null,
    val pause: String? = null,
)

/**
 * `GET /api/reinvented/atlas` (CONTRACT 6e), My Atlas: the caller's own kept Moments, live and ended, private to them,
 * newest first, by date (with [nextCursor]) or every one in a box (no cursor).
 */
@JsonClass(generateAdapter = true)
data class ReinventedAtlasResponse(
    @Lossy val moments: List<MomentDto> = emptyList(),
    @Json(name = "next_cursor") val nextCursor: String? = null,
)

/** `POST /api/reinvented/moments/:id/keep` (CONTRACT 6d): the author's one answer to "Keep this?". */
@JsonClass(generateAdapter = true)
data class ReinventedKeepBody(
    val keep: Boolean,
)
