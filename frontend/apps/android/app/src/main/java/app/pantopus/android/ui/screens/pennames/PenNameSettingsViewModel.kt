package app.pantopus.android.ui.screens.pennames

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.pennames.PenNameMeResponse
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.pennames.PenNamesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Backs Settings' made-up name row: the person's made-up name, read fresh each time Privacy opens. */
@HiltViewModel
class PenNameSettingsViewModel
    @Inject
    constructor(
        private val repo: PenNamesRepository,
    ) : ViewModel() {
        private val _me = MutableStateFlow<PenNameMeResponse?>(null)

        /** Null hides the row (not read yet, or the server has no made-up names). */
        val me: StateFlow<PenNameMeResponse?> = _me.asStateFlow()

        fun load() {
            viewModelScope.launch { (repo.loadMe() as? NetworkResult.Success)?.data?.let { _me.value = it } }
        }
    }
