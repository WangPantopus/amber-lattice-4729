package app.pantopus.android.ui.screens.profile.sources

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.profile.ProfileShareDto
import app.pantopus.android.data.api.models.profile.ProfileShareUpdateBody
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.profile.ProfilePageRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** A part of the main link (board 21): on means anyone with the link; off, people signed in to Pantopus. */
data class SharePart(
    val key: String,
    val setting: String,
    val hasContent: Boolean,
) {
    val on: Boolean get() = setting == ANYONE

    companion object {
        const val ANYONE = "anyone"
        const val MEMBERS = "members"
    }
}

/** The share sheet's state: the link, its parts, and the page a visitor gets. */
data class ProfileShareState(
    val url: String,
    val username: String,
    val usernameIsMadeUp: Boolean,
    val parts: List<SharePart>,
    val searchEngines: Boolean,
    /** anyone | connections | none: how far "Who sees your city" lets the city go. */
    val cityLimit: String,
    val visitor: ProfilePage?,
)

sealed interface ProfileShareUiState {
    data object Loading : ProfileShareUiState

    data class Loaded(
        val share: ProfileShareState,
        /** A part being saved, so its switch waits. */
        val saving: Set<String> = emptySet(),
    ) : ProfileShareUiState

    data class Error(
        val message: String,
    ) : ProfileShareUiState
}

/**
 * The owner's share sheet (board 21, contract §6): reads `GET /api/profile-page/me/share`, saves each switch as it is
 * flipped (`PUT`, only that part), and keeps the page a visitor would see from the answer. A failed save puts the
 * switch back and says so.
 */
@HiltViewModel
class ProfileShareViewModel
    @Inject
    constructor(
        private val pages: ProfilePageRepository,
    ) : ViewModel() {
        private val _state = MutableStateFlow<ProfileShareUiState>(ProfileShareUiState.Loading)
        val state: StateFlow<ProfileShareUiState> = _state.asStateFlow()

        private val _notice = MutableStateFlow<String?>(null)

        /** A short line for the toast ("Copied.", "Not saved. Try again."). */
        val notice: StateFlow<String?> = _notice.asStateFlow()

        fun load() {
            if (_state.value !is ProfileShareUiState.Loaded) _state.value = ProfileShareUiState.Loading
            viewModelScope.launch {
                when (val result = pages.share()) {
                    is NetworkResult.Success -> _state.value = ProfileShareUiState.Loaded(map(result.data))
                    is NetworkResult.Failure ->
                        if (_state.value !is ProfileShareUiState.Loaded) {
                            _state.value = ProfileShareUiState.Error("Your sharing settings can't be loaded right now.")
                        }
                }
            }
        }

        /** Flips one part: on is anyone with the link, off is people on Pantopus. */
        fun setPart(
            key: String,
            on: Boolean,
        ) {
            val loaded = _state.value as? ProfileShareUiState.Loaded ?: return
            if (key in loaded.saving) return
            val setting = if (on) SharePart.ANYONE else SharePart.MEMBERS
            val before = loaded.share
            val after = before.copy(parts = before.parts.map { if (it.key == key) it.copy(setting = setting) else it })
            _state.value = loaded.copy(share = after, saving = loaded.saving + key)
            save(ProfileShareUpdateBody(parts = mapOf(key to setting)), key, before)
        }

        fun setSearchEngines(on: Boolean) {
            val loaded = _state.value as? ProfileShareUiState.Loaded ?: return
            if (SEARCH in loaded.saving) return
            val before = loaded.share
            _state.value = loaded.copy(share = before.copy(searchEngines = on), saving = loaded.saving + SEARCH)
            save(ProfileShareUpdateBody(searchEngines = on), SEARCH, before)
        }

        private fun save(
            body: ProfileShareUpdateBody,
            key: String,
            before: ProfileShareState,
        ) {
            viewModelScope.launch {
                val result = pages.saveShare(body)
                val current = _state.value as? ProfileShareUiState.Loaded ?: return@launch
                _state.value =
                    when (result) {
                        is NetworkResult.Success -> current.copy(share = map(result.data), saving = current.saving - key)
                        is NetworkResult.Failure -> {
                            _notice.value = "Not saved. Try again."
                            current.copy(share = before, saving = current.saving - key)
                        }
                    }
            }
        }

        fun say(message: String) {
            _notice.value = message
        }

        fun clearNotice() {
            _notice.value = null
        }

        private fun map(dto: ProfileShareDto): ProfileShareState =
            ProfileShareState(
                url = dto.url.orEmpty(),
                username = dto.username.orEmpty(),
                usernameIsMadeUp = dto.usernameIsMadeUp == true,
                parts =
                    dto.parts.orEmpty().mapNotNull { part ->
                        val key = part.key?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                        SharePart(key = key, setting = part.setting ?: SharePart.MEMBERS, hasContent = part.hasContent != false)
                    },
                searchEngines = dto.searchEngines == true,
                cityLimit = dto.cityLimit ?: "connections",
                visitor = pages.visitorPage(dto),
            )

        private companion object {
            const val SEARCH = "search_engines"
        }
    }
