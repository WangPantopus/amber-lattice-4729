package app.pantopus.android.ui.screens.profile.sources

import app.pantopus.android.core.LaunchFeatures
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.profile.ProfilePageRepository
import app.pantopus.android.ui.screens.profile.PreviewAudience
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Where the profile with sources stands for the profile on screen. */
sealed interface ProfileSourcesState {
    /** The launch key is off: today's screen, nothing read. */
    data object Off : ProfileSourcesState

    /** Read beside today's profile read; the screen waits for it rather than flashing today's page first. */
    data object Loading : ProfileSourcesState

    data class Ready(
        val page: ProfilePage,
    ) : ProfileSourcesState

    /** Any answer but a page (the switch off, a business, private, a block, no connection): today's screen. */
    data object Unavailable : ProfileSourcesState
}

/** One month opened on the Record chart (board 13): loading, its lines, or nothing there for this viewer. */
sealed interface ProfileMonthState {
    data class Loading(
        val month: RecordMonth,
    ) : ProfileMonthState

    data class Ready(
        val month: RecordMonth,
        val content: ProfileMonth,
    ) : ProfileMonthState

    data class Empty(
        val month: RecordMonth,
    ) : ProfileMonthState

    val at: RecordMonth
        get() =
            when (this) {
                is Loading -> month
                is Ready -> month
                is Empty -> month
            }
}

/**
 * Reads the page for `PublicProfileViewModel` (the actions, sheets and owner extras stay that view-model's), its
 * months, and the owner's Preview as on the new page (`?as=`).
 */
class ProfileSourcesLoader(
    private val scope: CoroutineScope,
    private val pages: ProfilePageRepository,
) {
    private val _state =
        MutableStateFlow<ProfileSourcesState>(
            if (LaunchFeatures.profileSources) ProfileSourcesState.Loading else ProfileSourcesState.Off,
        )
    val state: StateFlow<ProfileSourcesState> = _state.asStateFlow()

    private val _month = MutableStateFlow<ProfileMonthState?>(null)
    val month: StateFlow<ProfileMonthState?> = _month.asStateFlow()

    private val _preview = MutableStateFlow<ProfilePage?>(null)

    /** The owner's page as one audience gets it; null when not previewing or before it is read. */
    val preview: StateFlow<ProfilePage?> = _preview.asStateFlow()

    private var job: Job? = null
    private var monthJob: Job? = null
    private var identifier: String? = null

    /**
     * Reads the page for [identifier] (an account id or a username). A page already on screen stays while it is read
     * again; a failed read again keeps it, unless [dropOnFailure] (a block, an unblock: the old page may be wrong).
     */
    fun load(
        identifier: String,
        dropOnFailure: Boolean = false,
    ) {
        if (!LaunchFeatures.profileSources) return
        if (identifier.isBlank()) {
            _state.value = ProfileSourcesState.Unavailable
            return
        }
        this.identifier = identifier
        job?.cancel()
        if (_state.value !is ProfileSourcesState.Ready) _state.value = ProfileSourcesState.Loading
        job =
            scope.launch {
                when (val result = pages.page(identifier)) {
                    is NetworkResult.Success -> _state.value = ProfileSourcesState.Ready(result.data)
                    is NetworkResult.Failure ->
                        if (dropOnFailure || _state.value !is ProfileSourcesState.Ready) _state.value = ProfileSourcesState.Unavailable
                }
            }
    }

    /** A block: nothing of the page stays; today's screen shows the blocked state. */
    fun drop() {
        job?.cancel()
        if (_state.value != ProfileSourcesState.Off) _state.value = ProfileSourcesState.Unavailable
        _month.value = null
    }

    /** Opens [at] on the Record chart; a month with nothing for this viewer shows that plainly. */
    fun openMonth(at: RecordMonth) {
        val page = (_state.value as? ProfileSourcesState.Ready)?.page ?: return
        val shown = _preview.value ?: page
        monthJob?.cancel()
        _month.value = ProfileMonthState.Loading(at)
        val key = "%04d-%02d".format(at.year, at.month + 1)
        monthJob =
            scope.launch {
                val result = pages.month(page.header.userId, key, shown.previewAs?.key)
                _month.value =
                    when (result) {
                        is NetworkResult.Success -> ProfileMonthState.Ready(at, result.data)
                        is NetworkResult.Failure -> ProfileMonthState.Empty(at)
                    }
            }
    }

    fun closeMonth() {
        monthJob?.cancel()
        _month.value = null
    }

    /** Preview as on the new page: the server's `?as=` answer, exactly what that viewer gets. */
    fun startPreview(
        audience: PreviewAudience,
        onFailed: () -> Unit,
    ) {
        val id = (_state.value as? ProfileSourcesState.Ready)?.page?.header?.userId ?: identifier ?: return
        val view =
            when (audience) {
                PreviewAudience.Anyone -> ProfileView.Link
                PreviewAudience.Neighbors -> ProfileView.Member
                PreviewAudience.Connections -> ProfileView.Connection
            }
        scope.launch {
            when (val result = pages.page(id, view.key)) {
                is NetworkResult.Success -> _preview.value = result.data
                is NetworkResult.Failure -> onFailed()
            }
        }
    }

    fun endPreview() {
        _preview.value = null
        _month.value = null
    }
}
