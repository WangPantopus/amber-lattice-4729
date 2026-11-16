@file:Suppress("MagicNumber")
@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)

package app.pantopus.android.ui.screens.plans.repeat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlanRepeatWords
import app.pantopus.android.data.plans.isPrivate
import app.pantopus.android.data.plans.planKind
import app.pantopus.android.data.plans.seriesContinues
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.PlanPrivateChip
import app.pantopus.android.ui.screens.plans.components.PlanTextButton
import app.pantopus.android.ui.screens.plans.components.PlanTile
import app.pantopus.android.ui.screens.plans.components.PlanWell
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.screens.plans.detail.PlanInfoLine
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing

/** What an invited person reads on a repeating plan (board Invited): one answer is for one date. */
const val PLAN_REPEAT_INVITED_LINE = "Say yes to this one; you'll be asked again for each one."

/**
 * "Every Tue and Thu until Feb 4" with the repeat glyph (Plans step 2), under a card's date line: on the preview, the
 * plan page and the pin's card. [text] null draws nothing (a plan that doesn't repeat).
 */
@Composable
fun PlanRepeatLine(
    text: String?,
    modifier: Modifier = Modifier,
    strong: Boolean = true,
) {
    if (text.isNullOrBlank()) return
    PlanInfoLine(
        icon = PantopusIcon.ArrowsRepeat,
        text = text,
        strong = strong,
        modifier = modifier.semantics { testTagsAsResourceId = true }.testTag("planRepeatLine"),
    )
}

/** An invited person's page on a repeating plan: "Say yes to this one; you'll be asked again for each one." */
@Composable
fun PlanRepeatInvitedLine(modifier: Modifier = Modifier) {
    PlanInfoLine(
        icon = PantopusIcon.Check,
        text = PLAN_REPEAT_INVITED_LINE,
        modifier = modifier.semantics { testTagsAsResourceId = true }.testTag("planRepeatInvitedLine"),
    )
}

/** What the host's controls on a repeating plan do (board Regulars). [busy] greys them while one is on its way. */
data class PlanSeriesActions(
    val onSkip: () -> Unit,
    val onChange: () -> Unit,
    val onStop: () -> Unit,
    val busy: Boolean = false,
)

private enum class SeriesConfirm { Skip, Stop }

/**
 * The host's repeating plan (board Regulars, Plans step 2): under Your plans [onOpen] adds the plan's tile, title, "Every
 * Tue and Thu · 6:30 AM" and "Private" (the plan page has its own heading). Then the well ("Next: Thu, Nov 19 · 3 in",
 * "2 of 24 · ends Thu, Feb 4"), "Skip Thursday" and "Change", and "Stop repeating"; Skip and Stop ask first. A series'
 * last date has nothing to skip or stop: only Change shows (the Repeats row there can keep it going).
 */
@Composable
fun PlanSeriesHostCard(
    plan: PlanDto,
    actions: PlanSeriesActions,
    modifier: Modifier = Modifier,
    onOpen: (() -> Unit)? = null,
) {
    val repeat = plan.repeat ?: return
    var confirm by remember { mutableStateOf<SeriesConfirm?>(null) }
    val weekday = PlanRepeatWords.weekdayOf(plan)
    val continues = plan.seriesContinues
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .planCard()
                .padding(14.dp)
                .semantics { testTagsAsResourceId = true }
                .testTag("planSeriesCard"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        if (onOpen != null) SeriesHeader(plan, onOpen)
        SeriesWell(plan, PlanRepeatWords.progressLine(repeat))
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            if (continues) {
                GhostButton(
                    title = "Skip $weekday",
                    onClick = { confirm = SeriesConfirm.Skip },
                    modifier = Modifier.weight(1f).testTag("planSkipDate"),
                    isEnabled = !actions.busy,
                )
            }
            GhostButton(
                title = "Change",
                onClick = actions.onChange,
                modifier = Modifier.weight(1f).testTag("planSeriesChange"),
                isEnabled = !actions.busy,
            )
        }
        if (continues) {
            PlanTextButton(
                title = "Stop repeating",
                onClick = { confirm = SeriesConfirm.Stop },
                danger = true,
                enabled = !actions.busy,
                modifier = Modifier.testTag("planStopRepeating"),
            )
        }
    }
    confirm?.let { asked ->
        SeriesConfirmDialog(
            asked = asked,
            plan = plan,
            weekday = weekday,
            onConfirm = {
                confirm = null
                if (asked == SeriesConfirm.Skip) actions.onSkip() else actions.onStop()
            },
            onDismiss = { confirm = null },
        )
    }
}

/** The well: "Next: Thu, Nov 19" with "3 in", then "2 of 24 · ends Thu, Feb 4". */
@Composable
private fun SeriesWell(
    plan: PlanDto,
    progress: String,
) {
    PlanWell(modifier = Modifier.semantics(mergeDescendants = true) {}.testTag("planSeriesWell")) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = PlanRepeatWords.nextLine(plan),
                    style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "${plan.goingCount} in",
                    style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.success,
                )
            }
            Text(text = progress, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
    }
}

/** Under Your plans: the plan's tile, its title, "Every Tue and Thu · 6:30 AM" and "Private"; a tap opens the plan. */
@Composable
private fun SeriesHeader(
    plan: PlanDto,
    onOpen: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onOpen)
                .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        val kind = plan.planKind
        if (kind != null) {
            PlanTile(kind)
        } else {
            PlanIconTile(PantopusIcon.Calendar, PantopusColors.appSurfaceSunken, PantopusColors.appTextStrong)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = plan.title, style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold), color = PantopusColors.appText)
            PlanRepeatWords.hostCardLine(plan)?.let {
                Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
            }
        }
        if (plan.isPrivate) PlanPrivateChip()
    }
}

/**
 * Asked before Skip ("Skip Thursday's walk? The people who are in are told, and the next date is posted.") and Stop
 * repeating ("This date stays. No more are posted after it."): the action in red, "Not now" to keep it as it is.
 */
@Composable
private fun SeriesConfirmDialog(
    asked: SeriesConfirm,
    plan: PlanDto,
    weekday: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val (title, body, action) =
        when (asked) {
            SeriesConfirm.Skip ->
                Triple(
                    "Skip $weekday's ${PlanFormat.noun(plan)}?",
                    "The people who are in are told, and the next date is posted.",
                    "Skip $weekday",
                )
            SeriesConfirm.Stop -> Triple("Stop repeating?", "This date stays. No more are posted after it.", "Stop repeating")
        }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = {
            TextButton(onClick = onConfirm, modifier = Modifier.testTag("planSeriesConfirm")) { Text(action, color = PantopusColors.error) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Not now") } },
    )
}
