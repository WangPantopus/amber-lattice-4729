package app.pantopus.android.data.api.models.plans

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * Plans for the holidays, the business track, B5 and B6: the bill at the place, tips, and a tip after a paid plan
 * (contract 11, 07-screens C1 to C4, servers #4222 and #4223, switch `plans_pay_here` read for the business). Every
 * amount, line and sentence is the server's: the app shows each `text` as sent and never adds a tip, takes off a
 * discount or works out a total.
 */

/** `pay_here` on a business's plan, for staff and guests who are in: "Pay at Example Taproom" (D2). */
@JsonClass(generateAdapter = true)
data class PlanPayHereDto(
    @Json(name = "tips_on") val tipsOn: Boolean = false,
    @Json(name = "text") val text: String? = null,
)

/** One line of a check: "Food and drinks", the deal ("20% off food", in the ok tone), "Tip, 18%", "You pay". */
@JsonClass(generateAdapter = true)
data class PlanCheckLineDto(
    /** `amount`, `deal`, `tip` or `total`. */
    @Json(name = "key") val key: String? = null,
    @Json(name = "label") val label: String? = null,
    @Json(name = "cents") val cents: Int = 0,
    @Json(name = "text") val text: String? = null,
    /** `ok` for the deal's line. */
    @Json(name = "tone") val tone: String? = null,
)

/** A tip choice: "18%" with its tip and what the guest pays with it. */
@JsonClass(generateAdapter = true)
data class PlanTipChoiceDto(
    @Json(name = "label") val label: String? = null,
    @Json(name = "tip_cents") val tipCents: Int = 0,
    @Json(name = "tip_text") val tipText: String? = null,
    @Json(name = "total_cents") val totalCents: Int = 0,
    @Json(name = "total_text") val totalText: String? = null,
)

/** "No tip": what the guest pays without one. */
@JsonClass(generateAdapter = true)
data class PlanNoTipDto(
    @Json(name = "total_cents") val totalCents: Int = 0,
    @Json(name = "total_text") val totalText: String? = null,
)

/** A guest's check (C1), and once paid its receipt lines (C2). */
@JsonClass(generateAdapter = true)
data class PlanCheckDto(
    @Json(name = "id") val id: String,
    /** `open`, `paid` or `refunded`. */
    @Json(name = "state") val state: String = "open",
    /** `business` or `guest`. */
    @Json(name = "started_by") val startedBy: String? = null,
    /** "Your check, sent by Example Taproom". */
    @Json(name = "heading") val heading: String? = null,
    @Json(name = "amount_cents") val amountCents: Int = 0,
    @Json(name = "amount_text") val amountText: String? = null,
    @Json(name = "no_deal_cents") val noDealCents: Int? = null,
    @Json(name = "lines") val lines: List<PlanCheckLineDto> = emptyList(),
    @Json(name = "total_cents") val totalCents: Int = 0,
    @Json(name = "total_text") val totalText: String? = null,
    @Json(name = "tips_on") val tipsOn: Boolean = false,
    @Json(name = "tip_choices") val tipChoices: List<PlanTipChoiceDto>? = null,
    @Json(name = "no_tip") val noTip: PlanNoTipDto? = null,
    /** "Percent of $48.00, before the deal". */
    @Json(name = "tip_base_text") val tipBaseText: String? = null,
    /** "The deal came off because you're paying here. The tip goes to …; Pantopus takes none of it." */
    @Json(name = "note_text") val noteText: String? = null,
    /** Once paid: "Mon, Nov 16 · 8:52 PM". */
    @Json(name = "paid_text") val paidText: String? = null,
    /** "Dana L.". */
    @Json(name = "payer") val payer: String? = null,
    /** "Card", "Apple Pay", "Google Pay". */
    @Json(name = "method_text") val methodText: String? = null,
    /** "Paid $46.40". */
    @Json(name = "paid_total_text") val paidTotalText: String? = null,
    @Json(name = "refunded_cents") val refundedCents: Int = 0,
    /** "Example Taproom refunded $12.00". */
    @Json(name = "refunded_text") val refundedText: String? = null,
    @Json(name = "receipt") val receipt: PlanReceiptDto? = null,
)

/** `GET /api/plans/:id/checks/mine`: the open check (or the last paid one), and whether the guest may start one. */
@JsonClass(generateAdapter = true)
data class PlanMyCheckResponse(
    @Json(name = "check") val check: PlanCheckDto? = null,
    @Json(name = "can_start") val canStart: Boolean = false,
)

/** A check's answer (send, start, quote, confirm): `{ check }`. */
@JsonClass(generateAdapter = true)
data class PlanCheckResponse(
    @Json(name = "check") val check: PlanCheckDto? = null,
)

/** `POST …/checks/:checkId/pay`: the payment for the shipped sheet, and the check as it will be paid. */
@JsonClass(generateAdapter = true)
data class PlanCheckPayResponse(
    @Json(name = "payment") val payment: PlanPaymentDto? = null,
    @Json(name = "check") val check: PlanCheckDto? = null,
)

/** `{ tip_cents }` for a check's quote and pay. */
@JsonClass(generateAdapter = true)
data class PlanTipBody(
    @Json(name = "tip_cents") val tipCents: Int,
)

/** `{ amount_cents }`: a guest starting a check (no deal on the bill), or staff refunding a part. */
@JsonClass(generateAdapter = true)
data class PlanAmountBody(
    @Json(name = "amount_cents") val amountCents: Int,
)

/** `POST /api/plans/:id/checks` (staff): a check for a guest who is in. */
@JsonClass(generateAdapter = true)
data class PlanSendCheckBody(
    @Json(name = "request_id") val requestId: String,
    @Json(name = "amount_cents") val amountCents: Int,
    /** The part the deal doesn't cover (alcohol); 0 at the start. */
    @Json(name = "no_deal_cents") val noDealCents: Int = 0,
)

/** C3's three totals: "14 guests in", "$126.24 paid so far", "$22.64 tips". */
@JsonClass(generateAdapter = true)
data class PlanChecksTotalsDto(
    @Json(name = "in") val isIn: Int = 0,
    @Json(name = "in_text") val inText: String? = null,
    @Json(name = "paid_cents") val paidCents: Int = 0,
    @Json(name = "paid_text") val paidText: String? = null,
    @Json(name = "tips_cents") val tipsCents: Int = 0,
    @Json(name = "tips_text") val tipsText: String? = null,
)

/** A guest's last check on C3: "Check sent · $52.00" / "Waiting", or "$38.40 · tip $8.64" / "Paid". */
@JsonClass(generateAdapter = true)
data class PlanStaffCheckDto(
    @Json(name = "id") val id: String,
    @Json(name = "amount_cents") val amountCents: Int = 0,
    @Json(name = "tip_cents") val tipCents: Int = 0,
    @Json(name = "total_cents") val totalCents: Int = 0,
    @Json(name = "text") val text: String? = null,
    @Json(name = "state_text") val stateText: String? = null,
    @Json(name = "refunded_cents") val refundedCents: Int = 0,
)

/** A guest on C3: "Dana L.", who brought them, and where their check stands. */
@JsonClass(generateAdapter = true)
data class PlanChecksRowDto(
    @Json(name = "request_id") val requestId: String,
    @Json(name = "name") val name: String? = null,
    @Json(name = "brought_by") val broughtBy: String? = null,
    /** "Pantopus" or "Yours". */
    @Json(name = "brought_by_text") val broughtByText: String? = null,
    /** `none`, `sent`, `paid` or `refunded`. */
    @Json(name = "state") val state: String = "none",
    @Json(name = "check") val check: PlanStaffCheckDto? = null,
)

/** `GET /api/plans/:id/checks` (staff, C3); `POST …/refund` answers the same. */
@JsonClass(generateAdapter = true)
data class PlanChecksDto(
    @Json(name = "totals") val totals: PlanChecksTotalsDto = PlanChecksTotalsDto(),
    @Json(name = "rows") val rows: List<PlanChecksRowDto> = emptyList(),
    @Json(name = "note_text") val noteText: String? = null,
    @Json(name = "refund_until") val refundUntil: String? = null,
    /** A deal comes off the bill: the "Send a check" sheet asks for the part it doesn't cover. */
    @Json(name = "deal_on_bill") val dealOnBill: Boolean = false,
)

/** `tip_later` (B6, C4): for a guest who paid for a spot, on a plan with tips on, from its end for 7 days, once. */
@JsonClass(generateAdapter = true)
data class PlanTipLaterDto(
    @Json(name = "until") val until: String? = null,
    @Json(name = "choices") val choices: List<PlanTipLaterChoiceDto> = emptyList(),
)

/** A later tip's choice: "18%" with its amount. */
@JsonClass(generateAdapter = true)
data class PlanTipLaterChoiceDto(
    @Json(name = "label") val label: String? = null,
    @Json(name = "tip_cents") val tipCents: Int = 0,
    @Json(name = "tip_text") val tipText: String? = null,
)

/** `POST /api/plans/:id/tip/confirm` (B6): "You tipped $5.00". */
@JsonClass(generateAdapter = true)
data class PlanTipConfirmDto(
    @Json(name = "state") val state: String? = null,
    @Json(name = "text") val text: String? = null,
)
