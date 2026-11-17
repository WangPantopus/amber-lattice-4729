package app.pantopus.android.data.api.models.homes

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * `GET /api/homes/:id/verify-options` (FASTVERIFY SPEC section 4): where this person stands at this Home and which
 * ways to verify it the server offers them now. The route answers 404 `FAST_CHECK_OFF` while `home_fast_verify` is
 * off, and the apps then keep today's verify sheet. Strings stay strings, so a new level, way or reason never fails
 * the decode; the app draws only what it knows.
 */
@JsonClass(generateAdapter = true)
data class HomeVerifyOptions(
    @Json(name = "home_id") val homeId: String,
    /** `none`, `added` (a claimed home), `fast` (a standing fast check) or `proven` (mail, document, landlord, review). */
    val level: String,
    /** The standing fast check, when [level] is `fast`. */
    val fast: HomeFastCheck? = null,
    /** In the order the apps draw them: phone, location, document, mail, landlord. */
    val options: List<HomeVerifyOption> = emptyList(),
    /** Add Home in two steps (`home_short_add`). */
    @Json(name = "short_add_home") val shortAddHome: Boolean = false,
    /** The postcard's QR picture and "This wasn't me" (`home_postcard_scan`). */
    @Json(name = "postcard_scan") val postcardScan: Boolean = false,
    /** How a proven (or fast) person was verified: mail, document, landlord, phone, location or bill. Null from servers without it. */
    @Json(name = "verified_by") val verifiedBy: String? = null,
    /** When that verification happened (ISO 8601). Null from servers without it. */
    @Json(name = "verified_at") val verifiedAt: String? = null,
) {
    /** The option with this id when the server offers it now. */
    fun available(id: String): HomeVerifyOption? = options.firstOrNull { it.id == id && it.available }

    /** The option with this id, offered or not. */
    fun option(id: String): HomeVerifyOption? = options.firstOrNull { it.id == id }

    val isFast: Boolean get() = level == LEVEL_FAST

    val isProven: Boolean get() = level == LEVEL_PROVEN

    companion object {
        const val LEVEL_FAST = "fast"
        const val LEVEL_PROVEN = "proven"
        const val LEVEL_ADDED = "added"
    }
}

/** A standing fast check: `phone`, `location` or `document`, and its dates (ISO 8601). */
@JsonClass(generateAdapter = true)
data class HomeFastCheck(
    val kind: String,
    val at: String? = null,
    @Json(name = "expires_at") val expiresAt: String? = null,
    @Json(name = "recheck_due_at") val recheckDueAt: String? = null,
)

/**
 * One way to verify: `phone`, `location`, `document`, `mail` or `landlord`. [reason] says why it isn't offered:
 * `OFF`, `NEEDS_CLAIM`, `ONE_HOME`, `LIMIT`, `APP_ONLY`, `IN_REVIEW` or `UNAVAILABLE`.
 */
@JsonClass(generateAdapter = true)
data class HomeVerifyOption(
    val id: String,
    val available: Boolean,
    val reason: String? = null,
)
