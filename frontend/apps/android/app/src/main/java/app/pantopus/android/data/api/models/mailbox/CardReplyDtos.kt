package app.pantopus.android.data.api.models.mailbox

import app.pantopus.android.data.api.models.mailbox.v2.MailCard
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * `GET /api/mailbox/cards/:id/exchange` (plan Part 3, the joined card; `:id` is the card or its reply; needs only
 * `mailbox`): the card and its reply as two pages, the writer's own reply while it waits, and whether this reader may
 * write back (`can_reply`, only with the server's `card_replies` on). 404 `CARD_NOT_FOUND` for anyone but the two people.
 */
@JsonClass(generateAdapter = true)
data class CardExchange(
    /** The card; null once this reader shredded it, or its row is gone. */
    val original: CardExchangePage? = null,
    /** The reply: the writer's own always (also while it waits); the card's sender once it has arrived. */
    val reply: CardExchangePage? = null,
    /** The writer's own reply while it waits for the 7 a.m. pickup. */
    @Json(name = "pending_reply") val pendingReply: CardPendingReply? = null,
    /** "Write back to {first name}" shows only when this is true. */
    @Json(name = "can_reply") val canReply: Boolean = false,
    /** Why not, for the card's reader, in the server's words; null for the card's sender or with replies off. */
    @Json(name = "reply_refusal") val replyRefusal: CardReplyRefusal? = null,
)

/** One page of the joined card: who wrote it to whom, the days (by the reader's clock), its face and its note. */
@JsonClass(generateAdapter = true)
data class CardExchangePage(
    val id: String,
    @Json(name = "from_name") val fromName: String? = null,
    @Json(name = "to_name") val toName: String? = null,
    /** "YYYY-MM-DD". */
    @Json(name = "sent_on") val sentOn: String? = null,
    @Json(name = "delivered_on") val deliveredOn: String? = null,
    /** The card's face, as on a piece (with its signature). */
    val card: MailCard? = null,
    /** A reply's face: the card it answers, and the writer's signature. */
    @Json(name = "card_reply") val cardReply: CardReplyFace? = null,
    /** Null only for a sealed card seen by its reader. */
    val note: String? = null,
)

/** A reply on a piece (`card_reply`): the card it answers, so the row and the table can draw it. */
@JsonClass(generateAdapter = true)
data class CardReplyFace(
    @Json(name = "card_id") val cardId: String,
    val design: String,
    val number: Int? = null,
    val caption: String? = null,
    val paper: String? = null,
    val height: Int? = null,
    val slug: String? = null,
    val table: String? = null,
    val year: Int? = null,
    /** The writer's own hand beside FROM (detail reads only). */
    val signature: CardSignature? = null,
    /** In the writer's Sent: whether it can still be taken back, and until when. */
    @Json(name = "can_take_back") val canTakeBack: Boolean = false,
    @Json(name = "take_back_until") val takeBackUntil: String? = null,
)

/** The writer's own reply while it waits: when it arrives ("YYYY-MM-DD") and until when it can be taken back. */
@JsonClass(generateAdapter = true)
data class CardPendingReply(
    val id: String,
    @Json(name = "arrives_on") val arrivesOn: String? = null,
    @Json(name = "take_back_until") val takeBackUntil: String? = null,
    @Json(name = "can_take_back") val canTakeBack: Boolean = false,
)

/** Why this reader can't write back: `CARD_REPLY_EXISTS`, `CARD_REPLY_CLOSED` or `CARD_NOT_FOUND`, with the sentence. */
@JsonClass(generateAdapter = true)
data class CardReplyRefusal(
    val code: String? = null,
    val error: String? = null,
)

/**
 * `POST /api/mailbox/cards/:id/reply`: the note (up to 300 letters), one request ID per draft (the same on every retry),
 * and the saved signature when there is one.
 */
@JsonClass(generateAdapter = true)
data class CardReplyBody(
    val message: String,
    @Json(name = "request_id") val requestId: String,
    val signature: CardSignature? = null,
)

/** 201 (or 200 for the same request again): the reply as sent. */
@JsonClass(generateAdapter = true)
data class CardReplyResponse(
    val reply: CardReplySummary,
)

/** A reply sent: when it arrives with the card sender's 7 a.m. mail, and until when it can be taken back. */
@JsonClass(generateAdapter = true)
data class CardReplySummary(
    val id: String,
    @Json(name = "card_id") val cardId: String? = null,
    @Json(name = "to_name") val toName: String? = null,
    @Json(name = "sent_at") val sentAt: String? = null,
    @Json(name = "arrives_at") val arrivesAt: String? = null,
    @Json(name = "arrives_on") val arrivesOn: String? = null,
    @Json(name = "take_back_until") val takeBackUntil: String? = null,
    @Json(name = "can_take_back") val canTakeBack: Boolean = false,
    /** `waiting` or `delivered`. */
    val status: String? = null,
)

/** `POST /api/mailbox/cards/:id/reply/take-back`: 200 once it's back (409 `CARD_ALREADY_SENT` once picked up). */
@JsonClass(generateAdapter = true)
data class CardReplyTakenBack(
    @Json(name = "taken_back") val takenBack: Boolean = false,
    @Json(name = "card_id") val cardId: String? = null,
)
