@file:Suppress("MagicNumber", "MatchingDeclarationName")

package app.pantopus.android.ui.screens.plans.host

import app.pantopus.android.data.api.models.plans.PlanPlaceInput
import app.pantopus.android.data.plans.PlanKind
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

    /** The test id of each choice: `plansWhereOnline` is the contract's; the other two are iPhone's. */
    fun tag(choice: String): String =
        when (choice) {
            ONLINE -> "plansWhereOnline"
            HOME -> "plansWhereHome"
            else -> "plansWherePublic"
        }
}

/**
 * A new plan of one of Plans step 4's kinds, as on iPhone: at a public place (the host may choose "My place"), 6 spots
 * (8 for something else), the host approving each person until they choose otherwise, and no title until they type
 * one (the field's hint suggests one).
 */
internal fun newKindDraft(kind: PlanKind): HostDraft = HostDraft(kind = kind, spots = if (kind == PlanKind.SOMETHING_ELSE) 8 else 6)

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
        ui.isOnline -> PantopusIcon.Video to "The link: ${PlanOnlineLink.parse(ui.draft.link)?.host ?: "the link you added"}"
        ui.draft.atHome -> PantopusIcon.Home to "Your address"
        else -> PantopusIcon.MapPin to "The exact spot: ${ui.draft.place?.name ?: "your place"}"
    }

/** What the preview says where the area goes for an online plan (contract section 3, as on iPhone). */
internal const val PREVIEW_ONLINE_WHERE = "Online"

/** The note's hint for an online plan, whatever its kind (as on iPhone). */
internal const val ONLINE_NOTE_HINT = "Join a few minutes early. Cameras optional."

/** The longest link the field takes as typed; a longer paste is kept whole and refused by the check (as on iPhone). */
internal const val LINK_INPUT_MAX = 2000
