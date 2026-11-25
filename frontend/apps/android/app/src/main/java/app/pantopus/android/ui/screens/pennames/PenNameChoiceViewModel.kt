package app.pantopus.android.ui.screens.pennames

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.pennames.PenNameCheckResponse
import app.pantopus.android.data.api.models.pennames.PenNameDto
import app.pantopus.android.data.api.models.pennames.PenNameMeResponse
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.auth.AuthRepository
import app.pantopus.android.data.pennames.PenNamesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Which name a post or a reply goes out under. Every new post starts on [Own]. */
enum class PenNameVoice { Own, MadeUp }

/**
 * The "Post as" row's state (contract "What each app builds", 1 and 7): the person's own name, their made-up name (or
 * none yet), whether they may use one ([refusal] says why not), and whether the choice is fixed ([fixedBy]: the reply
 * box once the person is in the conversation).
 */
data class PenNamePostAsUi(
    val ownName: String?,
    val penName: PenNameDto?,
    val voice: PenNameVoice,
    /** Why the made-up choice can't be picked here (the account, the place or the kind of post); null when it can. */
    val refusal: String? = null,
    /** The reply box: the person is already in this conversation under this voice, so the row can't change. */
    val fixedBy: PenNameVoice? = null,
    /** `/check`'s "few verified homes" sentence, shown above the button while the made-up name is chosen. */
    val warning: String? = null,
) {
    val isMadeUp: Boolean get() = voice == PenNameVoice.MadeUp && penName != null

    /** The name the button names: the one the post will carry. */
    val carriedName: String? get() = if (isMadeUp) penName?.name else ownName
}

/**
 * Backs the "Post as" row in the Pulse composer and the reply box, and opens the first-time name screen. It reads
 * `GET /api/pen-names/me` fresh each time a composer opens; an older server without the route leaves the row out.
 */
@HiltViewModel
class PenNameChoiceViewModel
    @Inject
    constructor(
        private val repo: PenNamesRepository,
        private val authRepo: AuthRepository,
    ) : ViewModel() {
        private val meRead = MutableStateFlow<PenNameMeResponse?>(null)
        private val voiceChosen = MutableStateFlow(PenNameVoice.Own)
        private val placeCheck = MutableStateFlow<PenNameCheckResponse?>(null)
        private val fixedVoice = MutableStateFlow<PenNameVoice?>(null)
        private val draftPostType = MutableStateFlow<String?>(null)
        private val _setupOpen = MutableStateFlow(false)
        private val _postAs = MutableStateFlow<PenNamePostAsUi?>(null)

        /** The row; null hides it (not read yet, or the server has no made-up names). */
        val postAs: StateFlow<PenNamePostAsUi?> = _postAs.asStateFlow()

        /** The first-time name screen is open. */
        val setupOpen: StateFlow<Boolean> = _setupOpen.asStateFlow()

        private var loaded = false
        private var checkJob: Job? = null
        private var checkedAt: Pair<Double, Double>? = null

        private val viewerId: String?
            get() = (authRepo.state.value as? AuthRepository.State.SignedIn)?.user?.id

        /**
         * Reads the person's made-up name once per composer. What this run already read shows at once, so the composer
         * doesn't change shape while the person looks at it; until `/me` has answered (or when it can't be read) there
         * is no row, and the post goes out under the person's own name as before.
         */
        fun load() {
            if (loaded) return
            loaded = true
            repo.peekMe(viewerId)?.let {
                meRead.value = it
                rebuild()
            }
            viewModelScope.launch {
                (repo.loadMe(viewerId) as? NetworkResult.Success)?.data?.let {
                    meRead.value = it
                    rebuild()
                }
            }
        }

        /** Reads `/me` ahead of the first composer (Pulse appearing), so it opens already in its final shape. */
        fun prefetch() {
            if (repo.peekMe(viewerId) != null) return
            viewModelScope.launch { repo.loadMe(viewerId) }
        }

        /** Whether a post made at this point may carry a made-up name, and the "few homes" warning. */
        fun checkAt(
            latitude: Double?,
            longitude: Double?,
        ) {
            val point = if (latitude != null && longitude != null) latitude to longitude else null
            if (point == checkedAt) return
            checkedAt = point
            checkJob?.cancel()
            if (point == null) {
                placeCheck.value = null
                rebuild()
                return
            }
            checkJob =
                viewModelScope.launch {
                    placeCheck.value = (repo.check(point.first, point.second) as? NetworkResult.Success)?.data
                    rebuild()
                }
        }

        /** The draft's post type: only the kinds `/me` lists can go out under a made-up name. */
        fun setPostType(postType: String?) {
            if (draftPostType.value == postType) return
            draftPostType.value = postType
            rebuild()
        }

        /** The reply box: the thread fixes the voice ([voice]), or leaves it free (null). */
        fun fixVoice(voice: PenNameVoice?) {
            if (fixedVoice.value == voice) return
            fixedVoice.value = voice
            if (voice != null) voiceChosen.value = voice
            rebuild()
        }

        /** A tap on one of the row's two names. The made-up one opens the name screen the first time. */
        fun choose(voice: PenNameVoice) {
            val row = _postAs.value ?: return
            if (row.fixedBy != null) return
            if (voice == PenNameVoice.MadeUp) {
                if (row.refusal != null) return
                if (row.penName == null) {
                    _setupOpen.value = true
                    return
                }
            }
            voiceChosen.value = voice
            rebuild()
        }

        /** The server answered `PEN_NAME_NEEDED`: open the name screen, then send again. */
        fun needName() {
            _setupOpen.value = true
        }

        /** "Use this name" kept a name: the row now carries it, chosen. */
        fun onTaken(penName: PenNameDto) {
            meRead.value = meRead.value?.copy(penName = penName, suggestions = emptyList())
            _setupOpen.value = false
            if (fixedVoice.value == null || fixedVoice.value == PenNameVoice.MadeUp) voiceChosen.value = PenNameVoice.MadeUp
            rebuild()
        }

        fun dismissSetup() {
            _setupOpen.value = false
        }

        /** After a post went out: the next one starts on the person's own name again. */
        fun reset() {
            if (fixedVoice.value == null) voiceChosen.value = PenNameVoice.Own
            rebuild()
        }

        private fun rebuild() {
            val me = meRead.value ?: return
            val check = placeCheck.value
            val postType = draftPostType.value
            val refusal =
                when {
                    !me.allowed -> me.refusal?.message ?: ""
                    postType != null && me.postTypes.isNotEmpty() && postType !in me.postTypes -> PenNameCopy.NOT_THIS_KIND
                    check != null && !check.allowed -> check.refusal?.message ?: ""
                    else -> null
                }
            val fixed = fixedVoice.value
            // A choice that is no longer allowed goes back to the person's own name; a fixed voice stays.
            if (fixed == null && refusal != null) voiceChosen.value = PenNameVoice.Own
            val user = (authRepo.state.value as? AuthRepository.State.SignedIn)?.user
            _postAs.value =
                PenNamePostAsUi(
                    ownName = user?.displayName?.trim()?.takeIf { it.isNotEmpty() },
                    penName = me.penName,
                    voice = voiceChosen.value,
                    refusal = refusal?.takeIf { fixed == null },
                    fixedBy = fixed,
                    warning = check?.warning?.takeIf { check.allowed },
                )
        }
    }
