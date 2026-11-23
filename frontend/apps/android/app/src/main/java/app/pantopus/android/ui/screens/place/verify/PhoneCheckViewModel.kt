package app.pantopus.android.ui.screens.place.verify

import android.os.SystemClock
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.homes.HomeVerifyOptions
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.auth.AuthRepository
import app.pantopus.android.data.homes.HomeFastVerifyRepository
import app.pantopus.android.data.homes.HomesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Where the phone check stands: the number, the texted code, then verified or no match. */
enum class PhoneCheckStage { NUMBER, CODE, VERIFIED, NO_MATCH }

/**
 * The phone check (FASTVERIFY drawings 4, 5, 6, 9). The number, the names and the code stay in memory only: never in
 * saved state, a log or the screen's route.
 */
data class PhoneCheckUiState(
    val stage: PhoneCheckStage = PhoneCheckStage.NUMBER,
    val address: String = "",
    /** The mobile number as typed: digits, shown as (360) 555-0142. */
    val digits: String = "",
    /** The signed-in account's name, which the records are asked about unless [someoneElse]. */
    val accountName: String = "",
    val someoneElse: Boolean = false,
    val firstName: String = "",
    val lastName: String = "",
    val code: String = "",
    val sending: Boolean = false,
    val verifying: Boolean = false,
    val error: String? = null,
    /** When "Send again" opens (elapsed realtime, ms). */
    val resendAt: Long = 0L,
    /** "What others near you pay in rent" opens to renters. */
    val renter: Boolean = false,
    /** The server's ways to verify, for B4's other ways. */
    val options: HomeVerifyOptions? = null,
) {
    val canSend: Boolean
        get() = !sending && digits.length == US_DIGITS && (!someoneElse || (firstName.isNotBlank() && lastName.isNotBlank()))

    val canVerify: Boolean get() = !verifying && code.length == CODE_LENGTH

    /** "(360) 555-0142". */
    val displayNumber: String get() = formatUsNumber(digits)

    companion object {
        const val US_DIGITS = 10
        const val CODE_LENGTH = 6
    }
}

/** The area code's digits and the exchange's end, in a US number. */
internal const val US_AREA_DIGITS = 3
internal const val US_EXCHANGE_END = 6

/** (360) 555-0142 from up to ten digits, as they are typed. */
internal fun formatUsNumber(digits: String): String {
    val area = digits.take(US_AREA_DIGITS)
    return when {
        digits.length <= US_AREA_DIGITS -> if (digits.isEmpty()) "" else "($digits"
        digits.length <= US_EXCHANGE_END -> "($area) ${digits.drop(US_AREA_DIGITS)}"
        else -> "($area) ${digits.substring(US_AREA_DIGITS, US_EXCHANGE_END)}-${digits.drop(US_EXCHANGE_END)}"
    }
}

@HiltViewModel
class PhoneCheckViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: HomeFastVerifyRepository,
        private val homes: HomesRepository,
        auth: AuthRepository,
    ) : ViewModel() {
        val homeId: String = savedStateHandle.get<String>(PLACE_VERIFY_HOME_ID_KEY).orEmpty()

        private val _state =
            MutableStateFlow(
                PhoneCheckUiState(
                    address = savedStateHandle.get<String>(PLACE_VERIFY_ADDRESS_KEY).orEmpty(),
                    accountName = (auth.state.value as? AuthRepository.State.SignedIn)?.user?.displayName.orEmpty(),
                ),
            )
        val state: StateFlow<PhoneCheckUiState> = _state.asStateFlow()

        init {
            viewModelScope.launch {
                val home = (homes.myHomesStored().data?.homes).orEmpty().firstOrNull { it.id.equals(homeId, ignoreCase = true) }
                _state.update {
                    it.copy(
                        address = it.address.ifBlank { home?.address.orEmpty() },
                        renter = home?.roleBase == "lease_resident",
                    )
                }
            }
        }

        fun updateNumber(typed: String) {
            // Typed digits only, a leading country 1 dropped: the field shows (360) 555-0142.
            val typedDigits = typed.filter(Char::isDigit)
            val withCountry = typedDigits.length > PhoneCheckUiState.US_DIGITS && typedDigits.startsWith("1")
            val digits = if (withCountry) typedDigits.drop(1) else typedDigits
            _state.update { it.copy(digits = digits.take(PhoneCheckUiState.US_DIGITS), error = null) }
        }

        fun toggleSomeoneElse() = _state.update { it.copy(someoneElse = !it.someoneElse, error = null) }

        fun updateFirstName(value: String) = _state.update { it.copy(firstName = value, error = null) }

        fun updateLastName(value: String) = _state.update { it.copy(lastName = value, error = null) }

        fun updateCode(typed: String) {
            val code = typed.filter(Char::isDigit).take(PhoneCheckUiState.CODE_LENGTH)
            _state.update { it.copy(code = code, error = null) }
            if (code.length == PhoneCheckUiState.CODE_LENGTH) verify()
        }

        /** "Text me a code", and "Send again". */
        fun sendCode() {
            val current = _state.value
            if (!current.canSend) return
            _state.update { it.copy(sending = true, error = null) }
            viewModelScope.launch {
                val names = current.takeIf { it.someoneElse }
                when (
                    val result =
                        repository.startPhoneCheck(homeId, e164(current.digits), names?.firstName?.trim(), names?.lastName?.trim())
                ) {
                    is NetworkResult.Success ->
                        _state.update {
                            it.copy(
                                sending = false,
                                stage = PhoneCheckStage.CODE,
                                code = "",
                                resendAt = SystemClock.elapsedRealtime() + (result.data.resendAfterS ?: DEFAULT_RESEND_S) * MS,
                            )
                        }
                    is NetworkResult.Failure -> _state.update { it.copy(sending = false, error = fastCheckErrorWords(result.error)) }
                }
            }
        }

        /** "Change number": back to the number, kept as typed. */
        fun changeNumber() = _state.update { it.copy(stage = PhoneCheckStage.NUMBER, code = "", error = null) }

        /** "Verify": the code, then the records' answer. */
        fun verify() {
            val current = _state.value
            if (!current.canVerify || current.stage != PhoneCheckStage.CODE) return
            _state.update { it.copy(verifying = true, error = null) }
            viewModelScope.launch {
                val names = current.takeIf { it.someoneElse }
                val result =
                    repository.verifyPhoneCheck(
                        homeId,
                        e164(current.digits),
                        current.code,
                        names?.firstName?.trim(),
                        names?.lastName?.trim(),
                    )
                when (result) {
                    is NetworkResult.Success ->
                        when (result.data.result) {
                            "verified" -> {
                                // Place and the sheet read the new level at once.
                                val options = repository.refresh(homeId)
                                _state.update { it.copy(verifying = false, stage = PhoneCheckStage.VERIFIED, options = options) }
                            }
                            "no_match" -> {
                                val options = repository.refresh(homeId)
                                _state.update { it.copy(verifying = false, stage = PhoneCheckStage.NO_MATCH, options = options) }
                            }
                            else ->
                                _state.update {
                                    val left = result.data.triesLeft
                                    it.copy(
                                        verifying = false,
                                        code = "",
                                        error = wrongCodeWords(left),
                                        // No tries left: the code is used up or expired, so "Send again" opens at once.
                                        resendAt = if (left == 0) 0L else it.resendAt,
                                    )
                                }
                        }
                    is NetworkResult.Failure -> _state.update { it.copy(verifying = false, error = fastCheckErrorWords(result.error)) }
                }
            }
        }

        private companion object {
            const val DEFAULT_RESEND_S = 30
            const val MS = 1000L
            const val WRONG_CODE = "That code didn't match."

            /**
             * A wrong code, with how many tries are left when the answer says (the web's and the iPhone's sentences).
             * The count is part of this line only, so no other refusal can carry it.
             */
            fun wrongCodeWords(left: Int?): String =
                when {
                    left == null -> "$WRONG_CODE Check it and try again."
                    left <= 0 -> "That code can't be used any more. Send a new one."
                    left == 1 -> "$WRONG_CODE 1 try left."
                    else -> "$WRONG_CODE $left tries left."
                }

            /** +1 and the ten digits: the phone-check service takes E.164. */
            fun e164(digits: String): String = "+1$digits"
        }
    }
