package app.pantopus.android.ui.screens.moments.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.moments.MomentDailySpotDto
import app.pantopus.android.data.api.models.moments.MomentGuessSpotDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.moments.MomentsRepository
import app.pantopus.android.data.pulse.PulseReinventedFeature
import app.pantopus.android.data.pulse.StudioRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.abs

/*
 * "Pulse, reinvented" (CONTRACT 5d): the Moments map's guess-the-spot list (`MomentsGuessSpots.kt`), while the switch
 * is on for the person.
 */

/** The map's spots, and today's spot for where the map is. */
@HiltViewModel
class MomentsGuessSpotsViewModel
    @Inject
    constructor(
        moments: MomentsRepository,
        feature: PulseReinventedFeature,
        private val studio: StudioRepository,
    ) : ViewModel() {
        val on: StateFlow<Boolean> = feature.on
        val spots: StateFlow<List<MomentGuessSpotDto>> = moments.guessSpots
        private val _daily = MutableStateFlow<MomentDailySpotDto?>(null)
        val daily: StateFlow<MomentDailySpotDto?> = _daily.asStateFlow()
        private var readAt: Pair<Double, Double>? = null

        /** Reads today's spot for where the map is, again once it moved about a kilometre. A refusal leaves it out. */
        fun readDaily(
            latitude: Double,
            longitude: Double,
        ) {
            val last = readAt
            if (last != null && abs(last.first - latitude) < MOVED_DEGREES && abs(last.second - longitude) < MOVED_DEGREES) return
            readAt = latitude to longitude
            viewModelScope.launch {
                _daily.value = (studio.dailySpot(latitude, longitude) as? NetworkResult.Success)?.data
            }
        }

        private companion object {
            /** About a kilometre. */
            const val MOVED_DEGREES = 0.01
        }
    }
