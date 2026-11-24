package app.pantopus.android.data.api.models.profile

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * The profile with sources: `~/pantopus-profile-sources/CONTRACT.md`, frozen v1 (2026-11-23). The server draws the page
 * for this viewer and the app draws its blocks. Blocks and links stay loose maps here, so a kind the app doesn't know
 * (or a key it doesn't read) never fails the whole page: `ProfilePageMapper` reads the kinds it knows and skips the
 * rest (contract §0).
 */

/** `GET /api/profile-page/:username` and `/id/:id` (contract §2). */
@JsonClass(generateAdapter = true)
data class ProfilePageDto(
    val v: Int? = null,
    /** owner | household | connection | member | link */
    val view: String? = null,
    val listed: Boolean? = null,
    val header: ProfilePageHeaderDto? = null,
    val summary: ProfilePageSummaryDto? = null,
    val tabs: List<ProfilePageTabDto>? = null,
    val actions: List<Map<String, Any?>>? = null,
    val footer: ProfilePageFooterDto? = null,
    /** Only on an owner's `?as=` read: the view this page was drawn for. */
    @Json(name = "preview_as") val previewAs: String? = null,
)

/** Contract §2.1. */
@JsonClass(generateAdapter = true)
data class ProfilePageHeaderDto(
    @Json(name = "user_id") val userId: String? = null,
    val username: String? = null,
    val name: String? = null,
    /** Owner view only: the account's own name, for the gray "stays private" line. */
    @Json(name = "account_name") val accountName: String? = null,
    @Json(name = "first_name") val firstName: String? = null,
    val headline: String? = null,
    @Json(name = "portrait_url") val portraitUrl: String? = null,
    @Json(name = "seen_as") val seenAs: String? = null,
    val place: ProfilePagePlaceDto? = null,
    val rings: ProfilePageRingsDto? = null,
)

@JsonClass(generateAdapter = true)
data class ProfilePagePlaceDto(
    /** City and state only. */
    val label: String? = null,
    /** The city's time zone, for the clock the app keeps running. */
    val tz: String? = null,
    /** The city's time when the page was composed. */
    val time: String? = null,
    /** dawn | day | evening | night; later values may add "_rain" etc. (draw the part before "_"). */
    val sky: String? = null,
)

@JsonClass(generateAdapter = true)
data class ProfilePageRingsDto(
    val from: Int? = null,
    /** `YYYY-MM-DD`. */
    val now: String? = null,
    val home: List<String>? = null,
    val work: List<String>? = null,
    val others: List<String>? = null,
)

/** Contract §2.2: from the shown lanes only. */
@JsonClass(generateAdapter = true)
data class ProfilePageSummaryDto(
    val years: Int? = null,
    @Json(name = "seen_months") val seenMonths: Int? = null,
    @Json(name = "signed_months") val signedMonths: Int? = null,
    @Json(name = "said_months") val saidMonths: Int? = null,
)

/** Contract §2.3: `person`, `work`, `record` (skip unknown keys). */
@JsonClass(generateAdapter = true)
data class ProfilePageTabDto(
    val key: String? = null,
    val title: String? = null,
    val blocks: List<Map<String, Any?>>? = null,
)

/** Contract §2.5: link view only. */
@JsonClass(generateAdapter = true)
data class ProfilePageFooterDto(
    val text: String? = null,
    @Json(name = "as_of") val asOf: String? = null,
)

/** `GET …/month/:month` (contract §5). */
@JsonClass(generateAdapter = true)
data class ProfilePageMonthDto(
    val v: Int? = null,
    val view: String? = null,
    val month: String? = null,
    val title: String? = null,
    val subtitle: String? = null,
    val lines: List<Map<String, Any?>>? = null,
)

/** `GET /api/profile-page/me/share` and the answer to `PUT` (contract §6). */
@JsonClass(generateAdapter = true)
data class ProfileShareDto(
    val v: Int? = null,
    val username: String? = null,
    /** True: the username prompt comes first; a made-up name is never shared. */
    @Json(name = "username_is_made_up") val usernameIsMadeUp: Boolean? = null,
    val url: String? = null,
    /** False until the first save; the parts are then the defaults. */
    val saved: Boolean? = null,
    /** In board 21's order. */
    val parts: List<ProfileSharePartDto>? = null,
    @Json(name = "search_engines") val searchEngines: Boolean? = null,
    /** The widest "Who sees your city" lets the city go: anyone | connections | none. */
    @Json(name = "city_limit") val cityLimit: String? = null,
    /** The page exactly as a signed-out read composes it. */
    val visitor: ProfilePageDto? = null,
)

@JsonClass(generateAdapter = true)
data class ProfileSharePartDto(
    val key: String? = null,
    /** anyone | members | connections */
    val setting: String? = null,
    @Json(name = "has_content") val hasContent: Boolean? = null,
)

/** `PUT /api/profile-page/me/share`: parts not sent keep their setting. */
@JsonClass(generateAdapter = true)
data class ProfileShareUpdateBody(
    val parts: Map<String, String>? = null,
    @Json(name = "search_engines") val searchEngines: Boolean? = null,
)

/** `GET /api/profile-page/marks?ids=…` (contract §7): the outer ring for avatars (board 6). */
@JsonClass(generateAdapter = true)
data class ProfileMarksResponse(
    val marks: List<ProfileMarkDto>? = null,
)

@JsonClass(generateAdapter = true)
data class ProfileMarkDto(
    @Json(name = "user_id") val userId: String? = null,
    /** The first month with anything in a lane that reaches this viewer, `YYYY-MM`. */
    val since: String? = null,
    /** Whether any such month is Seen. */
    val seen: Boolean? = null,
)
