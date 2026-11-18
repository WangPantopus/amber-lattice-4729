@file:Suppress("PackageNaming")

package app.pantopus.android.ui.screens.homes.add_home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import app.pantopus.android.ui.screens.shared.wizard.blocks.HeadlineBlock
import app.pantopus.android.ui.screens.shared.wizard.blocks.SubcopyBlock
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/** The founder's line about the typed address, verbatim, with no added period (FASTVERIFY SPEC section 6). */
private const val ADDRESS_PRIVACY_LINE = "Only you see the address you type, others see your first name, never your address"

/** The founder's line, on "1 of 2" from the first keystroke to the checked address: it is about the address being typed. */
@Composable
internal fun ShortPrivacyLine() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s1).testTag("addHome_privacyLine"),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PantopusIconImage(
            icon = PantopusIcon.Lock,
            contentDescription = null,
            size = 14.dp,
            tint = PantopusColors.appTextSecondary,
            modifier = Modifier.padding(top = 2.dp),
        )
        Text(ADDRESS_PRIVACY_LINE, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary)
    }
}

/**
 * Add Home in two steps, step 1 once an address is picked (FASTVERIFY drawing 1): the search box with the picked street,
 * the checked address with its unit, and who sees it. Typing in the box again goes back to the suggestions.
 */
@Composable
internal fun ShortFindStep(
    state: AddHomeUiState,
    vm: AddHomeWizardViewModel,
) {
    HeadlineBlock("Find your home")
    SubcopyBlock("Type your street address and pick it from the list.")
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s3)) {
        AddHomeSearchField(query = state.homeSearchQuery, onQueryChange = vm::searchAgain, onClear = { vm.searchAgain("") })
        state.zipMismatch?.let { ZipMismatchBanner(mismatch = it, onApply = vm::applyGeocodedZip) }
        CheckedAddressCard(state, onUnitChange = vm::updateShortUnit)
        state.postalNotice?.takeIf { state.isGeocodeResolved }?.let { AddHomePostalNoticeRow(it) }
        ShortPrivacyLine()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CheckedAddressCard(
    state: AddHomeUiState,
    onUnitChange: (String) -> Unit,
) {
    val checked = state.geocodedAddress
    val street = checked?.street ?: state.form.address.street
    val city = checked?.city ?: state.form.address.city
    val region = listOf(checked?.state ?: state.form.address.state, checked?.zipCode ?: state.form.address.zipCode)
    val place = listOf(city, region.filter { it.isNotBlank() }.joinToString(" ")).filter { it.isNotBlank() }.joinToString(", ")
    val shape = RoundedCornerShape(Radii.lg)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(1.dp, PantopusColors.appBorder, shape)
                .padding(Spacing.s4)
                .testTag("addHome_checkedAddress"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s1),
    ) {
        // The pill goes under the label when both don't fit on one line (the largest text sizes).
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalArrangement = Arrangement.spacedBy(Spacing.s1),
        ) {
            Text(
                "Checked address".uppercase(),
                style = PantopusTextStyle.overline,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.align(Alignment.CenterVertically),
            )
            if (state.isGeocodeResolved && state.postalConfirmed) UspsPill()
        }
        Text(
            street,
            style = PantopusTextStyle.h3,
            color = PantopusColors.appText,
            modifier = Modifier.padding(top = Spacing.s1).semantics { heading() },
        )
        if (place.isNotEmpty()) Text(place, style = PantopusTextStyle.body, color = PantopusColors.appTextSecondary)
        Text(
            "Apartment or unit",
            style = PantopusTextStyle.small,
            fontWeight = FontWeight.SemiBold,
            color = PantopusColors.appText,
            modifier = Modifier.padding(top = Spacing.s3),
        )
        OutlinedTextField(
            value = state.form.address.unit,
            onValueChange = onUnitChange,
            placeholder = { Text("None for this home", color = PantopusColors.appTextMuted) },
            singleLine = true,
            enabled = !state.isCheckingAddress && !state.isSubmitting,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth().testTag("addHome_shortUnit"),
        )
        Text("Leave empty if your home has none.", style = PantopusTextStyle.caption, color = PantopusColors.appTextMuted)
    }
}

/** "Confirmed with USPS": the address check's yes, as typed. */
@Composable
private fun UspsPill() {
    Row(
        modifier =
            Modifier
                .clip(RoundedCornerShape(Radii.pill))
                .background(PantopusColors.successBg)
                .padding(horizontal = Spacing.s2, vertical = Spacing.s1),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PantopusIconImage(icon = PantopusIcon.Check, contentDescription = null, size = 12.dp, tint = PantopusColors.success)
        Text("Confirmed with USPS", style = PantopusTextStyle.caption, fontWeight = FontWeight.SemiBold, color = PantopusColors.success)
    }
}

/** How each role reads in two steps (drawing 2). */
private fun AddHomeRole.shortLabel(): Pair<String, String> =
    when (this) {
        AddHomeRole.Owner -> "I own it" to "You can confirm ownership with a document later."
        AddHomeRole.Tenant -> "I rent it" to "The lease is in your name or a housemate's."
        AddHomeRole.HouseholdMember -> "I live here with family or friends" to "Someone else owns or rents it."
    }

/** Add Home in two steps, step 2 (FASTVERIFY drawing 2): how you live here. "Add home" saves it. */
@Composable
internal fun ShortRoleStep(
    state: AddHomeUiState,
    vm: AddHomeWizardViewModel,
) {
    val street = state.geocodedAddress?.street ?: state.form.address.street
    if (street.isNotBlank()) {
        Row(
            modifier =
                Modifier
                    .clip(RoundedCornerShape(Radii.pill))
                    .background(PantopusColors.successBg)
                    .padding(horizontal = Spacing.s3, vertical = Spacing.s1),
            horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PantopusIconImage(icon = PantopusIcon.Home, contentDescription = null, size = 13.dp, tint = PantopusColors.success)
            Text(street.uppercase(), style = PantopusTextStyle.overline, color = PantopusColors.success)
        }
    }
    HeadlineBlock("How do you live here?")
    SubcopyBlock("Pick the one that fits. It sets which tools you get.")
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        AddHomeRole.entries.forEach { role ->
            val (label, sub) = role.shortLabel()
            val selected = state.form.role == role
            val shape = RoundedCornerShape(Radii.lg)
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(shape)
                        .background(if (selected) PantopusColors.primary50 else PantopusColors.appSurface)
                        .border(if (selected) 2.dp else 1.dp, if (selected) PantopusColors.primary600 else PantopusColors.appBorder, shape)
                        .clickable(role = Role.RadioButton, onClick = { vm.selectRole(role) })
                        .padding(Spacing.s4)
                        .testTag("addHome_role_${role.name.lowercase()}")
                        .semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RadioCircle(isSelected = selected)
                Column(modifier = Modifier.weight(1f)) {
                    Text(label, style = PantopusTextStyle.body, fontWeight = FontWeight.SemiBold, color = PantopusColors.appText)
                    Text(sub, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary)
                }
            }
        }
    }
    if (!state.isClaimingExistingHome) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(Radii.lg))
                    .background(PantopusColors.appSurfaceSunken)
                    .padding(Spacing.s3)
                    .testTag("addHome_countyNote"),
            horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
        ) {
            PantopusIconImage(icon = PantopusIcon.Info, contentDescription = null, size = 16.dp, tint = PantopusColors.appTextSecondary)
            Text(
                "We fill in your home's type, size and year built from the county record. Check them anytime in Place.",
                style = PantopusTextStyle.caption,
                color = PantopusColors.appTextSecondary,
            )
        }
    }
}
