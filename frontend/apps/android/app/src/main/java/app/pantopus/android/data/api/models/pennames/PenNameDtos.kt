package app.pantopus.android.data.api.models.pennames

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * Made-up names (contract docs/product/made-up-names/README.md, routes backend/routes/penNames.js). On screen the words
 * are "made-up name"; in code it is a pen name, to keep it apart from the made-up username and the Mail aliases.
 */

/** The person's own made-up name (`GET /api/pen-names/me`'s `pen_name`, and what `POST /api/pen-names` answers). */
@JsonClass(generateAdapter = true)
data class PenNameDto(
    val id: String,
    val name: String,
    @Json(name = "avatar_url") val avatarUrl: String? = null,
    @Json(name = "taken_at") val takenAt: String? = null,
    /** When the name may be changed again once something was written under it; a name nothing was written under can change any time. */
    @Json(name = "change_after") val changeAfter: String? = null,
)

/** Why this account can't use a made-up name (or post one here): a sentence to show as it is. */
@JsonClass(generateAdapter = true)
data class PenNameRefusalDto(
    val code: String? = null,
    val message: String? = null,
)

/** Today's allowance under a made-up name. */
@JsonClass(generateAdapter = true)
data class PenNameLimitsDto(
    @Json(name = "posts_per_day") val postsPerDay: Int? = null,
    @Json(name = "replies_per_day") val repliesPerDay: Int? = null,
    @Json(name = "posts_today") val postsToday: Int? = null,
    @Json(name = "replies_today") val repliesToday: Int? = null,
)

@JsonClass(generateAdapter = true)
data class PenNameRulesDto(
    val min: Int = 3,
    val max: Int = 24,
)

/** `GET /api/pen-names/me`. */
@JsonClass(generateAdapter = true)
data class PenNameMeResponse(
    @Json(name = "pen_name") val penName: PenNameDto? = null,
    val allowed: Boolean = false,
    val refusal: PenNameRefusalDto? = null,
    val limits: PenNameLimitsDto? = null,
    @Json(name = "name_rules") val nameRules: PenNameRulesDto? = null,
    /** The kinds of Pulse post a made-up name may carry. */
    @Json(name = "post_types") val postTypes: List<String> = emptyList(),
    /** The three sentences shown where the name is chosen. */
    val promise: List<String> = emptyList(),
    /** Names Pantopus could give, when the person has none and may have one. */
    val suggestions: List<String> = emptyList(),
)

/** `GET /api/pen-names/suggestions`. */
@JsonClass(generateAdapter = true)
data class PenNameSuggestionsResponse(
    val suggestions: List<String> = emptyList(),
)

/** `POST /api/pen-names`: an empty [name] lets Pantopus give one; [replace] gives up the name in use. */
@JsonClass(generateAdapter = true)
data class TakePenNameRequest(
    val name: String? = null,
    val replace: Boolean? = null,
)

@JsonClass(generateAdapter = true)
data class TakePenNameResponse(
    @Json(name = "pen_name") val penName: PenNameDto? = null,
)

/** `GET /api/pen-names/check`: whether a post made here may carry a made-up name. */
@JsonClass(generateAdapter = true)
data class PenNameCheckResponse(
    val allowed: Boolean = false,
    val refusal: PenNameRefusalDto? = null,
    /** Shown above the Post button when few verified homes are near. */
    val warning: String? = null,
)

/** The small card a made-up name opens (`GET /api/pen-names/:id`). */
@JsonClass(generateAdapter = true)
data class PenNameCardDto(
    val id: String,
    val name: String,
    @Json(name = "avatar_url") val avatarUrl: String? = null,
    val badges: List<String> = emptyList(),
    val note: String? = null,
    @Json(name = "is_yours") val isYours: Boolean = false,
    val muted: Boolean = false,
    val blocked: Boolean = false,
)

@JsonClass(generateAdapter = true)
data class PenNameCardResponse(
    @Json(name = "pen_name") val penName: PenNameCardDto,
)
