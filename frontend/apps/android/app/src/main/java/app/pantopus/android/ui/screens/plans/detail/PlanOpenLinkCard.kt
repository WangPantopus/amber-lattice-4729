package app.pantopus.android.ui.screens.plans.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.components.GhostButton
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.components.PlanDivider
import app.pantopus.android.ui.screens.plans.components.PlanIconTile
import app.pantopus.android.ui.screens.plans.components.PlanTextButton
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing

/**
 * "One link for everyone" (Plans for the holidays, board 16, spec A4), under the invite sheet's ways to invite: the
 * link glyph and what it is for, "Copy link" and "Share", then "I say yes first". "Turn this link off" follows the card
 * once a link exists.
 */
@Composable
internal fun PlanOpenLinkCard(
    ui: PlanInviteUi,
    vm: PlanInviteViewModel,
) {
    if (!ui.showsOpenLink) return
    Column(
        modifier = Modifier.fillMaxWidth().planCard().padding(14.dp).testTag("planOpenLink"),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s3)) {
            PlanIconTile(PantopusIcon.Link, PantopusColors.primary100, PantopusColors.primary700, size = 40.dp, glyph = 20.dp, corner = 12.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "One link for everyone",
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                )
                Text(
                    text = "For the family chat. People answer in a browser, no app needed",
                    style = PantopusTextStyle.small,
                    color = PantopusColors.appTextSecondary,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton(
                title = "Copy link",
                onClick = { vm.useOpenLink(copy = true) },
                isEnabled = !ui.openLinkBusy,
                modifier = Modifier.weight(1f).testTag("planOpenLinkCopy"),
            )
            PrimaryButton(
                title = "Share",
                onClick = { vm.useOpenLink(copy = false) },
                isEnabled = !ui.openLinkBusy,
                modifier = Modifier.weight(1f).testTag("planOpenLinkShare"),
            )
        }
        PlanDivider()
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .toggleable(value = ui.yesFirst, enabled = !ui.openLinkBusy, role = Role.Switch, onValueChange = vm::setYesFirst)
                    .testTag("planOpenLinkYesFirst"),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "I say yes first",
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                )
                Text(
                    text = "People who answer wait for your OK before they get your address",
                    style = PantopusTextStyle.small,
                    color = PantopusColors.appTextSecondary,
                )
            }
            Switch(
                checked = ui.yesFirst,
                onCheckedChange = null,
                colors = SwitchDefaults.colors(checkedTrackColor = PantopusColors.primary600),
            )
        }
    }
    if (ui.openLinkOn) {
        PlanTextButton(
            title = "Turn this link off",
            onClick = vm::askLinkOff,
            danger = true,
            enabled = !ui.openLinkBusy,
            modifier = Modifier.fillMaxWidth().testTag("planOpenLinkOff"),
        )
    }
    if (ui.confirmsLinkOff) {
        AlertDialog(
            onDismissRequest = vm::keepLink,
            title = { Text("Turn this link off?") },
            text = { Text("People who already answered stay.") },
            confirmButton = { TextButton(onClick = vm::turnLinkOff) { Text("Turn off", color = PantopusColors.error) } },
            dismissButton = { TextButton(onClick = vm::keepLink) { Text("Keep it") } },
        )
    }
}
