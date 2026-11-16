package app.pantopus.android.data.plans

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** What a private plan's preview asked to do once it is posted (Plans step 1): open the invite sheet for it. */
enum class PlanPostedInvite {
    /** "Text a link": the sheet opens and makes a one-person link for the share sheet. */
    Text,

    /** "Email": the sheet opens on its search box, which takes an address. */
    Email,
}

/**
 * One-time Plans moments that cross screens: a plan just posted (the map drops its pin and shows H8), and which
 * plans have already played their reveal (J7) on this phone, so "You're in" animates once.
 */
@Singleton
class PlansEvents
    @Inject
    constructor(
        @ApplicationContext context: Context,
    ) {
        private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        private val _posted = MutableStateFlow<String?>(null)

        @Volatile private var postedInvite: Pair<String, PlanPostedInvite>? = null

        @Volatile private var postedNote: Pair<String, String>? = null

        /** The plan the person just posted, until the map has shown it. */
        val posted: StateFlow<String?> = _posted.asStateFlow()

        /**
         * [then]: the invite sheet to open over the posted plan (a private plan's "Text a link" or "Email"); [note]: what
         * went wrong with the invitations sent as it was posted, for H8 to say.
         */
        fun posted(
            planId: String,
            then: PlanPostedInvite? = null,
            note: String? = null,
        ) {
            postedInvite = then?.let { planId to it }
            postedNote = note?.let { planId to it }
            _posted.value = planId
        }

        /** What H8 says about the invitations sent with [planId], once. */
        fun takePostedNote(planId: String): String? {
            val pending = postedNote?.takeIf { it.first == planId } ?: return null
            postedNote = null
            return pending.second
        }

        /** What to open over [planId] once it shows as posted, once. */
        fun takePostedInvite(planId: String): PlanPostedInvite? {
            val pending = postedInvite?.takeIf { it.first == planId } ?: return null
            postedInvite = null
            return pending.second
        }

        fun consumePosted(planId: String) {
            if (_posted.value == planId) _posted.value = null
        }

        @Volatile private var arrivalNote: Pair<String, String>? = null

        /** A line for [planId]'s page to say when it opens (Plans step 2: a skipped date opens the next one, which says so). */
        fun noteOnArrival(
            planId: String,
            note: String,
        ) {
            arrivalNote = planId to note
        }

        /** The line [noteOnArrival] left for [planId]'s page, once. */
        fun takeArrivalNote(planId: String): String? {
            val pending = arrivalNote?.takeIf { it.first == planId } ?: return null
            arrivalNote = null
            return pending.second
        }

        /** The plan whose page is on screen (set while it's resumed), for push suppression. */
        @Volatile
        var viewedPlanId: String? = null

        /**
         * True when a push of [type] about [planId] needs no system notification: that plan's page is on screen
         * and updates itself. Pushes with buttons (a request, a reminder, a change) still post.
         */
        fun isShowingQuietly(
            type: String,
            planId: String?,
        ): Boolean = planId != null && planId == viewedPlanId && type in QUIET_WHEN_VIEWING

        /** True the first time this phone shows [planId] with the viewer in it; false afterwards. */
        fun shouldReveal(planId: String): Boolean {
            val seen = prefs.getStringSet(KEY_REVEALED, emptySet()).orEmpty()
            return planId !in seen
        }

        fun revealed(planId: String) {
            val seen = prefs.getStringSet(KEY_REVEALED, emptySet()).orEmpty()
            if (planId in seen) return
            val next = (seen + planId).toList().takeLast(MAX_REMEMBERED).toSet()
            prefs.edit().putStringSet(KEY_REVEALED, next).apply()
        }

        private companion object {
            val QUIET_WHEN_VIEWING = setOf("plan_accepted", "plan_declined", "plan_spot_opened", "plan_cancelled")
            const val PREFS = "pantopus.plans.events"
            const val KEY_REVEALED = "revealed"
            const val MAX_REMEMBERED = 200
        }
    }
