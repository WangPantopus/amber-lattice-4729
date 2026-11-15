package app.pantopus.android.ui.screens.plans.change

import androidx.compose.runtime.Composable
import app.pantopus.android.data.api.models.plans.PlanPlaceInput
import app.pantopus.android.data.plans.PlanOnlineLink
import app.pantopus.android.data.plans.PlanPlaceKind
import app.pantopus.android.data.plans.isOnline
import app.pantopus.android.data.plans.planKind
import app.pantopus.android.ui.screens.plans.components.PlanSegmented
import app.pantopus.android.ui.screens.plans.host.HostWhere
import app.pantopus.android.ui.screens.plans.host.OnlineLinkInput
import app.pantopus.android.ui.screens.plans.host.onlinePlaceInput
import app.pantopus.android.ui.theme.PantopusIcon

/*
 * H11's part of Plans step 3: an online plan changes its link or moves to a public place, and a plan that meets at a
 * public place moves online (while `plans_online` is on). Either counts as a place change ("Still coming?").
 */

/** H11's online state. */
data class PlanChangeOnline(
    /** `plans_online` is on: a plan at a public place can move online. A plan already online keeps its choice either way. */
    val switchOn: Boolean = false,
    /** Where is "Online": the plan is online and stays so, or the host chose to move it online. */
    val chosen: Boolean = false,
    /** The link field, starting from the plan's own link. */
    val link: String = "",
)

/**
 * Where offers "A place / Online": a public plan of a kind that can meet online (never a playdate, a pickup game, an
 * outing or a business's plan), while the switch is on or the plan is online already. A plan at home keeps its place.
 */
val PlanChangeUi.canGoOnline: Boolean
    get() = canChangePlace && plan?.planKind?.canBeOnline == true && (online.switchOn || plan?.isOnline == true)

/** An online plan staying online with a new link. */
val PlanChangeUi.linkChanged: Boolean
    get() = online.chosen && plan?.isOnline == true && online.link.trim() != plan?.place?.link

/** A plan at a public place moving online. */
val PlanChangeUi.movesOnline: Boolean
    get() = online.chosen && plan?.isOnline == false

/** The link or online-ness changed: the server asks everyone in "Still coming?", as for a new place. */
val PlanChangeUi.onlineChanged: Boolean
    get() = movesOnline || linkChanged

/** The `place` Save sends: the link (moving online or changing it), a new public place, or nothing. */
internal fun PlanChangeUi.changedPlace(): PlanPlaceInput? =
    when {
        online.chosen -> onlinePlaceInput(online.link).takeIf { onlineChanged }
        else ->
            newPlace?.let {
                PlanPlaceInput(
                    kind = PlanPlaceKind.PUBLIC,
                    name = it.name,
                    address = it.address,
                    latitude = it.latitude,
                    longitude = it.longitude,
                    placeId = it.placeId,
                )
            }
    }

/** An online plan the host is moving to a public place ("A place" chosen). */
private val PlanChangeUi.leavesOnline: Boolean
    get() = !online.chosen && plan?.isOnline == true

/** What Save can't send yet: a link the server would refuse, or an online plan moving to a place not picked yet. */
internal fun PlanChangeUi.whereProblem(): String? =
    when {
        onlineChanged -> PlanOnlineLink.problem(online.link)
        leavesOnline && newPlace == null -> "Choose a place."
        else -> null
    }

/**
 * The push H11 previews, word for word (planNotifications.changed): a new time and place, a new time, a new link, or
 * a new place ("It's online now" when it moves online).
 */
internal fun PlanChangeUi.pushWords(
    host: String,
    noun: String,
    now: String,
    placeMoved: Boolean,
): Pair<String, String> {
    val where =
        when {
            linkChanged -> "with a new link"
            movesOnline -> "online"
            else -> "at a new place"
        }
    return when {
        timeMoved && (placeMoved || linkChanged) -> "$host changed the $noun" to "$now, $where. Still coming?"
        timeMoved -> "$host moved the $noun" to "$now. Still coming?"
        linkChanged -> "$host changed the link" to "It has a new link now. Still coming?"
        movesOnline -> "$host changed the place" to "It's online now. Still coming?"
        else -> "$host changed the place" to "It's at a new place now. Still coming?"
    }
}

/** "A place / Online" at the top of H11's Where (board Details' control, without "My place"). */
@Composable
internal fun ChangeWhereChoice(
    ui: PlanChangeUi,
    onOnline: (Boolean) -> Unit,
) {
    val options = listOf(HostWhere.PUBLIC to "A place", HostWhere.ONLINE to "Online")
    PlanSegmented(
        options = options,
        selected = if (ui.online.chosen) HostWhere.ONLINE else HostWhere.PUBLIC,
        onSelect = { onOnline(it == HostWhere.ONLINE) },
        optionTags = options.map { (id, _) -> HostWhere.tag(id) },
        optionIcons = options.map { (id, _) -> PantopusIcon.Video.takeIf { id == HostWhere.ONLINE } },
    )
}

/** H11's link field (the host flow's), for an online plan or one moving online. */
@Composable
internal fun ChangeLinkField(
    ui: PlanChangeUi,
    onLink: (String) -> Unit,
) {
    OnlineLinkInput(value = ui.online.link, onValue = onLink)
}
