package app.pantopus.android.data.plans

import app.pantopus.android.data.api.models.plans.PlanAmountBody
import app.pantopus.android.data.api.models.plans.PlanCheckPayResponse
import app.pantopus.android.data.api.models.plans.PlanCheckResponse
import app.pantopus.android.data.api.models.plans.PlanChecksDto
import app.pantopus.android.data.api.models.plans.PlanMyCheckResponse
import app.pantopus.android.data.api.models.plans.PlanSendCheckBody
import app.pantopus.android.data.api.models.plans.PlanTipBody
import app.pantopus.android.data.api.models.plans.PlanTipConfirmDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.PlansApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Plans for the holidays, the business track, B5 and B6: the bill at the place and tips, on a business's plan (contract
 * 11, routes under `/api/plans/:id/checks` and `/tip`, `biz=1` added by PlansBizInterceptor). Every amount is the
 * server's; nothing here adds a tip or takes off a discount. Kept apart from [PlansRepository], which holds the plans
 * themselves; the plan page reads the plan again when it comes back on screen after a payment.
 */
@Singleton
class PlanChecksRepository
    @Inject
    constructor(
        private val api: PlansApi,
    ) {
        /** The guest's open check, or the last paid one, and whether they may start one. */
        suspend fun myCheck(id: String): NetworkResult<PlanMyCheckResponse> = safeApiCall { api.myCheck(id) }

        /** "What's your total?" (no deal on the bill). */
        suspend fun startCheck(
            id: String,
            amountCents: Int,
        ): NetworkResult<PlanCheckResponse> = safeApiCall { api.startCheck(id, PlanAmountBody(amountCents)) }

        /** The check's lines with a tip; no side effect. */
        suspend fun quoteCheck(
            id: String,
            checkId: String,
            tipCents: Int,
        ): NetworkResult<PlanCheckResponse> = safeApiCall { api.quoteCheck(id, checkId, PlanTipBody(tipCents)) }

        /** The payment for the shipped sheet, and the check as it will be paid. */
        suspend fun payCheck(
            id: String,
            checkId: String,
            tipCents: Int,
        ): NetworkResult<PlanCheckPayResponse> = safeApiCall { api.payCheck(id, checkId, PlanTipBody(tipCents)) }

        /** The sheet closed: the check once paid. */
        suspend fun confirmCheck(
            id: String,
            checkId: String,
        ): NetworkResult<PlanCheckResponse> = safeApiCall { api.confirmCheck(id, checkId) }

        /** Staff: the guest list with money (C3). */
        suspend fun checks(id: String): NetworkResult<PlanChecksDto> = safeApiCall { api.checks(id) }

        /** Staff: send a guest a check. */
        suspend fun sendCheck(
            id: String,
            body: PlanSendCheckBody,
        ): NetworkResult<PlanCheckResponse> = safeApiCall { api.sendCheck(id, body) }

        /** Staff: refund a paid check, all of it ([amountCents] null, `{}`) or a part; answers the list. */
        suspend fun refundCheck(
            id: String,
            checkId: String,
            amountCents: Int?,
        ): NetworkResult<PlanChecksDto> {
            val body = JSONObject().apply { amountCents?.let { put(AMOUNT_FIELD, it) } }.toString()
            return safeApiCall { api.refundCheck(id, checkId, body.toRequestBody(JSON_MEDIA_TYPE.toMediaType())) }
        }

        /** B6: a tip after a paid plan; answers the payment for the shipped sheet. */
        suspend fun tipLater(
            id: String,
            amountCents: Int,
        ): NetworkResult<PlanCheckPayResponse> = safeApiCall { api.tipLater(id, PlanAmountBody(amountCents)) }

        /** B6: "You tipped $5.00" once it went through. */
        suspend fun confirmTip(id: String): NetworkResult<PlanTipConfirmDto> = safeApiCall { api.confirmTip(id) }

        private companion object {
            const val AMOUNT_FIELD = "amount_cents"
            const val JSON_MEDIA_TYPE = "application/json; charset=utf-8"
        }
    }
