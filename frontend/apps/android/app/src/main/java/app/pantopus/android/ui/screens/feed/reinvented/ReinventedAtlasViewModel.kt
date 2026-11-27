package app.pantopus.android.ui.screens.feed.reinvented

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.displayMessage
import app.pantopus.android.data.pulse.ReinventedBox
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

/** What My Atlas shows. */
data class ReinventedAtlasState(
    /** Null until the first page has come. */
    val moments: List<MomentDto>? = null,
    val cursor: String? = null,
    val loadingMore: Boolean = false,
    val failed: Boolean = false,
    /** The person's kept Moments in the map's view, for the pins. */
    val onMap: List<MomentDto> = emptyList(),
    /** The one opened, with Delete for good. */
    val opened: MomentDto? = null,
    /** "Delete this Moment for good?" is asked. */
    val confirming: Boolean = false,
    val deleting: Boolean = false,
    /** What the server said when a delete couldn't happen ("This Moment is being reviewed…"). */
    val note: String? = null,
)

/**
 * "Pulse, reinvented" phase 1, My Atlas (PHASE-1 §2 piece 13; board B7, the "My Atlas" side; CONTRACT 6e): private to
 * its author, every Moment they took from the day the switch came on for them, by date (`GET /api/reinvented/atlas`,
 * 30 a page) and on the map (the same route for the box in view), each with "Delete for good"
 * (`DELETE /api/reinvented/atlas/:id`). Read only when the person opens Atlas.
 */
@HiltViewModel
class ReinventedAtlasViewModel
    @Inject
    constructor(
        private val repository: ReinventedRepository,
    ) : ViewModel() {
        private val _state = MutableStateFlow(ReinventedAtlasState())
        val state: StateFlow<ReinventedAtlasState> = _state.asStateFlow()

        private var reading: Job? = null
        private var mapReading: Job? = null
        private var box: ReinventedBox? = null

        /** Atlas opened: its first page, unless it is already there. */
        fun open() {
            if (_state.value.moments == null && reading?.isActive != true) read(cursor = null)
        }

        fun retry() {
            _state.update { it.copy(failed = false) }
            read(cursor = null)
        }

        fun loadMore() {
            val now = _state.value
            val cursor = now.cursor ?: return
            if (now.loadingMore || reading?.isActive == true) return
            _state.update { it.copy(loadingMore = true) }
            read(cursor)
        }

        /** The map, at the Atlas, settled on a box: the kept Moments in it are its pins. */
        fun moved(next: ReinventedBox) {
            if (next == box) return
            box = next
            mapReading?.cancel()
            mapReading =
                viewModelScope.launch {
                    delay(SETTLE_MS)
                    val answer = repository.atlasInBox(next) as? NetworkResult.Success ?: return@launch
                    _state.update { it.copy(onMap = answer.data.moments.filterNot { m -> m.noLocation }) }
                }
        }

        fun openMoment(moment: MomentDto) = _state.update { it.copy(opened = moment, confirming = false, note = null) }

        fun close() = _state.update { it.copy(opened = null, confirming = false, note = null) }

        fun askDelete() = _state.update { it.copy(confirming = true, note = null) }

        fun keep() = _state.update { it.copy(confirming = false) }

        /** Delete for good: its files and picture keys go at once, and it leaves the Atlas. */
        fun deleteForGood() {
            val moment = _state.value.opened ?: return
            if (_state.value.deleting) return
            _state.update { it.copy(deleting = true, confirming = false) }
            viewModelScope.launch {
                when (val answer = repository.deleteForGood(moment.id)) {
                    is NetworkResult.Success ->
                        _state.update { now ->
                            now.copy(
                                moments = now.moments?.filterNot { it.id == moment.id },
                                onMap = now.onMap.filterNot { it.id == moment.id },
                                opened = null,
                                deleting = false,
                            )
                        }
                    is NetworkResult.Failure ->
                        _state.update {
                            it.copy(deleting = false, note = deleteNote(answer.error))
                        }
                }
            }
        }

        private fun deleteNote(error: NetworkError): String =
            if (error == NetworkError.NotFound) GONE else error.displayMessage("Couldn't delete it. Try again.")

        private fun read(cursor: String?) {
            reading =
                viewModelScope.launch {
                    when (val answer = repository.atlas(cursor)) {
                        is NetworkResult.Success ->
                            _state.update { now ->
                                val fresh = answer.data.moments
                                now.copy(
                                    moments = if (cursor == null) fresh else (now.moments.orEmpty() + fresh).distinctBy { it.id },
                                    cursor = answer.data.nextCursor,
                                    loadingMore = false,
                                    failed = false,
                                )
                            }
                        is NetworkResult.Failure -> _state.update { it.copy(loadingMore = false, failed = it.moments == null) }
                    }
                }
        }

        private companion object {
            const val SETTLE_MS = 350L
            const val GONE = "This Moment is already gone."
        }
    }
