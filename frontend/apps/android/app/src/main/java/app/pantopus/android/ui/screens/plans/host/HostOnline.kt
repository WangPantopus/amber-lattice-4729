@file:Suppress("MagicNumber", "MatchingDeclarationName")

package app.pantopus.android.ui.screens.plans.host

import app.pantopus.android.data.api.models.plans.PlanPlaceInput
import app.pantopus.android.data.plans.PlanKind
import app.pantopus.android.data.plans.PlanKindDetails
import app.pantopus.android.data.plans.PlanOnlineLink
import app.pantopus.android.data.plans.PlanPlaceKind
import app.pantopus.android.ui.theme.PantopusIcon
import java.time.ZoneId

/*
 * The host flow's part of Plans steps 3 and 4: Where's three choices, an online plan's place, and the first draft of
 * a plan of one of the four newer kinds.
 */

/** Where's choices (boards H2, H5 and Details): a public place, the host's home, or online (Plans step 3). */
internal object HostWhere {
    const val PUBLIC = "public"
    const val HOME = "home"
    const val ONLINE = "online"

    /** The test id of each choice: `plansWhereOnline` is the contract's; the other two help find the control. */
    fun tag(choice: String): String =
        when (choice) {
            ONLINE -> "plansWhereOnline"
            HOME -> "plansWhereHome"
            else -> "plansWherePlace"
        }
}

/**
 * A new plan of one of Plans step 4's kinds. Food & drinks and game nights start at the host's home when there is one,
 * as a watch party does; an outing and "something else" at a public place. The host approves each person until they
 * choose otherwise; the title follows the first chip until they type their own (something else has none to follow).
 */
internal fun newKindDraft(
    kind: PlanKind,
    hasHome: Boolean,
): HostDraft =
    when (kind) {
        PlanKind.FOOD_DRINKS -> HostDraft(kind = kind, spots = 6, atHome = hasHome, title = PlanKindDetails.title(kind, "dinner"))
        PlanKind.GAME_NIGHT -> HostDraft(kind = kind, spots = 6, atHome = hasHome, title = PlanKindDetails.title(kind, "board_games"))
        PlanKind.OUTDOORS -> HostDraft(kind = kind, spots = 8, title = PlanKindDetails.title(kind, "hike"))
        else -> HostDraft(kind = kind, spots = 8)
    }

/** How long a new plan lasts at first: a watch party, a study group or a game night 3 hours, the newer kinds 2, else 1. */
internal fun hostedHours(kind: PlanKind): Long =
    when (kind) {
        PlanKind.WATCH_PARTY, PlanKind.STUDY_GROUP, PlanKind.GAME_NIGHT -> 3L
        PlanKind.FOOD_DRINKS, PlanKind.OUTDOORS, PlanKind.SOMETHING_ELSE -> 2L
        else -> 1L
    }

/**
 * An online plan's `place` (contract section 1): the link as typed, trimmed, and the phone's own IANA time zone, which
 * the server uses only when the plan has no area (a private plan by a host with no home and no fix).
 */
internal fun onlinePlaceInput(link: String): PlanPlaceInput =
    PlanPlaceInput(kind = PlanPlaceKind.ONLINE, link = link.trim(), timezone = ZoneId.systemDefault().id)

/** H7's "People you accept also see": the address, the exact spot, or an online plan's link by its site's name. */
internal fun acceptedSeeWhere(ui: HostUi): Pair<PantopusIcon, String> =
    when {
        ui.isOnline -> PantopusIcon.Link to "The link: ${PlanOnlineLink.parse(ui.draft.link)?.host ?: "your link"}"
        ui.draft.atHome -> PantopusIcon.Home to "Your address"
        else -> PantopusIcon.MapPin to "The exact spot: ${ui.draft.place?.name ?: "your place"}"
    }

/** "Online · hosted from Camas" on the preview (board Online's words), or "Online" before the town is known. */
internal fun previewOnlineWhere(ui: HostUi): String {
    val city = ui.previewArea?.removePrefix("Near ")?.takeIf(String::isNotBlank) ?: ui.home?.city?.takeIf(String::isNotBlank)
    return listOfNotNull("Online", city?.let { "hosted from $it" }).joinToString(" · ")
}
