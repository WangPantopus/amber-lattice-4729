package app.pantopus.android.data.api.models.plans

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * Plans for the holidays, the six extras (08-extras.md; the server's shapes in HOLSRV-extras-api-for-apps.md). Every
 * extra has its own switch, read for the plan's host; with it off its routes answer 404 and no card carries it. Every
 * word that names money or a date is the server's.
 */

// ---- 1. The same people again (board 30, switch `plans_same_people`) ----

/** `GET /api/plans/past-people`: the host's last ten ended plans that had anyone in, newest first. */
@JsonClass(generateAdapter = true)
data class PlanPastPlansResponse(
    @Json(name = "plans") val plans: List<PlanPastPlanDto> = emptyList(),
)

/** One past plan: "{12} people" is [count] (one a party). */
@JsonClass(generateAdapter = true)
data class PlanPastPlanDto(
    @Json(name = "post_id") val postId: String,
    @Json(name = "title") val title: String = "",
    @Json(name = "kind") val kind: String? = null,
    @Json(name = "date_text") val dateText: String? = null,
    @Json(name = "count") val count: Int = 0,
)

/** `GET /api/plans/past-people/:postId`: that plan's people, a check each, before anything goes. No address, no account id. */
@JsonClass(generateAdapter = true)
data class PlanPastPeopleDto(
    @Json(name = "post_id") val postId: String,
    @Json(name = "title") val title: String = "",
    @Json(name = "kind") val kind: String? = null,
    @Json(name = "date_text") val dateText: String? = null,
    @Json(name = "count") val count: Int = 0,
    @Json(name = "text_only") val textOnly: Int = 0,
    @Json(name = "people") val people: List<PlanPastPersonDto> = emptyList(),
)

/** A person who was in: [key] (`p:<user id>` or `g:<guest id>`) is what `skip` takes; `via` text can't be invited. */
@JsonClass(generateAdapter = true)
data class PlanPastPersonDto(
    @Json(name = "key") val key: String,
    @Json(name = "name") val name: String = "",
    @Json(name = "avatar_url") val avatarUrl: String? = null,
    @Json(name = "via") val via: String = "pantopus",
    @Json(name = "can_invite") val canInvite: Boolean = true,
)

/** `POST /api/plans/:id/invites/from-plan` body. */
@JsonClass(generateAdapter = true)
data class PlanFromPlanBody(
    @Json(name = "from_post_id") val fromPostId: String,
    @Json(name = "skip") val skip: List<String> = emptyList(),
    /** At a home, the host agreed that people who are in see the address (as inviting asks). */
    @Json(name = "confirm_shares_address") val confirmSharesAddress: Boolean? = null,
)

/** What `from-plan` answers besides the invitation list (read again after): the line to show, "Invited 4. …". */
@JsonClass(generateAdapter = true)
data class PlanFromPlanResponse(
    @Json(name = "invited") val invited: Int = 0,
    @Json(name = "text_only") val textOnly: Int = 0,
    @Json(name = "text") val text: String? = null,
)
