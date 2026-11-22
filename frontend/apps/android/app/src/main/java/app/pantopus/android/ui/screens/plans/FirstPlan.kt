package app.pantopus.android.ui.screens.plans

import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.core.routing.DeepLinkRouter
import app.pantopus.android.data.api.models.plans.MyPlansResponse
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.auth.AuthRepository
import app.pantopus.android.data.guidance.GuidanceRepository
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlansRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.Duration
import java.time.Instant
import javax.inject.Inject

/** A new account is one under a day old. */
private val NEW_ACCOUNT_AGE: Duration = Duration.ofHours(24)

/** How long the first screen's notices wait for the answer before the app opens as usual. */
private const val DECIDE_MS = 6000L

private val OVER = setOf("ended", "cancelled", "canceled")

/**
 * A new account opens on the plan that brought the person. Someone who answered an invitation in a browser, then
 * installed the app and signed up with that email, used to land on Place and had to find the dinner under Plans.
 * `GET /api/plans/mine` already moves a browser answer, and an email invitation, to the account with the same verified
 * email and lists it.
 *
 * So once, when a signed-in account first reaches the app's first screen on this device, while the account is under 24
 * hours old and Plans is on, that list is read (through the store the Plans screens use). If it has a plan that isn't
 * over under going, asked, waitlisted or invited (never one the person hosts), [planId] is the soonest one, and the
 * root opens its page over the first tab. A link or notification already opening wins. With or without a plan, it
 * never runs again for that account on this device. The first screen's notices and tip cards wait while [deciding].
 */
@HiltViewModel
class FirstPlanViewModel
    @Inject
    constructor(
        private val auth: AuthRepository,
        private val plans: PlansRepository,
        private val guidance: GuidanceRepository,
        private val prefs: SharedPreferences,
    ) : ViewModel() {
        private val _deciding = MutableStateFlow(false)

        /** Reading the person's plans: the first screen's notices and tip cards wait for the answer. */
        val deciding: StateFlow<Boolean> = _deciding.asStateFlow()

        private val _planId = MutableStateFlow<String?>(null)

        /** The plan to open now; [opened] takes it. */
        val planId: StateFlow<String?> = _planId.asStateFlow()

        /** The signed-in app's first screen came up. */
        fun evaluate() {
            val user = (auth.state.value as? AuthRepository.State.SignedIn)?.user ?: return
            val key = checkedKey(user.id)
            if (prefs.getBoolean(key, false) || _deciding.value) return
            // Once per account on this device, whatever it finds.
            prefs.edit().putBoolean(key, true).apply()
            if (DeepLinkRouter.pending.value != null) return
            _deciding.value = true
            viewModelScope.launch {
                val found = withTimeoutOrNull(DECIDE_MS) { if (isNew(user.id)) soonestPlan() else null }
                // A link that began opening meanwhile wins.
                if (DeepLinkRouter.pending.value == null) _planId.value = found
                _deciding.value = false
            }
        }

        fun opened() {
            _planId.value = null
        }

        private suspend fun soonestPlan(): String? {
            // Plans' switch for this person; right after a first sign-in this waits for the server's answer.
            if (!DeepLinkRouter.plansAnswer()) return null
            val mine = plans.mine().data ?: return null
            return soonest(mine)?.id
        }

        /** The account is under a day old, by the profile read at every app open (kept on the phone after the first). */
        private suspend fun isNew(userId: String): Boolean {
            val createdAt = guidance.state.first { it?.userId == userId && it.createdAt != null }?.createdAt
            val created = PlanFormat.instant(createdAt) ?: return false
            return Duration.between(created, Instant.now()) < NEW_ACCOUNT_AGE
        }

        internal companion object {
            fun checkedKey(userId: String) = "plans.firstPlanChecked.$userId"

            /** The soonest plan that isn't over among the ones the person is in, asked to join, waits for or is invited to. */
            fun soonest(mine: MyPlansResponse): PlanDto? =
                (mine.going + mine.asked + mine.waitlisted + mine.invited)
                    .filter { it.state?.lowercase() !in OVER }
                    .minByOrNull { PlanFormat.instant(it.startsAt) ?: Instant.MAX }
        }
    }
