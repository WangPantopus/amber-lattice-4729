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
    /** `document` only: true when the photo is read at once (the Bill check), false for today's review-only upload. */
    val fast: Boolean? = null,
)

/** `POST /api/public/postcard-report` body ("This wasn't me" for a scanned card, FASTVERIFY). */
@JsonClass(generateAdapter = true)
data class PostcardReportRequest(
    @Json(name = "home_id") val homeId: String,
    val code: String,
)

/** The report's answer: always `{ recorded: true }`, whatever the input, so it says nothing about the home or code. */
@JsonClass(generateAdapter = true)
data class PostcardReportResponse(
    val recorded: Boolean = false,
)

/** `POST /api/homes/:id/fast-check/phone/start`: text a code to [phone]; the records are asked for the account's name or the one given. */
@JsonClass(generateAdapter = true)
data class PhoneCheckStartRequest(
    val phone: String,
    @Json(name = "account_first_name") val accountFirstName: String? = null,
    @Json(name = "account_last_name") val accountLastName: String? = null,
) {
    /** Never prints the number or the names. */
    override fun toString(): String = "PhoneCheckStartRequest(hidden)"
}

/** The code went out; [resendAfterS] seconds until another may be sent. */
@JsonClass(generateAdapter = true)
data class PhoneCheckStartResponse(
    val sent: Boolean = false,
    @Json(name = "resend_after_s") val resendAfterS: Int? = null,
)

/** `POST /api/homes/:id/fast-check/phone/verify`: the texted [code] for [phone]. */
@JsonClass(generateAdapter = true)
data class PhoneCheckVerifyRequest(
    val phone: String,
    val code: String,
    @Json(name = "account_first_name") val accountFirstName: String? = null,
    @Json(name = "account_last_name") val accountLastName: String? = null,
) {
    /** Never prints the number or the code. */
    override fun toString(): String = "PhoneCheckVerifyRequest(hidden)"
}

/** `verified`, `no_match` or `wrong_code`, the person's level after it, and the code tries left. */
@JsonClass(generateAdapter = true)
data class PhoneCheckVerifyResponse(
    val result: String,
    val level: String? = null,
    @Json(name = "tries_left") val triesLeft: Int? = null,
)

/** `POST /api/homes/:id/fast-check/location/challenge`: a signed, two-minute value the reading's proof binds. */
@JsonClass(generateAdapter = true)
data class LocationChallengeResponse(
    val challenge: String,
    @Json(name = "expires_at") val expiresAt: String? = null,
)

/**
 * The device proof: on Android `{ type: 'play_integrity', token, reading }`, a Play Integrity token whose nonce is
 * base64url(SHA-256(challenge + reading)) and the exact reading text it binds.
 */
@JsonClass(generateAdapter = true)
data class LocationProofDto(
    val type: String,
    val token: String,
    val reading: String,
) {
    override fun toString(): String = "LocationProofDto(hidden)"
}

/** `POST /api/homes/:id/fast-check/location`: one reading. Never kept by the app. */
@JsonClass(generateAdapter = true)
data class LocationCheckRequest(
    val challenge: String,
    val latitude: Double,
    val longitude: Double,
    @Json(name = "accuracy_m") val accuracyM: Double,
    val mocked: Boolean,
    val platform: String,
    val proof: LocationProofDto?,
) {
    /** Never prints where the phone was. */
    override fun toString(): String = "LocationCheckRequest(hidden)"
}

/** `verified`, `confirmed`, `no_match`, `too_rough` or `not_counted`; the level after it; when it is checked again. */
@JsonClass(generateAdapter = true)
data class LocationCheckResponse(
    val result: String,
    val level: String? = null,
    @Json(name = "recheck_due_at") val recheckDueAt: String? = null,
)
