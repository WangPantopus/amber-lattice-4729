package app.pantopus.android.ui.screens.homes.postal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.components.PrimaryButton
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * Faster home verification's mail check (drawing 8): the Home's saved address, what happens next, and one tap.
 * The request repeats the saved address exactly, as `postcard-requests` requires, so there is nothing to type.
 */
@Composable
internal fun HomePostalOneTap(
    state: HomePostalUiState,
    viewModel: HomePostalViewModel,
    onAddressWrong: () -> Unit,
) {
    val address = state.status?.mailingAddress ?: return
    val shape = RoundedCornerShape(Radii.lg)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .padding(Spacing.s4)
                .testTag("homePostalMailingTo"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s1),
    ) {
        Text("Mailing to".uppercase(), style = PantopusTextStyle.overline, color = PantopusColors.appTextSecondary)
        Text(
            listOf(address.line1, address.line2).filter { it.isNotBlank() }.joinToString(", "),
            style = PantopusTextStyle.h3,
            color = PantopusColors.appText,
        )
        Text(
            listOf(address.city, listOf(address.state, address.postalCode).filter { it.isNotBlank() }.joinToString(" "))
                .filter { it.isNotBlank() }
                .joinToString(", "),
            style = PantopusTextStyle.body,
            color = PantopusColors.appTextSecondary,
        )
        HomePostalButton("This address is wrong", "homePostalAddressWrong", onClick = onAddressWrong)
    }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .padding(Spacing.s4),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        MailStep(number = 1, title = "Today", sub = "We print your card.")
        MailStep(number = 2, title = "In about a week", sub = "It arrives in your mailbox.")
        MailStep(number = 3, title = "You scan it", sub = "Verified by mail. Residency letters and home Mail open.")
    }
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s2), verticalAlignment = Alignment.CenterVertically) {
        PantopusIconImage(icon = PantopusIcon.Lock, contentDescription = null, size = 14.dp, tint = PantopusColors.appTextSecondary)
        Text(
            "The code works only from your account, for 30 days.",
            style = PantopusTextStyle.caption,
            color = PantopusColors.appTextSecondary,
        )
    }
    PrimaryButton(
        title = "Mail my postcard",
        onClick = viewModel::requestMailOneTap,
        modifier = Modifier.fillMaxWidth().testTag("homePostalMailMyPostcard"),
        isEnabled = viewModel.canRequestMail,
    )
    Text(
        "Free. One card at a time.",
        style = PantopusTextStyle.caption,
        color = PantopusColors.appTextMuted,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun MailStep(
    number: Int,
    title: String,
    sub: String,
) {
    Row(
        modifier = Modifier.semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Box(
            modifier = Modifier.size(24.dp).clip(CircleShape).background(PantopusColors.infoBg),
            contentAlignment = Alignment.Center,
        ) {
            Text("$number", style = PantopusTextStyle.caption, fontWeight = FontWeight.Bold, color = PantopusColors.primary700)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = PantopusTextStyle.body, color = PantopusColors.appText)
            Text(sub, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary)
        }
    }
}

/**
 * A scanned card that this account has no card to enter it on (FASTVERIFY): someone may have entered this address
 * without living here, so the person can stop it. The same words as the web's page for a scan.
 */
@Composable
internal fun HomePostalScannedCard(
    state: HomePostalUiState,
    viewModel: HomePostalViewModel,
) {
    val shape = RoundedCornerShape(Radii.lg)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurfaceSunken)
                .padding(Spacing.s4)
                .testTag("homePostalScannedCard"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        if (state.reported) {
            Text("Thank you. We stopped this card and will look into it.", style = PantopusTextStyle.body, color = PantopusColors.appText)
        } else {
            Text("Did you ask for this card?", style = PantopusTextStyle.h3, color = PantopusColors.appText)
            Text(
                "Someone asked Pantopus to mail a code to this address.",
                style = PantopusTextStyle.body,
                color = PantopusColors.appTextSecondary,
            )
            HomePostalButton("This wasn't me", "homePostalNotMe", enabled = !state.reporting, onClick = viewModel::reportScannedCard)
        }
    }
}
