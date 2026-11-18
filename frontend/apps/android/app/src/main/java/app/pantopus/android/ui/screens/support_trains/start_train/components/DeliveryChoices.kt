@file:Suppress("PackageNaming", "LongParameterList")

package app.pantopus.android.ui.screens.support_trains.start_train.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pantopus.android.data.api.models.geo.NormalizedAddress
import app.pantopus.android.data.api.models.homes.MyHome
import app.pantopus.android.data.api.models.support_trains.SupportTrainDeliveryLocationBody
import app.pantopus.android.ui.components.AddressSuggestionList
import app.pantopus.android.ui.components.AddressSuggestions
import app.pantopus.android.ui.screens.support_trains.start_train.StartSupportTrainDelivery
import app.pantopus.android.ui.screens.support_trains.start_train.StartSupportTrainHomeOption
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * Where a Support Train's help goes (A1), for the Start wizard and Manage: one of the organizer's homes, or another
 * address picked from the suggestions (the app's shared [AddressSuggestions]), so the train has a point and helpers
 * can be given the address. Rows look like the wizard's audience rows.
 */
@Composable
internal fun DeliveryAddressPicker(
    homeOptions: List<StartSupportTrainHomeOption>,
    delivery: StartSupportTrainDelivery?,
    typingAddress: Boolean,
    addressQuery: String,
    suggestions: AddressSuggestions?,
    onSelectHome: (StartSupportTrainHomeOption) -> Unit,
    onChooseAnotherAddress: () -> Unit,
    onAddressQuery: (String) -> Unit,
    onPickAddress: (NormalizedAddress) -> Unit,
    testTagPrefix: String = "startSupportTrain",
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        homeOptions.forEach { home ->
            SupportTrainChoiceRow(
                title = home.title,
                subtitle = home.subtitle,
                icon = PantopusIcon.Home,
                isSelected = delivery?.homeId == home.id,
                onSelect = { onSelectHome(home) },
                testTag = "${testTagPrefix}DeliverHome_${home.id}",
            )
        }
        val typing = typingAddress || homeOptions.isEmpty()
        if (homeOptions.isNotEmpty()) {
            SupportTrainChoiceRow(
                title = "Another address",
                subtitle = "The recipient's home, or wherever meals should go",
                icon = PantopusIcon.MapPin,
                isSelected = typingAddress,
                onSelect = onChooseAnotherAddress,
                testTag = "${testTagPrefix}DeliverAnother",
            )
        }
        if (typing) {
            OutlinedTextField(
                value = addressQuery,
                onValueChange = onAddressQuery,
                placeholder = { Text("Street address", color = PantopusColors.appTextMuted) },
                leadingIcon = {
                    PantopusIconImage(
                        icon = PantopusIcon.MapPin,
                        contentDescription = null,
                        size = Radii.xl,
                        tint = PantopusColors.appTextSecondary,
                    )
                },
                singleLine = true,
                colors =
                    OutlinedTextFieldDefaults.colors(
                        focusedTextColor = PantopusColors.appText,
                        unfocusedTextColor = PantopusColors.appText,
                        focusedBorderColor = PantopusColors.primary600,
                        unfocusedBorderColor = PantopusColors.appBorder,
                        focusedContainerColor = PantopusColors.appSurface,
                        unfocusedContainerColor = PantopusColors.appSurface,
                        cursorColor = PantopusColors.primary600,
                    ),
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Delivery address" }
                        .testTag("${testTagPrefix}AddressField"),
            )
            AddressSuggestionList(
                suggestions = suggestions,
                testTagPrefix = "${testTagPrefix}AddressSuggestion",
                onPicked = onPickAddress,
            )
            val picked = delivery?.takeIf { !it.isHome }
            Text(
                text =
                    if (picked != null) {
                        "Meals go to ${picked.label}."
                    } else {
                        "Pick the address from the suggestions, so helpers can find it."
                    },
                style = PantopusTextStyle.caption,
                color = if (picked != null) PantopusColors.success else PantopusColors.appTextMuted,
                modifier = Modifier.testTag("${testTagPrefix}AddressStatus"),
            )
        }
    }
}

/** One choice of several: radio, icon, title and a line. */
@Composable
internal fun SupportTrainChoiceRow(
    title: String,
    subtitle: String?,
    icon: PantopusIcon,
    isSelected: Boolean,
    onSelect: () -> Unit,
    testTag: String,
    enabled: Boolean = true,
) {
    val bg = if (isSelected) PantopusColors.primary50 else PantopusColors.appSurface
    val shape = RoundedCornerShape(Radii.md)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(bg)
                .border(
                    width = if (isSelected) 2.dp else 1.dp,
                    color = if (isSelected) PantopusColors.primary600 else PantopusColors.appBorder,
                    shape = shape,
                )
                .selectable(selected = isSelected, enabled = enabled, role = Role.RadioButton, onClick = onSelect)
                .padding(Spacing.s3)
                .testTag(testTag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        SupportTrainRadioCircle(isSelected = isSelected)
        PantopusIconImage(
            icon = icon,
            contentDescription = null,
            size = Radii.xl,
            tint = if (isSelected) PantopusColors.primary600 else PantopusColors.appTextSecondary,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            subtitle?.let {
                Text(text = it, style = PantopusTextStyle.caption, color = PantopusColors.appTextSecondary)
            }
        }
    }
}

@Composable
internal fun SupportTrainRadioCircle(isSelected: Boolean) {
    Box(
        modifier =
            Modifier
                .size(20.dp)
                .border(
                    width = 2.dp,
                    color = if (isSelected) PantopusColors.primary600 else PantopusColors.appBorderStrong,
                    shape = CircleShape,
                ),
        contentAlignment = Alignment.Center,
    ) {
        if (isSelected) {
            Box(
                modifier =
                    Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(PantopusColors.primary600),
            )
        }
    }
}

/** The organizer's homes a train may name, and the request shapes for where help goes. */
object SupportTrainHomes {
    /** A trusted occupancy that has ended, or is a guest's or a provider's, doesn't let a train name the home. */
    private val RESIDENT_ROLES = setOf("owner", "admin", "manager", "lease_resident", "member", "restricted_member")
    private val TRUSTED_STATUSES = setOf("verified", "provisional", "provisional_bootstrap")

    /**
     * Mirrors the server's household rule (`householdHomeIds`): a current, trusted occupancy of someone who lives in
     * or runs the home. The create quietly drops a home outside it, so the wizard offers only these.
     */
    fun canDeliverTo(home: MyHome): Boolean {
        val occupancy = home.occupancy ?: return false
        val role = home.roleBase ?: occupancy.roleBase
        val current = occupancy.isActive && occupancy.endAt == null && occupancy.accessEndAt == null
        val trusted = occupancy.verificationStatus in TRUSTED_STATUSES && occupancy.verificationSource != "probation"
        return current && trusted && role in RESIDENT_ROLES
    }

    fun options(homes: List<MyHome>): List<StartSupportTrainHomeOption> =
        homes.filter(::canDeliverTo).map { home ->
            val street = listOfNotNull(home.address, home.address2).filter { it.isNotBlank() }.joinToString(" ")
            val title = home.name?.takeIf { it.isNotBlank() } ?: street.ifBlank { "My home" }
            StartSupportTrainHomeOption(
                id = home.id,
                title = title,
                subtitle = line(street, home.city, home.state, home.zipcode).takeIf { it.isNotBlank() && it != title },
            )
        }

    /** "616 NE 4th Ave, Camas, WA 98607". */
    fun line(
        street: String?,
        city: String?,
        state: String?,
        zip: String?,
    ): String {
        val region = listOfNotNull(state?.trim(), zip?.trim()).filter { it.isNotEmpty() }.joinToString(" ")
        return listOfNotNull(street?.trim(), city?.trim(), region).filter { it.isNotEmpty() }.joinToString(", ")
    }

    fun homeDelivery(option: StartSupportTrainHomeOption): StartSupportTrainDelivery =
        StartSupportTrainDelivery(label = option.subtitle ?: option.title, homeId = option.id)

    /** A picked suggestion with its point, or null when it has none (it can't be a train's place). */
    fun addressDelivery(address: NormalizedAddress): StartSupportTrainDelivery? {
        val street = address.address?.trim().orEmpty()
        val lat = address.latitude
        val lng = address.longitude
        if (street.length < MIN_STREET || lat == null || lng == null) return null
        return StartSupportTrainDelivery(
            label = line(street, address.city, address.state, address.zipcode),
            address = street,
            city = address.city,
            state = address.state,
            zip = address.zipcode,
            latitude = lat,
            longitude = lng,
            placeId = address.placeId,
        )
    }

    fun body(delivery: StartSupportTrainDelivery): SupportTrainDeliveryLocationBody =
        if (delivery.homeId != null) {
            SupportTrainDeliveryLocationBody(mode = "home", homeId = delivery.homeId)
        } else {
            SupportTrainDeliveryLocationBody(
                mode = "address",
                latitude = delivery.latitude,
                longitude = delivery.longitude,
                address = delivery.address,
                city = delivery.city,
                state = delivery.state,
                zip = delivery.zip,
                placeId = delivery.placeId,
            )
        }

    private const val MIN_STREET = 3
}
