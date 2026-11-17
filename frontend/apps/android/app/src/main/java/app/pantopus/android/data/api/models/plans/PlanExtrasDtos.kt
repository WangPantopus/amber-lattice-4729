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

// ---- 2. Chip in (boards 26 and 27, switch `plans_chip_in`): no money moves through Pantopus ----

/**
 * The card's `chip_in`, for the host and people who are in only (never anyone else): the server's words for the amount
 * ([text], [paidText], [payText], [straightText]) and the host's own payment [link]. [mine] is null for the host.
 */
@JsonClass(generateAdapter = true)
data class PlanChipInDto(
    @Json(name = "text") val text: String = "",
    @Json(name = "amount_cents") val amountCents: Int = 0,
    @Json(name = "note") val note: String? = null,
    @Json(name = "service") val service: String? = null,
    @Json(name = "link") val link: String? = null,
    @Json(name = "paid_count") val paidCount: Int = 0,
    @Json(name = "of") val of: Int = 0,
    @Json(name = "paid_text") val paidText: String? = null,
    @Json(name = "pay_text") val payText: String? = null,
    @Json(name = "straight_text") val straightText: String? = null,
    @Json(name = "mine") val mine: PlanChipInMineDto? = null,
)

@JsonClass(generateAdapter = true)
data class PlanChipInMineDto(
    @Json(name = "paid") val paid: Boolean = false,
)

/** On the host's screens, each person who is in: whether they paid, and [who] (what "Mark paid" sends). */
@JsonClass(generateAdapter = true)
data class PlanChipInMarkDto(
    @Json(name = "paid") val paid: Boolean = false,
    @Json(name = "who") val who: String? = null,
)

/** The host form's `chip_in`: 100 to 50000 cents each person, a note of 1 to 60 characters, a Venmo, PayPal or Cash App link. */
@JsonClass(generateAdapter = true)
data class PlanChipInInput(
    @Json(name = "amount_cents") val amountCents: Int?,
    @Json(name = "note") val note: String,
    @Json(name = "link") val link: String,
)

/** `POST /api/plans/:id/chip-in/paid` body: empty for "I've paid"; the host's "Mark paid" names [who]. */
@JsonClass(generateAdapter = true)
data class PlanChipInWhoBody(
    @Json(name = "who") val who: String? = null,
)

/** What marking answers. */
@JsonClass(generateAdapter = true)
data class PlanChipInResponse(
    @Json(name = "chip_in") val chipIn: PlanChipInDto? = null,
)

// ---- 3. Find a date (boards 24 to 26, switch `plans_find_date`) ----

/**
 * The card's `dates` while the host is picking (`extras=1`); gone after the pick. Every word with a date or a count in it
 * is the server's ([answeredText], each option's `text` and `can_text`, the host's `pick_text` and `pick_note`).
 */
@JsonClass(generateAdapter = true)
data class PlanDatesDto(
    @Json(name = "state") val state: String = "picking",
    @Json(name = "answered") val answered: Int = 0,
    @Json(name = "invited") val invited: Int = 0,
    @Json(name = "answered_text") val answeredText: String? = null,
    @Json(name = "options") val options: List<PlanDateOptionDto> = emptyList(),
    /** An invited person's own answer; absent for the host. */
    @Json(name = "mine") val mine: PlanDatesMineDto? = null,
)

/** One time offered. The host's options also carry [who], [most], [pickText] and [pickNote], favorite first. */
@JsonClass(generateAdapter = true)
data class PlanDateOptionDto(
    @Json(name = "id") val id: String,
    @Json(name = "starts_at") val startsAt: String? = null,
    @Json(name = "ends_at") val endsAt: String? = null,
    @Json(name = "text") val text: String = "",
    @Json(name = "can") val can: Int = 0,
    @Json(name = "can_text") val canText: String? = null,
    @Json(name = "mine") val mine: Boolean = false,
    @Json(name = "who") val who: List<String>? = null,
    @Json(name = "most") val most: Boolean = false,
    @Json(name = "pick_text") val pickText: String? = null,
    @Json(name = "pick_note") val pickNote: String? = null,
)

@JsonClass(generateAdapter = true)
data class PlanDatesMineDto(
    @Json(name = "answered") val answered: Boolean = false,
    @Json(name = "party_size") val partySize: Int? = null,
    @Json(name = "kids_count") val kidsCount: Int? = null,
)

/** `PUT /api/plans/:id/dates/mine`: the times that work (`[]` is "none of these") and the numbers. */
@JsonClass(generateAdapter = true)
data class PlanDatesMineBody(
    @Json(name = "options") val options: List<String>,
    @Json(name = "party_size") val partySize: Int,
    @Json(name = "kids_count") val kidsCount: Int,
)

/**
 * One time the host offers, as creating and changing a plan take them (`date_options`, 2 to 5). On the Change screen a
 * kept time goes back exactly as the server sent it, so it keeps its ticks.
 */
@JsonClass(generateAdapter = true)
data class PlanDateOptionInput(
    @Json(name = "starts_at") val startsAt: String,
    @Json(name = "ends_at") val endsAt: String,
)

/** `POST /api/plans/:id/dates/pick`. */
@JsonClass(generateAdapter = true)
data class PlanDatePickBody(
    @Json(name = "option_id") val optionId: String,
)
