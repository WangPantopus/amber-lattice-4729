package app.pantopus.android.ui.screens.plans.detail

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.plans.PlanChecksDto
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanMyCheckResponse
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.screens.plans.components.PlanOverline
import app.pantopus.android.ui.screens.plans.components.PlanTextButton
import app.pantopus.android.ui.screens.plans.components.planCard
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Spacing

/*
 * Plans for the holidays, the business track, B5: the plan page's ways into the bill at the place. A guest who is in gets
 * "Pay at {business}" (D2, the server's `pay_here.text`), or, once their check is paid, "Paid $47.04" with "Receipt",
 * which opens C2 (07-screens D2, G27); a second check brings the button back. Staff get the guest list's three totals,
 * which open C3.
 */

/** The guest's check (read with the plan) and the way to C1. */
internal data class PlanPayHereEntry(
    val mine: PlanMyCheckResponse?,
    val onOpen: () -> Unit,
)

/** The staff's guest list totals (read with the plan) and the way to C3. */
internal data class PlanChecksEntry(
    val list: PlanChecksDto?,
    val onOpen: () -> Unit,
)

/** "Pay at {business}", or the paid check's row with "Receipt" (C2). Nothing on a plan that doesn't take the bill here. */
@Composable
internal fun PlanPayHereRow(
    plan: PlanDto,
    entry: PlanPayHereEntry,
) {
    val payHere = plan.payHere ?: return
    val check = entry.mine?.check
    if (check != null && check.state != OPEN) {
        Row(
            modifier = Modifier.fillMaxWidth().testTag("planCheckPaidRow"),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
        ) {
            Text(
                text = check.paidTotalText.orEmpty(),
                style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
                modifier = Modifier.weight(1f),
            )
            PlanTextButton(title = "Receipt", onClick = entry.onOpen, modifier = Modifier.fillMaxWidth(RECEIPT_WIDTH))
        }
        return
    }
    PrimaryButton(
        title = payHere.text ?: "Pay",
        onClick = entry.onOpen,
        modifier = Modifier.height(50.dp).testTag("planPayAtBusiness"),
    )
}

/** Staff: the guest list's three totals (the server's words), opening C3. */
@Composable
internal fun PlanChecksCard(
    plan: PlanDto,
    entry: PlanChecksEntry?,
) {
    if (plan.payHere == null || entry == null) return
    val totals = entry.list?.totals
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .planCard()
                .clickable(role = Role.Button, onClick = entry.onOpen)
                .padding(Spacing.s4)
                .testTag("planChecksEntry")
                .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
            PlanOverline("Guest list and checks")
            if (totals != null) {
                Text(
                    text = listOfNotNull(totals.inText, totals.paidText, totals.tipsText).joinToString(" · "),
                    style = PantopusTextStyle.body.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                )
            }
        }
        PantopusIconImage(icon = PantopusIcon.ChevronRight, contentDescription = null, size = 16.dp, tint = PantopusColors.appTextMuted)
    }
}

private const val OPEN = "open"
private const val RECEIPT_WIDTH = 0.35f
