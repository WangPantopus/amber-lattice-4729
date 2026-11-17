package app.pantopus.android.ui.screens.place.verify

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.homes.HomesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** The Home's street line and whether the person rents it, for B3's words. */
data class FastVerifiedUiState(
    val address: String = "",
    val renter: Boolean = false,
)

@HiltViewModel
class FastVerifiedViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val homes: HomesRepository,
    ) : ViewModel() {
        private val homeId: String = savedStateHandle.get<String>(PLACE_VERIFY_HOME_ID_KEY).orEmpty()
        private val _state =
            MutableStateFlow(FastVerifiedUiState(address = savedStateHandle.get<String>(PLACE_VERIFY_ADDRESS_KEY).orEmpty()))
        val state: StateFlow<FastVerifiedUiState> = _state.asStateFlow()

        init {
            viewModelScope.launch {
                val home = (homes.myHomesStored().data?.homes).orEmpty().firstOrNull { it.id.equals(homeId, ignoreCase = true) }
                _state.update {
                    it.copy(address = it.address.ifBlank { home?.address.orEmpty() }, renter = home?.roleBase == "lease_resident")
                }
            }
        }
    }

/** B3 after a bill read at once (FASTVERIFY phase 4): "You're verified", "Your bill matches {address}.". */
@Composable
fun BillVerifiedScreen(
    onDone: () -> Unit,
    onMailCode: () -> Unit,
    viewModel: FastVerifiedViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    FastVerifiedPage(FastCheckKind.BILL, state.address.ifBlank { "this address" }, state.renter, onMailCode = onMailCode, onDone = onDone)
}
