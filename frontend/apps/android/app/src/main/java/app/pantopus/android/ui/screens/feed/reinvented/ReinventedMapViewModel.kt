package app.pantopus.android.ui.screens.feed.reinvented

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.moments.MomentRingDto
import app.pantopus.android.data.api.models.plans.PlanPinDto
import app.pantopus.android.data.api.models.reinvented.ReinventedKeptDto
import app.pantopus.android.data.api.models.reinvented.ReinventedMarkDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.location.LocationProvider
import app.pantopus.android.data.plans.PlanLocationResolver
import app.pantopus.android.data.pulse.ReinventedBox
import app.pantopus.android.data.pulse.ReinventedPoint
import app.pantopus.android.data.pulse.ReinventedRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One thing on the one map: a ring is a Moment, a mark a post that stays (a kept Moment too), a ticket a plan. */
sealed interface ReinventedMapItem {
    val id: String
    val latitude: Double
    val longitude: Double

    data class Ring(
        val ring: MomentRingDto,
    ) : ReinventedMapItem {
        override val id: String get() = "ring-${ring.id}"
        override val latitude: Double get() = ring.latitude
        override val longitude: Double get() = ring.longitude
    }

    data class Mark(
        val mark: ReinventedMarkDto,
    ) : ReinventedMapItem {
        override val id: String get() = "mark-${mark.id}"
        override val latitude: Double get() = mark.latitude
        override val longitude: Double get() = mark.longitude
    }

    data class Kept(
        val kept: ReinventedKeptDto,
    ) : ReinventedMapItem {
        override val id: String get() = "kept-${kept.id}"
        override val latitude: Double get() = kept.latitude
        override val longitude: Double get() = kept.longitude
    }

    data class Ticket(
        val ticket: PlanPinDto,
        override val latitude: Double,
        override val longitude: Double,
    ) : ReinventedMapItem {
        override val id: String get() = "ticket-${ticket.id}"
    }

    /** A Heads-up: red, pulsing and always on top. */
    val headsUp: Boolean get() = this is Mark && mark.headsUp
}

/** What the one map shows. */
data class ReinventedMapState(
    /** Where the map opens: the phone's place, else the person's home; null until known. */
    val center: ReinventedPoint? = null,
    val time: String = LIVE,
    val items: List<ReinventedMapItem> = emptyList(),
) {
    /** Heads-ups last, so they draw over everything else. */
    val drawOrder: List<ReinventedMapItem> get() = items.filterNot { it.headsUp } + items.filter { it.headsUp }

    companion object {
        const val LIVE = "live"
    }
}

/**
 * "Pulse, reinvented" phase 1, the one map (PHASE-1 §2 piece 7, board B4 flat; CONTRACT 6b), behind the list and full
 * screen at the Map height: `GET /api/reinvented/map` for the box in view and a time. Nothing is read before the list's
 * first page has arrived ([allow]), so the map never competes with what opens the tab; then each box is read once the
 * map has been still a moment.
 */
@HiltViewModel
class ReinventedMapViewModel
    @Inject
    constructor(
        private val repository: ReinventedRepository,
        private val location: LocationProvider,
        private val places: PlanLocationResolver,
    ) : ViewModel() {
        private val _state = MutableStateFlow(ReinventedMapState())
        val state: StateFlow<ReinventedMapState> = _state.asStateFlow()

        private var allowed = false
        private var box: ReinventedBox? = null
        private var reading: Job? = null

        init {
            // The phone's place, when it already has one, without waiting: the map opens there.
            location.cachedCoordinate()?.let { fix -> _state.update { it.copy(center = ReinventedPoint(fix.latitude, fix.longitude)) } }
        }

        /** The list's first page arrived: the map may read now, and finds the home to open on if it has no place yet. */
        fun allow() {
            if (allowed) return
            allowed = true
            if (_state.value.center == null) {
                viewModelScope.launch {
                    val home = places.home() ?: return@launch
                    _state.update { it.copy(center = it.center ?: ReinventedPoint(home.latitude, home.longitude)) }
                }
            }
            readSoon(waitMs = 0L)
        }

        /** The map settled on a box. */
        fun moved(next: ReinventedBox) {
            if (next == box) return
            box = next
            readSoon(waitMs = SETTLE_MS)
        }

        /** The time row's choice: back (Live, Today, This week, All time) or forward (Tonight, This weekend). */
        fun pickTime(time: String) {
            if (time == _state.value.time) return
            _state.update { it.copy(time = time) }
            readSoon(waitMs = 0L)
        }

        /** Read again (a pull on the list, coming back to the tab). */
        fun refresh() = readSoon(waitMs = 0L)

        private fun readSoon(waitMs: Long) {
            if (!allowed) return
            val area = box ?: return
            reading?.cancel()
            reading =
                viewModelScope.launch {
                    if (waitMs > 0) delay(waitMs)
                    val time = _state.value.time
                    val answer = repository.map(area, time) as? NetworkResult.Success ?: return@launch
                    val map = answer.data
                    val items =
                        map.rings.filterNot { it.noLocation }.map(ReinventedMapItem::Ring) +
                            map.marks.map(ReinventedMapItem::Mark) +
                            map.kept.map(ReinventedMapItem::Kept) +
                            map.tickets.mapNotNull { ticket ->
                                val lat = ticket.latitude ?: return@mapNotNull null
                                val lng = ticket.longitude ?: return@mapNotNull null
                                ReinventedMapItem.Ticket(ticket, lat, lng)
                            }
                    _state.update { if (it.time == time) it.copy(items = items) else it }
                }
        }

        private companion object {
            const val SETTLE_MS = 350L
        }
    }
