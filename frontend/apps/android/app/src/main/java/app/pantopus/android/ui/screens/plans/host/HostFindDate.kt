@file:Suppress("MatchingDeclarationName")

package app.pantopus.android.ui.screens.plans.host

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.plans.PlanDateOptionInput
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.ui.components.FutureDateTimePickerDialogs
import app.pantopus.android.ui.screens.plans.components.PlanField
import app.pantopus.android.ui.screens.plans.components.PlanFormCard
import app.pantopus.android.ui.screens.plans.components.PlanOptionRow
import app.pantopus.android.ui.screens.plans.components.PlanTimePickerDialog
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing
import java.time.Duration
import java.time.LocalDateTime
import java.time.ZoneId

/*
 * The holidays' find a date on the host form (08-extras section 2, board 26): "Let guests pick the date" under "Add to
 * this plan". On, the form's "When" card gives way to the two to five times the host offers, each with "Remove", and
 * "Add a time" with "Up to 5" (the form's own time is the first). The same list is the Change screen's while a plan is
 * picking, where at least two stay. As iPhone #4300 and #4312.
 */

/** One offered time. On the Change screen a kept time also carries the server's [text] and the value it [asRead]. */
data class DateOptionDraft(
    val key: Int,
    val start: LocalDateTime,
    val end: LocalDateTime,
    val text: String? = null,
    val asRead: PlanDateOptionInput? = null,
) {
    /** As creating and changing a plan take it: a kept time exactly as the server sent it, so it keeps its ticks. */
    fun toInput(zone: ZoneId): PlanDateOptionInput =
        asRead ?: PlanDateOptionInput(
            startsAt = start.atZone(zone).toInstant().toString(),
            endsAt = end.atZone(zone).toInstant().toString(),
        )
}

/** The most times a host offers, and the fewest a plan picks from. */
const val DATE_OPTIONS_MOST = 5
const val DATE_OPTIONS_FEWEST = 2

/** Why the host form can't go on with fewer than two times (iPhone's words). */
internal const val DATE_OPTIONS_TOO_FEW =
    "Add at least two times for guests to pick from, or switch off “Let guests pick the date”."

/** [options] with a time added, in order of start, under a key none of them has. */
internal fun List<DateOptionDraft>.adding(
    start: LocalDateTime,
    end: LocalDateTime,
): List<DateOptionDraft> {
    val key = (maxOfOrNull { it.key } ?: 0) + 1
    return (this + DateOptionDraft(key = key, start = start, end = end)).sortedBy { it.start }
}

/** The host form's "When" while find a date is on: the times, "Add a time" and "Up to 5". */
@Composable
internal fun OfferedTimesField(
    ui: HostUi,
    vm: HostFlowViewModel,
) {
    PlanField(label = "When", modifier = Modifier.testTag("planFindDateTimes")) {
        OfferedTimesCard(
            options = ui.draft.dateOptions.orEmpty(),
            zone = ui.zone,
            onAdd = vm::addDateOption,
            onRemove = vm::removeDateOption,
        )
    }
}

/** The times, each with "Remove" (off at [keepsAtLeast]), and "Add a time" with "Up to 5". */
@Composable
internal fun OfferedTimesCard(
    options: List<DateOptionDraft>,
    zone: ZoneId,
    onAdd: (LocalDateTime, LocalDateTime) -> Unit,
    onRemove: (Int) -> Unit,
    keepsAtLeast: Int = 0,
) {
    var adding by remember { mutableStateOf(false) }
    PlanFormCard {
        options.forEachIndexed { index, option ->
            val text = option.text ?: PlanFormat.whenLine(option.start.atZone(zone), option.end.atZone(zone))
            PlanOptionRow(first = index == 0) {
                Text(text = text, style = PantopusTextStyle.body, color = PantopusColors.appText, modifier = Modifier.weight(1f))
                SmallAction(
                    title = "Remove",
                    spoken = "Remove $text",
                    enabled = options.size > keepsAtLeast,
                    tag = "planFindDateRemove",
                    onClick = { onRemove(option.key) },
                )
            }
        }
        val canAdd = options.size < DATE_OPTIONS_MOST
        PlanOptionRow(first = options.isEmpty(), onClick = if (canAdd) ({ adding = true }) else null) {
            Row(
                modifier = Modifier.weight(1f).alpha(if (canAdd) 1f else DISABLED_ALPHA).testTag("planFindDateAdd"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
            ) {
                PantopusIconImage(icon = PantopusIcon.Plus, contentDescription = null, size = 18.dp, tint = PantopusColors.primary600)
                Text(text = "Add a time", style = STRONG, color = PantopusColors.primary600)
            }
            Text(text = "Up to 5", style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
    }
    if (adding) {
        val last = options.lastOrNull()
        AddTimeDialogs(
            // The day after the last time offered, as long as it.
            initialStart = last?.start?.plusDays(1),
            length = last?.let { Duration.between(it.start, it.end) } ?: Duration.ofHours(2),
            onAdd = { start, end ->
                adding = false
                onAdd(start, end)
            },
            onDismiss = { adding = false },
        )
    }
}

/** "Add a time": when it starts (a day, then a time), then when it ends; dismissing either adds nothing. */
@Composable
private fun AddTimeDialogs(
    initialStart: LocalDateTime?,
    length: Duration,
    onAdd: (LocalDateTime, LocalDateTime) -> Unit,
    onDismiss: () -> Unit,
) {
    var start by remember { mutableStateOf<LocalDateTime?>(null) }
    val picked = start
    if (picked == null) {
        FutureDateTimePickerDialogs(initial = initialStart, onPicked = { start = it }, onDismiss = onDismiss)
    } else {
        PlanTimePickerDialog(
            initial = picked.plus(length).toLocalTime(),
            onPicked = { time ->
                var end = LocalDateTime.of(picked.toLocalDate(), time)
                if (!end.isAfter(picked)) end = end.plusDays(1)
                onAdd(picked, end)
            },
            onDismiss = onDismiss,
        )
    }
}

/** A small text action at the end of a row ("Remove"), at least 48 dp tall to tap. */
@Composable
private fun SmallAction(
    title: String,
    spoken: String,
    enabled: Boolean,
    tag: String,
    onClick: () -> Unit,
) {
    Text(
        text = title,
        style = STRONG,
        color = if (enabled) PantopusColors.primary600 else PantopusColors.appTextSecondary,
        modifier =
            Modifier
                .defaultMinSize(minHeight = 48.dp)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .semantics { contentDescription = spoken }
                .padding(horizontal = Spacing.s2, vertical = Spacing.s3)
                .testTag(tag),
    )
}

/** The Change screen's "When" while a plan is picking: the times and what removing one does. */
@Composable
internal fun ChangeOfferedTimes(
    options: List<DateOptionDraft>,
    zone: ZoneId,
    onAdd: (LocalDateTime, LocalDateTime) -> Unit,
    onRemove: (Int) -> Unit,
) {
    PlanField(label = "When", modifier = Modifier.testTag("planChangeTimes")) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            OfferedTimesCard(options = options, zone = zone, onAdd = onAdd, onRemove = onRemove, keepsAtLeast = DATE_OPTIONS_FEWEST)
            Text(
                text = "Removing a time clears its ticks.",
                style = PantopusTextStyle.caption,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.testTag("planChangeTimesNote"),
            )
        }
    }
}

private const val DISABLED_ALPHA = 0.5f
private val STRONG = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold)
