package app.pantopus.android.ui.screens.homes.record

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.homerecord.HomeRecord
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.homerecord.HomeRecordRepository
import app.pantopus.android.data.homerecord.HomeRecordSource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface HomeRecordUiState {
    data object Loading : HomeRecordUiState

    data class Loaded(val record: HomeRecord) : HomeRecordUiState

    data class Error(val message: String) : HomeRecordUiState
}

/**
 * The home record page: a Home's (route `homes/{homeId}/record`, [HOME_ID_KEY]) or a looked-up address's, opened
 * over the lookup result with [open]. One call per opening; the server draws the page.
 */
@HiltViewModel
class HomeRecordViewModel
    @Inject
    constructor(
        private val repo: HomeRecordRepository,
        savedStateHandle: SavedStateHandle,
    ) : ViewModel() {
        private var source: HomeRecordSource? = savedStateHandle.get<String>(HOME_ID_KEY)?.let { HomeRecordSource.Home(it) }
        private val _state = MutableStateFlow<HomeRecordUiState>(HomeRecordUiState.Loading)
        val state: StateFlow<HomeRecordUiState> = _state.asStateFlow()
        private var job: Job? = null

        /** The page for [next]; a page already showing [next] stays as it is. */
        fun open(next: HomeRecordSource) {
            if (next == source && (job?.isActive == true || _state.value is HomeRecordUiState.Loaded)) return
            source = next
            refresh()
        }

        /** The first load of a routed page (its Home came in the route). */
        fun load() {
            if (job?.isActive == true || _state.value is HomeRecordUiState.Loaded) return
            refresh()
        }

        fun refresh() {
            val current = source ?: return
            job?.cancel()
            _state.value = HomeRecordUiState.Loading
            job =
                viewModelScope.launch {
                    _state.value =
                        when (val r = repo.load(current)) {
                            is NetworkResult.Success -> HomeRecordUiState.Loaded(r.data)
                            is NetworkResult.Failure -> HomeRecordUiState.Error(message(r.error))
                        }
                }
        }

        private fun message(error: NetworkError): String =
            when {
                // The lookup's daily limit, or lookups are busy: the server's own sentence.
                error.code == HTTP_TOO_MANY_REQUESTS -> error.message
                error is NetworkError.NotFound -> "We couldn’t find a record for this home."
                error is NetworkError.Forbidden -> "This home’s record is for the people of this Home."
                error is NetworkError.Unauthorized -> "Sign in again to see this home’s record."
                error is NetworkError.Transport -> "We couldn’t reach Pantopus to load this home’s record. Check your connection."
                else -> "We couldn’t load this home’s record."
            }

        companion object {
            const val HOME_ID_KEY = "homeId"
            private const val HTTP_TOO_MANY_REQUESTS = 429
        }
    }
