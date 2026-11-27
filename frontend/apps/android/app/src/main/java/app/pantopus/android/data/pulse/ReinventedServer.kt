package app.pantopus.android.data.pulse

import android.os.SystemClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Whether the server knows the new Pulse tab's routes (PHASE-1 §3, "an older server"). The apps are released before
 * the server catches up, in staging and in production: a 404 from one of the routes marks the server behind, and
 * today's Pulse shows at once, as on `403 PULSE_REINVENTED_OFF`. It is asked again later: once a minute has passed, the
 * next time the Pulse tab opens or the app comes back to the foreground ([retryIfDue]).
 */
@Singleton
class ReinventedServer
    @Inject
    constructor() {
        private val _behind = MutableStateFlow(false)

        /** Today's Pulse shows while this is true. */
        val behind: StateFlow<Boolean> = _behind.asStateFlow()

        @Volatile private var markedAt = 0L

        /** A route answered 404. */
        fun markBehind() {
            markedAt = SystemClock.elapsedRealtime()
            _behind.value = true
        }

        /** A route answered: the server has them. */
        fun caughtUp() {
            if (_behind.value) _behind.value = false
        }

        /** The tab opened or the app came back: a minute after the 404, the new Pulse is tried again. */
        fun retryIfDue() {
            if (_behind.value && SystemClock.elapsedRealtime() - markedAt >= RETRY_MS) _behind.value = false
        }

        private companion object {
            const val RETRY_MS = 60_000L
        }
    }
