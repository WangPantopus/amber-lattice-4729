package app.pantopus.android.data.guidance

import android.content.Context
import android.os.SystemClock
import app.pantopus.android.data.api.models.users.GuidanceDto
import app.pantopus.android.data.api.models.users.GuidanceShownRequest
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.UsersApi
import app.pantopus.android.data.auth.AuthRepository
import app.pantopus.android.data.network.NetworkMonitor
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

/** One closed card: how many times it closed, and when last (ISO time). */
data class GuidanceSeen(
    val times: Int,
    val lastAt: String?,
)

/**
 * What the guidance cards know about the signed-in account (founder 2026-11-16; `ui/guidance`).
 *
 * [enabled], [newAccount] and [business] come from the server's profile (the last answer is kept per account, so a
 * relaunch without a connection knows them). [seen] is the server's record of closed cards plus the closes this phone
 * hasn't sent yet ([pending]). The rest is kept on this phone: [opens] counts app opens for the account here, [visits]
 * counts arrivals on each tab's first screen, [flags] notes what the person did here (a glance row opened, a post made).
 */
data class GuidanceState(
    val userId: String,
    val loaded: Boolean,
    val enabled: Boolean,
    val newAccount: Boolean,
    val business: Boolean,
    val seen: Map<String, GuidanceSeen>,
    val pending: Map<String, Int>,
    val opens: Int,
    val openSerial: Int,
    val visits: Map<String, Int>,
    val flags: Set<String>,
    val lastCentreDay: String?,
) {
    fun hasSeen(id: String): Boolean = (seen[id]?.times ?: 0) > 0

    fun visitsTo(screen: String): Int = visits[screen] ?: 0
}

/**
 * The guidance cards' record for the signed-in account: the server's switch and seen map, read with the profile on
 * every app open (a cold start, or a return after 30 minutes in the background), and the closes made here, kept at
 * once on this phone and sent to `POST /api/users/guidance/shown` (retried quietly until the server has them). The
 * server's record wins: each read replaces the seen map, keeping only the closes not sent yet.
 */
@Singleton
@Suppress("TooManyFunctions")
class GuidanceRepository
    @Inject
    constructor(
        private val api: UsersApi,
        private val auth: AuthRepository,
        private val network: NetworkMonitor,
        @ApplicationContext context: Context,
    ) {
        private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private val sending = Mutex()
        private val _state = MutableStateFlow<GuidanceState?>(null)
        private var started = false
        private var openSerial = 0
        private var countedOpen = mutableMapOf<String, Int>()
        private var backgroundedAt: Long? = null
        private var otherCardOpen = 0

        /** The signed-in account's guidance; null while signed out. */
        val state: StateFlow<GuidanceState?> = _state.asStateFlow()

        /** Starts following sign-in and sign-out, and the connection coming back. Safe to call more than once. */
        @Synchronized
        fun start() {
            if (started) return
            started = true
            if (openSerial == 0) openSerial = 1
            scope.launch {
                auth.state.collect { auth ->
                    val id = (auth as? AuthRepository.State.SignedIn)?.user?.id
                    if (id == _state.value?.userId) return@collect
                    if (id == null) {
                        _state.value = null
                    } else {
                        _state.value = load(id)
                        countOpen()
                        refresh()
                    }
                }
            }
            scope.launch { network.isOnline.filter { it }.collect { flush() } }
        }

        /** The app came to the foreground: a cold start, or a return after 30 minutes away, is a new app open. */
        fun foregrounded() {
            val away = backgroundedAt?.let { SystemClock.elapsedRealtime() - it }
            backgroundedAt = null
            if (away == null || away < NEW_OPEN_AFTER_MS) return
            openSerial += 1
            countOpen()
            refresh()
        }

        /** The app went to the background (not a rotation). */
        fun backgrounded() {
            backgroundedAt = SystemClock.elapsedRealtime()
        }

        /** Reads the profile's `guidance` again, then sends what is waiting. */
        fun refresh() {
            val id = _state.value?.userId ?: return
            scope.launch {
                val result = safeApiCall { api.profile() }
                if (result !is NetworkResult.Success || _state.value?.userId != id) return@launch
                val guidance = result.data.guidance ?: GuidanceDto()
                applyServer(id, guidance, business = result.data.user.accountType == ACCOUNT_BUSINESS)
                flush()
            }
        }

        /** A card closed (by any of its ways): counted here at once, and sent to the server. */
        fun markSeen(card: String) {
            val now = Instant.now().toString()
            change { state ->
                val times = (state.seen[card]?.times ?: 0) + 1
                state.copy(
                    seen = state.seen + (card to GuidanceSeen(times, now)),
                    pending = state.pending + (card to (state.pending[card] ?: 0) + 1),
                )
            }
            scope.launch { flush() }
        }

        /** A card other than a tab's own showed in this app open: no other one until the next (spec §2). */
        fun markOtherCardShown() {
            otherCardOpen = openSerial
        }

        fun otherCardShownThisOpen(): Boolean = otherCardOpen == openSerial

        /** A centre card showed today (reminders never show on such a day). */
        fun markCentreCardDay() {
            change { it.copy(lastCentreDay = LocalDate.now().toString()) }
        }

        /** One more arrival on [screen]'s first screen. */
        fun visit(screen: String) {
            change { it.copy(visits = it.visits + (screen to it.visitsTo(screen) + 1)) }
        }

        /** Notes that the person did [flag] on this phone (a glance row opened, a post made). */
        fun note(flag: String) {
            if (_state.value?.flags?.contains(flag) != false) return
            change { it.copy(flags = it.flags + flag) }
        }

        private fun countOpen() {
            val id = _state.value?.userId ?: return
            if (countedOpen[id] == openSerial) return
            countedOpen[id] = openSerial
            change { it.copy(opens = it.opens + 1, openSerial = openSerial) }
        }

        private fun applyServer(
            id: String,
            guidance: GuidanceDto,
            business: Boolean,
        ) {
            change(id) { state ->
                val server = guidance.seen.mapValues { (_, seen) -> GuidanceSeen(seen.times, seen.lastAt) }
                val unsent = state.pending.keys.mapNotNull { key -> state.seen[key]?.let { key to it } }.toMap()
                state.copy(
                    loaded = true,
                    enabled = guidance.enabled,
                    newAccount = guidance.newAccount,
                    business = business,
                    seen = server + unsent,
                )
            }
        }

        /** Sends each waiting close; stops at the first failure that a later try could fix. */
        private suspend fun flush() {
            sending.withLock {
                while (true) {
                    val state = _state.value ?: return
                    val card = state.pending.entries.firstOrNull { it.value > 0 }?.key ?: return
                    when (val result = safeApiCall { api.guidanceShown(GuidanceShownRequest(card)) }) {
                        is NetworkResult.Success -> {
                            dropPending(state.userId, card, all = false)
                            applyServer(state.userId, result.data.guidance, state.business)
                        }
                        is NetworkResult.Failure -> {
                            val error = result.error
                            // An id the server doesn't know (400), or the switch off (404): sending again can't help.
                            if (error is NetworkError.ClientError && error.code == HTTP_BAD_REQUEST || error is NetworkError.NotFound) {
                                dropPending(state.userId, card, all = true)
                            } else {
                                return
                            }
                        }
                    }
                }
            }
        }

        /** One close of [card] reached the server (or [all] of them can never reach it). */
        private fun dropPending(
            id: String,
            card: String,
            all: Boolean,
        ) {
            change(id) { state ->
                val left = if (all) 0 else (state.pending[card] ?: 0) - 1
                state.copy(pending = if (left > 0) state.pending + (card to left) else state.pending - card)
            }
        }

        private fun change(
            id: String? = null,
            transform: (GuidanceState) -> GuidanceState,
        ) {
            var saved: GuidanceState? = null
            _state.update { current ->
                if (current == null || (id != null && current.userId != id)) return@update current
                transform(current).also { saved = it }
            }
            saved?.let(::save)
        }

        private fun load(id: String): GuidanceState {
            val json = prefs.getString(id, null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject()
            return GuidanceState(
                userId = id,
                loaded = json.optBoolean(K_LOADED, false),
                enabled = json.optBoolean(K_ENABLED, false),
                newAccount = json.optBoolean(K_NEW, false),
                business = json.optBoolean(K_BUSINESS, false),
                seen =
                    json.optJSONObject(K_SEEN)?.let { seen ->
                        seen.keyList().associateWith { key ->
                            val entry = seen.optJSONObject(key)
                            GuidanceSeen(entry?.optInt("times", 1) ?: 1, entry?.optString("last_at")?.takeIf { it.isNotEmpty() })
                        }
                    }.orEmpty(),
                pending = json.optJSONObject(K_PENDING)?.let { p -> p.keyList().associateWith { p.optInt(it) } }.orEmpty(),
                opens = json.optInt(K_OPENS, 0),
                openSerial = openSerial,
                visits = json.optJSONObject(K_VISITS)?.let { v -> v.keyList().associateWith { v.optInt(it) } }.orEmpty(),
                flags =
                    json.optJSONArray(K_FLAGS)?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() }.orEmpty(),
                lastCentreDay = json.optString(K_CENTRE_DAY).takeIf { it.isNotEmpty() },
            )
        }

        private fun save(state: GuidanceState) {
            val json =
                JSONObject()
                    .put(K_LOADED, state.loaded)
                    .put(K_ENABLED, state.enabled)
                    .put(K_NEW, state.newAccount)
                    .put(K_BUSINESS, state.business)
                    .put(
                        K_SEEN,
                        JSONObject().apply {
                            state.seen.forEach { (key, seen) ->
                                put(key, JSONObject().put("times", seen.times).put("last_at", seen.lastAt.orEmpty()))
                            }
                        },
                    ).put(K_PENDING, JSONObject(state.pending))
                    .put(K_OPENS, state.opens)
                    .put(K_VISITS, JSONObject(state.visits))
                    .put(K_FLAGS, org.json.JSONArray(state.flags.toList()))
                    .put(K_CENTRE_DAY, state.lastCentreDay.orEmpty())
            prefs.edit().putString(state.userId, json.toString()).apply()
        }

        private companion object {
            const val PREFS = "pantopus_guidance"
            const val ACCOUNT_BUSINESS = "business"
            const val HTTP_BAD_REQUEST = 400

            /** A return after this long in the background is a new app open (spec §2). */
            const val NEW_OPEN_AFTER_MS = 30 * 60 * 1000L
            const val K_LOADED = "loaded"
            const val K_ENABLED = "enabled"
            const val K_NEW = "new_account"
            const val K_BUSINESS = "business"
            const val K_SEEN = "seen"
            const val K_PENDING = "pending"
            const val K_OPENS = "opens"
            const val K_VISITS = "visits"
            const val K_FLAGS = "flags"
            const val K_CENTRE_DAY = "centre_day"
        }
    }

private fun JSONObject.keyList(): List<String> = keys().asSequence().map { it.toString() }.toList()
