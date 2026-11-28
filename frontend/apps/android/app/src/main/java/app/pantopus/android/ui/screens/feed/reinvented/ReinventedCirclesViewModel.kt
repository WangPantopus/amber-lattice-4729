package app.pantopus.android.ui.screens.feed.reinvented

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.moments.MomentAuthorDto
import app.pantopus.android.data.api.models.reinvented.ReinventedCircleChangeBody
import app.pantopus.android.data.api.models.reinvented.ReinventedCircleDto
import app.pantopus.android.data.api.models.reinvented.ReinventedMagazineResponse
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.displayMessage
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.RelationshipsApi
import app.pantopus.android.data.pulse.ReinventedRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/*
 * "Pulse, reinvented" phase 3, circles and the weekly magazine (PHASE-3 piece 8; CONTRACT 8d; iPhone's
 * `ReinventedCircles.swift`): circles of 2 to 8 close people, reached from Close circle in the reach dial. Nobody is in
 * a circle without their own yes, and nobody outside it learns it exists. Circles are read when the dial opens (and
 * after each change), never beside what opens the tab.
 */

/** A connection the person may put in a circle. */
data class ReinventedCirclePerson(
    val id: String,
    val name: String,
    val author: MomentAuthorDto,
)

data class ReinventedCirclesUi(
    val circles: List<ReinventedCircleDto> = emptyList(),
    val invites: List<ReinventedCircleDto> = emptyList(),
    val read: Boolean = false,
    val busy: Boolean = false,
    val note: String? = null,
    val connections: List<ReinventedCirclePerson>? = null,
    val magazine: ReinventedMagazineResponse? = null,
    val magazineFailed: Boolean = false,
) {
    /** Invites, and magazines not opened yet: the dial's "N new". */
    val fresh: Int get() = invites.size + circles.count { it.magazineReady }
}

@HiltViewModel
class ReinventedCirclesViewModel
    @Inject
    constructor(
        private val repository: ReinventedRepository,
        private val relationships: RelationshipsApi,
    ) : ViewModel() {
        private val _ui = MutableStateFlow(ReinventedCirclesUi())
        val ui: StateFlow<ReinventedCirclesUi> = _ui.asStateFlow()

        fun read() {
            viewModelScope.launch {
                when (val answer = repository.circles()) {
                    is NetworkResult.Success ->
                        _ui.update { it.copy(circles = answer.data.circles, invites = answer.data.invites, read = true) }
                    is NetworkResult.Failure -> _ui.update { it.copy(read = true) }
                }
            }
        }

        /** The person's accepted connections, for a new circle or "Invite more". */
        fun readConnections() {
            if (_ui.value.connections != null) return
            viewModelScope.launch {
                val answer = safeApiCall { relationships.list(status = "accepted", limit = CONNECTIONS) }
                val people =
                    (answer as? NetworkResult.Success)?.data?.relationships.orEmpty().mapNotNull { row ->
                        val other = row.otherUser ?: return@mapNotNull null
                        val name = other.name ?: other.username ?: return@mapNotNull null
                        ReinventedCirclePerson(
                            id = other.id,
                            name = name,
                            author =
                                MomentAuthorDto(
                                    id = other.id,
                                    name = name,
                                    firstName = other.firstName ?: name.substringBefore(' '),
                                    avatarUrl = other.profilePictureUrl,
                                ),
                        )
                    }
                _ui.update { it.copy(connections = people.sortedBy { p -> p.name.lowercase() }) }
            }
        }

        fun make(
            name: String,
            people: List<String>,
            onDone: (ReinventedCircleDto) -> Unit,
        ) = act({ repository.makeCircle(name.trim(), people) }, "Couldn't make the circle. Try again.") { it?.let(onDone) }

        fun join(
            circle: ReinventedCircleDto,
            keepFaded: Boolean,
        ) = act({ repository.joinCircle(circle.id, keepFaded) }, "Couldn't join. Try again.") {}

        /** Leave a circle, or say no to an invite (nobody is told who said no). */
        fun leave(
            circle: ReinventedCircleDto,
            onDone: () -> Unit = {},
        ) = act({ repository.leaveCircle(circle.id) }, "Couldn't do that. Try again.") { onDone() }

        fun keep(
            circle: ReinventedCircleDto,
            keepFaded: Boolean,
        ) = act({ repository.circleKeep(circle.id, keepFaded) }, "Couldn't change that. Try again.") {}

        fun change(
            circle: ReinventedCircleDto,
            change: ReinventedCircleChangeBody,
        ) = act({ repository.changeCircle(circle.id, change) }, "Couldn't change the circle. Try again.") {}

        fun end(
            circle: ReinventedCircleDto,
            onDone: () -> Unit,
        ) = act({ repository.endCircle(circle.id) }, "Couldn't end the circle. Try again.") { onDone() }

        /** The circle's week: the newest finished one, or the week holding [week]. Opening it marks it read. */
        fun magazine(
            circleId: String,
            week: String? = null,
        ) {
            _ui.update { it.copy(magazine = null, magazineFailed = false) }
            viewModelScope.launch {
                when (val answer = repository.magazine(circleId, week)) {
                    is NetworkResult.Success -> {
                        _ui.update { it.copy(magazine = answer.data) }
                        // The server marks it read on this read: the "new" goes on the next list.
                        read()
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(magazineFailed = true) }
                }
            }
        }

        fun clearNote() = _ui.update { it.copy(note = null) }

        private fun <T> act(
            call: suspend () -> NetworkResult<T>,
            failed: String,
            onDone: (T) -> Unit,
        ) {
            if (_ui.value.busy) return
            _ui.update { it.copy(busy = true, note = null) }
            viewModelScope.launch {
                val answer = call()
                _ui.update { it.copy(busy = false, note = (answer as? NetworkResult.Failure)?.error?.displayMessage(failed)) }
                if (answer is NetworkResult.Success) {
                    onDone(answer.data)
                    read()
                }
            }
        }

        private companion object {
            const val CONNECTIONS = 200
        }
    }
