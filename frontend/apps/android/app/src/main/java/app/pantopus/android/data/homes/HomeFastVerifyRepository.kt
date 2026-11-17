package app.pantopus.android.data.homes

import android.content.Context
import app.pantopus.android.data.api.models.homes.HomeVerifyOptions
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.HomeFastVerifyApi
import app.pantopus.android.data.auth.AuthRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Faster home verification (FASTVERIFY) in the typed [NetworkResult] taxonomy, with the last verify options per
 * account and Home kept in memory, so Place and the verify sheet draw the server's answer at once and read it again.
 */
@Singleton
class HomeFastVerifyRepository
    @Inject
    constructor(
        private val api: HomeFastVerifyApi,
        private val auth: AuthRepository,
        @ApplicationContext context: Context,
    ) {
        private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        private data class Key(
            val account: String,
            val homeId: String,
        )

        /** A Home's last answer: its options, or null when the server doesn't offer them. No entry: not read yet. */
        private val answers = MutableStateFlow<Map<Key, HomeVerifyOptions?>>(emptyMap())

        private fun key(homeId: String): Key? = account()?.let { Key(it, homeId.lowercase()) }

        /** The kept options for [homeId], for the first frame; null when not offered or not read yet. */
        fun cached(homeId: String): HomeVerifyOptions? = key(homeId)?.let { answers.value[it] }

        /** The kept options for [homeId] as they change. */
        fun answer(homeId: String): Flow<HomeVerifyOptions?> = answers.map { kept -> key(homeId)?.let { kept[it] } }.distinctUntilChanged()

        /**
         * Reads the options for [homeId] again and keeps them. `home_fast_verify` off answers 404 (and an older server
         * the same), which keeps "not offered": today's screens. A failed read keeps the last answer.
         */
        suspend fun refresh(homeId: String): HomeVerifyOptions? {
            val key = key(homeId) ?: return null
            when (val result = safeApiCall { api.verifyOptions(homeId) }) {
                is NetworkResult.Success -> {
                    val options = result.data.takeIf { it.homeId.equals(homeId, ignoreCase = true) }
                    if (key(homeId) == key) answers.update { it + (key to options) }
                }
                is NetworkResult.Failure ->
                    if (result.error is NetworkError.NotFound && key(homeId) == key) answers.update { it + (key to null) }
            }
            return cached(homeId)
        }

        private fun account(): String? = (auth.state.value as? AuthRepository.State.SignedIn)?.user?.id

        /** Add Home in two steps (`home_short_add`) as last read for the signed-in person; off when never read. */
        fun keptShortAddHome(): Boolean = account()?.let { prefs.getBoolean("$SHORT_ADD.$it", false) } ?: false

        /** Reads `home_short_add` again and keeps it for the signed-in person; a failed read keeps the last answer. */
        suspend fun refreshShortAddHome(): Boolean {
            val account = account() ?: return false
            val result = safeApiCall { api.shortAddHomeFlag() }
            if (result is NetworkResult.Success && account() == account) {
                prefs.edit().putBoolean("$SHORT_ADD.$account", result.data.enabled).apply()
            }
            return keptShortAddHome()
        }

        private companion object {
            const val PREFS = "home_fast_verify"
            const val SHORT_ADD = "short_add_home"
        }
    }
