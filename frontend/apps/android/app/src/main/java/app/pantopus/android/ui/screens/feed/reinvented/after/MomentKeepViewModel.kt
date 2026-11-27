package app.pantopus.android.ui.screens.feed.reinvented.after

import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.moments.MomentDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.displayMessage
import app.pantopus.android.data.moments.serverCode
import app.pantopus.android.data.pulse.ReinventedRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The "Keep this?" answers given in this run of the app, so the question doesn't come back while the viewer still holds
 * the answer it read before (as iPhone's `keepAnswered`). A snapshot state, so the viewer's hold reads it as it changes.
 */
internal object MomentKeepAnswers {
    val answered = mutableStateOf<Set<String>>(emptySet())
}

/**
 * "Keep this?" waits for its author (CONTRACT 6d): the server offers it (`keep_offer`, switch on only) and they haven't
 * answered yet. While it waits, the viewer holds the Moment still, as it does for a spot not yet guessed.
 */
fun MomentDto.keepWaits(mine: Boolean): Boolean = mine && keepOffer && id !in MomentKeepAnswers.answered.value

/**
 * "Pulse, reinvented" phase 1, "Keep this?" (PHASE-1 §2 piece 11; CONTRACT 6d): a Moment that drew replies asks its
 * author once, in its last two hours. Yes makes it a post that stays for the same people until its author removes it
 * (nothing is copied); "Not now" closes the question. Either answer is sent once:
 * `POST /api/reinvented/moments/:id/keep`.
 */
@HiltViewModel
class MomentKeepViewModel
    @Inject
    constructor(
        private val repository: ReinventedRepository,
    ) : ViewModel() {
        private val _note = MutableStateFlow<String?>(null)

        /** What the answer left to say ("Kept. …"), or the server's words when it couldn't. */
        val note: StateFlow<String?> = _note.asStateFlow()

        fun answer(
            momentId: String,
            keep: Boolean,
        ) {
            val answered = MomentKeepAnswers.answered
            if (momentId in answered.value) return
            answered.value = answered.value + momentId
            viewModelScope.launch {
                when (val result = repository.keep(momentId, keep)) {
                    is NetworkResult.Success -> if (keep) _note.value = KEPT
                    is NetworkResult.Failure -> {
                        // Asked again on the next try, unless the server says the question is over (it ended, or it
                        // can't be kept now): then its words, once.
                        if (result.error.serverCode !in OVER) answered.value = answered.value - momentId
                        _note.value = result.error.displayMessage("Couldn't keep it. Try again.")
                    }
                }
            }
        }

        fun noteShown() {
            _note.value = null
        }

        private companion object {
            const val KEPT = "Kept. It stays for the same people until you remove it."
            val OVER = setOf("KEEP_NOT_OFFERED", "MOMENT_ENDED", "MOMENT_NOT_FOUND")
        }
    }
