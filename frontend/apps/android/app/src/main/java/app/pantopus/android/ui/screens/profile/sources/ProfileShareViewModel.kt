package app.pantopus.android.ui.screens.profile.sources

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.profile.ProfileShareDto
import app.pantopus.android.data.api.models.profile.ProfileShareLinkCreateBody
import app.pantopus.android.data.api.models.profile.ProfileShareLinkDto
import app.pantopus.android.data.api.models.profile.ProfileShareUpdateBody
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.profile.ProfilePageRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
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

/** A link for one purpose (contract v1.3). [key] opens it; the app builds its own link from it, never logs it. */
data class ShareLink(
    val id: String,
    val name: String,
    val key: String?,
    val parts: Map<String, Boolean>,
    val endsOn: LocalDate?,
    val switchedOff: Boolean,
    val live: Boolean,
    val opens: Int,
    val lastOpenedOn: LocalDate?,
)

/** The share sheet's state: the link, its parts, the page a visitor gets, and the links for one purpose. */
data class ProfileShareState(
    val url: String,
    val username: String,
    val usernameIsMadeUp: Boolean,
    val parts: List<SharePart>,
    val searchEngines: Boolean,
    /** anyone | connections | none: how far "Who sees your city" lets the city go. */
    val cityLimit: String,
    val visitor: ProfilePage?,
    /** Null while the server's `PROFILE_LINKS` is off: no "Links for one purpose" section at all. */
    val linksEnabled: Boolean?,
    val links: List<ShareLink>,
    /** v1.4: false while the profile is private: no link opens, and [linksNote] says why in Copy and Send's place. */
    val linksOpen: Boolean = true,
    val linksNote: String? = null,
    /** P2.5: the pieces a link shows, of the pieces on Work ("12 of your 18 pieces"); null before phase 2. */
    val workPieces: Pair<Int, Int>? = null,
)

/** A link's page as its visitor gets it, or why it isn't there. */
sealed interface LinkPreviewState {
    data object Loading : LinkPreviewState

    data class Ready(
        val page: ProfilePage,
    ) : LinkPreviewState

    data object Failed : LinkPreviewState
}

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

        private val _linkPreview = MutableStateFlow<LinkPreviewState?>(null)

        /** "See it as a visitor" for one link for one purpose. */
        val linkPreview: StateFlow<LinkPreviewState?> = _linkPreview.asStateFlow()

        private val _linkSaving = MutableStateFlow(false)

        /** A link is being made or changed: its sheet's buttons wait. */
        val linkSaving: StateFlow<Boolean> = _linkSaving.asStateFlow()

        /** Each part's setting when the sheet read it: switching a part off goes back there (never wider than it was). */
        private var openedWith: Map<String, String> = emptyMap()

        private val _notice = MutableStateFlow<String?>(null)

        /** A short line for the toast ("Copied.", "Not saved. Try again."). */
        val notice: StateFlow<String?> = _notice.asStateFlow()

        fun load() {
            if (_state.value !is ProfileShareUiState.Loaded) _state.value = ProfileShareUiState.Loading
            viewModelScope.launch {
                when (val result = pages.share()) {
                    is NetworkResult.Success -> {
                        val share = map(result.data)
                        openedWith = share.parts.associate { it.key to it.setting }
                        _state.value = ProfileShareUiState.Loaded(share)
                    }
                    is NetworkResult.Failure ->
                        if (_state.value !is ProfileShareUiState.Loaded) {
                            _state.value = ProfileShareUiState.Error("Your sharing settings can't be loaded right now.")
                        }
                }
            }
        }

        /**
         * Flips one part: on is anyone with the link; off goes back to the setting it had when the sheet opened, or to
         * people on Pantopus, so a switch never widens a part (as on iPhone).
         */
        fun setPart(
            key: String,
            on: Boolean,
        ) {
            val loaded = _state.value as? ProfileShareUiState.Loaded ?: return
            if (key in loaded.saving) return
            val setting = if (on) SharePart.ANYONE else openedWith[key]?.takeIf { it != SharePart.ANYONE } ?: SharePart.MEMBERS
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

        /** Links for one purpose on or off for this person: off, none of their links open and none can be made. */
        fun setLinksEnabled(on: Boolean) {
            val loaded = _state.value as? ProfileShareUiState.Loaded ?: return
            if (LINKS in loaded.saving) return
            val before = loaded.share
            _state.value = loaded.copy(share = before.copy(linksEnabled = on), saving = loaded.saving + LINKS)
            save(ProfileShareUpdateBody(linksEnabled = on), LINKS, before)
        }

        /** Makes a link for one purpose; [onMade] gets it so its sheet can offer Copy link at once. */
        fun createLink(
            name: String,
            parts: Map<String, Boolean>,
            endsOn: LocalDate?,
            onMade: (ShareLink) -> Unit,
        ) {
            if (_linkSaving.value) return
            _linkSaving.value = true
            viewModelScope.launch {
                val result = pages.createLink(ProfileShareLinkCreateBody(name.trim(), parts, endsOn?.toString()))
                _linkSaving.value = false
                when (result) {
                    is NetworkResult.Success ->
                        mapLink(result.data)?.let { link ->
                            replaceLink(link, first = true)
                            onMade(link)
                        }
                    is NetworkResult.Failure -> _notice.value = result.error.message.ifBlank { "Your link wasn't made. Try again." }
                }
            }
        }

        /** Changes one link: its name, a part, its end, or switches it off or on. */
        fun updateLink(
            id: String,
            name: String? = null,
            parts: Map<String, Boolean>? = null,
            endsOn: LocalDate? = null,
            clearEnd: Boolean = false,
            switchedOff: Boolean? = null,
        ) {
            if (_linkSaving.value) return
            _linkSaving.value = true
            viewModelScope.launch {
                val result = pages.updateLink(id, name, parts, endsOn?.toString(), clearEnd, switchedOff)
                _linkSaving.value = false
                when (result) {
                    is NetworkResult.Success -> mapLink(result.data)?.let { replaceLink(it, first = false) }
                    is NetworkResult.Failure -> _notice.value = result.error.message.ifBlank { "Not saved. Try again." }
                }
            }
        }

        fun deleteLink(
            id: String,
            onDeleted: () -> Unit,
        ) {
            if (_linkSaving.value) return
            _linkSaving.value = true
            viewModelScope.launch {
                val result = pages.deleteLink(id)
                _linkSaving.value = false
                when (result) {
                    is NetworkResult.Success -> {
                        val loaded = _state.value as? ProfileShareUiState.Loaded
                        if (loaded != null) {
                            _state.value = loaded.copy(share = loaded.share.copy(links = loaded.share.links.filterNot { it.id == id }))
                        }
                        _notice.value = "Link deleted."
                        onDeleted()
                    }
                    is NetworkResult.Failure -> _notice.value = "Not deleted. Try again."
                }
            }
        }

        /** The page this link opens, as its visitor gets it. */
        fun previewLink(link: ShareLink) {
            val loaded = _state.value as? ProfileShareUiState.Loaded ?: return
            val key = link.key ?: return
            _linkPreview.value = LinkPreviewState.Loading
            viewModelScope.launch {
                _linkPreview.value =
                    when (val result = pages.pageByKey(loaded.share.username, key)) {
                        is NetworkResult.Success -> LinkPreviewState.Ready(result.data)
                        is NetworkResult.Failure -> LinkPreviewState.Failed
                    }
            }
        }

        fun endLinkPreview() {
            _linkPreview.value = null
        }

        private fun replaceLink(
            link: ShareLink,
            first: Boolean,
        ) {
            val loaded = _state.value as? ProfileShareUiState.Loaded ?: return
            val others = loaded.share.links.filterNot { it.id == link.id }
            val links =
                if (first) {
                    listOf(link) + others
                } else {
                    loaded.share.links.map { if (it.id == link.id) link else it }
                }
            _state.value = loaded.copy(share = loaded.share.copy(links = links))
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
                linksEnabled = dto.linksEnabled,
                linksOpen = dto.linksOpen != false,
                linksNote = dto.linksNote?.takeIf { it.isNotBlank() },
                links = dto.links.orEmpty().mapNotNull(::mapLink),
                workPieces =
                    dto.workPieces?.let { counts ->
                        val total = counts.total ?: return@let null
                        (counts.shown ?: 0) to total
                    }?.takeIf { it.second > 0 },
            )

        private fun mapLink(dto: ProfileShareLinkDto): ShareLink? {
            val id = dto.id?.takeIf { it.isNotBlank() } ?: return null
            return ShareLink(
                id = id,
                name = dto.name?.takeIf { it.isNotBlank() } ?: "A link",
                key = dto.url?.substringAfter("/v/", "")?.substringBefore('?')?.takeIf { it.isNotBlank() },
                parts = dto.parts.orEmpty(),
                endsOn = dto.endsOn?.let { runCatching { LocalDate.parse(it.take(DAY_CHARS)) }.getOrNull() },
                switchedOff = dto.switchedOff == true,
                live = dto.live != false,
                opens = dto.opens ?: 0,
                lastOpenedOn = dto.lastOpenedOn?.let { runCatching { LocalDate.parse(it.take(DAY_CHARS)) }.getOrNull() },
            )
        }

        private companion object {
            const val SEARCH = "search_engines"
            const val LINKS = "links_enabled"
            const val DAY_CHARS = 10
        }
    }
