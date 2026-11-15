@file:Suppress("MagicNumber")

package app.pantopus.android.ui.screens.plans.host

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.plans.PlanInviteCandidateDto
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlanKind
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.Shimmer
import app.pantopus.android.ui.screens.plans.components.PlanAvatar
import app.pantopus.android.ui.screens.plans.components.PlanFormCard
import app.pantopus.android.ui.screens.plans.components.PlanOptionRow
import app.pantopus.android.ui.screens.plans.components.PlanOverline
import app.pantopus.android.ui.screens.plans.components.PlanPrivateChip
import app.pantopus.android.ui.screens.plans.components.PlanScopeLine
import app.pantopus.android.ui.screens.plans.components.PlanTypeTag
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.screens.plans.detail.PlanInfoLine
import app.pantopus.android.ui.screens.plans.detail.PlanInviteLines
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/*
 * A private plan's preview (board Preview, Plans step 1): what the people invited see, with the "Private" chip and
 * the place by name, the host's people to invite as it is posted, "Text a link" and "Email" (they post it, then open
 * the invite sheet over it), and who never sees it.
 */

/** What [PrivatePreview] does when tapped. */
internal data class PrivatePreviewActions(
    val onToggle: (String) -> Unit,
    val onRetry: () -> Unit,
    val onTextLink: () -> Unit,
    val onEmail: () -> Unit,
)

/** H7 for a private plan. */
@Composable
internal fun PrivatePreview(
    ui: HostUi,
    kind: PlanKind,
    actions: PrivatePreviewActions,
) {
    val draft = ui.draft
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s4), modifier = Modifier.testTag("planPrivatePreview")) {
        PlanOverline("What the people you invite see")
        InvitedCard(ui, kind)
        Row(modifier = Modifier.fillMaxWidth().padding(top = Spacing.s1), verticalAlignment = Alignment.CenterVertically) {
            PlanOverline("Invite", modifier = Modifier.weight(1f))
            if (draft.inviteIds.isNotEmpty()) {
                Text(
                    text = "${draft.inviteIds.size} chosen",
                    style = PantopusTextStyle.small,
                    color = PantopusColors.appTextSecondary,
                    modifier = Modifier.testTag("planInviteChosenCount"),
                )
            }
        }
        InvitePeople(ui, actions)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SmallSecondaryButton(
                title = "Text a link",
                icon = PantopusIcon.MessageCircle,
                enabled = !ui.posting,
                onClick = actions.onTextLink,
                modifier = Modifier.weight(1f).testTag("planTextLink"),
            )
            SmallSecondaryButton(
                title = "Email",
                icon = PantopusIcon.Mail,
                enabled = !ui.posting,
                onClick = actions.onEmail,
                modifier = Modifier.weight(1f).testTag("planEmailInvite"),
            )
        }
        PlanScopeLine(
            "Not on the map, the list or Today. A link works for one person; passed on, it says only “This plan is private.”",
        )
        if (draft.atHome) {
            PlanScopeLine("People you invite see your address once they say they're in.", icon = PantopusIcon.Home)
        }
    }
}

/** The card as the people invited read it: kind and "Private", the title, when, the place by name, and the host. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InvitedCard(
    ui: HostUi,
    kind: PlanKind,
) {
    val draft = ui.draft
    val start = draft.start
    val whenText =
        when {
            start == null -> ""
            // A playdate's guests see the part of the day until they're in, as on the public preview.
            kind == PlanKind.PLAYDATE -> PlanFormat.dayPartPhrase(start.atZone(ui.zone))
            else -> PlanFormat.whenLine(start.atZone(ui.zone), draft.end?.atZone(ui.zone), long = true)
        }
    val city = ui.previewArea?.removePrefix("Near ")?.takeIf(String::isNotBlank) ?: ui.home?.city?.takeIf { draft.atHome }
    // At a home the address waits until they say they're in; a public place shows by name.
    val place =
        if (draft.atHome) {
            listOfNotNull("${ui.hostName.substringBefore(' ')}'s place", city).joinToString(", ")
        } else {
            listOfNotNull(draft.place?.name, city).joinToString(", ")
        }
    Column(
        modifier = Modifier.fillMaxWidth().planCard().padding(Spacing.s4).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.s2), verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            PlanTypeTag(kind)
            PlanPrivateChip()
        }
        Text(text = draft.title.ifBlank { kind.label }, style = PantopusTextStyle.h3, color = PantopusColors.appText)
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
            if (whenText.isNotBlank()) PlanInfoLine(PantopusIcon.Calendar, whenText)
            if (place.isNotBlank()) PlanInfoLine(if (draft.atHome) PantopusIcon.Home else PantopusIcon.MapPin, place)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PlanAvatar(name = ui.hostName, avatarUrl = ui.hostAvatar, size = 30.dp)
            val noun =
                if (kind == PlanKind.PLAYDATE) {
                    if (draft.spots == 1) "family" else "families"
                } else {
                    if (draft.spots == 1) "spot" else "spots"
                }
            Text(
                text = "${ui.hostName} · ${draft.spots} $noun",
                style = PantopusTextStyle.small,
                color = PantopusColors.appText,
            )
        }
    }
}

/** The host's people, each with a checkbox; while loading, after a failure, or with nobody to list yet. */
@Composable
private fun InvitePeople(
    ui: HostUi,
    actions: PrivatePreviewActions,
) {
    when (val people = ui.invitePeople) {
        HostInvitePeople.Idle, HostInvitePeople.Loading ->
            Column(
                modifier = Modifier.semantics { contentDescription = "Loading your people" },
                verticalArrangement = Arrangement.spacedBy(Spacing.s3),
            ) {
                repeat(LOADING_ROWS) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s3)) {
                        Shimmer(width = 40.dp, height = 40.dp, cornerRadius = 20.dp)
                        Shimmer(width = 160.dp, height = 14.dp)
                    }
                }
            }
        is HostInvitePeople.Failed ->
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2), modifier = Modifier.testTag("planInvitePeopleFailed")) {
                Text(
                    text = "Couldn't load your people",
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                )
                Text(text = people.message, style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
                GhostButton(title = "Try again", onClick = actions.onRetry, modifier = Modifier.testTag("planInvitePeopleRetry"))
            }
        is HostInvitePeople.Loaded ->
            if (people.people.isEmpty()) {
                Text(
                    text =
                        "Your connections and people who came to your plans show here. After you post, you can text a link " +
                            "or email anyone.",
                    style = PantopusTextStyle.small,
                    color = PantopusColors.appTextSecondary,
                )
            } else {
                PlanFormCard(modifier = Modifier.testTag("planInvitePeople")) {
                    people.people.forEachIndexed { index, person ->
                        InvitePersonRow(
                            person = person,
                            first = index == 0,
                            chosen = person.userId in ui.draft.inviteIds,
                            onToggle = { actions.onToggle(person.userId) },
                        )
                    }
                }
            }
    }
}

/** One person: their picture, name and why they're listed; the whole row is the checkbox. */
@Composable
private fun InvitePersonRow(
    person: PlanInviteCandidateDto,
    first: Boolean,
    chosen: Boolean,
    onToggle: () -> Unit,
) {
    PlanOptionRow(
        first = first,
        modifier =
            Modifier
                .testTag("planInvitePerson.${person.userId}")
                .toggleable(value = chosen, role = Role.Checkbox, onValueChange = { onToggle() }),
    ) {
        PlanAvatar(name = person.displayName, seed = person.userId, avatarUrl = person.avatarUrl)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = person.displayName,
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(text = PlanInviteLines.reason(person.reason), style = PantopusTextStyle.small, color = PantopusColors.appTextSecondary)
        }
        InviteCheckbox(chosen)
    }
}

/** The board's checkbox ("cbox"): a 24 dp rounded square, filled with a check when chosen. Drawn only; the row toggles. */
@Composable
private fun InviteCheckbox(chosen: Boolean) {
    val shape = RoundedCornerShape(7.dp)
    Box(
        modifier =
            Modifier
                .size(24.dp)
                .clip(shape)
                .background(if (chosen) PantopusColors.primary600 else PantopusColors.appSurface)
                .border(2.dp, if (chosen) PantopusColors.primary600 else PantopusColors.appTextSecondary, shape)
                .clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        if (chosen) {
            PantopusIconImage(icon = PantopusIcon.Check, contentDescription = null, size = 14.dp, tint = PantopusColors.appTextInverse)
        }
    }
}

/** The board's small secondary button ("btn secondary sm"): surface, a strong hairline, a glyph and a label, 40 dp. */
@Composable
private fun SmallSecondaryButton(
    title: String,
    icon: PantopusIcon,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(Radii.md)
    Row(
        modifier =
            modifier
                .heightIn(min = 44.dp)
                .alpha(if (enabled) 1f else 0.5f)
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorderStrong, shape)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = Spacing.s3)
                .clearAndSetSemantics {
                    contentDescription = title
                    role = Role.Button
                },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2, Alignment.CenterHorizontally),
    ) {
        PantopusIconImage(icon = icon, contentDescription = null, size = 18.dp, tint = PantopusColors.appText)
        Text(
            text = title,
            style = PantopusTextStyle.body.copy(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
            color = PantopusColors.appText,
            maxLines = 1,
        )
    }
}

/** The footer's button for a private plan: "Post and invite 2", or "Post plan" with nobody chosen. */
internal fun privatePostTitle(chosen: Int): String = if (chosen > 0) "Post and invite $chosen" else "Post plan"

private const val LOADING_ROWS = 3
