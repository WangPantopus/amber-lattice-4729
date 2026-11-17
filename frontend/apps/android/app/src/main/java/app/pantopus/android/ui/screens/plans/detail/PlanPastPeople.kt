package app.pantopus.android.ui.screens.plans.detail

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.plans.PlanPastPersonDto
import app.pantopus.android.data.api.models.plans.PlanPastPlanDto
import app.pantopus.android.data.plans.PlanKind
import app.pantopus.android.ui.components.PantopusCheckbox
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.components.LARGE_TEXT_SCALE
import app.pantopus.android.ui.screens.plans.components.PlanAvatar
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanTile
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.screens.plans.map.planH3
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/*
 * Plans for the holidays, the same people again (08-extras section 6, board 30): a row in the invite sheet, then the
 * host's past plans with "Invite all", then that plan's people with a check each before anything goes. The host never
 * sees a guest's email here: the server sends names only.
 */

/** "People from a past plan", under "Text an invite". */
@Composable
internal fun PastPeopleRow(onOpen: () -> Unit) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .planCard()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(14.dp)
                .semantics(mergeDescendants = true) {}
                .testTag("planInvitePastPlan"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PlanIconTile(PantopusIcon.Users, PantopusColors.primary100, PantopusColors.primary700, size = 40.dp, glyph = 20.dp, corner = 12.dp)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "People from a past plan",
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(
                text = "Invite everyone who came, in one tap",
                style = PantopusTextStyle.small,
                color = PantopusColors.appTextSecondary,
            )
        }
        PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 16.dp, tint = PantopusColors.appTextMuted)
    }
}

/** Board 30 inside the invite sheet: a header with Back, then the plans or one plan's people. */
@Composable
internal fun PastPeoplePageContent(
    ui: PlanPastPeopleUi,
    vm: PlanPastPeopleViewModel,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s4), modifier = Modifier.testTag("planPastPeople")) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s3)) {
            PlanRoundButton(icon = PantopusIcon.ChevronLeft, label = "Back", onClick = vm::back, glass = false)
            Text(
                text = if (ui.page == PastPeoplePage.People) ui.people?.title.orEmpty() else "People from a past plan",
                style = planH3,
                color = PantopusColors.appText,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
        }
        when (ui.page) {
            PastPeoplePage.People -> PeopleList(ui, onToggle = vm::toggle)
            else -> PlansList(ui, onInviteAll = vm::choosePlan)
        }
        ui.error?.let { Text(text = it, style = PantopusTextStyle.small, color = PantopusColors.error) }
        PlanScopeLine(
            "Each person is invited the way they were last time: on Pantopus or by email. You can take anyone out before it goes.",
            icon = PantopusIcon.Info,
        )
    }
}

/** The plans, each with its date, "{12} people" and "Invite all". */
@Composable
private fun PlansList(
    ui: PlanPastPeopleUi,
    onInviteAll: (PlanPastPlanDto) -> Unit,
) {
    Text(
        text = "Invite everyone who came to one of your plans, in one tap.",
        style = PantopusTextStyle.body,
        color = PantopusColors.appTextSecondary,
    )
    Column(modifier = Modifier.fillMaxWidth().planCard().padding(horizontal = 14.dp)) {
        // At the largest text sizes "Invite all" goes under the plan's name, so the name doesn't break mid-word.
        val large = LocalDensity.current.fontScale >= LARGE_TEXT_SCALE
        ui.plans.forEachIndexed { index, plan ->
            if (index > 0) HorizontalDivider(color = PantopusColors.appBorder)
            val inviteAll: @Composable () -> Unit = {
                SmallOutlinedButton(
                    title = "Invite all",
                    spoken = "Invite all from ${plan.title}",
                    enabled = !ui.loadingPeople,
                    onClick = { onInviteAll(plan) },
                )
            }
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.s3).testTag("planPastPlan"),
                verticalArrangement = Arrangement.spacedBy(Spacing.s2),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s3)) {
                    PlanTile(PlanKind.from(plan.kind) ?: PlanKind.FOOD_DRINKS, size = 40.dp, glyph = 20.dp, corner = 12.dp)
                    Column(modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
                        Text(
                            text = plan.title,
                            style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                            color = PantopusColors.appText,
                        )
                        Text(
                            text = listOfNotNull(plan.dateText, peopleText(plan.count)).joinToString(" · "),
                            style = PantopusTextStyle.small,
                            color = PantopusColors.appTextSecondary,
                        )
                    }
                    if (!large) inviteAll()
                }
                if (large) inviteAll()
            }
        }
    }
}

/** The names with a check each; a person reached only by text is unchecked and greyed. */
@Composable
private fun PeopleList(
    ui: PlanPastPeopleUi,
    onToggle: (String) -> Unit,
) {
    val from = ui.people ?: return
    Text(
        text = listOfNotNull(from.dateText, peopleText(from.count)).joinToString(" · "),
        style = PantopusTextStyle.small,
        color = PantopusColors.appTextSecondary,
    )
    Column(modifier = Modifier.fillMaxWidth().planCard().padding(horizontal = 14.dp)) {
        from.people.forEachIndexed { index, person ->
            if (index > 0) HorizontalDivider(color = PantopusColors.appBorder)
            PersonRow(person, chosen = person.canInvite && person.key !in ui.skipped, onToggle = { onToggle(person.key) })
        }
    }
}

@Composable
private fun PersonRow(
    person: PlanPastPersonDto,
    chosen: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .alpha(if (person.canInvite) 1f else DISABLED_ALPHA)
                // The whole row is the checkbox (TalkBack: "Ann W., On Pantopus, Checked").
                .toggleable(value = chosen, enabled = person.canInvite, role = Role.Checkbox, onValueChange = { onToggle() })
                .padding(vertical = 10.dp)
                .testTag("planPastPerson"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        PlanAvatar(name = person.name, seed = person.key, avatarUrl = person.avatarUrl)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = person.name,
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(text = viaText(person), style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
        PantopusCheckbox(isChecked = chosen, onCheckedChange = { onToggle() }, modifier = Modifier.clearAndSetSemantics {})
    }
}

/** The send bar under the people: "Invite {n}". */
@Composable
internal fun PastPeopleSendBar(
    ui: PlanPastPeopleUi,
    onSend: () -> Unit,
) {
    if (ui.page != PastPeoplePage.People) return
    val count = ui.chosenCount
    PrimaryButton(
        title = if (count == 1) "Invite 1 person" else "Invite $count people",
        onClick = onSend,
        isLoading = ui.sending,
        isEnabled = count > 0 && !ui.sending,
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s4, vertical = Spacing.s2).testTag("planPastInvite"),
    )
}

/** Board 30's small outlined button. */
@Composable
private fun SmallOutlinedButton(
    title: String,
    spoken: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Text(
        text = title,
        style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
        color = PantopusColors.primary700,
        modifier =
            Modifier
                .heightIn(min = 44.dp)
                .clip(RoundedCornerShape(Radii.md))
                .border(1.dp, PantopusColors.primary600, RoundedCornerShape(Radii.md))
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = 14.dp, vertical = Spacing.s3)
                .clearAndSetSemantics {
                    contentDescription = spoken
                    role = Role.Button
                },
    )
}

private fun peopleText(count: Int): String = if (count == 1) "1 person" else "$count people"

private fun viaText(person: PlanPastPersonDto): String =
    when {
        !person.canInvite || person.via == "text" -> "Came by a text invite · can't be reached again"
        person.via == "email" -> "By email"
        else -> "On Pantopus"
    }

private const val DISABLED_ALPHA = 0.5f
