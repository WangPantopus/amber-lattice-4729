package app.pantopus.android.data.api.models.plans

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * Plans for the holidays, the business track, B1: deals without money on a business's plan (contract 9, 07-screens D1
 * to D4, server #4214, switch `plans_deals` read for the business). Every word and every amount comes from the server:
 * the app shows `text`, `tag`, `short`, `condition_text`, `left_text`, `if_short_text`, `state_text`, `join_text` and
 * `mine.*` as sent and never composes "20% off" or a time left itself.
 */

/** `deal` on a business's plan card (07-screens D1, D2). */
@JsonClass(generateAdapter = true)
data class PlanDealDto(
    /** `everyone` or `group`. */
    @Json(name = "scope") val scope: String = "everyone",
    /** `free_item`; with B4 also `percent` and `amount`. */
    @Json(name = "kind") val kind: String = "free_item",
    /** The sentence in large type (D1): "A free appetizer for the table". */
    @Json(name = "text") val text: String = "",
    /** The one tag a list row shows in place of its count: "Deal", "20% off". */
    @Json(name = "tag") val tag: String? = null,
    /** The deal in a few words ("Your deal"). */
    @Json(name = "short") val short: String? = null,
    /** `on` (everyone), `open`, `unlocked` or `short`. */
    @Json(name = "state") val state: String = "on",
    /** A group deal's condition: "if 12 people are in by Friday at 5:00 PM"; null for everyone. */
    @Json(name = "condition_text") val conditionText: String? = null,
    /** A group deal's progress; null for everyone. */
    @Json(name = "group") val group: PlanDealGroupDto? = null,
    /** While open: "If it doesn't get to 12, the night still happens, without the deal." */
    @Json(name = "if_short_text") val ifShortText: String? = null,
    /** Once settled: "Unlocked: 14 are in" or "It didn't get to 12. The night still happens." */
    @Json(name = "state_text") val stateText: String? = null,
    /** Under "Join": "Free to join. Show your deal there." */
    @Json(name = "join_text") val joinText: String? = null,
    /** Only for a guest who is in ("Your deal", D2). */
    @Json(name = "mine") val mine: PlanDealMineDto? = null,
    /** Only for staff: the deal as the form edits it (D3). */
    @Json(name = "form") val form: PlanDealFormDto? = null,
    /** Staff: the deal can still change (nobody is in yet). */
    @Json(name = "can_change") val canChange: Boolean = false,
    /** B4: what one spot costs with the deal (the group price), or null once it fell short with nothing smaller. */
    @Json(name = "price_cents") val priceCents: Int? = null,
)

/** A group deal's progress: how many are in of how many, by when, and the server's words for the time left. */
@JsonClass(generateAdapter = true)
data class PlanDealGroupDto(
    @Json(name = "size") val size: Int = 0,
    @Json(name = "in") val isIn: Int = 0,
    @Json(name = "left") val left: Int = 0,
    @Json(name = "by") val by: String? = null,
    /** "2 days left", "Closes at 5:00 PM", "3 hours left"; null once settled. */
    @Json(name = "left_text") val leftText: String? = null,
)

/** The deal for a guest who is in ("Your deal", D2). */
@JsonClass(generateAdapter = true)
data class PlanDealMineDto(
    /** `waiting` (a group deal not settled), `ready`, `used` (staff marked it), `none` (fell short, nothing smaller). */
    @Json(name = "state") val state: String = "ready",
    /** What they get now (the smaller deal after a short). */
    @Json(name = "short") val short: String? = null,
    /** For something free: "Show this to your server." */
    @Json(name = "text") val text: String? = null,
    /** For something free: the guest's first name (no code, K8). */
    @Json(name = "name") val name: String? = null,
    @Json(name = "used_at") val usedAt: String? = null,
    /** B4: what comes back to the guest's card when a group price unlocks, and when it went back. */
    @Json(name = "back_cents") val backCents: Int? = null,
    @Json(name = "back_at") val backAt: String? = null,
)

/** The deal as staff edit it (D3); the same shape the create and change calls take. */
@JsonClass(generateAdapter = true)
data class PlanDealFormDto(
    @Json(name = "scope") val scope: String? = null,
    @Json(name = "kind") val kind: String? = null,
    @Json(name = "item") val item: String? = null,
    @Json(name = "value") val value: Int? = null,
    @Json(name = "applies_to") val appliesTo: String? = null,
    @Json(name = "group_size") val groupSize: Int? = null,
    @Json(name = "group_by") val groupBy: String? = null,
    /** Always an object or null, never a word. */
    @Json(name = "if_short") val ifShort: PlanDealIfShortDto? = null,
)

/**
 * A smaller deal when a group deal falls short: `{ "kind": "free_item", "item": "cookie" }`, or (B4) money after money
 * `{ "kind": "percent", "value": 10 }`.
 */
@JsonClass(generateAdapter = true)
data class PlanDealIfShortDto(
    @Json(name = "kind") val kind: String = "free_item",
    @Json(name = "item") val item: String? = null,
    @Json(name = "value") val value: Int? = null,
    @Json(name = "applies_to") val appliesTo: String? = null,
)

/**
 * `deal` on `POST /api/plans` (with `host_as`) and `PATCH /api/plans/:id`. `item` is 1 to 40 characters ("A free" is the
 * server's). Taking a deal off is `"deal": null`, which [UpdatePlanBody] can't say (nulls are left out): see
 * `PlansRepository.removeDeal`. Once someone is in, any other change answers `409 deal_locked`.
 */
@JsonClass(generateAdapter = true)
data class PlanDealInput(
    @Json(name = "scope") val scope: String,
    @Json(name = "kind") val kind: String = "free_item",
    @Json(name = "item") val item: String? = null,
    /** B4: percent (5 to 50) or cents off. */
    @Json(name = "value") val value: Int? = null,
    /** B4: `spot` (money off the spot). */
    @Json(name = "applies_to") val appliesTo: String? = null,
    @Json(name = "group_size") val groupSize: Int? = null,
    @Json(name = "group_by") val groupBy: String? = null,
    @Json(name = "if_short") val ifShort: PlanDealIfShortDto? = null,
)

/** `POST /api/plans/deal-preview` (staff with plans.manage): nothing is saved. */
@JsonClass(generateAdapter = true)
data class PlanDealPreviewBody(
    @Json(name = "business_user_id") val businessUserId: String,
    @Json(name = "deal") val deal: PlanDealInput,
    @Json(name = "spots") val spots: Int,
    @Json(name = "starts_at") val startsAt: String,
    /** From B4, for money off the spot. */
    @Json(name = "price_cents") val priceCents: Int? = null,
)

/** The server's words for the deal the form describes, or the field errors (`errors` keyed by field). */
@JsonClass(generateAdapter = true)
data class PlanDealPreviewResponse(
    @Json(name = "ok") val ok: Boolean = false,
    @Json(name = "text") val text: String? = null,
    @Json(name = "tag") val tag: String? = null,
    @Json(name = "condition_text") val conditionText: String? = null,
    @Json(name = "if_short_text") val ifShortText: String? = null,
    /** "Your staff mark it used on the guest list. Once a guest." */
    @Json(name = "claim_text") val claimText: String? = null,
    @Json(name = "errors") val errors: Map<String, String> = emptyMap(),
    /** B4: one spot with the deal. */
    @Json(name = "price_cents") val priceCents: Int? = null,
)

/** A guest's deal on the host page's Going list (`people` for staff): `ready` or `used`. */
@JsonClass(generateAdapter = true)
data class PlanPersonDealDto(
    @Json(name = "state") val state: String = "ready",
    @Json(name = "used_at") val usedAt: String? = null,
)

/** `POST /api/plans/:id/requests/:requestId/deal-used` ("Mark used"; no undo; again on a used one, the same). */
@JsonClass(generateAdapter = true)
data class PlanDealUsedResponse(
    @Json(name = "request_id") val requestId: String? = null,
    @Json(name = "deal") val deal: PlanPersonDealDto? = null,
)

/** Host-as, per business, while a business-track switch is on for it: which rows the form draws. */
@JsonClass(generateAdapter = true)
data class HostAsCanDto(
    @Json(name = "deals") val deals: Boolean = false,
    @Json(name = "price") val price: Boolean = false,
    @Json(name = "pay_here") val payHere: Boolean = false,
)
