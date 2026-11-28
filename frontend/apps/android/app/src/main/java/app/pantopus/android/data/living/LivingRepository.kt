package app.pantopus.android.data.living

import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.moments.serverCode
import app.pantopus.android.data.pulse.PulseReinventedFeature
import app.pantopus.android.data.pulse.ReinventedBox
import app.pantopus.android.data.pulse.StudioRepository
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/** The living world's reads (CONTRACT 9). A 403 `PULSE_REINVENTED_OFF` turns the switch off at once. */
@Singleton
class LivingRepository
    @Inject
    constructor(
        private val api: LivingApi,
        private val feature: PulseReinventedFeature,
    ) {
        /** CONTRACT 9h: the live beams in the map's box. */
        suspend fun beams(box: ReinventedBox): NetworkResult<List<LivingBeamDto>> =
            guarded { api.beams(box.south.fixed(), box.west.fixed(), box.north.fixed(), box.east.fixed()).beams }

        private suspend fun <T> guarded(call: suspend () -> T): NetworkResult<T> {
            val answer = safeApiCall { call() }
            if (answer is NetworkResult.Failure && answer.error.serverCode == StudioRepository.SWITCH_OFF) feature.refusedOff()
            return answer
        }
    }

/** A box's side as the map sends it: five decimals, a dot whatever the phone's language. */
internal fun Double.fixed(): String = String.format(Locale.US, "%.5f", this)
