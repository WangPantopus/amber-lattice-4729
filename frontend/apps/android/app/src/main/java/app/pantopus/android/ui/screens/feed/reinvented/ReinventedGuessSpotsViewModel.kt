package app.pantopus.android.ui.screens.feed.reinvented

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.moments.MomentDailySpotDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.pulse.ReinventedPoint
import app.pantopus.android.data.pulse.StudioRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.abs

/** Today's spot for where the map is, read again once it moved about a kilometre. */
@HiltViewModel
class ReinventedGuessSpotsViewModel
    @Inject
    constructor(
        private val studio: StudioRepository,
    ) : ViewModel() {
        private val _daily = MutableStateFlow<MomentDailySpotDto?>(null)
        val daily: StateFlow<MomentDailySpotDto?> = _daily.asStateFlow()
        private var readAt: ReinventedPoint? = null

        fun readDaily(at: ReinventedPoint) {
            val last = readAt
            if (last != null && abs(last.latitude - at.latitude) < MOVED && abs(last.longitude - at.longitude) < MOVED) return
            readAt = at
            viewModelScope.launch { _daily.value = (studio.dailySpot(at.latitude, at.longitude) as? NetworkResult.Success)?.data }
        }

        private companion object {
            const val MOVED = 0.01
        }
    }
