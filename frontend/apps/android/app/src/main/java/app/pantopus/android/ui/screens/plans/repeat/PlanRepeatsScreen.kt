@file:Suppress("MagicNumber", "TooManyFunctions")
@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package app.pantopus.android.ui.screens.plans.repeat

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.plans.PlanMonthDay
import app.pantopus.android.data.plans.PlanRepeatFreq
import app.pantopus.android.data.plans.PlanRepeatPattern
import app.pantopus.android.data.plans.PlanRepeatWords
import app.pantopus.android.ui.screens.plans.components.PlanDivider
import app.pantopus.android.ui.screens.plans.components.PlanField
import app.pantopus.android.ui.screens.plans.components.PlanFormCard
import app.pantopus.android.ui.screens.plans.components.PlanOptionRow
import app.pantopus.android.ui.screens.plans.components.PlanRadio
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanWell
import app.pantopus.android.ui.screens.plans.host.HostFooterButton
import app.pantopus.android.ui.screens.plans.host.HostStepScaffold
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing

/** The Repeats screen's pickers, one at a time. */
private enum class RepeatPicker { AddDay, Until, Count }

/**
 * The Repeats screen (boards Repeats and Monthly, Plans step 2), pushed over a plan's details or the change screen: how
 * often, on which days, when it ends, and the dates that makes. [onDone] gets the pattern, or null for "Doesn't repeat".
 * Back keeps the choices too, as Done does.
 */
@Composable
fun PlanRepeatsScreen(
    setup: PlanRepeatSetup,
    onDone: (PlanRepeatPattern?) -> Unit,
) {
    var editor by remember(setup) { mutableStateOf(PlanRepeatEditor.start(setup)) }
    var picker by remember { mutableStateOf<RepeatPicker?>(null) }
    val done = { onDone(editor.pattern(setup)) }
    BackHandler(onBack = done)
    Box(modifier = Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }.testTag("planRepeats")) {
        HostStepScaffold(
            title = "Repeats",
            step = null,
            leadingClose = false,
            onLeading = done,
            footer = { Box(modifier = Modifier.testTag("planRepeatDone")) { HostFooterButton(title = "Done", onClick = done) } },
        ) {
            FrequencyCard(selected = editor.freq, onSelect = { editor = editor.choose(it) })
            when (editor.freq) {
                PlanRepeatFreq.WEEKLY, PlanRepeatFreq.BIWEEKLY -> DaysField(editor, setup) { editor = editor.toggleDay(it, setup) }
                PlanRepeatFreq.MONTHLY ->
                    MonthDaysField(
                        editor = editor,
                        setup = setup,
                        onRemove = { editor = editor.remove(it, setup) },
                        onAdd = { picker = RepeatPicker.AddDay },
                    )
                null -> Unit
            }
            if (editor.freq != null) {
                EndsField(
                    editor = editor,
                    onDateRow = { if (editor.endsOnDate) picker = RepeatPicker.Until else editor = editor.endOnDate(true) },
                    onCountRow = { if (editor.endsOnDate) editor = editor.endOnDate(false) else picker = RepeatPicker.Count },
                )
                editor.pattern(setup)?.let { SummaryWell(it, setup) }
                HowItWorks()
            }
        }
    }
    when (picker) {
        RepeatPicker.AddDay ->
            PlanAddMonthDayDialog(
                setup = setup,
                taken = editor.monthDays,
                onAdd = { day ->
                    editor = editor.add(day)
                    picker = null
                },
                onDismiss = { picker = null },
            )
        RepeatPicker.Until ->
            PlanRepeatUntilDialog(
                setup = setup,
                current = editor.until,
                onPick = { date ->
                    editor = editor.withUntil(date, setup)
                    picker = null
                },
                onDismiss = { picker = null },
            )
        RepeatPicker.Count ->
            PlanRepeatCountDialog(
                setup = setup,
                current = editor.count,
                onPick = { times ->
                    editor = editor.withCount(times, setup)
                    picker = null
                },
                onDismiss = { picker = null },
            )
        null -> Unit
    }
}

private val semibold = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold)

/** The four ways it can repeat, with their test ids. */
private val frequencies: List<Triple<PlanRepeatFreq?, String, String>> =
    listOf(
        Triple(null, PlanRepeatWords.NONE, "planRepeatNone"),
        Triple(PlanRepeatFreq.WEEKLY, "Every week", "planRepeatWeekly"),
        Triple(PlanRepeatFreq.BIWEEKLY, "Every 2 weeks", "planRepeatBiweekly"),
        Triple(PlanRepeatFreq.MONTHLY, "Every month", "planRepeatMonthly"),
    )

/** "Doesn't repeat", "Every week", "Every 2 weeks", "Every month" as radio rows. */
@Composable
private fun FrequencyCard(
    selected: PlanRepeatFreq?,
    onSelect: (PlanRepeatFreq?) -> Unit,
) {
    PlanFormCard(modifier = Modifier.selectableGroup()) {
        frequencies.forEachIndexed { index, (freq, title, tag) ->
            RepeatRadioRow(first = index == 0, selected = selected == freq, title = title, tag = tag, onClick = { onSelect(freq) })
        }
    }
}

/** A radio row (board "optrow" with "radio"); [trailing] shows the chosen end's value and chevron. */
@Composable
private fun RepeatRadioRow(
    first: Boolean,
    selected: Boolean,
    title: String,
    tag: String,
    onClick: () -> Unit,
    trailing: String? = null,
) {
    PlanOptionRow(
        first = first,
        modifier = Modifier.testTag(tag).selectable(selected = selected, role = Role.RadioButton, onClick = onClick),
    ) {
        PlanRadio(selected = selected)
        Text(text = title, style = semibold, color = PantopusColors.appText, modifier = Modifier.weight(1f))
        if (trailing != null) {
            Text(text = trailing, style = semibold, color = PantopusColors.appText)
            PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 16.dp, tint = PantopusColors.appTextMuted)
        }
    }
}

/** "On these days": the seven round day buttons; the plan's own day is on and stays on. */
@Composable
private fun DaysField(
    editor: PlanRepeatEditor,
    setup: PlanRepeatSetup,
    onToggle: (Int) -> Unit,
) {
    PlanField(label = "On these days") {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (day in 1..7) {
                DayButton(
                    day = day,
                    on = day in editor.weekdays || day == setup.startWeekday,
                    locked = day == setup.startWeekday,
                    onToggle = { onToggle(day) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
        Text(
            text = "Pick one day or several. All seven makes it daily.",
            style = PantopusTextStyle.small,
            color = PantopusColors.appTextSecondary,
        )
    }
}

/** One day (board "day"): a 46 dp round button, filled when on; TalkBack hears the weekday's whole name. */
@Composable
private fun DayButton(
    day: Int,
    on: Boolean,
    locked: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val name = PlanRepeatWords.WEEKDAYS[day - 1]
    Box(
        modifier =
            modifier
                .height(46.dp)
                .clip(CircleShape)
                .background(if (on) PantopusColors.primary600 else Color.Transparent)
                .border(1.dp, if (on) PantopusColors.primary600 else PantopusColors.appTextSecondary, CircleShape)
                .toggleable(value = on, enabled = !locked, role = Role.Checkbox, onValueChange = { onToggle() })
                .testTag("planRepeatDay.$day")
                .semantics {
                    contentDescription = name
                    if (locked) stateDescription = "On, the day the plan starts"
                },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = name.take(1),
            style = PantopusTextStyle.small.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
            color = if (on) PantopusColors.appTextInverse else PantopusColors.appText,
            modifier = Modifier.clearAndSetSemantics {},
        )
    }
}

/** "On" for a month: "The 1st Saturday" rows with their remove buttons, and "+ Add another day" (up to 4). */
@Composable
private fun MonthDaysField(
    editor: PlanRepeatEditor,
    setup: PlanRepeatSetup,
    onRemove: (PlanMonthDay) -> Unit,
    onAdd: () -> Unit,
) {
    PlanField(label = "On") {
        PlanFormCard {
            editor.monthDays.forEachIndexed { index, day ->
                MonthDayRow(
                    day = day,
                    first = index == 0,
                    index = index,
                    onRemove = if (editor.canRemove(day, setup)) ({ onRemove(day) }) else null,
                )
            }
            if (editor.canAdd) {
                PlanOptionRow(first = editor.monthDays.isEmpty(), onClick = onAdd, modifier = Modifier.testTag("planRepeatAddDay")) {
                    PantopusIconImage(icon = PantopusIcon.Plus, contentDescription = null, size = 18.dp, tint = PantopusColors.primary700)
                    Text(text = "Add another day", style = semibold, color = PantopusColors.primary700, modifier = Modifier.weight(1f))
                }
            }
        }
        Text(
            text = "A day of the week (\"the 1st Saturday\") or a date (\"the 15th\").",
            style = PantopusTextStyle.small,
            color = PantopusColors.appTextSecondary,
        )
    }
}

/** One monthly day; [onRemove] is null for the only one the plan's own date falls on, which can't be removed. */
@Composable
private fun MonthDayRow(
    day: PlanMonthDay,
    first: Boolean,
    index: Int,
    onRemove: (() -> Unit)?,
) {
    val words = PlanRepeatWords.monthDayRow(day)
    Column(modifier = Modifier.fillMaxWidth().testTag("planRepeatMonthDay.$index")) {
        if (!first) PlanDivider()
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(vertical = Spacing.s1),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            Text(text = words, style = semibold, color = PantopusColors.appText, modifier = Modifier.weight(1f))
            if (onRemove != null) {
                Box(
                    modifier =
                        Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .clickable(role = Role.Button, onClick = onRemove)
                            .testTag("planRepeatRemoveDay.$index")
                            .clearAndSetSemantics { contentDescription = "Remove ${words.replaceFirstChar { it.lowercase() }}" },
                    contentAlignment = Alignment.Center,
                ) {
                    PantopusIconImage(
                        icon = PantopusIcon.X,
                        contentDescription = null,
                        size = 16.dp,
                        tint = PantopusColors.appTextSecondary,
                    )
                }
            }
        }
    }
}

/** "Ends": on a date (default 12 weeks out, at most a year) or after a number of times (2 to 100). */
@Composable
private fun EndsField(
    editor: PlanRepeatEditor,
    onDateRow: () -> Unit,
    onCountRow: () -> Unit,
) {
    PlanField(label = "Ends") {
        PlanFormCard(modifier = Modifier.selectableGroup()) {
            RepeatRadioRow(
                first = true,
                selected = editor.endsOnDate,
                title = "On a date",
                tag = "planRepeatEndsDate",
                onClick = onDateRow,
                trailing = PlanRepeatWords.endDate(editor.until).takeIf { editor.endsOnDate },
            )
            RepeatRadioRow(
                first = false,
                selected = !editor.endsOnDate,
                title = "After a number of times",
                tag = "planRepeatEndsCount",
                onClick = onCountRow,
                trailing = PlanRepeatWords.times(editor.count).takeUnless { editor.endsOnDate },
            )
        }
    }
}

/** The summary well: "Every Tuesday and Thursday, 6:30–7:30 AM" and "First on Tue, Nov 17. Last on Thu, Feb 4. 24 walks." */
@Composable
private fun SummaryWell(
    pattern: PlanRepeatPattern,
    setup: PlanRepeatSetup,
) {
    val title = PlanRepeatWords.summaryTitle(pattern, setup.start, setup.end)
    val line = remember(pattern, setup) { PlanRepeatWords.summaryLine(pattern, setup.anchor, setup.kind, setup.walkKind) }
    PlanWell(modifier = Modifier.testTag("planRepeatSummary").semantics(mergeDescendants = true) {}) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
            Text(text = title, style = semibold, color = PantopusColors.appText)
            Text(text = line, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
    }
}

/** How a repeating plan works (board Repeats): each date its own plan, and the people who came asked each time. */
@Composable
private fun HowItWorks() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PlanScopeLine("Each date is its own plan. The next one is posted when the last one ends.", icon = PantopusIcon.ArrowsRepeat)
        PlanScopeLine("People who came before are asked each time: \"I'm in\" or \"Can't make it\".", icon = PantopusIcon.Users)
    }
}
