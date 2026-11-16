@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.plans.guests

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.data.api.models.plans.PlanInviteRowDto
import app.pantopus.android.ui.components.ErrorState
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.components.ToastController
import app.pantopus.android.ui.components.ToastHost
import app.pantopus.android.ui.screens.plans.components.PlanAvatar
import app.pantopus.android.ui.screens.plans.components.PlanDivider
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.PlanOverline
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.screens.plans.detail.PlanInviteSheet
import app.pantopus.android.ui.screens.plans.detail.PlanPlainScaffold
import app.pantopus.android.ui.screens.plans.detail.PlanRoundButton
import app.pantopus.android.ui.screens.plans.map.PlanRowsSkeleton
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/** Who's coming (Plans for the holidays, board 17, spec A5): the host's answers in sections. */
@Composable
fun PlanGuestsScreen(
    onBack: () -> Unit,
    viewModel: PlanGuestsViewModel = hiltViewModel(),
) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val toast = remember { ToastController() }
    LifecycleResumeEffect(Unit) {
        viewModel.load()
        onPauseOrDispose { }
    }
    LaunchedEffect(ui.notice) {
        ui.notice?.let {
            toast.info(it)
            viewModel.noticeShown()
        }
    }
    Box(modifier = Modifier.fillMaxSize().testTag("planGuests")) {
        PlanPlainScaffold(
            onBack = onBack,
            title = "Who's coming",
            trailing = {
                PlanRoundButton(icon = PantopusIcon.Plus, label = "Invite people", onClick = viewModel::openInvite, glass = false)
            },
            footer = if ((ui.remindable > 0 || ui.remindedTodayNow) && ui.list != null) ({ RemindFooter(ui, viewModel::remind) }) else null,
        ) {
            when {
                ui.loading -> PlanRowsSkeleton(rows = 4)
                ui.failed != null ->
                    ErrorState(headline = "Couldn't load who's coming", message = ui.failed.orEmpty(), onRetry = viewModel::load)
                else -> GuestsBody(ui, viewModel)
            }
        }
        ToastHost(controller = toast, modifier = Modifier.align(Alignment.TopCenter))
    }
    ui.confirmRemove?.let { row ->
        val first = row.name.trim().substringBefore(' ').ifBlank { row.name }
        AlertDialog(
            onDismissRequest = viewModel::keep,
            title = { Text("Remove $first?") },
            text = { Text("They'll be told once.") },
            confirmButton = { TextButton(onClick = viewModel::remove) { Text("Remove", color = PantopusColors.error) } },
            dismissButton = { TextButton(onClick = viewModel::keep) { Text("Not now") } },
        )
    }
    val plan = ui.plan
    if (ui.inviting && plan != null) PlanInviteSheet(plan = plan, onDismiss = viewModel::closeInvite)
}

@Composable
private fun GuestsBody(
    ui: PlanGuestsUi,
    vm: PlanGuestsViewModel,
) {
    ui.counts?.let { PlanGuestCountsRow(it) }
    if (ui.waiting.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            PlanOverline("Waiting for you")
            ui.waiting.forEach { row -> WaitingCard(ui, row, vm) }
        }
    }
    GuestSection("Coming", ui.coming, ui, vm)
    GuestSection("Maybe", ui.maybe, ui, vm)
    GuestSection("Haven't answered", ui.noAnswer, ui, vm)
    GuestSection("Can't make it", ui.cantMakeIt, ui, vm)
    if (ui.nobodyYet) {
        Text(
            text = "Nobody has answered yet. Invite people with the plus.",
            style = PantopusTextStyle.body,
            color = PantopusColors.appTextSecondary,
        )
    }
}

/** The three counts in one row (A5 item 2, A6 item 2): coming (with adults and kids), maybe, haven't answered. */
@Composable
internal fun PlanGuestCountsRow(
    counts: PlanGuestCounts,
    modifier: Modifier = Modifier,
) {
    // The three tiles share one height (board 17), however many lines the first one needs.
    Row(
        modifier = modifier.fillMaxWidth().height(IntrinsicSize.Min).testTag("planGuestCounts"),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        CountTile(
            number = counts.coming,
            words = listOfNotNull("coming", counts.adultsKids).joinToString(" · "),
            modifier = Modifier.weight(1f),
        )
        CountTile(number = counts.maybe, words = "maybe", modifier = Modifier.weight(1f))
        CountTile(number = counts.noAnswer, words = "haven't answered", modifier = Modifier.weight(1f))
    }
}

@Composable
private fun CountTile(
    number: Int,
    words: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxHeight()
                .clip(RoundedCornerShape(Radii.lg))
                .background(PantopusColors.appSurfaceSunken)
                .padding(horizontal = Spacing.s3, vertical = 10.dp)
                .semantics(mergeDescendants = true) {},
    ) {
        Text(
            text = number.toString(),
            style = PantopusTextStyle.body.copy(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.Bold),
            color = PantopusColors.appText,
        )
        Text(text = words, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary)
    }
}

/** A guest from the open link who waits for the host's yes: the name, the count, "Not this time" and "Let in". */
@Composable
private fun WaitingCard(
    ui: PlanGuestsUi,
    row: PlanInviteRowDto,
    vm: PlanGuestsViewModel,
) {
    val working = row.id in ui.working
    Column(
        modifier = Modifier.fillMaxWidth().planCard().padding(14.dp).testTag("planGuestWaiting"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Row(
            modifier = Modifier.semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            PlanAvatar(name = row.title, seed = row.id)
            Column(modifier = Modifier.weight(1f)) {
                Text(text = row.title, style = semibold, color = PantopusColors.appText, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(text = ui.waitingLine(row), style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton(
                title = "Not this time",
                onClick = { vm.askNotThisTime(row) },
                isEnabled = !working,
                modifier = Modifier.weight(1f).testTag("planGuestNotThisTime"),
            )
            PrimaryButton(
                title = "Let in",
                onClick = { vm.letIn(row) },
                isLoading = working,
                isEnabled = !working,
                modifier = Modifier.weight(1f).testTag("planGuestLetIn"),
            )
        }
    }
}

@Composable
private fun GuestSection(
    title: String,
    rows: List<PlanGuestRow>,
    ui: PlanGuestsUi,
    vm: PlanGuestsViewModel,
) {
    if (rows.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        PlanOverline(title)
        Column(modifier = Modifier.fillMaxWidth().planCard().padding(horizontal = 14.dp, vertical = Spacing.s1)) {
            rows.forEachIndexed { index, row ->
                if (index > 0) PlanDivider()
                GuestRow(row, working = (row.inviteId ?: row.requestId) in ui.working, onRemove = { vm.askRemove(row) })
            }
        }
    }
}

/**
 * One person: a picture or first letter (an address or a text invite draws its glyph), the name and the line under
 * it. A long press (or TalkBack's action) offers "Remove {name}" where the row can be removed.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun GuestRow(
    row: PlanGuestRow,
    working: Boolean,
    onRemove: () -> Unit,
) {
    val removable = row.removal != null && !working
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .then(
                    if (removable) {
                        Modifier.combinedClickable(
                            onClick = {},
                            onLongClickLabel = "Remove ${row.name}",
                            onLongClick = onRemove,
                        )
                    } else {
                        Modifier
                    },
                ).semantics(mergeDescendants = true) {
                    if (removable) {
                        customActions =
                            listOf(
                                CustomAccessibilityAction("Remove ${row.name}") {
                                    onRemove()
                                    true
                                },
                            )
                    }
                }.padding(vertical = Spacing.s2)
                .testTag("planGuestRow"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        when (row.channel) {
            "email" -> ChannelTile(PantopusIcon.Mail)
            "link" -> ChannelTile(PantopusIcon.MessageCircle)
            else -> PlanAvatar(name = row.name, seed = row.userId ?: row.key, avatarUrl = row.avatarUrl)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = row.name, style = semibold, color = PantopusColors.appText, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(text = row.line, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
    }
}

/** An address or a text invite: its glyph in a round tile where a picture would be. */
@Composable
private fun ChannelTile(icon: PantopusIcon) {
    PlanIconTile(icon, PantopusColors.appSurfaceSunken, PantopusColors.appTextStrong, size = 40.dp, glyph = 18.dp, corner = 20.dp)
}

/** "Remind {n} people", the note about unopened text invites, and "Reminded today" once used. */
@Composable
private fun RemindFooter(
    ui: PlanGuestsUi,
    onRemind: () -> Unit,
) {
    val n = ui.remindable
    PrimaryButton(
        title =
            when {
                ui.remindedTodayNow -> "Reminded today"
                n == 1 -> "Remind 1 person"
                else -> "Remind $n people"
            },
        onClick = onRemind,
        isLoading = ui.reminding,
        isEnabled = !ui.reminding && !ui.remindedTodayNow,
        modifier = Modifier.fillMaxWidth().testTag("planGuestsRemind"),
    )
    if (ui.hasUnopenedText) {
        Text(
            text = "A text invite that hasn't been opened has nobody to remind",
            style = PantopusTextStyle.caption,
            color = PantopusColors.appTextSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
        )
    }
}

private val semibold = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold)
