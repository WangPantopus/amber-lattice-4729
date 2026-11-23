package app.pantopus.android.data.mailbox

import app.pantopus.android.data.api.models.mailbox.CardExchange
import app.pantopus.android.data.api.models.mailbox.CardReplyBody
import app.pantopus.android.data.api.models.mailbox.CardReplySummary
import app.pantopus.android.data.api.models.mailbox.CardReplyTakenBack
import app.pantopus.android.data.api.models.mailbox.CardSignature
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.HolidayCardsApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Writing back to a Christmas card (plan Part 3; the November 2 memories plan, steps 5 and 6): the joined card, the
 * reply, and taking it back before the pickup. The reply routes answer 404 while the server's `card_replies` is off;
 * the joined card needs only `mailbox`.
 */
@Singleton
class CardRepliesRepository
    @Inject
    constructor(
        private val api: HolidayCardsApi,
    ) {
        /** The card and its reply, from either one's id. */
        suspend fun exchange(id: String): NetworkResult<CardExchange> = safeApiCall { api.exchange(id) }

        /** The reply to card [cardId]; the same [requestId] on every retry of this draft. */
        suspend fun reply(
            cardId: String,
            message: String,
            requestId: String,
            signature: CardSignature?,
        ): NetworkResult<CardReplySummary> =
            when (val result = safeApiCall { api.reply(cardId, CardReplyBody(message, requestId, signature)) }) {
                is NetworkResult.Success -> NetworkResult.Success(result.data.reply)
                is NetworkResult.Failure -> result
            }

        /** The writer's waiting reply to card [cardId], before the 7 a.m. pickup. */
        suspend fun takeBack(cardId: String): NetworkResult<CardReplyTakenBack> = safeApiCall { api.takeBackReply(cardId) }
    }
