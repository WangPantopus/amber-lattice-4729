@file:Suppress("PackageNaming", "MagicNumber", "SwallowedException", "TooGenericExceptionCaught")

package app.pantopus.android.ui.screens.auth.verify_email

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.auth.AuthError
import app.pantopus.android.data.auth.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Clock
import javax.inject.Inject

/**
 * T6.1c P5 — Verify email view-model. Mirrors iOS
 * `VerifyEmailViewModel` (`Features/Auth/Screens/VerifyEmailView.swift`).
 * Receives email + token through [SavedStateHandle]: the email is the
 * recipient surfaced in the body copy, the token is the hashed Supabase
 * OTP carried by the verification link (when present, the screen
 * auto-verifies on first attach).
 */
@HiltViewModel
class VerifyEmailViewModel
    @Inject
    constructor(
        private val authRepository: AuthRepository,
        private val savedStateHandle: SavedStateHandle,
    ) : ViewModel() {
        /** Wall-clock source — replaced in tests with a fake clock. */
        var clock: Clock = Clock.systemUTC()

        data class UiState(
            val email: String? = null,
            val token: String? = null,
            val softGate: Boolean = true,
            val isVerifying: Boolean = false,
            val didVerify: Boolean = false,
            val isResending: Boolean = false,
            val didResend: Boolean = false,
            val didComplete: Boolean = false,
            val errorMessage: AuthError? = null,
            val resendCooldownUntilEpochMs: Long? = null,
            /** "Already confirmed? Log in" found the email not confirmed yet. */
            val notConfirmedYet: Boolean = false,
        ) {
            /**
             * True when the resend CTA is tappable (no in-flight call AND no
             * active cooldown AND we have an email to resend to). Mirrors iOS
             * `VerifyEmailViewModel.canResend` — the cooldown is wall-clock
             * based, so it must be evaluated against a supplied `now` rather
             * than a stored flag that nothing ever clears.
             */
            fun canResend(nowEpochMs: Long): Boolean = !isResending && !email.isNullOrEmpty() && cooldownRemaining(nowEpochMs) == null

            fun cooldownRemaining(nowEpochMs: Long): Long? {
                val until = resendCooldownUntilEpochMs ?: return null
                val delta = until - nowEpochMs
                return if (delta > 0) delta else null
            }
        }

        private var hasAutoVerified: Boolean = false

        private val _uiState =
            MutableStateFlow(
                UiState(
                    email = savedStateHandle.get<String>(EMAIL_KEY)?.takeIf { it.isNotEmpty() },
                    token = savedStateHandle.get<String>(TOKEN_KEY)?.takeIf { it.isNotEmpty() },
                    softGate = savedStateHandle.get<Boolean>(SOFT_GATE_KEY) ?: true,
                ),
            )
        val uiState: StateFlow<UiState> = _uiState.asStateFlow()

        fun clearError() = _uiState.update { it.copy(errorMessage = null) }

        private var signingIn = false

        /** True while the sign-in under way is a quiet one (a return to the app, a check): a tap then waits for it. */
        private var signingInQuietly = false

        /** A tap of "Already confirmed?" made during a quiet sign-in: answered from that sign-in's result. */
        private var tapDuringQuietSignIn: ((String?) -> Unit)? = null

        /**
         * Signs in with the password typed at sign-up once the email is
         * confirmed. [asked] (the "Already confirmed?" tap) says "not confirmed
         * yet" when it isn't, and hands [onUnavailable] the email when this
         * phone can't sign in by itself; a return to the app stays quiet.
         */
        fun signInIfConfirmed(
            asked: Boolean = false,
            onUnavailable: (String?) -> Unit = {},
        ) {
            if (signingIn) {
                if (asked && signingInQuietly) tapDuringQuietSignIn = onUnavailable
                return
            }
            signingIn = true
            signingInQuietly = !asked
            viewModelScope.launch { signInNow(tap = onUnavailable.takeIf { asked }) }
        }

        private var watchStartedAtMs: Long? = null
        private var watchChecks = 0

        /**
         * While the screen shows, checks now and then, quietly, whether the
         * email was confirmed somewhere else (the link opened on a computer)
         * and signs in the way "Already confirmed? Log in" does. Each check is
         * that same sign-in: `/login` answers 403 until the email is confirmed,
         * and a 403 never counts against the person's sign-in limits. But every
         * sign-in also uses Supabase Auth's per-address allowance, which all of
         * the app's sign-ins and sign-ups share because they reach it from the
         * server's one address, so the checks stay sparse: the first 15 s
         * after the screen first shows, then 30 s, 1 min and every 2 min after,
         * for 10 minutes (7 checks, never more than 4 in any 5 minutes). Any
         * other answer (signed in, offline, refused, nothing remembered to sign
         * in with) ends this run. The screen runs it while it is in view, so
         * leaving the screen or the app stops it; coming back continues the
         * same schedule within the same 10 minutes.
         */
        suspend fun watchForConfirmation() {
            val startedAt = watchStartedAtMs ?: clock.millis().also { watchStartedAtMs = it }
            while (true) {
                val wait = WATCH_DELAYS_MS[minOf(watchChecks, WATCH_DELAYS_MS.lastIndex)]
                if (clock.millis() + wait - startedAt > WATCH_WINDOW_MS) return
                delay(wait)
                watchChecks++
                // Null: another sign-in was under way, so this check wasn't needed.
                val outcome =
                    if (signingIn) {
                        null
                    } else {
                        signingIn = true
                        signingInQuietly = true
                        signInNow(tap = null)
                    }
                if (outcome != null && outcome != AuthRepository.ConfirmedSignIn.NotConfirmedYet) return
            }
        }

        /**
         * The sign-in its caller marked under way ([signingIn]). [tap] is the
         * "Already confirmed?" tap that asked for it, if one did; a tap made
         * while a quiet one runs gets the same answer.
         */
        private suspend fun signInNow(tap: ((String?) -> Unit)?): AuthRepository.ConfirmedSignIn {
            try {
                val email = _uiState.value.email
                val outcome = authRepository.signInAfterConfirmation(email)
                (tap ?: tapDuringQuietSignIn)?.let { onUnavailable ->
                    when (outcome) {
                        AuthRepository.ConfirmedSignIn.SignedIn -> Unit
                        AuthRepository.ConfirmedSignIn.NotConfirmedYet -> _uiState.update { it.copy(notConfirmedYet = true) }
                        AuthRepository.ConfirmedSignIn.Unavailable -> onUnavailable(email)
                    }
                }
                return outcome
            } finally {
                signingIn = false
                signingInQuietly = false
                tapDuringQuietSignIn = null
            }
        }

        /**
         * Fired once from the screen's `LaunchedEffect`. If a token was
         * supplied (verification-email deep-link path), POSTs it. Sets
         * [UiState.didComplete] after a brief success banner so the host
         * can pop back to login.
         */
        fun verifyOnAppearIfNeeded() {
            val snapshot = _uiState.value
            val token = snapshot.token
            if (token.isNullOrEmpty() || hasAutoVerified) return
            hasAutoVerified = true
            _uiState.update { it.copy(isVerifying = true, errorMessage = null) }
            viewModelScope.launch {
                try {
                    authRepository.verifyEmail(token)
                    _uiState.update { it.copy(isVerifying = false, didVerify = true) }
                    delay(VERIFY_SUCCESS_BANNER_DELAY_MS)
                    _uiState.update { it.copy(didComplete = true) }
                } catch (e: AuthError) {
                    _uiState.update { it.copy(isVerifying = false, errorMessage = e) }
                } catch (e: Throwable) {
                    _uiState.update {
                        it.copy(isVerifying = false, errorMessage = AuthError.Unknown)
                    }
                }
            }
        }

        /**
         * Re-sends the verification email. Silently no-ops when the local
         * cooldown is active so a frustrated double-tap doesn't pile on
         * the backend rate limiter.
         */
        fun resend() {
            val snapshot = _uiState.value
            if (!snapshot.canResend(clock.millis())) return
            val email = snapshot.email ?: return
            _uiState.update { it.copy(isResending = true, didResend = false, errorMessage = null) }
            viewModelScope.launch {
                try {
                    authRepository.resendVerification(email)
                    val nextCooldown = clock.millis() + RESEND_COOLDOWN_MS
                    _uiState.update {
                        it.copy(
                            isResending = false,
                            didResend = true,
                            resendCooldownUntilEpochMs = nextCooldown,
                        )
                    }
                } catch (e: AuthError) {
                    _uiState.update { it.copy(isResending = false, errorMessage = e) }
                } catch (e: Throwable) {
                    _uiState.update {
                        it.copy(isResending = false, errorMessage = AuthError.Unknown)
                    }
                }
            }
        }

        /** Test helper — drops the cooldown without waiting wall-clock. */
        fun clearCooldown() = _uiState.update { it.copy(resendCooldownUntilEpochMs = null) }

        companion object {
            const val EMAIL_KEY = "email"
            const val TOKEN_KEY = "token"
            const val SOFT_GATE_KEY = "softGate"
            const val RESEND_COOLDOWN_MS: Long = 30_000
            const val VERIFY_SUCCESS_BANNER_DELAY_MS: Long = 1_500

            /** Waits before each quiet check; the last one repeats. */
            val WATCH_DELAYS_MS = listOf(15_000L, 30_000L, 60_000L, 120_000L)

            /** No quiet check later than this after the screen first shows. */
            const val WATCH_WINDOW_MS: Long = 10 * 60_000L
        }
    }
