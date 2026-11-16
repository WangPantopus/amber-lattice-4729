@file:Suppress("PackageNaming")

package app.pantopus.android.data.api.models.saved_places

import app.pantopus.android.data.api.models.feed.FeedPost
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * BLOCK 2E — "Saved places" DTOs. Decodes the `{ savedPlaces }` /
 * `{ savedPlace }` envelopes from `backend/routes/savedPlaces.js`. The GET/echo
 * rows are a raw table `select('*')`, so their keys are snake_case and need
 * `@Json(name = …)`. The POST body, however, is read camelCase on the server
 * (`req.body.placeType`, …), so [SavePlaceBody] ships property names as-is.
 */

/** `GET /api/saved-places` envelope. */
@JsonClass(generateAdapter = true)
data class SavedPlacesListResponse(
    val savedPlaces: List<SavedPlaceDto> = emptyList(),
)

/** `POST /api/saved-places` echo (the upserted row). */
@JsonClass(generateAdapter = true)
data class SavedPlaceResponse(
    val savedPlace: SavedPlaceDto,
)

/** One saved place. Only the fields the list + toggle read are modelled. */
@JsonClass(generateAdapter = true)
data class SavedPlaceDto(
    val id: String,
    @Json(name = "user_id") val userId: String? = null,
    val label: String,
    /** `home | work | searched | saved`. */
    @Json(name = "place_type") val placeType: String = "saved",
    val latitude: Double,
    val longitude: Double,
    val city: String? = null,
    val state: String? = null,
    @Json(name = "source_id") val sourceId: String? = null,
    @Json(name = "geocode_place_id") val geocodePlaceId: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

/**
 * Body for `POST /api/saved-places`. The backend reads camelCase keys, so no
 * `@Json` remapping is required. `label`, `latitude`, `longitude` are required
 * server-side; `placeType` defaults to `searched`. The upsert keys on
 * `(user, latitude, longitude)`, so re-posting the same coordinate replaces the
 * row rather than duplicating it.
 */
@JsonClass(generateAdapter = true)
data class SavePlaceBody(
    val label: String,
    val placeType: String,
    val latitude: Double,
    val longitude: Double,
    val city: String? = null,
    val state: String? = null,
    val geocodePlaceId: String? = null,
    val sourceId: String? = null,
    val expectedUserId: String? = null,
) {
    companion object {
        /** Rebuild a save body from an existing row — used by the Undo path. */
        fun from(dto: SavedPlaceDto): SavePlaceBody =
            SavePlaceBody(
                label = dto.label,
                placeType = dto.placeType,
                latitude = dto.latitude,
                longitude = dto.longitude,
                city = dto.city,
                state = dto.state,
                geocodePlaceId = dto.geocodePlaceId,
                sourceId = dto.sourceId,
            )
    }
}

/** `DELETE /api/saved-places/:id` echo (`{ message }`). */
@JsonClass(generateAdapter = true)
data class SavedPlaceDeleteResponse(
    val message: String? = null,
)

/**
 * Body for `POST /api/saved-places/area/today` (TABCARD §4): a point already rounded to two decimal places on the
 * phone (about a kilometre). An exact fix is never sent.
 */
@JsonClass(generateAdapter = true)
data class AreaTodayBody(
    val latitude: Double,
    val longitude: Double,
)

/**
 * Today's second half, "Around you" (`backend/services/aroundYouService.js`): local headlines for the place Today
 * shows, each also a post by the Pantopus curator account in the feed's shape. `available` false: Today shows no
 * switch (the feature is off, or the area has nothing to show).
 */
@JsonClass(generateAdapter = true)
data class AroundYouDto(
    val available: Boolean = false,
    /** The content region's name ("Clark County, WA"). */
    val area: String? = null,
    val sections: List<AroundYouSectionDto> = emptyList(),
) {
    /** The server sent the items as posts (one from before the posts sends only the rows). */
    val hasPosts: Boolean get() = sections.any { it.posts != null }

    /** Every section's posts, in page order. */
    val posts: List<FeedPost> get() = sections.flatMap { it.posts.orEmpty() }
}

@JsonClass(generateAdapter = true)
data class AroundYouSectionDto(
    val id: String,
    val title: String,
    val items: List<AroundYouItemDto> = emptyList(),
    /** The same items as posts, in the feed's shape and order; null when the server could not make or read them. */
    val posts: List<FeedPost>? = null,
)

/** An outlet's own headline, the outlet's name and where to read it. */
@JsonClass(generateAdapter = true)
data class AroundYouItemDto(
    val id: String,
    val title: String,
    /** Who published it ("The Columbian"). */
    val source: String? = null,
    /** The story at its outlet; null for a tip that is its own text. */
    val url: String? = null,
    /** When Pantopus first saw it (ISO 8601). */
    @Json(name = "seen_at") val seenAt: String,
    /** The item's post; null from a server before the posts. */
    @Json(name = "post_id") val postId: String? = null,
)
