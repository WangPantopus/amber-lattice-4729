package app.pantopus.android.data.profile

import android.os.SystemClock
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.ProfilePageApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.YearMonth
import javax.inject.Inject
import javax.inject.Singleton

/** A person's outer ring (board 6): the first month on record and whether anything is Seen. */
data class ProfileMark(
    val since: YearMonth,
    val seen: Boolean,
)

/**
 * The outer ring of each person's mark, for the avatars the app draws (board 6), read the way Moments reads its rings
 * (`MomentsPeopleRings`): a circle that comes on screen asks about its person, the asks of one screenful go to the
 * server together (`GET /api/profile-page/marks`, at most 100 ids), and an answer is kept for a minute (contract §7). The server
 * leaves out anyone the viewer may not see; such a person, and everyone while the switch is off, simply has no ring.
 * Used from the main thread only.
 */
@Singleton
class ProfileMarks
    @Inject
    constructor(
        private val api: ProfilePageApi,
    ) {
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        private val _marks = MutableStateFlow<Map<String, ProfileMark>>(emptyMap())

        /** The mark of each person the server answered for, by account id. */
        val marks: StateFlow<Map<String, ProfileMark>> = _marks.asStateFlow()

        private var account: String? = null
        private val answeredAt = HashMap<String, Long>()
        private val waiting = LinkedHashSet<String>()
        private var sending: Job? = null

        /** A server without the route (404): it isn't asked again until the app starts again. */
        private var unsupported = false

        /** A circle showing [userId] is on screen for [viewerId]: its mark is read unless it was read lately. */
        fun want(
            userId: String,
            viewerId: String?,
        ) {
            if (userId.isBlank() || viewerId.isNullOrBlank() || unsupported) return
            if (viewerId != account) reset(viewerId)
            val at = answeredAt[userId]
            if (at != null && SystemClock.elapsedRealtime() - at < KEEP_MS) return
            waiting += userId
            gather()
        }

        /** Another account signed in: nothing read for the last one is shown to this one. */
        private fun reset(newAccount: String) {
            account = newAccount
            unsupported = false
            _marks.value = emptyMap()
            answeredAt.clear()
            waiting.clear()
            sending?.cancel()
            sending = null
        }

        private fun gather() {
            if (sending != null) return
            val asker = account
            sending =
                scope.launch {
                    delay(GATHER_MS)
                    send(asker)
                    sending = null
                    if (waiting.isNotEmpty() && asker == account) gather()
                }
        }

        private suspend fun send(asker: String?) {
            val ids = waiting.take(MOST_PER_REQUEST)
            waiting.removeAll(ids.toSet())
            if (ids.isEmpty() || asker != account) return
            val now = SystemClock.elapsedRealtime()
            ids.forEach { answeredAt[it] = now }
            when (val result = safeApiCall { api.marks(ids.joinToString(",")) }) {
                is NetworkResult.Success -> {
                    if (asker != account) return
                    val answered =
                        result.data.marks
                            .orEmpty()
                            .mapNotNull { dto ->
                                val id = dto.userId?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                                val since = dto.since?.let { runCatching { YearMonth.parse(it.take(SINCE_CHARS)) }.getOrNull() }
                                since?.let { id to ProfileMark(it, dto.seen == true) }
                            }.toMap()
                    _marks.update { current -> current - ids.toSet() + answered }
                }
                is NetworkResult.Failure ->
                    if (result.error is NetworkError.NotFound) {
                        unsupported = true
                    } else {
                        ids.forEach { answeredAt.remove(it) }
                    }
            }
        }

        private companion object {
            const val KEEP_MS = 60_000L
            const val GATHER_MS = 120L
            const val MOST_PER_REQUEST = 100
            const val SINCE_CHARS = 7
        }
    }
