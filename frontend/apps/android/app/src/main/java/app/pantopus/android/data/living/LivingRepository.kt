package app.pantopus.android.data.living

import app.pantopus.android.data.api.net.NetworkError
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

        /** CONTRACT 9b: Ask the map, for the map's box and time. */
        suspend fun askMap(
            q: String,
            box: ReinventedBox,
            time: String,
        ): NetworkResult<LivingAskAnswer> = guarded { api.askMap(LivingAskBody(q, box.south, box.west, box.north, box.east, time)) }

        /** CONTRACT 9b: Atlas search, a page after [cursor]. */
        suspend fun atlasSearch(
            q: String,
            cursor: String?,
        ): NetworkResult<LivingAtlasSearchPage> = guarded { api.atlasSearch(LivingAtlasSearchBody(q, cursor)) }

        /** CONTRACT 9c: the person's followed places. */
        suspend fun places(): NetworkResult<List<LivingFollowedPlaceDto>> = guarded { api.places().places }

        /** CONTRACT 9c: follow a place, by the name and point the place picker answered. */
        suspend fun follow(
            label: String,
            latitude: Double,
            longitude: Double,
        ): NetworkResult<LivingFollowAnswer> = guarded { api.follow(LivingFollowBody(label.take(MAX_LABEL), latitude, longitude)) }

        suspend fun unfollow(id: String): NetworkResult<Unit> = guarded { api.unfollow(id) }

        /** CONTRACT 9c: constellations near the phone's place (in the body, never kept). */
        suspend fun constellations(
            latitude: Double,
            longitude: Double,
        ): NetworkResult<LivingConstellationsDto> = guarded { api.constellations(LivingPointDto(latitude, longitude)) }

        private suspend fun <T> guarded(call: suspend () -> T): NetworkResult<T> {
            val answer = safeApiCall { call() }
            if (answer is NetworkResult.Failure && answer.error.serverCode == StudioRepository.SWITCH_OFF) feature.refusedOff()
            return answer
        }
    }

/** What a refused search says (CONTRACT 9b): too many, or not words it can search. */
internal fun searchRefusal(error: NetworkError): String =
    when {
        error.code == HTTP_TOO_MANY -> "That's a lot of searching. Wait a minute, then try again."
        error.serverCode == "SEARCH_INVALID" || error.code == HTTP_BAD_REQUEST -> "Try a word or two, like \u201Cmushroom\u201D or \u201Csunset\u201D."
        else -> "Search couldn't finish. Try again."
    }

private const val HTTP_BAD_REQUEST = 400
private const val MAX_LABEL = 60
private const val HTTP_TOO_MANY = 429

/** A box's side as the map sends it: five decimals, a dot whatever the phone's language. */
internal fun Double.fixed(): String = String.format(Locale.US, "%.5f", this)
