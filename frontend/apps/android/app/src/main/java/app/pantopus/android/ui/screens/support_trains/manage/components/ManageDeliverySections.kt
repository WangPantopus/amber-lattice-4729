@file:Suppress("PackageNaming", "LongMethod", "LongParameterList", "TooManyFunctions")

package app.pantopus.android.ui.screens.support_trains.manage.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pantopus.android.data.api.models.geo.NormalizedAddress
import app.pantopus.android.data.support_trains.SupportTrainRecipientDetails
import app.pantopus.android.ui.components.AddressSuggestions
import app.pantopus.android.ui.screens.support_trains.manage.ManageAddressEditor
import app.pantopus.android.ui.screens.support_trains.manage.ManageDetailsEditor
import app.pantopus.android.ui.screens.support_trains.start_train.StartSupportTrainHomeOption
import app.pantopus.android.ui.screens.support_trains.start_train.StartSupportTrainVisibility
import app.pantopus.android.ui.screens.support_trains.start_train.components.DeliveryAddressPicker
import app.pantopus.android.ui.screens.support_trains.start_train.components.SupportTrainChoiceRow
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing

/**
 * Where help goes and what helpers are told (A1): a train made without an address, or with a wrong one, gets one
 * here, and the household's details can be added or changed.
 */
@Composable
fun ManageDeliverySection(
    address: String?,
    details: SupportTrainRecipientDetails,
    isBusy: Boolean,
    canEdit: Boolean,
    onEditAddress: () -> Unit,
    onEditDetails: () -> Unit,
    canEditAddress: Boolean = canEdit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag("manageTrainDeliverySection"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        ManageSectionHeader(
            title = "Deliver to",
            actionLabel = if (canEditAddress) (if (address == null) "Add" else "Change") else null,
            actionTag = "manageTrainEditAddressButton",
            onAction = onEditAddress.takeIf { canEditAddress && !isBusy },
        )
        ManageCard {
            Text(
                text = address ?: "No delivery address yet",
                color = if (address == null) PantopusColors.appTextMuted else PantopusColors.appText,
                fontSize = 14.sp,
                fontWeight = if (address == null) FontWeight.Normal else FontWeight.SemiBold,
                modifier = Modifier.testTag("manageTrainDeliveryAddress"),
            )
            Text(
                text =
                    if (address == null) {
                        "Add where meals go, so you can share the address with helpers who sign up."
                    } else {
                        "Only organizers and the person it's for see it, until you share it with a helper."
                    },
                color = PantopusColors.appTextSecondary,
                fontSize = 12.sp,
            )
        }
        ManageSectionHeader(
            title = "Details for helpers",
            actionLabel = if (canEdit) "Edit" else null,
            actionTag = "manageTrainEditDetailsButton",
            onAction = onEditDetails.takeIf { canEdit && !isBusy },
        )
        ManageCard {
            val lines = detailLines(details)
            if (lines.isEmpty()) {
                Text(
                    text = "No household details yet: size, allergies, diet, contactless drop-off, instructions.",
                    color = PantopusColors.appTextMuted,
                    fontSize = 13.sp,
                )
            }
            lines.forEach { (label, value) ->
                Row(modifier = Modifier.fillMaxWidth().testTag("manageTrainDetail-$label"), verticalAlignment = Alignment.Top) {
                    Text(
                        text = label,
                        color = PantopusColors.appTextSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(end = Spacing.s2),
                    )
                    Text(text = value, color = PantopusColors.appText, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

private fun detailLines(details: SupportTrainRecipientDetails): List<Pair<String, String>> =
    buildList {
        details.householdSize?.let { add("Household" to if (it == 1) "1 person" else "$it people") }
        if (details.allergies.isNotEmpty()) add("Allergies" to details.allergies.joinToString(", ") { it.replace('_', ' ') })
        if (details.dietaryStyles.isNotEmpty()) add("Diet" to details.dietaryStyles.joinToString(", ") { it.replace('_', ' ') })
        if (details.contactlessPreferred) add("Contactless" to "Leave it at the door")
        details.specialInstructions?.takeIf { it.isNotBlank() }?.let { add("Instructions" to it) }
    }

/**
 * Who can see the train (A2): anyone with the link (the default), the organizer's connections and people they
 * invite, or people near the address. A tap saves it.
 */
@Composable
fun ManageAudienceSection(
    sharingMode: String?,
    canEdit: Boolean,
    isBusy: Boolean,
    invitedNames: List<String>,
    invitesFailed: Boolean,
    onSetAudience: (String) -> Unit,
    onInvite: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag("manageTrainAudienceSection"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        ManageSectionHeader(title = "Who can see it")
        AUDIENCE_ORDER.forEach { option ->
            SupportTrainChoiceRow(
                title = option.title,
                subtitle = option.subtitle,
                icon = option.icon,
                isSelected = sharingMode == option.sharingModeWire,
                onSelect = { onSetAudience(option.sharingModeWire) },
                testTag = "manageTrainAudience_${option.sharingModeWire}",
                enabled = canEdit && !isBusy,
            )
        }
        ManageSectionHeader(
            title = if (invitesFailed) "Invited" else "Invited (${invitedNames.size})",
            actionLabel = if (canEdit) "Invite" else null,
            actionTag = "manageTrainInviteButton",
            onAction = onInvite.takeIf { canEdit && !isBusy },
        )
        ManageCard {
            Text(
                text =
                    when {
                        invitesFailed -> "Couldn't load who you invited."
                        invitedNames.isEmpty() -> "No one invited yet."
                        else -> invitedNames.joinToString(", ")
                    },
                color = if (invitedNames.isEmpty()) PantopusColors.appTextMuted else PantopusColors.appText,
                fontSize = 13.sp,
                modifier = Modifier.testTag("manageTrainInvitedNames"),
            )
            Text(
                text =
                    "Invite people you're connected with. They get the train in their Mail, and with \"My connections\" " +
                        "they can open it.",
                color = PantopusColors.appTextSecondary,
                fontSize = 12.sp,
            )
        }
    }
}

private val AUDIENCE_ORDER =
    listOf(
        StartSupportTrainVisibility.LinkOnly,
        StartSupportTrainVisibility.Connections,
        StartSupportTrainVisibility.Nearby,
    )

/** "Deliver to" as a sheet: the organizer's homes, or another address picked from the suggestions. */
@Composable
fun ManageAddressSheet(
    editor: ManageAddressEditor,
    suggestions: AddressSuggestions?,
    isSubmitting: Boolean,
    onSelectHome: (StartSupportTrainHomeOption) -> Unit,
    onChooseAnotherAddress: () -> Unit,
    onAddressQuery: (String) -> Unit,
    onPickAddress: (NormalizedAddress) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    ManageSheetFrame(
        title = "Deliver to",
        saveLabel = if (isSubmitting) "Saving…" else "Save address",
        canSave = editor.delivery != null && !isSubmitting,
        onSave = onSave,
        onCancel = onCancel,
        isSubmitting = isSubmitting,
        testTag = "manageTrainAddressSheet",
    ) {
        DeliveryAddressPicker(
            homeOptions = editor.homeOptions,
            delivery = editor.delivery,
            typingAddress = editor.typingAddress,
            addressQuery = editor.addressQuery,
            suggestions = suggestions,
            onSelectHome = onSelectHome,
            onChooseAnotherAddress = onChooseAnotherAddress,
            onAddressQuery = onAddressQuery,
            onPickAddress = onPickAddress,
            testTagPrefix = "manageTrain",
        )
        Text(
            text = "Helpers who already have the address are told it changed.",
            color = PantopusColors.appTextSecondary,
            fontSize = 12.sp,
        )
    }
}

/** "Details for helpers" as a sheet: household size, allergies, diet, contactless drop-off and instructions. */
@Composable
fun ManageDetailsSheet(
    editor: ManageDetailsEditor,
    isSubmitting: Boolean,
    onChange: (ManageDetailsEditor) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    ManageSheetFrame(
        title = "Details for helpers",
        saveLabel = if (isSubmitting) "Saving…" else "Save details",
        canSave = editor.householdSizeProblem == null && editor.listProblem == null && !isSubmitting,
        onSave = onSave,
        onCancel = onCancel,
        isSubmitting = isSubmitting,
        testTag = "manageTrainDetailsSheet",
    ) {
        SheetField(
            label = "How many people to feed",
            value = editor.householdSize,
            placeholder = "e.g. 4",
            keyboardType = KeyboardType.Number,
            testTag = "manageTrainDetailsHousehold",
            onValueChange = { onChange(editor.copy(householdSize = it.filter(Char::isDigit).take(2))) },
        )
        editor.householdSizeProblem?.let { Text(text = it, color = PantopusColors.error, fontSize = 12.5.sp) }
        SheetField(
            label = "Allergies",
            value = editor.allergies,
            placeholder = "e.g. peanuts, shellfish",
            testTag = "manageTrainDetailsAllergies",
            onValueChange = { onChange(editor.copy(allergies = it.take(LIST_TEXT_LIMIT))) },
        )
        SheetField(
            label = "Diet",
            value = editor.diet,
            placeholder = "e.g. vegetarian, low salt",
            testTag = "manageTrainDetailsDiet",
            onValueChange = { onChange(editor.copy(diet = it.take(LIST_TEXT_LIMIT))) },
        )
        editor.listProblem?.let { Text(text = it, color = PantopusColors.error, fontSize = 12.5.sp) }
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .toggleable(value = editor.contactless, role = Role.Switch) { onChange(editor.copy(contactless = it)) }
                    .padding(vertical = Spacing.s1)
                    .testTag("manageTrainDetailsContactless"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = "Contactless drop-off", color = PantopusColors.appText, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Switch(
                checked = editor.contactless,
                onCheckedChange = null,
                colors =
                    SwitchDefaults.colors(
                        checkedTrackColor = PantopusColors.primary600,
                        checkedThumbColor = PantopusColors.appTextInverse,
                    ),
            )
        }
        SheetField(
            label = "Instructions for helpers",
            value = editor.instructions,
            placeholder = "Gate code, which door, a cooler on the porch…",
            testTag = "manageTrainDetailsInstructions",
            singleLine = false,
            onValueChange = { onChange(editor.copy(instructions = it.take(INSTRUCTIONS_LIMIT))) },
        )
        Text(
            text = "Instructions show only to people who can see the address; the rest to anyone who can open the train.",
            color = PantopusColors.appTextMuted,
            fontSize = 12.sp,
        )
    }
}

/** What the server takes for a list: 50 items of 100 characters, plus the ", " between them. */
private const val LIST_TEXT_LIMIT = 50 * 102

/** The server keeps 2,000 characters of instructions (`special_instructions` max(2000)). */
private const val INSTRUCTIONS_LIMIT = 2000

@Composable
private fun ManageSheetFrame(
    title: String,
    saveLabel: String,
    canSave: Boolean,
    isSubmitting: Boolean,
    onSave: () -> Unit,
    onCancel: () -> Unit,
    testTag: String,
    content: @Composable () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(PantopusColors.appBg)
                .verticalScroll(rememberScrollState())
                .testTag(testTag),
        verticalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Box(
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).background(PantopusColors.appSurface),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = title,
                color = PantopusColors.appText,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Box(
                modifier =
                    Modifier
                        .align(Alignment.CenterStart)
                        .padding(start = Spacing.s2)
                        .heightIn(min = 44.dp)
                        .clickable(enabled = !isSubmitting, onClick = onCancel)
                        .padding(horizontal = Spacing.s3)
                        .testTag("${testTag}Cancel")
                        .semantics {
                            role = Role.Button
                            contentDescription = "Cancel"
                        },
                contentAlignment = Alignment.Center,
            ) {
                Text(text = "Cancel", color = PantopusColors.primary600, fontSize = 14.sp)
            }
        }
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s5),
            verticalArrangement = Arrangement.spacedBy(Spacing.s3),
        ) {
            content()
        }
        Box(modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s4, vertical = Spacing.s3)) {
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clip(RoundedCornerShape(Radii.lg))
                        .background(if (canSave) PantopusColors.primary600 else PantopusColors.appBorderStrong)
                        .clickable(enabled = canSave, onClick = onSave)
                        .testTag("${testTag}Save")
                        .clearAndSetSemantics {
                            role = Role.Button
                            contentDescription = saveLabel
                        },
                contentAlignment = Alignment.Center,
            ) {
                Text(text = saveLabel, color = PantopusColors.appTextInverse, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun SheetField(
    label: String,
    value: String,
    placeholder: String,
    testTag: String,
    onValueChange: (String) -> Unit,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
        Text(
            text = label,
            color = PantopusColors.appTextSecondary,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.clearAndSetSemantics {},
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = singleLine,
            minLines = if (singleLine) 1 else 2,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier =
                Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = label }
                    .testTag(testTag),
            colors =
                OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = PantopusColors.appSurface,
                    unfocusedContainerColor = PantopusColors.appSurface,
                    focusedBorderColor = PantopusColors.primary600,
                    unfocusedBorderColor = PantopusColors.appBorder,
                ),
            placeholder = { Text(text = placeholder, color = PantopusColors.appTextMuted, fontSize = 14.sp) },
        )
    }
}
