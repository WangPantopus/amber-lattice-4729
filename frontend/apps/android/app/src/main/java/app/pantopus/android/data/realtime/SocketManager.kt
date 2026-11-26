package app.pantopus.android.data.realtime

import app.pantopus.android.BuildConfig
import app.pantopus.android.data.api.net.UtcTimestamps
import app.pantopus.android.data.auth.AuthRepository
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Socket.IO client wrapper.
 *
 * - [connect] / [disconnect] manage session lifecycle; [backgrounded] /
 *   [foregrounded] pause and resume the transport when the app enters/leaves
 *   the background.
 * - [connectionState] is a StateFlow so the UI can react.
 * - [eventsOf] exposes a given event as a cold Flow of JSON payloads that
 *   follows the current socket, so a token refresh (which replaces the socket)
 *   doesn't leave open screens listening to a dead one.
 * - [sessionRevoked] surfaces the server's `auth:session_revoked` push and
 *   terminal revocation connect errors.
 */
@Singleton
class SocketManager
    @Inject
    constructor(
        private val authRepository: dagger.Lazy<AuthRepository>,
    ) {
        enum class ConnectionState { Disconnected, Connecting, Connected }

        private val _connectionState = MutableStateFlow(ConnectionState.Disconnected)
        val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

        /**
         * `auth:session_revoked { sessionId, reason, code:"SESSION_REVOKED" }`
         * from `backend/socket/chatSocketio.js` — the server revoked this
         * session (device removed, revoke-others/all, password reset, …) and
         * is about to disconnect us.
         *
         * The socket is NEVER the authority (design §7.7): the collector
         * confirms with a `/refresh` probe and only signs out when the server
         * answers 401. Mirrors iOS `SocketClient.stopForRevocation` →
         * `AuthManager.confirmSessionAfterRevocationSignal()`.
         *
         * A hot flow (not [eventsOf]) so the listener is registered with the
         * socket itself and survives reconnects; the buffer lets a signal that
         * arrives before the collector attaches still be delivered.
         */
        private val _sessionRevoked = MutableSharedFlow<Unit>(replay = 1, extraBufferCapacity = 1)
        val sessionRevoked: SharedFlow<Unit> = _sessionRevoked.asSharedFlow()

        private val stateLock = Any()
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        // The live socket, observable so [eventsOf] collectors re-attach when
        // [connect] replaces it after a token refresh.
        private val currentSocket = MutableStateFlow<Socket?>(null)
        private var socket: Socket?
            get() = currentSocket.value
            set(value) {
                currentSocket.value = value
            }
        private var authToken: String? = null
        private var connectionGeneration = 0L
        private var stoppedForRevocation = false
        private var backgrounded = false
        private var backgroundDisconnectJob: Job? = null
        private var pausedInBackground = false

        // At most one auth refresh until a socket actually authenticates, so a
        // rejected replacement token cannot spin an unbounded refresh/reconnect loop.
        private var attemptedAuthRecovery = false
        private var transientRecoveryRetries = 0
        private var authRecoveryJob: Job? = null

        fun connect(token: String) {
            var oldSocket: Socket? = null
            var socketToConnect: Socket? = null
            synchronized(stateLock) {
                if (authToken == token && socket != null) {
                    if (stoppedForRevocation || backgrounded) return
                    val existing = socket
                    if (existing != null && !existing.connected()) {
                        _connectionState.value = ConnectionState.Connecting
                        socketToConnect = existing
                    }
                } else {
                    oldSocket = socket
                    val freshSession = authToken == null
                    connectionGeneration += 1
                    authRecoveryJob?.cancel()
                    authRecoveryJob = null
                    socket = null
                    authToken = token
                    stoppedForRevocation = false
                    // A revocation signal for the old token must not send a later collector to /refresh.
                    _sessionRevoked.resetReplayCache()
                    if (freshSession) {
                        attemptedAuthRecovery = false
                        transientRecoveryRetries = 0
                    }
                    if (backgrounded) {
                        _connectionState.value = ConnectionState.Disconnected
                    } else {
                        val next = buildSocket(token, connectionGeneration)
                        // Publish before connecting so collectors are listening when the rooms rejoin.
                        socket = next
                        _connectionState.value = ConnectionState.Connecting
                        socketToConnect = next
                    }
                }
            }
            oldSocket?.disconnect()
            oldSocket?.off()
            socketToConnect?.connect()
        }

        /**
         * Pause the socket transport while the app is in the background to
         * avoid idle keepalive / reconnect battery drain. Keeps the session
         * token and registered event listeners intact for [foregrounded].
         * Waits [BACKGROUND_GRACE_MS] first, so a short trip out (photo picker,
         * camera, a browser tab, a payment sheet) keeps the live connection.
         */
        fun backgrounded() {
            synchronized(stateLock) {
                backgrounded = true
                authRecoveryJob?.cancel()
                authRecoveryJob = null
                backgroundDisconnectJob?.cancel()
                backgroundDisconnectJob =
                    scope.launch {
                        delay(BACKGROUND_GRACE_MS)
                        synchronized(stateLock) {
                            if (!backgrounded) return@launch
                            backgroundDisconnectJob = null
                            pausedInBackground = true
                            _connectionState.value = ConnectionState.Disconnected
                            // Queued on socket.io's event thread under the lock, so a later
                            // foregrounded() connect() is always queued after it.
                            socket?.disconnect()
                        }
                    }
            }
        }

        /** Resume the socket when the app returns to the foreground. */
        fun foregrounded() {
            var pausedSocket: Socket? = null
            val tokenForFreshSocket =
                synchronized(stateLock) {
                    backgrounded = false
                    backgroundDisconnectJob?.cancel()
                    backgroundDisconnectJob = null
                    val wasPaused = pausedInBackground
                    pausedInBackground = false
                    attemptedAuthRecovery = false
                    transientRecoveryRetries = 0
                    if (stoppedForRevocation) return
                    if (socket == null) {
                        authToken
                    } else {
                        // Its disconnect may still be queued, so connected() can read true: connect it regardless.
                        if (wasPaused) pausedSocket = socket
                        null
                    }
                }
            val paused = pausedSocket
            if (tokenForFreshSocket != null) {
                connect(tokenForFreshSocket)
            } else if (paused != null) {
                _connectionState.value = ConnectionState.Connecting
                paused.connect()
            } else {
                reconnectNow()
            }
        }

        /**
         * Reconnect at once when the network returns or the app comes back, instead of waiting out socket.io's
         * reconnection backoff (up to several seconds). socket.io ignores connect() while it backs off; closing first
         * resets that backoff and keeps automatic reconnection for later drops. Never replaces the socket or its token.
         */
        fun reconnectNow() {
            val s =
                synchronized(stateLock) {
                    if (backgrounded || stoppedForRevocation) return
                    socket
                } ?: return
            if (s.connected()) return
            if (s.io().isReconnecting) s.disconnect()
            _connectionState.value = ConnectionState.Connecting
            s.connect()
        }

        fun disconnect() {
            val oldSocket =
                synchronized(stateLock) {
                    connectionGeneration += 1
                    authRecoveryJob?.cancel()
                    authRecoveryJob = null
                    attemptedAuthRecovery = false
                    transientRecoveryRetries = 0
                    stoppedForRevocation = false
                    val existing = socket
                    socket = null
                    authToken = null
                    // A stale revocation signal must not fire against the next session.
                    _sessionRevoked.resetReplayCache()
                    _connectionState.value = ConnectionState.Disconnected
                    existing
                }
            oldSocket?.disconnect()
            oldSocket?.off()
        }

        /**
         * Listen to [event] as a cold Flow of JSONObject payloads.
         * Collectors are responsible for parsing the JSON into their own types.
         * The listener moves to each new socket: [connect] with a refreshed
         * token replaces the socket, and `disconnect()` strips the old one's
         * listeners, which used to leave open chats silently deaf.
         */
        @OptIn(ExperimentalCoroutinesApi::class)
        fun eventsOf(event: String): Flow<JSONObject> =
            currentSocket.flatMapLatest { s ->
                if (s == null) {
                    emptyFlow()
                } else {
                    callbackFlow {
                        val listener =
                            io.socket.emitter.Emitter.Listener { args ->
                                if (s === socket) {
                                    (args.firstOrNull() as? JSONObject)?.let { trySend(UtcTimestamps.normalizeInPlace(it)) }
                                }
                            }
                        s.on(event, listener)
                        awaitClose { s.off(event, listener) }
                    }
                }
            }

        /** Attach an account guard before listening and capture access before buffering each event. */
        @OptIn(ExperimentalCoroutinesApi::class)
        fun <T> scopedEventsOf(
            event: String,
            capture: () -> (() -> T),
        ): Flow<Pair<JSONObject, T>> =
            currentSocket.flatMapLatest { s ->
                if (s == null) {
                    emptyFlow()
                } else {
                    val captureEvent = capture()
                    callbackFlow {
                        val listener =
                            io.socket.emitter.Emitter.Listener { args ->
                                if (s === socket) {
                                    (args.firstOrNull() as? JSONObject)?.let {
                                        trySend(
                                            UtcTimestamps.normalizeInPlace(it) to captureEvent(),
                                        )
                                    }
                                }
                            }
                        s.on(event, listener)
                        awaitClose { s.off(event, listener) }
                    }
                }
            }

        fun emit(
            event: String,
            payload: JSONObject,
        ) {
            socket?.emit(event, payload)
        }

        suspend fun emitWithAck(
            event: String,
            payload: JSONObject,
            timeoutMs: Long = 5_000,
            cancelEvent: String? = null,
        ): JSONObject? {
            val s = socket ?: return null
            return withTimeoutOrNull(timeoutMs) {
                suspendCancellableCoroutine { continuation ->
                    s.emit(
                        event,
                        payload,
                        Ack { args ->
                            val response = (args.firstOrNull() as? JSONObject)?.let(UtcTimestamps::normalizeInPlace)
                            if (continuation.isActive) continuation.resume(response)
                        },
                    )
                    // Register after emit so cancellation cannot send leave before the matching join.
                    continuation.invokeOnCancellation { cancelEvent?.let { s.emit(it, payload) } }
                }
            }
        }

        private fun buildSocket(
            token: String,
            generation: Long,
        ): Socket {
            val options =
                IO.Options
                    .builder()
                    .setAuth(mapOf("token" to token))
                    .setReconnection(true)
                    .setReconnectionDelay(RECONNECTION_DELAY_MS)
                    .setReconnectionDelayMax(RECONNECTION_DELAY_MAX_MS)
                    .setReconnectionAttempts(Integer.MAX_VALUE)
                    .setExtraHeaders(mapOf("Authorization" to listOf("Bearer $token")))
                    .build()

            return IO.socket(BuildConfig.PANTOPUS_SOCKET_URL, options).apply {
                on(Socket.EVENT_CONNECT) {
                    val isCurrent =
                        synchronized(stateLock) {
                            if (connectionGeneration != generation) {
                                false
                            } else {
                                attemptedAuthRecovery = false
                                transientRecoveryRetries = 0
                                _connectionState.value = ConnectionState.Connected
                                true
                            }
                        }
                    if (isCurrent) Timber.i("Socket connected")
                }
                on(Socket.EVENT_DISCONNECT) {
                    val isCurrent =
                        synchronized(stateLock) {
                            if (connectionGeneration != generation) {
                                false
                            } else {
                                _connectionState.value = ConnectionState.Disconnected
                                true
                            }
                        }
                    if (isCurrent) Timber.i("Socket disconnected")
                }
                on(Socket.EVENT_CONNECT_ERROR) { args ->
                    if (synchronized(stateLock) { connectionGeneration != generation }) return@on
                    val message = extractErrorMessage(args)
                    Timber.w("Socket connect error: %s", message)
                    handleConnectError(message, generation)
                }
                on(EVENT_SESSION_REVOKED) { args ->
                    if (synchronized(stateLock) { connectionGeneration != generation }) return@on
                    Timber.i("Socket session revoked: ${args.joinToString()}")
                    stopForRevocation(reason = EVENT_SESSION_REVOKED, emitRevokedSignal = true, generation = generation)
                }
            }
        }

        private fun handleConnectError(
            message: String,
            generation: Long,
        ) {
            val lower = message.lowercase()
            if (TERMINAL_AUTH_ERROR_MARKERS.any { lower.contains(it) }) {
                stopForRevocation(reason = message, emitRevokedSignal = true, generation = generation)
                return
            }
            if (REFRESHABLE_AUTH_ERROR_MARKERS.none { lower.contains(it) }) return
            val staleToken =
                synchronized(stateLock) {
                    val canRecover =
                        connectionGeneration == generation &&
                            authRecoveryJob?.isActive != true &&
                            !attemptedAuthRecovery &&
                            !stoppedForRevocation &&
                            !backgrounded &&
                            socket != null
                    if (!canRecover) return
                    attemptedAuthRecovery = true
                    authToken
                }
            val job =
                scope.launch {
                    recoverAuth(staleToken, generation)
                }
            synchronized(stateLock) {
                if (connectionGeneration == generation && !stoppedForRevocation && !backgrounded) {
                    authRecoveryJob = job
                } else {
                    job.cancel()
                }
            }
        }

        private suspend fun recoverAuth(
            staleToken: String?,
            generation: Long,
        ) {
            when (val outcome = authRepository.get().refreshTokens()) {
                is AuthRepository.RefreshOutcome.Rotated -> {
                    val shouldReconnect =
                        synchronized(stateLock) {
                            connectionGeneration == generation &&
                                !stoppedForRevocation &&
                                !backgrounded &&
                                outcome.accessToken != staleToken
                        }
                    if (shouldReconnect) {
                        Timber.i("Socket auth error — token refreshed, reconnecting")
                        connect(outcome.accessToken)
                    }
                }
                is AuthRepository.RefreshOutcome.AuthRejected -> {
                    val isSameSession =
                        synchronized(stateLock) {
                            connectionGeneration == generation && authToken == staleToken
                        }
                    if (isSameSession) {
                        Timber.w("Socket auth error — refresh rejected (%s)", outcome.reason.code.orEmpty())
                        stopForRevocation(
                            reason = "refresh_rejected:${outcome.reason.code.orEmpty()}",
                            emitRevokedSignal = false,
                            generation = generation,
                        )
                        authRepository.get().signOut(reason = outcome.reason)
                    }
                }
                AuthRepository.RefreshOutcome.Transient -> retryAfterTransientFailure(generation)
            }
        }

        private suspend fun retryAfterTransientFailure(generation: Long) {
            Timber.i("Socket auth error — refresh transient failure; backing off before retry")
            val canRetry =
                synchronized(stateLock) {
                    connectionGeneration == generation &&
                        !stoppedForRevocation &&
                        !backgrounded &&
                        transientRecoveryRetries < MAX_TRANSIENT_RECOVERY_RETRIES
                }
            if (canRetry) {
                delay(TRANSIENT_RECOVERY_BACKOFF_MS)
                val retry =
                    synchronized(stateLock) {
                        val stillCurrent = connectionGeneration == generation && !stoppedForRevocation && !backgrounded
                        if (stillCurrent) {
                            transientRecoveryRetries += 1
                            attemptedAuthRecovery = false
                            // This job is done: the retry's connect error may start the next recovery.
                            authRecoveryJob = null
                        }
                        stillCurrent
                    }
                // The server refused the handshake, so socket.io won't retry on its own: reconnect, and a
                // second auth error refreshes again (at most MAX_TRANSIENT_RECOVERY_RETRIES times).
                if (retry) reconnectNow()
            }
        }

        private fun stopForRevocation(
            reason: String,
            emitRevokedSignal: Boolean,
            generation: Long,
        ) {
            val toDisconnect =
                synchronized(stateLock) {
                    // Checked under the same lock as the stop, so a socket replaced meanwhile can't stop the new one.
                    if (stoppedForRevocation || connectionGeneration != generation) return
                    stoppedForRevocation = true
                    authRecoveryJob?.cancel()
                    authRecoveryJob = null
                    _connectionState.value = ConnectionState.Disconnected
                    socket
                }
            Timber.w("Socket stopped — session/device revoked (%s)", reason)
            toDisconnect?.disconnect()
            if (emitRevokedSignal) _sessionRevoked.tryEmit(Unit)
        }

        companion object {
            /** `backend/socket/chatSocketio.js` — emitted just before the kick. */
            const val EVENT_SESSION_REVOKED = "auth:session_revoked"

            private const val RECONNECTION_DELAY_MS = 2_000L
            private const val RECONNECTION_DELAY_MAX_MS = 5_000L
            private const val TRANSIENT_RECOVERY_BACKOFF_MS = 10_000L
            private const val BACKGROUND_GRACE_MS = 30_000L
            private const val MAX_TRANSIENT_RECOVERY_RETRIES = 3

            /**
             * Server-side auth errors that mean "refresh the token and reconnect"
             * (`backend/socket/chatSocketio.js` `io.use` middleware; mirrors iOS
             * `SocketClient.refreshableAuthErrorMarkers`).
             */
            private val REFRESHABLE_AUTH_ERROR_MARKERS =
                listOf(
                    "authentication required",
                    "invalid token",
                    "authentication failed",
                    "unauthorized",
                    "jwt expired",
                    "token expired",
                    "token_reuse",
                    "dpop_",
                )

            /**
             * Terminal revocation errors: stop reconnecting and trigger HTTP
             * revocation confirmation (mirrors iOS `SocketClient.terminalAuthErrorMarkers`
             * plus backend `Session revoked`).
             */
            private val TERMINAL_AUTH_ERROR_MARKERS =
                listOf(
                    "device_revoked",
                    "session_revoked",
                    "device revoked",
                    "session revoked",
                )
        }
    }

private fun extractErrorMessage(args: Array<out Any?>): String {
    val first = args.firstOrNull() ?: return ""
    return when (first) {
        is String -> first
        is JSONObject ->
            listOf("message", "code", "error")
                .mapNotNull { key -> first.optString(key).takeIf(String::isNotBlank) }
                .joinToString(" ")
                .ifBlank { first.toString() }
        is Throwable ->
            listOfNotNull(first.message, first.cause?.message)
                .joinToString(" ")
                .ifBlank { first.toString() }
        else -> first.toString()
    }
}
