@file:Suppress("PackageNaming", "TooManyFunctions")

package app.pantopus.android.core.routing

import android.content.Context
import android.content.SharedPreferences
import android.os.Looper
import androidx.annotation.VisibleForTesting
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.ProviderException

@JsonClass(generateAdapter = true)
internal data class PendingContentArrival(
    val version: Int = 1,
    val path: String,
    val timestampMs: Long,
    val expectedUserId: String?,
    val awaitingReauthentication: Boolean = false,
)

/** Device-only encrypted handoff. Legacy links migrate without extending their original lifetime. */
@Suppress("TooManyFunctions")
object PendingDeepLinkStore {
    private val adapter = Moshi.Builder().build().adapter(PendingContentArrival::class.java).serializeNulls()
    private val storage = PendingContentArrivalPreferences()

    /**
     * Single-lane IO dispatcher so Keystore / `EncryptedSharedPreferences`
     * work never touches the Main thread and queued handoffs (e.g. cold-start
     * stash in `MainActivity` followed by post-login `takeAsync` in
     * `PantopusNavHost`) preserve strict FIFO order.
     */
    internal val ioDispatcher: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(1)
    private val ioScope = CoroutineScope(SupervisorJob() + ioDispatcher)

    fun init(context: Context) {
        storage.init(context)
        ioScope.launch { storage.warmUp() }
    }

    /** No write succeeds unless the original is durably protected. */
    @Synchronized
    fun stash(
        path: String,
        expectedUserId: String? = null,
    ): Boolean =
        safely(false) {
            val trimmed = path.trim()
            if (trimmed.isEmpty()) return@safely false
            val arrival = PendingContentArrival(path = trimmed, timestampMs = System.currentTimeMillis(), expectedUserId = expectedUserId)
            if (!storage.write(adapter.toJson(arrival))) return@safely false
            storage.clearLegacy()
            true
        }

    suspend fun stashAsync(
        path: String,
        expectedUserId: String? = null,
    ): Boolean = withContext(ioDispatcher) { stash(path, expectedUserId) }

    @Synchronized
    fun peek(now: Long = System.currentTimeMillis()): String? = safely(null) { read(now)?.path }

    suspend fun peekAsync(now: Long = System.currentTimeMillis()): String? = withContext(ioDispatcher) { peek(now) }

    @Synchronized
    fun take(
        userId: String? = null,
        now: Long = System.currentTimeMillis(),
    ): String? =
        safely(null) {
            val arrival = read(now) ?: return@safely null
            if (!storage.clearProtected()) return@safely null
            arrival.path.takeIf { arrival.expectedUserId == null || arrival.expectedUserId == userId }
        }

    suspend fun takeAsync(
        userId: String? = null,
        now: Long = System.currentTimeMillis(),
    ): String? = withContext(ioDispatcher) { take(userId, now) }

    /**
     * A content link opened while a stored session was still hydrating (cold
     * start) is stashed unbound: the router cannot know the account yet. When
     * that hydration ends the stored session, the link belongs to that stored
     * account, so bind it before [retainForReauthentication] — only the same
     * account's re-sign-in can then replay it.
     */
    @Synchronized
    fun adoptHydrationArrival(userId: String?) {
        safely(Unit) {
            val arrival = read(System.currentTimeMillis()) ?: return@safely
            if (userId != null && arrival.expectedUserId == null) {
                storage.write(adapter.toJson(arrival.copy(expectedUserId = userId)))
            }
        }
    }

    @Synchronized
    fun retainForReauthentication(userId: String?) {
        safely(Unit) {
            val arrival = read(System.currentTimeMillis())
            if (arrival == null || userId == null || arrival.expectedUserId != userId) {
                storage.clearProtected()
            } else {
                storage.write(adapter.toJson(arrival.copy(awaitingReauthentication = true)))
            }
        }
    }

    @Synchronized
    internal fun completeArrival(
        userId: String,
        matches: (String) -> Boolean,
    ) {
        safely(Unit) {
            val arrival = read(System.currentTimeMillis()) ?: return@safely
            if (arrival.expectedUserId == userId && !arrival.awaitingReauthentication && matches(arrival.path)) storage.clearProtected()
        }
    }

    @Synchronized
    fun clear() {
        safely(Unit) { storage.clearProtected() }
    }

    suspend fun clearAsync() = withContext(ioDispatcher) { clear() }

    /**
     * Run [action] on [ioDispatcher] when invoked on the Android Main thread
     * against real storage, and inline otherwise (background threads and
     * in-memory JVM unit tests).
     */
    internal fun runOffMainIfNeeded(action: () -> Unit) {
        if (!storage.isTestBound && isMainThread()) {
            ioScope.launch { action() }
        } else {
            action()
        }
    }

    private fun isMainThread(): Boolean = runCatching { Looper.myLooper() == Looper.getMainLooper() }.getOrDefault(false)

    private fun read(now: Long): PendingContentArrival? {
        val bytes = storage.raw()
        val arrival =
            if (bytes != null) {
                // Corrupt or unavailable protected state never falls back to an older plaintext link.
                checkNotNull(adapter.fromJson(bytes)).also { check(it.version == 1 && it.path.isNotBlank()) }
            } else {
                storage.migrate(adapter, now) ?: return null
            }
        if (!arrival.isFresh(now)) {
            storage.clearProtected()
            return null
        }
        return arrival
    }

    private inline fun <T> safely(
        fallback: T,
        action: () -> T,
    ): T =
        try {
            action()
        } catch (_: Exception) {
            fallback
        }

    @VisibleForTesting
    @Synchronized
    internal fun bindForTesting(
        protected: SharedPreferences,
        oldPreferences: SharedPreferences? = null,
    ) {
        storage.bindForTesting(protected, oldPreferences)
    }
}

private const val ARRIVAL_TTL_MS = 24L * 60L * 60L * 1000L
private const val LEGACY_PREFS_FILE = "pantopus_pending_deep_link"
private const val PROTECTED_PREFS_FILE = "private_pending_deep_link_v1"
private const val ANDROID_KEYSTORE = "AndroidKeyStore"

private fun PendingContentArrival.isFresh(now: Long): Boolean = timestampMs > 0L && now - timestampMs <= ARRIVAL_TTL_MS

/** Owns durable preference writes, their uncertain memory cache and legacy migration. */
private class PendingContentArrivalPreferences {
    private val lock = Any()

    @Volatile
    var isTestBound: Boolean = false
        private set

    @Volatile
    private var context: Context? = null

    @Volatile
    private var prefs: SharedPreferences? = null

    @Volatile
    private var legacy: SharedPreferences? = null

    private var uncertain = false
    private var uncertainValue: String? = null

    fun init(context: Context) {
        synchronized(lock) {
            if (this.context != null) return
            this.context = context.applicationContext
        }
    }

    fun warmUp() {
        if (isTestBound || prefs != null) return
        runCatching {
            legacyPrefs()
            protected()
        }.onFailure { Timber.w(it, "PendingDeepLinkStore warm-up failed") }
    }

    fun migrate(
        adapter: com.squareup.moshi.JsonAdapter<PendingContentArrival>,
        now: Long,
    ): PendingContentArrival? {
        val old = legacyPrefs() ?: return null
        val path = old.getString("path", null)?.takeIf(String::isNotBlank) ?: return null
        val record =
            PendingContentArrival(
                path = path,
                timestampMs = old.getLong("timestamp_ms", 0L),
                expectedUserId = old.getString("expected_user_id", null),
                awaitingReauthentication = old.getBoolean("awaiting_reauthentication", false),
            )
        if (!record.isFresh(now)) {
            clearLegacy()
            return null
        }
        return if (write(adapter.toJson(record))) {
            clearLegacy()
            record
        } else {
            null
        }
    }

    fun raw(): String? = if (uncertain) uncertainValue else protected().getString("arrival-v1", null)

    fun write(value: String?): Boolean {
        val previous = raw()
        val edit = protected().edit()
        if (value == null) edit.remove("arrival-v1") else edit.putString("arrival-v1", value)
        if (!edit.commit()) {
            // A failed commit can still replace the SharedPreferences memory cache.
            uncertain = true
            uncertainValue = previous
            return false
        }
        uncertain = false
        uncertainValue = null
        return true
    }

    fun clearProtected(): Boolean = clearLegacy() && write(null)

    fun clearLegacy(): Boolean = legacyPrefs()?.let { if (it.all.isEmpty()) true else it.edit().clear().commit() } ?: true

    private fun legacyPrefs(): SharedPreferences? {
        legacy?.let { return it }
        if (isTestBound) return null
        val app = context ?: return null
        return synchronized(lock) {
            legacy?.let { return@synchronized it }
            if (isTestBound) return@synchronized null
            app.getSharedPreferences(LEGACY_PREFS_FILE, Context.MODE_PRIVATE).also { legacy = it }
        }
    }

    private fun protected(): SharedPreferences {
        prefs?.let { return it }
        return synchronized(lock) {
            prefs?.let { return@synchronized it }
            val app = checkNotNull(context)
            openProtectedWithRecovery(app).also { prefs = it }
        }
    }

    private fun openProtectedWithRecovery(app: Context): SharedPreferences =
        attemptProtected(open = { createProtected(app) }) { firstError ->
            Timber.e(firstError, "%s open failed; clearing encrypted prefs and retrying", PROTECTED_PREFS_FILE)
            runCatching { app.deleteSharedPreferences(PROTECTED_PREFS_FILE) }
            attemptProtected(open = { createProtected(app) }) { secondError ->
                Timber.e(secondError, "%s retry failed; resetting MasterKey alias and retrying", PROTECTED_PREFS_FILE)
                runCatching {
                    KeyStore.getInstance(ANDROID_KEYSTORE).apply {
                        load(null)
                        deleteEntry(MasterKey.DEFAULT_MASTER_KEY_ALIAS)
                    }
                }
                runCatching { app.deleteSharedPreferences(PROTECTED_PREFS_FILE) }
                // If recreation still fails, let the exception propagate to PendingDeepLinkStore.safely()
                // so writes fail closed without falling back to plaintext storage or crashing.
                createProtected(app)
            }
        }

    private fun createProtected(app: Context): SharedPreferences {
        val master = MasterKey.Builder(app).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        return EncryptedSharedPreferences.create(
            app,
            PROTECTED_PREFS_FILE,
            master,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun bindForTesting(
        protected: SharedPreferences,
        oldPreferences: SharedPreferences?,
    ) {
        synchronized(lock) {
            isTestBound = true
            prefs = protected
            legacy = oldPreferences
            uncertain = false
            uncertainValue = null
        }
    }
}

private inline fun attemptProtected(
    open: () -> SharedPreferences,
    onFailure: (Throwable) -> SharedPreferences,
): SharedPreferences =
    try {
        open()
    } catch (e: GeneralSecurityException) {
        onFailure(e)
    } catch (e: IOException) {
        onFailure(e)
    } catch (e: SecurityException) {
        onFailure(e)
    } catch (e: ProviderException) {
        onFailure(e)
    }
