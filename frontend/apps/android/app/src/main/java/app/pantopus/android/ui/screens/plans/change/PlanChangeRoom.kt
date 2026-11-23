package app.pantopus.android.ui.screens.plans.change

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.plans.isPrivate
import app.pantopus.android.data.plans.planKind
import app.pantopus.android.ui.screens.plans.components.PlanField
import app.pantopus.android.ui.screens.plans.components.PlanFormCard
import app.pantopus.android.ui.screens.plans.components.PlanStepperRow
import app.pantopus.android.ui.screens.plans.host.AddToPlanRow
import app.pantopus.android.ui.screens.plans.host.ChipInFields
import app.pantopus.android.ui.screens.plans.host.GiftFields
import app.pantopus.android.ui.screens.plans.host.ROOM_FOR_MAX
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.Spacing

/*
 * Plans for the holidays (06-screens A3, "The Change screen"): the Change screen of a private plan gains the host form's
 * "Room for" (from the seats already taken up to 100) and "Kids welcome". They save with the shipped change call
 * (`spots`, `kids_welcome`), each only when changed; a refusal shows the server's own sentence. As iPhone #4236.
 */

/** The room and "Kids welcome" as the host changes them. */
data class PlanChangeRoom(
    /** The rows show: the host's private plan with H1's answers (not a business's, a playdate or a pickup game). */
    val shows: Boolean = false,
    /** Seats already taken: the room is never offered below them. */
    val seatsTaken: Int = 0,
    val originalSpots: Int = 0,
    val originalKids: Boolean = false,
    val spots: Int = 0,
    val kidsWelcome: Boolean = false,
) {
    /** From the seats taken (at least 1) up to 100; a plan already over its room keeps its own number. */
    val range: IntRange
        get() {
            val lower = maxOf(1, minOf(seatsTaken, originalSpots))
            return lower..maxOf(lower, ROOM_FOR_MAX)
        }

    val spotsChanged: Boolean get() = shows && spots != originalSpots
    val kidsChanged: Boolean get() = shows && kidsWelcome != originalKids
    val changed: Boolean get() = spotsChanged || kidsChanged

    companion object {
        /** [guestAnswersOn]: `plans_guest_answers` is on for the host; a card with H1's keys carries `kids_welcome`. */
        fun of(
            plan: PlanDto,
            guestAnswersOn: Boolean,
        ): PlanChangeRoom {
            val shows =
                guestAnswersOn &&
                    plan.isPrivate &&
                    plan.business == null &&
                    plan.kidsWelcome != null &&
                    plan.planKind?.countsPeople == true
            val kids = plan.kidsWelcome == true
            return PlanChangeRoom(
                shows = shows,
                seatsTaken = plan.goingCount,
                originalSpots = plan.spots,
                originalKids = kids,
                spots = plan.spots,
                kidsWelcome = kids,
            )
        }
    }
}

/**
 * The rows drawn as the host form's: "Room for" with its stepper, then "Add to this plan" with the holidays' "Chip in"
 * (and its three fields while on) and "Kids welcome", each where it shows.
 */
@Composable
internal fun ChangeRoomRows(
    ui: PlanChangeUi,
    viewModel: PlanChangeViewModel,
) {
    val room = ui.room
    val chip = ui.chipIn
    val gift = ui.gift
    if (!room.shows && !chip.shows && !gift.shows) return
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s5)) {
        if (room.shows) {
            PlanStepperRow(
                title = "Room for",
                caption = "Adults and kids, besides your household",
                value = room.spots,
                range = room.range,
                onChange = { viewModel.setRoom(it.coerceIn(room.range)) },
                modifier = Modifier.testTag("planChangeRoomFor"),
                holdStep = ROOM_FOR_HOLD_STEP,
            )
        }
        PlanField(label = "Add to this plan") {
            PlanFormCard {
                if (chip.shows) {
                    AddToPlanRow(
                        first = true,
                        icon = PantopusIcon.DollarSign,
                        title = "Chip in",
                        caption = "Guests pay you, not Pantopus",
                        checked = chip.draft != null,
                        tag = "planChangeChipIn",
                        onChecked = viewModel::setChipIn,
                    )
                }
                if (gift.shows) {
                    AddToPlanRow(
                        first = !chip.shows,
                        icon = PantopusIcon.Gift,
                        title = "Gift exchange",
                        caption = "Everyone who joins draws one name",
                        checked = gift.draft != null,
                        tag = "planChangeGift",
                        onChecked = viewModel::setGift,
                    )
                }
                if (room.shows) {
                    AddToPlanRow(
                        first = !chip.shows && !gift.shows,
                        icon = PantopusIcon.AdultChild,
                        title = "Kids welcome",
                        caption = "Guests say how many adults and kids",
                        checked = room.kidsWelcome,
                        tag = "planChangeKidsWelcome",
                        onChecked = viewModel::setKidsWelcome,
                    )
                }
            }
        }
        chip.draft?.let { ChipInFields(it, chip.errors, viewModel::editChipIn) }
        gift.draft?.let { GiftFields(it, gift.errors, drawn = gift.drawn, onEdit = viewModel::editGift) }
    }
}

/** Holding the plus on "Room for" steps by 5, as on the host form. */
private const val ROOM_FOR_HOLD_STEP = 5
