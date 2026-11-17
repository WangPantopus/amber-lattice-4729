package app.pantopus.android.ui.screens.plans

import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import app.pantopus.android.data.ai.AIScreenContext
import app.pantopus.android.ui.screens.place.HubVerificationTarget
import app.pantopus.android.ui.screens.plans.bring.PlanBringScreen
import app.pantopus.android.ui.screens.plans.change.PlanChangeScreen
import app.pantopus.android.ui.screens.plans.checks.PlanCheckScreen
import app.pantopus.android.ui.screens.plans.checks.PlanChecksScreen
import app.pantopus.android.ui.screens.plans.detail.PlanDetailScreen
import app.pantopus.android.ui.screens.plans.guests.PlanGuestsScreen
import app.pantopus.android.ui.screens.plans.host.HostFlowScreen
import app.pantopus.android.ui.screens.plans.requests.PlanRequestsScreen

/** The Plans pages' routes. Kept out of `RootTabScreen` so the two grow without merge conflicts. */
object PlansRoutes {
    const val PLAN_ID_KEY = "planId"
    const val ASK_KEY = "ask"
    const val REVEAL_KEY = "reveal"
    const val INVITE_KEY = "invite"
    const val OPEN_KEY = "open"
    const val KIND_KEY = "kind"
    const val GAME_KEY = "game"
    const val AGAIN_KEY = "again"
    const val VIA_KEY = "via"
    const val PRIVATE_KEY = "private"

    /** Opened from a business's page (B6): a join from there tells the server `via: business_page`. */
    const val VIA_BUSINESS_PAGE = "business_page"

    /**
     * A plan (J1 to J9 for guests, H9 for its host). `ask=true` opens "Ask to join" at once; `invite` is an email or
     * text invitation's token, which the plan opens for this account first; `open` the plan's one link for everyone
     * (Plans for the holidays, contract 6.9), which the person answers as themselves.
     */
    const val PLAN =
        "plans/{$PLAN_ID_KEY}?$ASK_KEY={$ASK_KEY}&$REVEAL_KEY={$REVEAL_KEY}&$INVITE_KEY={$INVITE_KEY}&$VIA_KEY={$VIA_KEY}" +
            "&$OPEN_KEY={$OPEN_KEY}"

    /** The host's requests (H10). */
    const val REQUESTS = "plans/{$PLAN_ID_KEY}/requests"

    /** Change the time or place (H11). */
    const val CHANGE = "plans/{$PLAN_ID_KEY}/change"

    /** Who's coming (Plans for the holidays, A5): the host's answers. */
    const val GUESTS = "plans/{$PLAN_ID_KEY}/guests"

    /** The bring list for the host (Plans for the holidays, A9). */
    const val BRING = "plans/{$PLAN_ID_KEY}/bring"

    /** The guest's check (business track B5, C1 and C2). */
    const val CHECK = "plans/{$PLAN_ID_KEY}/check"

    /** The business's guest list with money (business track B5, C3). */
    const val CHECKS = "plans/{$PLAN_ID_KEY}/checks"

    /**
     * Host a plan (H1 to H8); `kind` skips the type step, `game` fills a watch party, `again` copies a plan, and
     * `private` starts "Who can see this" on "Only people I invite" (the empty state's "Plan with people you know").
     */
    const val HOST =
        "plans-host?$KIND_KEY={$KIND_KEY}&$GAME_KEY={$GAME_KEY}&$AGAIN_KEY={$AGAIN_KEY}&$PRIVATE_KEY={$PRIVATE_KEY}"

    fun plan(
        id: String,
        ask: Boolean = false,
        reveal: Boolean = false,
        invite: String? = null,
        via: String? = null,
        open: String? = null,
    ): String =
        "plans/${Uri.encode(id)}?$ASK_KEY=$ask&$REVEAL_KEY=$reveal" + invite?.let { "&$INVITE_KEY=${Uri.encode(it)}" }.orEmpty() +
            via?.let { "&$VIA_KEY=${Uri.encode(it)}" }.orEmpty() + open?.let { "&$OPEN_KEY=${Uri.encode(it)}" }.orEmpty()

    fun requests(id: String): String = "plans/${Uri.encode(id)}/requests"

    fun change(id: String): String = "plans/${Uri.encode(id)}/change"

    fun guests(id: String): String = "plans/${Uri.encode(id)}/guests"

    fun bring(id: String): String = "plans/${Uri.encode(id)}/bring"

    fun check(id: String): String = "plans/${Uri.encode(id)}/check"

    fun checks(id: String): String = "plans/${Uri.encode(id)}/checks"

    fun host(
        kind: String? = null,
        game: String? = null,
        again: String? = null,
        startPrivate: Boolean = false,
    ): String =
        "plans-host?$KIND_KEY=${Uri.encode(
            kind.orEmpty(),
        )}&$GAME_KEY=${Uri.encode(game.orEmpty())}&$AGAIN_KEY=${Uri.encode(again.orEmpty())}&$PRIVATE_KEY=$startPrivate"
}

/** Where Plans hands off to the rest of the app. */
data class PlansExternalRoutes(
    val openPulse: () -> Unit,
    val openConnections: () -> Unit,
    /** Opens a plan's group chat (A4). */
    val openChat: (roomId: String, title: String, planId: String) -> Unit,
    /** "Verify your address" (J9): the Home that waits on verification, or Add Home. */
    val openVerification: (HubVerificationTarget) -> Unit,
    /** Back to the Plans tab (the map), closing the Plans pages on top of it. */
    val openNearby: () -> Unit,
    /** Ask Pantopus about a plan (AI assistant phase 1); null hides the button. */
    val askPantopus: ((AIScreenContext) -> Unit)? = null,
    /** A person's profile: the host's, a guest's or a requester's, from their photo and name. */
    val openProfile: ((userId: String) -> Unit)? = null,
    /** A business's page: the host card of a business's plan (Plans with businesses). */
    val openBusiness: ((businessUserId: String) -> Unit)? = null,
    /** The shipped conversation with a person or a business (business track B5: "Something's wrong with this payment"). */
    val openMessage: ((userId: String, name: String) -> Unit)? = null,
)

/** Opens a person's profile from the Plans pages; null leaves people plain. */
val LocalPlanOpenProfile = staticCompositionLocalOf<((String) -> Unit)?> { null }

/** Opens a business's page from the Plans pages; null leaves the business's card plain. */
val LocalPlanOpenBusiness = staticCompositionLocalOf<((String) -> Unit)?> { null }

/** A tap opens [userId]'s profile through [open] (the Plans pages' [LocalPlanOpenProfile]); no change when either is null. */
fun Modifier.opensPlanProfile(
    userId: String?,
    open: ((String) -> Unit)?,
): Modifier = if (userId != null && open != null) clickable(onClickLabel = "Open profile", role = Role.Button) { open(userId) } else this

/** A tap opens the business [businessUserId]'s page through [open] ([LocalPlanOpenBusiness]); no change when either is null. */
fun Modifier.opensPlanBusiness(
    businessUserId: String?,
    open: ((String) -> Unit)?,
): Modifier =
    if (businessUserId != null && open != null) {
        clickable(onClickLabel = "Open the business's page", role = Role.Button) { open(businessUserId) }
    } else {
        this
    }

/** The Plans pages' ways out to a person's profile and a business's page. */
@Composable
private fun PlansLocals(
    external: PlansExternalRoutes,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(
        LocalPlanOpenProfile provides external.openProfile,
        LocalPlanOpenBusiness provides external.openBusiness,
        content = content,
    )
}

/** A plan page's arguments: the plan, "Ask to join" at once, the reveal, an invitation's token, and how they came. */
private fun planArguments() =
    listOf(
        navArgument(PlansRoutes.PLAN_ID_KEY) { type = NavType.StringType },
        navArgument(PlansRoutes.ASK_KEY) {
            type = NavType.BoolType
            defaultValue = false
        },
        navArgument(PlansRoutes.REVEAL_KEY) {
            type = NavType.BoolType
            defaultValue = false
        },
        navArgument(PlansRoutes.INVITE_KEY) {
            type = NavType.StringType
            nullable = true
            defaultValue = null
        },
        navArgument(PlansRoutes.VIA_KEY) {
            type = NavType.StringType
            nullable = true
            defaultValue = null
        },
        navArgument(PlansRoutes.OPEN_KEY) {
            type = NavType.StringType
            nullable = true
            defaultValue = null
        },
    )

/** Registers every Plans page. Call inside the root `NavHost`. */
// One composable a page: it grows with the pages, and splitting it would scatter the routes.
@Suppress("LongMethod")
fun NavGraphBuilder.plansRoutes(
    nav: NavHostController,
    external: PlansExternalRoutes,
) {
    composable(
        route = PlansRoutes.PLAN,
        arguments = planArguments(),
    ) {
        PlansLocals(external) {
            PlanDetailScreen(
                onBack = { if (!nav.popBackStack()) external.openNearby() },
                onOpenPlan = { id -> nav.navigate(PlansRoutes.plan(id)) },
                onOpenRequests = { id -> nav.navigate(PlansRoutes.requests(id)) },
                onOpenGuests = { id -> nav.navigate(PlansRoutes.guests(id)) },
                onOpenBring = { id -> nav.navigate(PlansRoutes.bring(id)) },
                onOpenCheck = { id -> nav.navigate(PlansRoutes.check(id)) },
                onOpenChecks = { id -> nav.navigate(PlansRoutes.checks(id)) },
                onChange = { id -> nav.navigate(PlansRoutes.change(id)) },
                onHost = { kind, again -> nav.navigate(PlansRoutes.host(kind = kind, again = again)) },
                onOpenChat = external.openChat,
                onOpenVerification = external.openVerification,
                onSeeAllPlans = external.openNearby,
                onAskPantopus = external.askPantopus,
                // A skipped date's next one (Plans step 2) takes its place, so Back goes where the skipped one came from.
                onOpenNextDate = { id -> nav.navigate(PlansRoutes.plan(id)) { popUpTo(PlansRoutes.PLAN) { inclusive = true } } },
            )
        }
    }
    composable(
        route = PlansRoutes.REQUESTS,
        arguments = listOf(navArgument(PlansRoutes.PLAN_ID_KEY) { type = NavType.StringType }),
    ) {
        PlansLocals(external) {
            PlanRequestsScreen(onBack = { if (!nav.popBackStack()) external.openNearby() })
        }
    }
    composable(
        route = PlansRoutes.GUESTS,
        arguments = listOf(navArgument(PlansRoutes.PLAN_ID_KEY) { type = NavType.StringType }),
    ) {
        PlansLocals(external) {
            PlanGuestsScreen(onBack = { if (!nav.popBackStack()) external.openNearby() })
        }
    }
    composable(
        route = PlansRoutes.BRING,
        arguments = listOf(navArgument(PlansRoutes.PLAN_ID_KEY) { type = NavType.StringType }),
    ) {
        PlanBringScreen(onDone = { if (!nav.popBackStack()) external.openNearby() })
    }
    composable(
        route = PlansRoutes.CHECK,
        arguments = listOf(navArgument(PlansRoutes.PLAN_ID_KEY) { type = NavType.StringType }),
    ) {
        PlanCheckScreen(onBack = { if (!nav.popBackStack()) external.openNearby() }, onMessageBusiness = external.openMessage)
    }
    composable(
        route = PlansRoutes.CHECKS,
        arguments = listOf(navArgument(PlansRoutes.PLAN_ID_KEY) { type = NavType.StringType }),
    ) {
        PlanChecksScreen(onBack = { if (!nav.popBackStack()) external.openNearby() })
    }
    composable(
        route = PlansRoutes.CHANGE,
        arguments = listOf(navArgument(PlansRoutes.PLAN_ID_KEY) { type = NavType.StringType }),
    ) {
        PlanChangeScreen(onDone = { nav.popBackStack() })
    }
    composable(
        route = PlansRoutes.HOST,
        arguments =
            listOf(
                navArgument(PlansRoutes.KIND_KEY) {
                    type = NavType.StringType
                    defaultValue = ""
                },
                navArgument(PlansRoutes.GAME_KEY) {
                    type = NavType.StringType
                    defaultValue = ""
                },
                navArgument(PlansRoutes.AGAIN_KEY) {
                    type = NavType.StringType
                    defaultValue = ""
                },
                navArgument(PlansRoutes.PRIVATE_KEY) {
                    type = NavType.BoolType
                    defaultValue = false
                },
            ),
    ) {
        HostFlowScreen(
            onClose = { nav.popBackStack() },
            onDoneToMap = {
                nav.popBackStack()
                external.openNearby()
            },
        )
    }
}
