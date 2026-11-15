package app.pantopus.android.data.plans

import android.content.Context
import app.pantopus.android.core.routing.DeepLinkRouter
import app.pantopus.android.data.api.models.users.UserDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.PlansApi
import app.pantopus.android.data.auth.AuthRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The server flags (brief section 3). [playdates] only counts when [plans] is on; so does [privatePlans] (`plans_private`
 * and `plans_invites` both on, Plans step 1: invite-only plans), which shows none of its controls while off, and [repeat]
 * (`plans_repeat`, Plans step 2).
 */
data class PlansFlags(
    val plans: Boolean = false,
    val playdates: Boolean = false,
    val privatePlans: Boolean = false,
    val repeat: Boolean = false,
    /** `plans_online` (Plans step 3): online plans can be posted. An online plan already posted reads either way. */
    val onlinePlans: Boolean = false,
    /** `plans_kinds` (Plans step 4): the four newer kinds can be posted. A plan of one already posted reads either way. */
    val newKinds: Boolean = false,
) {
    val playdatesOn: Boolean get() = plans && playdates

    /** Private plans can be posted: the empty state's row, "Who can see this" and the private preview show. */
    val privateOn: Boolean get() = plans && privatePlans

    /**
     * A plan can be set to repeat: the Repeats row shows on a person's new plan and on the change screen. A plan that
     * already repeats keeps its lines and its host's controls with this off.
     */
    val repeatOn: Boolean get() = plans && repeat

    /** The Where control's "Online" choice shows (never for a playdate, a pickup game, outdoors or a business's plan). */
    val onlineOn: Boolean get() = plans && onlinePlans

    /** The type picker, the empty state and the map's chips show nine kinds rather than five. */
    val kindsOn: Boolean get() = plans && newKinds
}

/**
 * Nearby Plans' switch. Reads `plans` and `plans_playdates` from `GET /api/feature-flags/:flagName` (which honors
 * the internal-team and beta-user lists) when someone signs in and every time the app comes to the foreground.
 *
 * Off: Nearby is today's screen and no Plans entry point, card, notification or deep link shows. The last answer
 * is kept per account so a relaunch opens Nearby the right way at once; the re-check follows. A failed read keeps
 * the last answer (every Plans route also answers 404 while the flag is off, so nothing private can show).
 */
@Singleton
class PlansFeature
    @Inject
    constructor(
        private val api: PlansApi,
        private val auth: AuthRepository,
        @ApplicationContext context: Context,
    ) {
        private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private val _flags = MutableStateFlow(PlansFlags())
        private var started = false

        @Volatile private var reading: Job? = null

        @Volatile private var userId: String? = null

        @Volatile private var user: UserDto? = null

        /** The current answer for the signed-in person (off while signed out). */
        val flags: StateFlow<PlansFlags> = _flags.asStateFlow()

        private val _settled = MutableStateFlow(false)

        /**
         * True once [flags] holds the signed-in person's answer (the one kept from last time, then the re-check);
         * false while signed out and in the moment after sign-in or a relaunch before it is read. The tab bar waits
         * for it before moving anyone off the Plans tab.
         */
        val settled: StateFlow<Boolean> = _settled.asStateFlow()

        /** True when Plans is on for the signed-in person right now. */
        val isOn: Boolean get() = _flags.value.plans

        /**
         * Whether `plans_business` (Plans with businesses) is on for the signed-in person, read when asked: the team's
         * "Post plans" and "Run plans" permissions show only then. False while Plans is off and on any failure.
         */
        suspend fun businessOn(): Boolean = isOn && runCatching { api.flag(BUSINESS_FLAG).enabled }.getOrDefault(false)

        /** The signed-in person's id (to tell "you" apart in a plan's people), or null while signed out. */
        val viewerId: String? get() = userId

        /** The signed-in person, for the host preview's name and avatar. */
        val viewer: UserDto? get() = user

        /** Starts following sign-in and sign-out. Safe to call more than once. */
        @Synchronized
        fun start() {
            if (started) return
            started = true
            DeepLinkRouter.bindPlansEnabledProvider { isOn }
            DeepLinkRouter.bindPlansAnswerProvider { linkAnswer() }
            scope.launch {
                auth.state.collect { state ->
                    val signedIn = state as? AuthRepository.State.SignedIn
                    user = signedIn?.user
                    val id = signedIn?.user?.id
                    if (id == userId) return@collect
                    userId = id
                    if (id == null) {
                        reading?.cancel()
                        _flags.value = PlansFlags()
                        _settled.value = false
                    } else {
                        _flags.value = remembered(id)
                        _settled.value = true
                        refresh()
                    }
                }
            }
        }

        /**
         * The answer a Plans link acts on: the one kept for the signed-in person, or the server's when this device has
         * none for them yet (their first sign-in here). Read straight from the auth state, so a link handled before
         * the sign-in reaches [start]'s collector still knows who is in.
         */
        suspend fun linkAnswer(): Boolean {
            val id = userId ?: (auth.state.value as? AuthRepository.State.SignedIn)?.user?.id ?: return false
            if (prefs.contains(id)) return if (id == userId) isOn else remembered(id).plans
            return read(FLAG_PLANS) ?: isOn
        }

        /**
         * A Plans push can start the app: FCM wakes the process with no screen, so [start] (MainActivity) hasn't run
         * and nothing has read who is signed in. The router then still answers its default "Plans off" and the push's
         * notification is dropped. Until [start] binds the live answer, answer with the one kept on this device for
         * [signedInUserId], the account the saved session belongs to: the answer a relaunch opens on.
         */
        @Synchronized
        fun bindKeptAnswerForPush(signedInUserId: String?) {
            if (started) return
            val kept = signedInUserId?.takeIf { it.isNotBlank() }?.let { remembered(it).plans } ?: false
            DeepLinkRouter.bindPlansEnabledProvider { kept }
        }

        /** The app came to the foreground: re-check the flags. */
        fun foregrounded() {
            if (userId != null) refresh()
        }

        /** Re-reads the flags now. */
        fun refresh() {
            val id = userId ?: return
            if (reading?.isActive == true) return
            reading =
                scope.launch {
                    val plans = async { read(FLAG_PLANS) }
                    val playdates = async { read(FLAG_PLAYDATES) }
                    val privatePlans = async { read(FLAG_PRIVATE) }
                    val invites = async { read(FLAG_INVITES) }
                    val repeat = async { read(FLAG_REPEAT) }
                    val onlinePlans = async { read(FLAG_ONLINE) }
                    val newKinds = async { read(FLAG_KINDS) }
                    val plansOn = plans.await()
                    val playdatesOn = playdates.await()
                    // A private plan is posted and filled by invitation, so it needs both switches (the server's own rule).
                    val privateOn = bothOn(privatePlans.await(), invites.await())
                    val repeatOn = repeat.await()
                    val onlineOn = onlinePlans.await()
                    val kindsOn = newKinds.await()
                    if (userId != id) return@launch
                    val current = _flags.value
                    val next =
                        PlansFlags(
                            plans = plansOn ?: current.plans,
                            playdates = playdatesOn ?: current.playdates,
                            privatePlans = privateOn ?: current.privatePlans,
                            repeat = repeatOn ?: current.repeat,
                            onlinePlans = onlineOn ?: current.onlinePlans,
                            newKinds = kindsOn ?: current.newKinds,
                        )
                    _flags.value = next
                    remember(id, next)
                }
        }

        /** Both flags on; null (keep what was known) when a read failed and the other didn't already say off. */
        private fun bothOn(
            first: Boolean?,
            second: Boolean?,
        ): Boolean? =
            when {
                first == false || second == false -> false
                first == null || second == null -> null
                else -> true
            }

        private suspend fun read(name: String): Boolean? =
            when (val result = safeApiCall { api.flag(name) }) {
                is NetworkResult.Success -> result.data.enabled
                is NetworkResult.Failure -> null
            }

        /**
         * One character a flag, in order: plans, playdates, private, repeat, online (`plans_online`) and kinds
         * (`plans_kinds`). A shorter string from before a flag existed reads that flag off ("11" reads the rest off).
         */
        @Suppress("MagicNumber")
        private fun remembered(id: String): PlansFlags {
            val raw = prefs.getString(id, null) ?: return PlansFlags()
            return PlansFlags(
                plans = raw.getOrNull(0) == '1',
                playdates = raw.getOrNull(1) == '1',
                privatePlans = raw.getOrNull(2) == '1',
                repeat = raw.getOrNull(3) == '1',
                onlinePlans = raw.getOrNull(INDEX_ONLINE) == '1',
                newKinds = raw.getOrNull(INDEX_KINDS) == '1',
            )
        }

        private fun remember(
            id: String,
            flags: PlansFlags,
        ) {
            val raw =
                listOf(flags.plans, flags.playdates, flags.privatePlans, flags.repeat, flags.onlinePlans, flags.newKinds)
                    .joinToString("") { if (it) "1" else "0" }
            prefs.edit().putString(id, raw).apply()
        }

        private companion object {
            const val BUSINESS_FLAG = "plans_business"
            const val PREFS = "pantopus.plans.flags"
            const val FLAG_PLANS = "plans"
            const val FLAG_PLAYDATES = "plans_playdates"
            const val FLAG_PRIVATE = "plans_private"
            const val FLAG_INVITES = "plans_invites"
            const val FLAG_REPEAT = "plans_repeat"
            const val FLAG_ONLINE = "plans_online"
            const val FLAG_KINDS = "plans_kinds"
            const val INDEX_ONLINE = 4
            const val INDEX_KINDS = 5
        }
    }
