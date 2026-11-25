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

/**
 * `GET …/piece/:pieceId` (contract §5 and P2.2): one piece opened (board 8). The piece stays raw JSON for the mapper,
 * as blocks do: its `media` is a list in v1's read and the counts in phase 2's.
 */
@JsonClass(generateAdapter = true)
data class ProfilePieceDto(
    val v: Int? = null,
    val view: String? = null,
    val piece: Map<String, Any?>? = null,
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
    /** The page exactly as a signed-out read composes it; null when a signed-out visitor couldn't open it at all. */
    val visitor: ProfilePageDto? = null,
    /** v1.3: absent while `PROFILE_LINKS` is off (no "Links for one purpose" section); false when the person turned them off. */
    @Json(name = "links_enabled") val linksEnabled: Boolean? = null,
    /** v1.3: links for one purpose, newest first. */
    val links: List<ProfileShareLinkDto>? = null,
    /** v1.4: false while the profile is private (no link opens); then [linksNote] takes Copy and Send's place. */
    @Json(name = "links_open") val linksOpen: Boolean? = null,
    @Json(name = "links_note") val linksNote: String? = null,
    /** P2.5: the Work row's "12 of your 18 pieces", counted from each piece's who-sees-it. */
    @Json(name = "work_pieces") val workPieces: ProfileWorkPiecesDto? = null,
)

/** `GET /me/share`'s `work_pieces` (P2.5): pieces a link shows, of the pieces on Work. */
@JsonClass(generateAdapter = true)
data class ProfileWorkPiecesDto(
    val shown: Int? = null,
    val total: Int? = null,
)

/** A link for one purpose (contract v1.3). Its key is in [url]: shown only to the owner, never logged or pasted. */
@JsonClass(generateAdapter = true)
data class ProfileShareLinkDto(
    val id: String? = null,
    val name: String? = null,
    val url: String? = null,
    val parts: Map<String, Boolean>? = null,
    /** `YYYY-MM-DD`; the link works through that Pacific day. Null: no end. */
    @Json(name = "ends_on") val endsOn: String? = null,
    @Json(name = "switched_off") val switchedOff: Boolean? = null,
    val live: Boolean? = null,
    val opens: Int? = null,
    @Json(name = "last_opened_on") val lastOpenedOn: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

/** `POST /api/profile-page/me/links`. */
@JsonClass(generateAdapter = true)
data class ProfileShareLinkCreateBody(
    val name: String,
    val parts: Map<String, Boolean>,
    @Json(name = "ends_on") val endsOn: String?,
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
    @Json(name = "links_enabled") val linksEnabled: Boolean? = null,
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
