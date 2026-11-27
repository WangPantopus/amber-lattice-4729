package app.pantopus.android.data.pulse

import app.pantopus.android.data.api.models.moments.MomentDailySpotDto
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.models.moments.MomentEditBody
import app.pantopus.android.data.api.models.moments.MomentGuessBody
import app.pantopus.android.data.api.models.moments.MomentGuessResponse
import app.pantopus.android.data.api.models.moments.MomentStampsPreviewBody
import app.pantopus.android.data.api.models.moments.MomentStampsPreviewDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.StudioApi
import app.pantopus.android.data.moments.serverCode
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The Studio's own requests ([StudioApi]). A refusal that says the switch is off for this person
 * (`403 PULSE_REINVENTED_OFF`, CONTRACT 1) turns it off at once and reads it again, so the app goes back to today's
 * screens.
 */
@Singleton
class StudioRepository
    @Inject
    constructor(
        private val api: StudioApi,
        private val feature: PulseReinventedFeature,
    ) {
        /** The tray's stamps for a Moment posted at this point now (CONTRACT 2a). */
        suspend fun stampsPreview(
            latitude: Double,
            longitude: Double,
        ): NetworkResult<MomentStampsPreviewDto> =
            when (val answer = safeApiCall { api.stampsPreview(MomentStampsPreviewBody(latitude, longitude)) }) {
                is NetworkResult.Success -> NetworkResult.Success(answer.data.stamps ?: MomentStampsPreviewDto())
                is NetworkResult.Failure -> {
                    if (answer.error.serverCode == SWITCH_OFF) feature.refusedOff()
                    answer
                }
            }

        /** One of the five signals on a Moment, or none (CONTRACT 4); the answer is the signal the server kept. */
        suspend fun signal(
            momentId: String,
            signal: String?,
        ): NetworkResult<String?> {
            val body = JSONObject().put("signal", signal ?: JSONObject.NULL).toString().toRequestBody(JSON)
            return when (val answer = safeApiCall { api.signal(momentId, body) }) {
                is NetworkResult.Success -> NetworkResult.Success(answer.data.mySignal)
                is NetworkResult.Failure -> {
                    if (answer.error.serverCode == SWITCH_OFF) feature.refusedOff()
                    answer
                }
            }
        }

        /** The author's 15-minute edit (CONTRACT 3): the Moment as it is now. */
        suspend fun edit(
            momentId: String,
            body: MomentEditBody,
        ): NetworkResult<MomentDto> =
            when (val answer = safeApiCall { api.edit(momentId, body) }) {
                is NetworkResult.Success -> NetworkResult.Success(answer.data.moment)
                is NetworkResult.Failure -> {
                    if (answer.error.serverCode == SWITCH_OFF) feature.refusedOff()
                    answer
                }
            }

        /** The reader's one guess at a guess-the-spot Moment (CONTRACT 5c): how far off, and the Moment in full. */
        suspend fun guess(
            momentId: String,
            latitude: Double,
            longitude: Double,
        ): NetworkResult<MomentGuessResponse> =
            safeApiCall { api.guess(momentId, MomentGuessBody(latitude, longitude)) }.also { answer ->
                if ((answer as? NetworkResult.Failure)?.error?.serverCode == SWITCH_OFF) feature.refusedOff()
            }

        /** Today's guess-the-spot Moment for the town at this point (CONTRACT 5d), or null. */
        suspend fun dailySpot(
            latitude: Double,
            longitude: Double,
        ): NetworkResult<MomentDailySpotDto?> =
            when (val answer = safeApiCall { api.dailySpot(latitude, longitude) }) {
                is NetworkResult.Success -> NetworkResult.Success(answer.data.dailySpot?.takeIf { it.momentId != null })
                is NetworkResult.Failure -> {
                    if (answer.error.serverCode == SWITCH_OFF) feature.refusedOff()
                    answer
                }
            }

        companion object {
            private val JSON = "application/json; charset=utf-8".toMediaType()

            /** The server's answer to a Studio-only request from a person whose switch is off (CONTRACT 1). */
            const val SWITCH_OFF = "PULSE_REINVENTED_OFF"
        }
    }
