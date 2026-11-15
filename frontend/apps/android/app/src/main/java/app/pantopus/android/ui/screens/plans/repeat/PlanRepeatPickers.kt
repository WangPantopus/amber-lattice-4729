@file:Suppress("MagicNumber")
@file:OptIn(
    androidx.compose.material3.ExperimentalMaterial3Api::class,
    androidx.compose.foundation.layout.ExperimentalLayoutApi::class,
)

package app.pantopus.android.ui.screens.plans.repeat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import app.pantopus.android.data.plans.PlanMonthDay
import app.pantopus.android.data.plans.PlanRepeatWords
import app.pantopus.android.data.plans.PlanSeries
import app.pantopus.android.ui.screens.plans.components.PlanChoiceChip
import app.pantopus.android.ui.screens.plans.components.PlanOverline
import app.pantopus.android.ui.screens.plans.components.PlanSegmented
import app.pantopus.android.ui.screens.plans.components.PlanStepperControl
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.math.roundToInt

/*
 * The Repeats screen's pickers (Plans step 2): another day of the month, the end date (within the year), and the
 * number of times (2 to 100). Each keeps what the server would refuse out of reach.
 */

private const val BY_WEEKDAY = "weekday"
private const val BY_DATE = "date"

/**
 * "+ Add another day": a day of the week with which week ("the 2nd Tuesday", "the last Friday"), or a date ("the 15th").
 * A day already on the list can't be added again.
 */
@Composable
internal fun PlanAddMonthDayDialog(
    setup: PlanRepeatSetup,
    taken: List<PlanMonthDay>,
    onAdd: (PlanMonthDay) -> Unit,
    onDismiss: () -> Unit,
) {
    var byDate by remember { mutableStateOf(false) }
    // It opens on the plan's own weekday in the first week not on the list yet ("the 1st Saturday" beside "the 3rd").
    val firstFree = PlanMonthDay.WEEKS.firstOrNull { PlanMonthDay(week = it, weekday = setup.startWeekday) !in taken }
    var week by remember { mutableIntStateOf(firstFree ?: PlanMonthDay.weekOf(setup.date)) }
    var weekday by remember { mutableIntStateOf(setup.startWeekday) }
    var day by remember { mutableIntStateOf(setup.date.dayOfMonth) }
    val choice = if (byDate) PlanMonthDay(day = day) else PlanMonthDay(week = week, weekday = weekday)
    val already = choice in taken
    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.testTag("planRepeatAddDayDialog"),
        title = { Text("Add another day") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Spacing.s3)) {
                PlanSegmented(
                    options = listOf(BY_WEEKDAY to "A day of the week", BY_DATE to "A date"),
                    selected = if (byDate) BY_DATE else BY_WEEKDAY,
                    onSelect = { byDate = it == BY_DATE },
                    optionTags = listOf("planRepeatAddByWeekday", "planRepeatAddByDate"),
                )
                if (byDate) {
                    ChipRow(values = (1..31).toList(), selected = day, label = PlanRepeatWords::nth, tag = "planRepeatAddDate") { day = it }
                    // A 29th to 31st falls only in the months that have it.
                    if (day > 28) Caption("Months without the ${PlanRepeatWords.nth(day)} are skipped.")
                } else {
                    PlanOverline("Which week")
                    ChipRow(values = PlanMonthDay.WEEKS, selected = week, label = ::weekLabel, tag = "planRepeatAddWeek") { week = it }
                    PlanOverline("Which day")
                    ChipRow(
                        values = (1..7).toList(),
                        selected = weekday,
                        label = { PlanRepeatWords.WEEKDAYS[it - 1] },
                        tag = "planRepeatAddWeekday",
                    ) { weekday = it }
                }
                Caption(if (already) "That day is already on the list." else PlanRepeatWords.monthDayRow(choice))
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onAdd(choice) },
                enabled = !already,
                modifier = Modifier.testTag("planRepeatAddDayConfirm"),
            ) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** "1st" … "4th", "Last". */
private fun weekLabel(week: Int): String = PlanRepeatWords.weekWord(week).replaceFirstChar { it.uppercase() }

@Composable
private fun ChipRow(
    values: List<Int>,
    selected: Int,
    label: (Int) -> String,
    tag: String,
    onSelect: (Int) -> Unit,
) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        values.forEach { value ->
            PlanChoiceChip(
                label = label(value),
                selected = value == selected,
                onClick = { onSelect(value) },
                modifier = Modifier.testTag("$tag.$value"),
            )
        }
    }
}

@Composable
private fun Caption(text: String) {
    Text(text = text, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
}

/** "On a date": Android's date picker, from the plan's own date to a year after it. */
@Composable
internal fun PlanRepeatUntilDialog(
    setup: PlanRepeatSetup,
    current: LocalDate,
    onPick: (LocalDate) -> Unit,
    onDismiss: () -> Unit,
) {
    val first = setup.firstEnd
    val last = setup.lastEnd
    val selectable = remember(first, last) { betweenDates(first, last) }
    val state =
        rememberDatePickerState(
            initialSelectedDateMillis = PlanSeries.clamp(current, first, last).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            yearRange = first.year..last.year,
            selectableDates = selectable,
        )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.testTag("planRepeatUntilDialog"),
        confirmButton = {
            TextButton(onClick = {
                val picked = state.selectedDateMillis
                if (picked != null) onPick(Instant.ofEpochMilli(picked).atZone(ZoneOffset.UTC).toLocalDate()) else onDismiss()
            }) { Text("Done") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    ) {
        DatePicker(state = state)
    }
}

/** The days a date picker offers: [first] through [last]. */
private fun betweenDates(
    first: LocalDate,
    last: LocalDate,
): SelectableDates =
    object : SelectableDates {
        override fun isSelectableDate(utcTimeMillis: Long): Boolean {
            val date = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate()
            return !date.isBefore(first) && !date.isAfter(last)
        }

        override fun isSelectableYear(year: Int): Boolean = year in first.year..last.year
    }

/** "After a number of times": 2 to 100 dates from this one on (this one included). */
@Composable
internal fun PlanRepeatCountDialog(
    setup: PlanRepeatSetup,
    current: Int,
    onPick: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val range = setup.minCount..PlanSeries.MAX_COUNT
    var times by remember { mutableIntStateOf(current.coerceIn(range)) }
    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.testTag("planRepeatCountDialog"),
        title = { Text("After a number of times") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Spacing.s3)) {
                PlanStepperControl(value = times, range = range, label = "Times", onChange = { times = it })
                Slider(
                    value = times.toFloat(),
                    onValueChange = { times = it.roundToInt().coerceIn(range) },
                    valueRange = range.first.toFloat()..range.last.toFloat(),
                    steps = (range.last - range.first - 1).coerceAtLeast(0),
                    colors = SliderDefaults.colors(thumbColor = PantopusColors.primary600, activeTrackColor = PantopusColors.primary600),
                    modifier = Modifier.fillMaxWidth().testTag("planRepeatCountSlider"),
                )
                Caption(PlanRepeatWords.times(times))
            }
        },
        confirmButton = { TextButton(onClick = { onPick(times) }, modifier = Modifier.testTag("planRepeatCountConfirm")) { Text("Done") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
