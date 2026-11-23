package app.pantopus.android.data.homes

import android.content.SharedPreferences
import app.pantopus.android.data.api.models.homes.MyHomesResponse
import app.pantopus.android.data.auth.AuthRepository
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/**
 * Which of Place and Today is the bar's first tab, and the tab the app opens on (founder decision 2026-11-21). A person
 * with a Home gets Today first: it is the screen they come back to each day. Until they have one, Place is first,
 * because Place is where a home is added and verified.
 *
 * "Has a Home" is the Home Place lands on and Today follows ([MyHomesResponse.defaultHomeId]): a saved address, a claim
 * still in review or entries that all wait on verification keep Place first.
 *
 * The answer is kept on this phone per account each time the home list is read ([note], from
 * [HomesRepository.myHomesStored]), and the tabs read it once, when they are made ([todayFirst]). So the bar is drawn in
 * its order from the first frame, with no request (the stored home list itself is read off the main thread and comes
 * later), and never moves while the app is in use: a home set up now shows Today first the next time the app opens. An
 * account new to this phone has no answer yet and gets Place first for that one launch. As on iPhone (`RootTabOrder`).
 */
@Singleton
class RootTabOrder
    @Inject
    constructor(
        private val prefs: SharedPreferences,
        private val auth: Provider<AuthRepository>,
    ) {
        /** Today is the first tab for the signed-in account, as its last home list on this phone says. */
        fun todayFirst(): Boolean = accountId()?.let { prefs.getBoolean(key(it), false) } ?: false

        /** The home list was read for the signed-in account: its answer is kept for the next launch. */
        fun note(homes: MyHomesResponse) {
            val key = key(accountId() ?: return)
            val hasHome = homes.defaultHomeId != null
            if (prefs.getBoolean(key, false) != hasHome) prefs.edit().putBoolean(key, hasHome).apply()
        }

        private fun accountId(): String? = (auth.get().state.value as? AuthRepository.State.SignedIn)?.user?.id

        internal companion object {
            fun key(userId: String) = "tabs.todayFirst.$userId"
        }
    }
