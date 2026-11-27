package app.pantopus.android.data.pulse

import android.content.Context
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.MomentsApi
import app.pantopus.android.data.auth.AuthRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * "Pulse, reinvented" (founder, 2026-11-26) sits behind one server switch, `pulse_reinvented`: off, on for chosen
 * accounts (`beta_user_ids`, the internal team), or on for everyone. On, the new screens (the Studio first) open in
 * place of today's; off, everything is today's again at once. Nothing of today's Moments or Pulse is deleted or
 * changed: the new screens sit beside them, reachable only while this answers true for the person. There is no build
 * key, so switching never needs a new build or a store review.
 *
 * Read the way [app.pantopus.android.data.moments.MomentsFeature] reads `moments`: `GET /api/feature-flags/pulse_reinvented`
 * when someone signs in and every time the app comes to the foreground. The last answer is kept per account, so a
 * relaunch opens the right screens at once and the re-check follows; a failed read keeps the last answer, and a new
 * account starts from its own answer (off until the server says otherwise), never the previous account's.
 */
@Singleton
class PulseReinventedFeature
    @Inject
    constructor(
        private val api: MomentsApi,
        private val auth: AuthRepository,
        @ApplicationContext context: Context,
    ) {
        private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private val _on = MutableStateFlow(false)
        private var started = false

        @Volatile private var reading: Job? = null

        @Volatile private var userId: String? = null

        /** The new direction is on for the signed-in person (off while signed out). */
        val on: StateFlow<Boolean> = _on.asStateFlow()

        /** Starts following sign-in and sign-out. Safe to call more than once. */
        @Synchronized
        fun start() {
            if (started) return
            started = true
            scope.launch {
                auth.state.collect { state ->
                    val id = (state as? AuthRepository.State.SignedIn)?.user?.id
                    if (id == userId) return@collect
                    userId = id
                    if (id == null) {
                        reading?.cancel()
                        _on.value = false
                    } else {
                        _on.value = prefs.getBoolean(id, false)
                        refresh()
                    }
                }
            }
        }

        /** The app came to the foreground: read the switch again. */
        fun foregrounded() {
            if (userId != null) refresh()
        }

        /** Reads the switch now. */
        fun refresh() {
            val id = userId ?: return
            if (reading?.isActive == true) return
            reading =
                scope.launch {
                    val answer = (safeApiCall { api.flag(FLAG) } as? NetworkResult.Success)?.data?.enabled ?: return@launch
                    // An account switch while the read ran: its answer isn't this account's.
                    if (userId != id) return@launch
                    _on.value = answer
                    prefs.edit().putBoolean(id, answer).apply()
                }
        }

        companion object {
            /** The server switch's name (`FeatureFlag.name`). */
            const val FLAG = "pulse_reinvented"
            private const val PREFS = "pantopus.pulseReinvented.flag"
        }
    }
