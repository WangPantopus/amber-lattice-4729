package app.pantopus.android.core.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import timber.log.Timber
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.ProviderException

/**
 * Opens an app-private EncryptedSharedPreferences file under the shared MasterKey and recovers when it can't be read.
 *
 * A failed open is tried once more after a short pause, so a passing Keystore hiccup never costs saved data. If it
 * still fails, only this file is deleted and made again: its keyset is damaged, or was written under a MasterKey that
 * has since been reset. The shared MasterKey itself is reset only by `TokenStorage`, as its last step; every other
 * file then recovers here on its next open.
 */
object EncryptedPrefsRecovery {
    private const val RETRY_PAUSE_MS = 100L

    fun open(
        context: Context,
        file: String,
    ): SharedPreferences =
        attempt(open = { create(context, file) }) { firstError ->
            Timber.w(firstError, "%s open failed; retrying once", file)
            Thread.sleep(RETRY_PAUSE_MS)
            attempt(open = { create(context, file) }) { secondError ->
                Timber.e(secondError, "%s still unreadable; clearing it and retrying", file)
                runCatching { context.deleteSharedPreferences(file) }
                create(context, file)
            }
        }

    fun create(
        context: Context,
        file: String,
    ): SharedPreferences {
        val master = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        return EncryptedSharedPreferences.create(
            context,
            file,
            master,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /** Runs [open]; a Keystore or keyset failure goes to [onFailure]. Anything else propagates. */
    inline fun attempt(
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
}
