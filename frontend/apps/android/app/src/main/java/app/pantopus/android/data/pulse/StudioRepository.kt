package app.pantopus.android.data.pulse

import app.pantopus.android.data.api.models.moments.MomentStampsPreviewBody
import app.pantopus.android.data.api.models.moments.MomentStampsPreviewDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.StudioApi
import app.pantopus.android.data.moments.serverCode
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The Studio's own requests ([StudioApi]). A refusal that says the switch is off for this person
 * (`403 PULSE_REINVENTED_OFF`, CONTRACT 1) reads the switch again at once, so the app goes back to today's screens.
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
                    if (answer.error.serverCode == SWITCH_OFF) feature.refresh()
                    answer
                }
            }

        companion object {
            /** The server's answer to a Studio-only request from a person whose switch is off (CONTRACT 1). */
            const val SWITCH_OFF = "PULSE_REINVENTED_OFF"
        }
    }
