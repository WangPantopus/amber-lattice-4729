package app.pantopus.android.ui.screens.homes.postal

/**
 * The code a scanned postcard's link carried (`#c=`, FASTVERIFY), on its way from the link to the postcard screen. Held
 * in memory only, never in a nav argument, saved state or a log, and taken once by the screen for that Home.
 */
object ScannedPostcardCode {
    private var pending: Pair<String, String>? = null

    @Synchronized
    fun put(
        homeId: String,
        code: String,
    ) {
        pending = homeId.lowercase() to code
    }

    /** The code for [homeId], once; null when the link carried none or another Home's. */
    @Synchronized
    fun take(homeId: String): String? {
        val held = pending ?: return null
        if (held.first != homeId.lowercase()) return null
        pending = null
        return held.second
    }
}
