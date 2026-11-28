package app.pantopus.android.data.pulse

import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.reinvented.MomentRepliesResponse
import app.pantopus.android.data.api.models.reinvented.MomentRepliesShownBody
import app.pantopus.android.data.api.models.reinvented.MomentReplyBody
import app.pantopus.android.data.api.models.reinvented.MomentReplyDto
import app.pantopus.android.data.api.models.reinvented.MomentReplyReportBody
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.TogetherApi
import app.pantopus.android.data.moments.serverCode
import javax.inject.Inject
import javax.inject.Singleton

/** Replies people can see on a Moment (CONTRACT 8a). A 403 `PULSE_REINVENTED_OFF` turns the switch off at once. */
@Singleton
class TogetherRepository
    @Inject
    constructor(
        private val api: TogetherApi,
        private val feature: PulseReinventedFeature,
    ) {
        suspend fun replies(
            momentId: String,
            cursor: String?,
        ): NetworkResult<MomentRepliesResponse> = guarded { api.replies(momentId, cursor) }

        suspend fun reply(
            momentId: String,
            text: String,
        ): NetworkResult<MomentReplyDto> = guarded { api.reply(momentId, MomentReplyBody(text)).reply }

        suspend fun remove(
            momentId: String,
            replyId: String,
        ): NetworkResult<Unit> = guarded { api.remove(momentId, replyId) }

        suspend fun report(
            momentId: String,
            replyId: String,
            reason: String,
        ): NetworkResult<Unit> = guarded { api.report(momentId, replyId, MomentReplyReportBody(reason)) }

        suspend fun setShown(
            momentId: String,
            shown: Boolean,
        ): NetworkResult<MomentDto> = guarded { api.setShown(momentId, MomentRepliesShownBody(shown)).moment }

        private suspend fun <T> guarded(call: suspend () -> T): NetworkResult<T> {
            val answer = safeApiCall { call() }
            if (answer is NetworkResult.Failure && answer.error.serverCode == StudioRepository.SWITCH_OFF) feature.refusedOff()
            return answer
        }
    }
