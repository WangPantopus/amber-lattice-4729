package app.pantopus.android.ui.screens.place.verify

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.homes.HomeVerifyOptions
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.homes.HomeFastVerifyRepository
import app.pantopus.android.data.homes.HomeLocationProof
import app.pantopus.android.data.homes.HomesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Where the location check stands: the ask, the reading, then verified or a miss with its words. */
enum class LocationCheckStage { INTRO, CHECKING, VERIFIED, MISS }

/** Why a reading didn't pass, for its words (SPEC section 6). */
enum class LocationMiss { NO_MATCH, TOO_ROUGH, NOT_COUNTED, NO_LOCATION, ERROR }

data class LocationCheckUiState(
    val stage: LocationCheckStage = LocationCheckStage.INTRO,
    val address: String = "",
    val miss: LocationMiss? = null,
    /** The server's words for a refusal ([LocationMiss.ERROR]). */
    val error: String? = null,
    val renter: Boolean = false,
    val options: HomeVerifyOptions? = null,
)

/**
 * The location check (FASTVERIFY phase 5): one fresh reading, bound to a one-time challenge and, where Google Play can
 * give one, a Play Integrity token. The reading goes to the server once; the app keeps no coordinates.
 */
@HiltViewModel
class LocationCheckViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: HomeFastVerifyRepository,
        private val proof: HomeLocationProof,
        private val homes: HomesRepository,
    ) : ViewModel() {
        val homeId: String = savedStateHandle.get<String>(PLACE_VERIFY_HOME_ID_KEY).orEmpty()

        private val _state =
            MutableStateFlow(LocationCheckUiState(address = savedStateHandle.get<String>(PLACE_VERIFY_ADDRESS_KEY).orEmpty()))
        val state: StateFlow<LocationCheckUiState> = _state.asStateFlow()

        init {
            viewModelScope.launch {
                val home = (homes.myHomesStored().data?.homes).orEmpty().firstOrNull { it.id.equals(homeId, ignoreCase = true) }
                _state.update {
                    it.copy(address = it.address.ifBlank { home?.address.orEmpty() }, renter = home?.roleBase == "lease_resident")
                }
            }
        }

        fun hasPermission(): Boolean = proof.hasPermission()

        /** The person declined location: the miss page says so, with the other ways. */
        fun permissionDenied() {
            viewModelScope.launch { showMiss(LocationMiss.NO_LOCATION) }
        }

        /** "Check my location": a challenge, one reading, its proof, then the server's answer. */
        fun check() {
            if (_state.value.stage == LocationCheckStage.CHECKING) return
            _state.update { it.copy(stage = LocationCheckStage.CHECKING, miss = null, error = null) }
            viewModelScope.launch {
                val challenge =
                    when (val result = repository.locationChallenge(homeId)) {
                        is NetworkResult.Success -> result.data.challenge
                        is NetworkResult.Failure -> return@launch showMiss(LocationMiss.ERROR, fastCheckErrorWords(result.error))
                    }
                val reading = proof.read() ?: return@launch showMiss(LocationMiss.NO_LOCATION)
                val token = proof.integrityToken(challenge, reading)
                when (val result = repository.checkLocation(homeId, challenge, reading, token)) {
                    is NetworkResult.Success ->
                        when (result.data.result) {
                            "verified", "confirmed" -> {
                                repository.refresh(homeId)
                                _state.update { it.copy(stage = LocationCheckStage.VERIFIED) }
                            }
                            "too_rough" -> showMiss(LocationMiss.TOO_ROUGH)
                            "not_counted" -> showMiss(LocationMiss.NOT_COUNTED)
                            else -> showMiss(LocationMiss.NO_MATCH)
                        }
                    is NetworkResult.Failure -> showMiss(LocationMiss.ERROR, fastCheckErrorWords(result.error))
                }
            }
        }

        /** "Try again" from a miss: back to the ask. */
        fun again() = _state.update { it.copy(stage = LocationCheckStage.INTRO, miss = null, error = null) }

        private suspend fun showMiss(
            miss: LocationMiss,
            error: String? = null,
        ) {
            val options = repository.refresh(homeId)
            _state.update { it.copy(stage = LocationCheckStage.MISS, miss = miss, error = error, options = options) }
        }
    }
