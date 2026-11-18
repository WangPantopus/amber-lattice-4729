package app.pantopus.android.data.api.models.plans

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/*
 * Plans for the holidays, the business track, B2 and B4: paying to join a business's plan, and the group price (contract
 * 10.2 and 10.4, 07-screens P1, servers #4215 and #4221, switch `plans_paid` read for the business). Every amount and
 * every sentence comes from the server: the app shows `text`, `line`, `join_text`, `refund_text`, the quote's texts and
 * `leave_text` as sent, and never multiplies, adds or subtracts money.
 */

/** `paid` on a business's plan, for a guest who is in and paid (D2 after P1). */
@JsonClass(generateAdapter = true)
data class PlanPaidDto(
    @Json(name = "cents") val cents: Int = 0,
    /** "Paid $18.00". */
    @Json(name = "text") val text: String? = null,
    @Json(name = "refunded_cents") val refundedCents: Int = 0,
    @Json(name = "refund_until") val refundUntil: String? = null,
    /** What leaving now gives back. */
    @Json(name = "leave_back_cents") val leaveBackCents: Int = 0,
    /** "You'll get $18.00 back." or "There is no refund now." ("Can't make it"). */
    @Json(name = "leave_text") val leaveText: String? = null,
    /** The receipt filed in the guest's Mail, under Receipts; null while the Mailbox is off. */
    @Json(name = "receipt") val receipt: PlanReceiptDto? = null,
)

/** A receipt in Mail: `/app/mailbox/<mail id>`. */
@JsonClass(generateAdapter = true)
data class PlanReceiptDto(
    @Json(name = "link") val link: String? = null,
)

/** `paid` on a staff person row: who paid, and who brought them ("Pantopus" / "Yours"). */
@JsonClass(generateAdapter = true)
data class PlanPersonPaidDto(
    @Json(name = "cents") val cents: Int = 0,
    /** "$18.00". */
    @Json(name = "text") val text: String? = null,
    @Json(name = "refunded_cents") val refundedCents: Int = 0,
    /** `pantopus` or `own`. */
    @Json(name = "brought_by") val broughtBy: String? = null,
)

/** `POST /api/plans/:id/requests/quote` body: the party being asked about (no side effect). */
@JsonClass(generateAdapter = true)
data class PlanQuoteBody(
    @Json(name = "party_size") val partySize: Int,
    @Json(name = "kids_count") val kidsCount: Int? = null,
    /** The holidays' one person pays for the group: `link` with [spots] (2 up to the room) quotes spots to share. */
    @Json(name = "for") val forWhom: String? = null,
    @Json(name = "spots") val spots: Int? = null,
)

/** P1's amounts for a party, worked out by the server: "2 spots", "$18 each", "$36.00", the group price, the refund line. */
@JsonClass(generateAdapter = true)
data class PlanQuoteDto(
    @Json(name = "spots") val spots: Int = 1,
    @Json(name = "spots_text") val spotsText: String? = null,
    @Json(name = "each_cents") val eachCents: Int = 0,
    @Json(name = "each_text") val eachText: String? = null,
    @Json(name = "total_cents") val totalCents: Int = 0,
    @Json(name = "total_text") val totalText: String? = null,
    /** B4: a group price's card; null without one, or once it fell short. */
    @Json(name = "group") val group: PlanQuoteGroupDto? = null,
    @Json(name = "refund_text") val refundText: String? = null,
    /** The holidays' one person pays for the group, while it is on: "Who are they for?" and the room left. */
    @Json(name = "group_pay") val groupPay: PlanGroupPayChoiceDto? = null,
    /** A link's quote: how many the link holds and the server's note ("After you pay you get one link. …"). */
    @Json(name = "link_spots") val linkSpots: Int? = null,
    @Json(name = "note") val note: String? = null,
)

/** P1's group price card: open ("If 10 are in by …, everyone pays $14 and $4.00 comes back to your card.") or unlocked. */
@JsonClass(generateAdapter = true)
data class PlanQuoteGroupDto(
    /** `open` or `unlocked`. */
    @Json(name = "state") val state: String? = null,
    @Json(name = "in") val isIn: Int = 0,
    @Json(name = "size") val size: Int = 0,
    @Json(name = "price_cents") val priceCents: Int? = null,
    @Json(name = "text") val text: String? = null,
)

/** `payment` on joining a priced plan: what the shipped payment sheet needs. */
@JsonClass(generateAdapter = true)
data class PlanPaymentDto(
    @Json(name = "payment_id") val paymentId: String? = null,
    @Json(name = "amount_cents") val amountCents: Int = 0,
    @Json(name = "amount_text") val amountText: String? = null,
    @Json(name = "client_secret") val clientSecret: String? = null,
    @Json(name = "customer_id") val customerId: String? = null,
    @Json(name = "ephemeral_key") val ephemeralKey: String? = null,
    @Json(name = "publishable_key") val publishableKey: String? = null,
)
