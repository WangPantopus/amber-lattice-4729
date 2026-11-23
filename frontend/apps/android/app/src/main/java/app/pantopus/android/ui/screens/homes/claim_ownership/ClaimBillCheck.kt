@file:Suppress("PackageNaming")

package app.pantopus.android.ui.screens.homes.claim_ownership

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.screens.homes.claim_ownership.components.ClaimHomeChip
import app.pantopus.android.ui.screens.homes.claim_ownership.components.UploadSlot
import app.pantopus.android.ui.screens.shared.wizard.blocks.HeadlineBlock
import app.pantopus.android.ui.screens.shared.wizard.blocks.SubcopyBlock
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * The Bill check (FASTVERIFY phase 4, drawing 10): today's residency upload, for one bill. A photo (the camera, or a
 * picture or PDF already on the phone), then "What we read" and "Use this photo". The server reads the name, address
 * and date at once; its answer gives no read values, so the card names what is read rather than showing it.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
internal fun BillCheckContent(
    homeLabel: String,
    slots: List<ClaimUploadSlotModel>,
    submitError: String?,
    billResult: String?,
    onPick: (String) -> Unit,
    onRemove: (String) -> Unit,
    onTakePhoto: (() -> Unit)?,
) {
    val attached = slots.any { it.state.isAttached }
    Column(modifier = Modifier.fillMaxWidth().testTag("claimOwnership_billCheck"), verticalArrangement = Arrangement.spacedBy(Spacing.s4)) {
        ClaimHomeChip(label = homeLabel)
        HeadlineBlock("Take a photo of a bill")
        SubcopyBlock("A utility bill, bank statement or lease from the last 90 days.")
        if (billResult == "unreadable") BillNote(ClaimOwnershipWizardViewModel.BILL_NOT_SURE, PantopusIcon.Info)
        if (!attached && onTakePhoto != null) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 52.dp)
                        .clip(RoundedCornerShape(Radii.lg))
                        .background(PantopusColors.primary600)
                        .clickable(role = Role.Button, onClick = onTakePhoto)
                        .padding(horizontal = Spacing.s4, vertical = Spacing.s3)
                        .testTag("claimOwnership_billTakePhoto"),
                horizontalArrangement = Arrangement.spacedBy(Spacing.s2, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PantopusIconImage(PantopusIcon.Camera, null, size = 18.dp, tint = PantopusColors.appTextInverse)
                Text(
                    "Take a photo",
                    style = PantopusTextStyle.body,
                    fontWeight = FontWeight.SemiBold,
                    color = PantopusColors.appTextInverse,
                )
            }
        }
        slots.forEach { slot ->
            UploadSlot(
                id = slot.id,
                label = slot.label,
                hint = slot.hint,
                state = slot.state,
                required = slot.required,
                onPick = { onPick(slot.id) },
                onRemove = { onRemove(slot.id) },
            )
        }
        if (attached) {
            val shape = RoundedCornerShape(Radii.lg)
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(shape)
                        .background(PantopusColors.appSurface)
                        .border(1.dp, PantopusColors.appBorder, shape)
                        .padding(Spacing.s4)
                        .testTag("claimOwnership_billWhatWeRead"),
                verticalArrangement = Arrangement.spacedBy(Spacing.s2),
            ) {
                Text("What we read".uppercase(), style = PantopusTextStyle.overline, color = PantopusColors.appTextSecondary)
                listOf("Name", "Address", "Date").forEach { item ->
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2), verticalAlignment = Alignment.CenterVertically) {
                        PantopusIconImage(PantopusIcon.Check, null, size = 16.dp, tint = PantopusColors.success)
                        Text(item, style = PantopusTextStyle.body, color = PantopusColors.appText)
                    }
                }
            }
            BillNote("If the document matches your name and home address, you may be verified right away. Otherwise, a reviewer will check it.", PantopusIcon.Info)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2)) {
            PantopusIconImage(
                PantopusIcon.Lock,
                null,
                size = 14.dp,
                tint = PantopusColors.appTextSecondary,
                modifier = Modifier.padding(top = 2.dp),
            )
            Text(
                "Cover account numbers if you like. We only read the name, address and date.",
                style = PantopusTextStyle.caption,
                color = PantopusColors.appTextSecondary,
            )
        }
        submitError?.let { Text(it, style = PantopusTextStyle.caption, color = PantopusColors.error) }
    }
}

@Composable
private fun BillNote(
    text: String,
    icon: PantopusIcon,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.md))
                .background(PantopusColors.infoBg)
                .padding(Spacing.s3),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PantopusIconImage(icon, null, size = 16.dp, tint = PantopusColors.primary700, modifier = Modifier.padding(top = 2.dp))
        Text(text, style = PantopusTextStyle.caption, color = PantopusColors.primary700)
    }
}
