package app.pantopus.android.ui.screens.plans.change

import app.pantopus.android.data.api.models.plans.PlanDateOptionInput
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.isPicking
import app.pantopus.android.ui.screens.plans.host.DATE_OPTIONS_FEWEST
import app.pantopus.android.ui.screens.plans.host.DateOptionDraft
import java.time.ZoneId

/*
 * The holidays' find a date on the Change screen (08-extras section 2, "The Change screen while picking"; no board, it
 * reuses board 26's list). While a plan is picking, the times the host offered take the place of "When": each with
 * "Remove" (at least two stay), "Add a time" with "Up to 5", and "Removing a time clears its ticks." Saving sends
 * `date_options` through the shipped change call; a kept time goes back exactly as the server sent it, so it keeps its
 * ticks, and nobody is told. After the pick (no `dates` on the card) the Change screen is any plan's. As iPhone #4312.
 */

/** The offered times as the plan has them and as changed here. */
data class PlanChangeTimes(
    /** The plan is still picking (its card carries `dates`). */
    val isPicking: Boolean = false,
    val original: List<DateOptionDraft> = emptyList(),
    val options: List<DateOptionDraft> = emptyList(),
) {
    /** A time was added or removed (an added one carries no server value, even at a time removed here): Save sends them. */
    val changed: Boolean get() = isPicking && options != original

    /** What Save can't send (the list keeps two, so this is a guard). */
    val problem: String? get() = if (changed && options.size < DATE_OPTIONS_FEWEST) "Offer two to five times." else null

    fun toInput(zone: ZoneId): List<PlanDateOptionInput> = options.sortedBy { it.start }.map { it.toInput(zone) }

    companion object {
        /** The card's `dates.options` (the host's come favorite first), in order of start, with the server's words. */
        fun of(
            plan: PlanDto,
            zone: ZoneId,
        ): PlanChangeTimes {
            val dates = plan.dates?.takeIf { plan.isPicking } ?: return PlanChangeTimes()
            val read =
                dates.options.mapIndexedNotNull { index, option ->
                    val startsAt = option.startsAt ?: return@mapIndexedNotNull null
                    val endsAt = option.endsAt ?: return@mapIndexedNotNull null
                    val start = PlanFormat.instant(startsAt)?.atZone(zone)?.toLocalDateTime() ?: return@mapIndexedNotNull null
                    val end = PlanFormat.instant(endsAt)?.atZone(zone)?.toLocalDateTime() ?: return@mapIndexedNotNull null
                    DateOptionDraft(
                        key = index + 1,
                        start = start,
                        end = end,
                        text = option.text.takeIf(String::isNotBlank),
                        asRead = PlanDateOptionInput(startsAt = startsAt, endsAt = endsAt),
                    )
                }.sortedBy { it.start }
            return PlanChangeTimes(isPicking = true, original = read, options = read)
        }
    }
}
