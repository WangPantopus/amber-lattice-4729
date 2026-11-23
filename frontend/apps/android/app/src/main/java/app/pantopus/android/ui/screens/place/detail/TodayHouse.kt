package app.pantopus.android.ui.screens.place.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.ai.AINeedsYouItemDto
import app.pantopus.android.data.api.models.place.PickupCollection
import app.pantopus.android.data.api.models.place.PlaceAddressCalendarData
import app.pantopus.android.data.api.models.place.PlaceCalendarEvent
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.theme.PantopusColors
import java.time.LocalDate
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/*
 * The house on Today (JOURNEYS, founder approval 2026-11-21), behind the server's `today_house`: the picture Today
 * already paints of the person's home gains a mailbox, a note on the door and a lantern, each a button like the bins
 * (`TodaySkyHouseObjects.kt`); the "Needs you" card sits right under the picture and says the same things in words;
 * and while the home still runs on its city's general pickup schedule, one question that is already answered.
 */

/** What the Today tab gives the house: the facts for the picture and the card under it. */
data class TodayHouse(
    /** The Mailbox is on: a mailbox stands by the house. */
    val mailbox: Boolean,
    /** Mail that came and is not opened yet (the Mail tab's badge count): the flag is up while it is over 0. */
    val unopenedMail: Int,
    val onOpenMail: () -> Unit,
    /** Today's "Needs you" list, as its card gets it. */
    val needsYou: List<AINeedsYouItemDto>?,
    val onOpenLink: (String) -> Unit,
    /** The first of Today's Plans cards' plans: its title and how it opens; null with no card. */
    val plan: Pair<String, () -> Unit>?,
    /** The "Needs you" card under the picture (the Today tab draws it, with the rows only the page knows). */
    val card: @Composable (TodayHouseCard) -> Unit,
)

/** What the page adds to the card under the picture. */
data class TodayHouseCard(
    /** Tasks "Coming up at home" lists on the same screen: they show in one place only. */
    val agendaTaskIds: Set<String>,
    /** A pickup evening: "Garbage and recycling", and the way to the pickup schedule, as the bins. Null on other days. */
    val pickup: Pair<String, () -> Unit>?,
    /** The person has a home here: with nothing to list the card says so instead of hiding. */
    val hasHome: Boolean,
)

/** Tasks "Coming up at home" may also list (AI assistant phase 3 brief section 3, decision 2). */
private val AGENDA_TASK_TYPES = setOf("task_overdue", "task_assigned")

/** The "Needs you" rows that show: a task the agenda lists on the same screen is left out. */
fun needsYouShown(
    items: List<AINeedsYouItemDto>?,
    agendaTaskIds: Set<String>,
): List<AINeedsYouItemDto> = items.orEmpty().filterNot { it.type in AGENDA_TASK_TYPES && it.subject?.id in agendaTaskIds }

/** What the picture shows, from the same facts the card under it lists. */
internal fun TodayHouse.sky(agendaTaskIds: Set<String>): SkyHouse {
    val first = needsYouShown(needsYou, agendaTaskIds).firstOrNull()
    return SkyHouse(
        mailbox = mailbox,
        onMail = onOpenMail.takeIf { mailbox && unopenedMail > 0 },
        note = first?.title,
        onNote = first?.link?.let { link -> { onOpenLink(link) } },
        lantern = plan?.first,
        onLantern = plan?.second,
    )
}

private const val ISO_DAY = 10
private const val WEEK_DAYS = 7L
private val DAY_CODES = listOf("MO", "TU", "WE", "TH", "FR", "SA", "SU")

/** A general date's own day: a holiday's move is undone, so the weekday is the schedule's. */
private fun PlaceCalendarEvent.generalDay(): LocalDate? = runCatching { LocalDate.parse((movedFrom ?: date).take(ISO_DAY)) }.getOrNull()

/** The garbage date the question is about: the city's next one (never the household's own). */
internal fun generalGarbageDate(calendar: PlaceAddressCalendarData): PlaceCalendarEvent? =
    calendar.upcoming.firstOrNull { it.kind == "garbage" && !it.isHouseholds && it.generalDay() != null }

/**
 * The household's schedule as the address's general schedule shows it, for garbage and recycling: what "Yes, remind me"
 * saves. Two dates a week apart are every week; a single date in the two weeks is every other week from it.
 */
internal fun generalSchedule(calendar: PlaceAddressCalendarData): List<PickupCollection> =
    listOf("garbage", "recycling").mapNotNull { kind ->
        val days = calendar.upcoming.filter { it.kind == kind && !it.isHouseholds }.mapNotNull { it.generalDay() }.sorted()
        val first = days.firstOrNull() ?: return@mapNotNull null
        val weekly = days.any { ChronoUnit.DAYS.between(first, it) == WEEK_DAYS }
        PickupCollection(
            kind = kind,
            interval = if (weekly) 1 else 2,
            weekdays = listOf(DAY_CODES[first.dayOfWeek.value - 1]),
            anchorDate = first.toString(),
        )
    }

/** "Garbage and recycling": the kinds collected tomorrow. */
internal fun pickupKindsLine(kinds: List<String>): String {
    val words = kinds.map { if (it == "yard_waste") "yard waste" else it }
    val line = if (words.size > 1) "${words.dropLast(1).joinToString(", ")} and ${words.last()}" else words.firstOrNull().orEmpty()
    return line.replaceFirstChar { it.uppercase() }
}

/** Above this font scale the question's two buttons stack. */
private const val QUESTION_STACKS_ABOVE = 1.3f

/**
 * One question, already answered (board H4): "Bins go out Tuesday. Remind you Monday night?" from the city's general
 * schedule, while the household has none of its own. "Yes, remind me" saves that schedule and turns the reminder on;
 * "Change day" opens the pickup editor.
 */
@Composable
internal fun TodayHouseQuestion(
    garbage: PlaceCalendarEvent,
    busy: Boolean,
    onYes: () -> Unit,
    onChange: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val day = garbage.generalDay() ?: return
    val weekday = day.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.US)
    val before = day.minusDays(1).dayOfWeek.getDisplayName(TextStyle.FULL, Locale.US)
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.infoBg)
                .border(1.dp, PantopusColors.primary600, shape)
                .padding(16.dp)
                .testTag("today.house.question"),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            "Bins go out $weekday. Remind you $before night?",
            fontSize = 17.sp,
            lineHeight = 22.sp,
            fontWeight = FontWeight.Bold,
            color = PantopusColors.appText,
            modifier = Modifier.semantics { heading() },
        )
        // Whose schedule the date comes from, by the date's own scope (a city's, or a county's public map, or a state's).
        val whose =
            when (garbage.scope) {
                "county" -> "county's"
                "state" -> "state's"
                else -> "city's"
            }
        Text(
            if (garbage.confidence == "unverified") {
                "From your $whose schedule, not confirmed. Change it if yours differs."
            } else {
                "From your $whose schedule. Change it if yours differs."
            },
            fontSize = 13.sp,
            lineHeight = 18.sp,
            color = PantopusColors.appTextSecondary,
        )
        val yes: @Composable (Modifier) -> Unit = { m ->
            PrimaryButton("Yes, remind me", onYes, modifier = m.testTag("today.house.question.yes"), isLoading = busy, isEnabled = !busy)
        }
        val change: @Composable (Modifier) -> Unit = { m ->
            GhostButton("Change day", onChange, modifier = m.testTag("today.house.question.change"), isEnabled = !busy)
        }
        if (LocalDensity.current.fontScale > QUESTION_STACKS_ABOVE) {
            Column(modifier = Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                yes(Modifier.fillMaxWidth())
                change(Modifier.fillMaxWidth())
            }
        } else {
            Row(modifier = Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                yes(Modifier.weight(1f))
                change(Modifier.weight(1f))
            }
        }
    }
}
