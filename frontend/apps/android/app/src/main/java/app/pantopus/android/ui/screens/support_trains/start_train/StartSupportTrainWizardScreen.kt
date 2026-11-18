@file:Suppress("PackageNaming", "LongMethod", "TooManyFunctions", "MagicNumber", "LongParameterList")

package app.pantopus.android.ui.screens.support_trains.start_train

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pantopus.android.core.identity.MadeUpUsername
import app.pantopus.android.data.api.models.geo.NormalizedAddress
import app.pantopus.android.data.api.models.mail_compose.MailRecipientDto
import app.pantopus.android.ui.components.AddressSuggestions
import app.pantopus.android.ui.components.TimeOnlyPickerDialog
import app.pantopus.android.ui.components.firstTapClosesKeyboard
import app.pantopus.android.ui.components.rememberAddressSuggestions
import app.pantopus.android.ui.screens.shared.wizard.WizardIdentity
import app.pantopus.android.ui.screens.shared.wizard.WizardShell
import app.pantopus.android.ui.screens.support_trains.start_train.components.DeliveryAddressPicker
import app.pantopus.android.ui.screens.support_trains.start_train.components.InviteRecipientCard
import app.pantopus.android.ui.screens.support_trains.start_train.components.StartTrainRecipientCard
import app.pantopus.android.ui.screens.support_trains.start_train.components.StepRail
import app.pantopus.android.ui.screens.support_trains.start_train.components.SupportTrainRadioCircle
import app.pantopus.android.ui.screens.support_trains.start_train.components.TrainChip
import app.pantopus.android.ui.theme.PantopusColors
import app.pantopus.android.ui.theme.PantopusIcon
import app.pantopus.android.ui.theme.PantopusIconImage
import app.pantopus.android.ui.theme.PantopusTextStyle
import app.pantopus.android.ui.theme.Radii
import app.pantopus.android.ui.theme.Spacing
import java.time.LocalTime

private const val SCREEN_TAG: String = "startSupportTrainWizard"

@Composable
fun StartSupportTrainWizardScreen(
    onDismiss: () -> Unit = {},
    onOpenTrain: (String) -> Unit = {},
    /** The story from a Pantopus AI Support Train card, which the organizer reviews in the reason step. */
    initialStory: String? = null,
    viewModel: StartSupportTrainViewModel = hiltViewModel(),
) {
    val form by viewModel.form.collectAsStateWithLifecycle()
    LaunchedEffect(initialStory) {
        if (!initialStory.isNullOrBlank() && form.reason.isBlank()) viewModel.updateReason(initialStory.trim())
    }
    val beneficiaryResults by viewModel.beneficiaryResults.collectAsStateWithLifecycle()
    val selectedBeneficiary by viewModel.selectedBeneficiary.collectAsStateWithLifecycle()
    val isSearching by viewModel.isSearching.collectAsStateWithLifecycle()
    val searchFailed by viewModel.beneficiarySearchFailed.collectAsStateWithLifecycle()
    val isEditingQuery by viewModel.isEditingBeneficiaryQuery.collectAsStateWithLifecycle()
    val launchError by viewModel.launchError.collectAsStateWithLifecycle()
    val pendingEvent by viewModel.pendingEvent.collectAsStateWithLifecycle()
    val homeOptions by viewModel.homeOptions.collectAsStateWithLifecycle()
    val recipientNotLinked by viewModel.recipientNotLinked.collectAsStateWithLifecycle()
    val addressSuggestions = rememberAddressSuggestions()

    LaunchedEffect(pendingEvent) {
        val event = pendingEvent ?: return@LaunchedEffect
        when (event) {
            StartSupportTrainEvent.Dismiss -> onDismiss()
            is StartSupportTrainEvent.OpenTrain -> onOpenTrain(event.trainId)
        }
        viewModel.acknowledgePendingEvent()
    }

    WizardShell(
        model = viewModel,
        modifier = Modifier.testTag(SCREEN_TAG),
        identity = WizardIdentity.Warm,
        handleSystemBack = true,
        // Each step opens at its top.
        scrollResetKey = form.step,
    ) {
        when (form.step) {
            StartSupportTrainStep.WhoAndWhy ->
                WhoAndWhyStep(
                    form = form,
                    results = beneficiaryResults,
                    selected = selectedBeneficiary,
                    isSearching = isSearching,
                    mutuals = viewModel.recipientMutuals(),
                    // The no-match card waits until the name is typed.
                    inviteCandidate = if (isEditingQuery) null else viewModel.inviteCandidate(),
                    onQuery = viewModel::updateBeneficiaryQuery,
                    onSelectBeneficiary = viewModel::selectBeneficiary,
                    onClearBeneficiary = viewModel::clearBeneficiary,
                    onSearchAgain = viewModel::searchAgain,
                    onReason = viewModel::updateReason,
                    onToggleInviteOnly = viewModel::toggleInviteOnly,
                    onToggleBlockVisible = viewModel::toggleBlockVisible,
                    onSelectInviteMethod = viewModel::selectInviteMethod,
                    reasonRemaining = viewModel.reasonRemainingChars(),
                    searchFailed = searchFailed,
                    onRetrySearch = viewModel::retryBeneficiarySearch,
                    onQueryFocusChanged = viewModel::setEditingBeneficiaryQuery,
                    homeOptions = homeOptions,
                    addressSuggestions = addressSuggestions,
                    onSelectHome = viewModel::selectHome,
                    onChooseAnotherAddress = viewModel::chooseAnotherAddress,
                    onAddressQuery = { text ->
                        viewModel.updateAddressQuery(text)
                        addressSuggestions?.onTextChanged(text)
                    },
                    onPickAddress = viewModel::pickAddress,
                )
            StartSupportTrainStep.WhatAndWhen ->
                WhatAndWhenStep(
                    form = form,
                    scheduleProblem = viewModel.scheduleProblem(),
                    householdSizeProblem = viewModel.householdSizeProblem(),
                    onStartDate = viewModel::setStartDate,
                    onEndDate = viewModel::setEndDate,
                    onToggleWeekday = viewModel::toggleWeekday,
                    onStartMinutes = viewModel::setStartMinutes,
                    onSelectDuration = viewModel::selectSlotDuration,
                    onHouseholdSize = viewModel::updateHouseholdSize,
                    onAllergies = viewModel::updateAllergies,
                    onDiet = viewModel::updateDiet,
                    onContactless = viewModel::setContactless,
                    onInstructions = viewModel::updateInstructions,
                )
            StartSupportTrainStep.ReviewAndLaunch ->
                ReviewStep(
                    form = form,
                    selectedBeneficiary = selectedBeneficiary,
                    slots = viewModel.generatedSlots(),
                    onSelectVisibility = viewModel::selectVisibility,
                    launchError = launchError,
                )
            StartSupportTrainStep.Success ->
                SuccessStep(
                    slotCount = viewModel.generatedSlots().size,
                    visibility = form.visibility,
                    recipientNotLinked = recipientNotLinked,
                )
        }
    }
}

// ─── Step 1 · Who & why ───────────────────────────────────────────────

@Composable
internal fun WhoAndWhyStep(
    form: StartSupportTrainFormState,
    results: List<MailRecipientDto>,
    selected: MailRecipientDto?,
    isSearching: Boolean,
    mutuals: List<StartSupportTrainMutual>,
    inviteCandidate: StartSupportTrainInviteCandidate?,
    onQuery: (String) -> Unit,
    onSelectBeneficiary: (MailRecipientDto) -> Unit,
    onClearBeneficiary: () -> Unit,
    onSearchAgain: () -> Unit,
    onReason: (String) -> Unit,
    onToggleInviteOnly: (Boolean) -> Unit,
    onToggleBlockVisible: (Boolean) -> Unit,
    onSelectInviteMethod: (StartSupportTrainInviteMethod) -> Unit,
    reasonRemaining: Int,
    searchFailed: Boolean = false,
    onRetrySearch: () -> Unit = {},
    onQueryFocusChanged: (Boolean) -> Unit = {},
    homeOptions: List<StartSupportTrainHomeOption> = emptyList(),
    addressSuggestions: AddressSuggestions? = null,
    onSelectHome: (StartSupportTrainHomeOption) -> Unit = {},
    onChooseAnotherAddress: () -> Unit = {},
    onAddressQuery: (String) -> Unit = {},
    onPickAddress: (NormalizedAddress) -> Unit = {},
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s4)) {
        TrainChip()
        Text(
            text = "Who is this for, and why?",
            style = PantopusTextStyle.h2,
            color = PantopusColors.appText,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text =
                "A support train lines up meals for someone going through something: home-cooked, takeout or " +
                    "groceries. Pick the person, say what's going on, and where help goes.",
            style = PantopusTextStyle.body,
            color = PantopusColors.appTextSecondary,
        )

        Overline("RECIPIENT")
        when {
            inviteCandidate != null ->
                InviteRecipientCard(
                    candidate = inviteCandidate,
                    selectedMethod = form.inviteMethod,
                    onClear = onSearchAgain,
                    onSelectMethod = onSelectInviteMethod,
                )
            selected != null ->
                StartTrainRecipientCard(
                    recipient = selected,
                    mutuals = mutuals,
                    onChange = onClearBeneficiary,
                )
            else -> {
                RecipientSearchField(
                    query = form.beneficiaryQuery,
                    isSearching = isSearching,
                    onQuery = onQuery,
                    onFocusChanged = onQueryFocusChanged,
                )
                if (results.isNotEmpty()) {
                    ResultList(results = results, onSelect = onSelectBeneficiary)
                }
                if (searchFailed) {
                    SearchFailedRow(onRetry = onRetrySearch)
                } else {
                    Text(
                        text =
                            "Search people on Pantopus, or enter a name for someone who isn't on it. " +
                                "No invitation is sent from this step.",
                        style = PantopusTextStyle.caption,
                        color = PantopusColors.appTextMuted,
                    )
                }
            }
        }

        // The story shows whoever the recipient is (B8): a person who isn't on Pantopus needs it most.
        ContextNoteField(
            note = form.reason,
            remaining = reasonRemaining,
            onReason = onReason,
        )
        DeliverToSection(
            form = form,
            homeOptions = homeOptions,
            suggestions = addressSuggestions,
            onSelectHome = onSelectHome,
            onChooseAnotherAddress = onChooseAnotherAddress,
            onAddressQuery = onAddressQuery,
            onPickAddress = onPickAddress,
        )
        PrivacyToggleList(
            inviteOnly = form.inviteOnly,
            blockVisible = form.blockVisible,
            onToggleInviteOnly = onToggleInviteOnly,
            onToggleBlockVisible = onToggleBlockVisible,
        )
        StepRail(current = 1)
    }
}

/**
 * Where help goes (A1): one of the organizer's homes, or another address picked from the suggestions, so the train
 * has a point and helpers can be given the address. Rows look like the review's audience rows.
 */
@Composable
private fun DeliverToSection(
    form: StartSupportTrainFormState,
    homeOptions: List<StartSupportTrainHomeOption>,
    suggestions: AddressSuggestions?,
    onSelectHome: (StartSupportTrainHomeOption) -> Unit,
    onChooseAnotherAddress: () -> Unit,
    onAddressQuery: (String) -> Unit,
    onPickAddress: (NormalizedAddress) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2), modifier = Modifier.testTag("startSupportTrainDeliverTo")) {
        Overline("DELIVER TO")
        DeliveryAddressPicker(
            homeOptions = homeOptions,
            delivery = form.delivery,
            typingAddress = form.typingAddress,
            addressQuery = form.addressQuery,
            suggestions = suggestions,
            onSelectHome = onSelectHome,
            onChooseAnotherAddress = onChooseAnotherAddress,
            onAddressQuery = onAddressQuery,
            onPickAddress = onPickAddress,
        )
        Text(
            text =
                "The exact address shows only to the train's organizers and the person it's for, until you share " +
                    "it with a helper who signed up.",
            style = PantopusTextStyle.caption,
            color = PantopusColors.appTextMuted,
        )
    }
}

/** A failed search found nobody, so it says so instead of "no one by that
 *  name", and offers the search again. */
@Composable
private fun SearchFailedRow(onRetry: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
    ) {
        Text(
            text = "Couldn't search right now.",
            style = PantopusTextStyle.caption,
            color = PantopusColors.appTextMuted,
        )
        Text(
            text = "Try again",
            style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.primary600,
            modifier = Modifier.clickable { onRetry() }.testTag("startSupportTrainRecipientSearchRetry"),
        )
    }
}

@Composable
private fun RecipientSearchField(
    query: String,
    isSearching: Boolean,
    onQuery: (String) -> Unit,
    onFocusChanged: (Boolean) -> Unit,
) {
    val focusManager = LocalFocusManager.current
    OutlinedTextField(
        value = query,
        onValueChange = onQuery,
        placeholder = { Text("Search by name or username", color = PantopusColors.appTextMuted) },
        leadingIcon = {
            PantopusIconImage(
                icon = PantopusIcon.Search,
                contentDescription = null,
                size = Radii.xl,
                tint = PantopusColors.appTextSecondary,
            )
        },
        trailingIcon = {
            if (isSearching) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = PantopusColors.primary600,
                )
            }
        },
        singleLine = true,
        // Done ends the edit, which lets the no-match card show.
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() }),
        colors = pantopusTextFieldColors(),
        modifier =
            Modifier
                .fillMaxWidth()
                .onFocusChanged { onFocusChanged(it.isFocused) }
                .testTag("startSupportTrainBeneficiaryField"),
    )
}

@Composable
private fun ContextNoteField(
    note: String,
    remaining: Int,
    onReason: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Overline("SHORT NOTE")
        OutlinedTextField(
            value = note,
            onValueChange = onReason,
            placeholder = {
                Text(
                    text = "Add a few details so helpers know what kind of help fits.",
                    color = PantopusColors.appTextMuted,
                    style = PantopusTextStyle.small,
                )
            },
            minLines = 3,
            colors = pantopusTextFieldColors(),
            modifier =
                Modifier
                    .fillMaxWidth()
                    // At least the old height, so large text grows the box instead of clipping it (B15).
                    .heightIn(min = 116.dp)
                    .testTag("startSupportTrainReasonField"),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
        ) {
            PantopusIconImage(
                icon = PantopusIcon.Lock,
                contentDescription = null,
                size = 10.dp,
                tint = PantopusColors.appTextMuted,
            )
            Text(
                text = "Visible to the audience you choose for this train",
                style = PantopusTextStyle.caption.copy(fontSize = 10.sp),
                color = PantopusColors.appTextMuted,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "$remaining left",
                style = PantopusTextStyle.caption.copy(fontSize = 10.sp),
                color = PantopusColors.appTextMuted,
                modifier = Modifier.testTag("startSupportTrainReasonRemaining"),
            )
        }
    }
}

@Composable
private fun PrivacyToggleList(
    inviteOnly: Boolean,
    blockVisible: Boolean,
    onToggleInviteOnly: (Boolean) -> Unit,
    onToggleBlockVisible: (Boolean) -> Unit,
) {
    val shape = RoundedCornerShape(Radii.lg)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(width = 1.dp, color = PantopusColors.appBorder, shape = shape),
    ) {
        PrivacyToggleRow(
            icon = PantopusIcon.UsersRound,
            title = "My connections",
            subtitle = "Only your connections and people you invite can see and sign up",
            checked = inviteOnly,
            onToggle = onToggleInviteOnly,
            testTag = "startSupportTrainInviteOnly",
        )
        HorizontalDivider(thickness = 1.dp, color = PantopusColors.appBorderSubtle)
        PrivacyToggleRow(
            icon = PantopusIcon.Home,
            title = "People near you",
            // The Support Trains list shows these trains to people nearby
            // (about 25 mi); it doesn't check verification or a block.
            subtitle = "Listed for people within 25 mi, who can see and sign up",
            checked = blockVisible,
            onToggle = onToggleBlockVisible,
            testTag = "startSupportTrainBlockVisible",
        )
        HorizontalDivider(thickness = 1.dp, color = PantopusColors.appBorderSubtle)
        Text(
            text =
                when {
                    inviteOnly -> "Someone else who opens the link can't see it. Invite people from Manage once it's launched."
                    blockVisible -> "Anyone you share the link with can see it too."
                    else -> "Both off: anyone with the link. It isn't listed anywhere; share the link with the people you choose."
                },
            style = PantopusTextStyle.caption,
            color = PantopusColors.appTextSecondary,
            modifier = Modifier.padding(horizontal = Spacing.s3, vertical = Spacing.s2).testTag("startSupportTrainAudienceNote"),
        )
    }
}

@Composable
private fun PrivacyToggleRow(
    icon: PantopusIcon,
    title: String,
    subtitle: String,
    checked: Boolean,
    onToggle: (Boolean) -> Unit,
    testTag: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s3, vertical = Spacing.s2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Box(
            modifier =
                Modifier
                    .size(30.dp)
                    .clip(RoundedCornerShape(Radii.md))
                    .background(if (checked) PantopusColors.warmAmberBg else PantopusColors.appSurfaceSunken),
            contentAlignment = Alignment.Center,
        ) {
            PantopusIconImage(
                icon = icon,
                contentDescription = null,
                size = 14.dp,
                tint = if (checked) PantopusColors.warmAmber else PantopusColors.appTextSecondary,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(
                text = subtitle,
                style = PantopusTextStyle.caption,
                color = PantopusColors.appTextSecondary,
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onToggle,
            colors =
                SwitchDefaults.colors(
                    checkedThumbColor = PantopusColors.appTextInverse,
                    checkedTrackColor = PantopusColors.warmAmber,
                ),
            modifier = Modifier.testTag(testTag),
        )
    }
}

@Composable
private fun ResultList(
    results: List<MailRecipientDto>,
    onSelect: (MailRecipientDto) -> Unit,
) {
    // While typing in the search box, the first tap on a result only puts the keyboard away.
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .firstTapClosesKeyboard()
                .clip(RoundedCornerShape(Radii.md))
                .background(PantopusColors.appSurface),
    ) {
        results.forEachIndexed { index, recipient ->
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(recipient) }
                        .padding(horizontal = Spacing.s3, vertical = Spacing.s3)
                        .testTag("startSupportTrainResult_${recipient.userId}"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PantopusIconImage(
                    icon = PantopusIcon.User,
                    contentDescription = null,
                    size = Radii.xl,
                    tint = PantopusColors.primary600,
                )
                Spacer(modifier = Modifier.width(Spacing.s3))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = recipient.name ?: MadeUpUsername.chosen(recipient.username) ?: "Recipient",
                        style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
                        color = PantopusColors.appText,
                    )
                    recipient.homeAddress?.let { addr ->
                        Text(
                            text = addr,
                            style = PantopusTextStyle.caption,
                            color = PantopusColors.appTextSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                PantopusIconImage(
                    icon = PantopusIcon.ChevronRight,
                    contentDescription = null,
                    size = 14.dp,
                    tint = PantopusColors.appTextSecondary,
                )
            }
            if (index < results.size - 1) {
                HorizontalDivider(thickness = 1.dp, color = PantopusColors.appBorderSubtle)
            }
        }
    }
}

// ─── Step 2 · What & when ─────────────────────────────────────────────

@Composable
internal fun WhatAndWhenStep(
    form: StartSupportTrainFormState,
    scheduleProblem: String?,
    householdSizeProblem: String?,
    onStartDate: (Long) -> Unit,
    onEndDate: (Long) -> Unit,
    onToggleWeekday: (Int) -> Unit,
    onStartMinutes: (Int) -> Unit,
    onSelectDuration: (StartSupportTrainSlotDuration) -> Unit,
    onHouseholdSize: (String) -> Unit,
    onAllergies: (String) -> Unit,
    onDiet: (String) -> Unit,
    onContactless: (Boolean) -> Unit,
    onInstructions: (String) -> Unit,
) {
    var showStartPicker by remember { mutableStateOf(false) }
    var showEndPicker by remember { mutableStateOf(false) }
    var showTimePicker by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s4)) {
        Text(
            text = "What's the rotation?",
            style = PantopusTextStyle.h2,
            color = PantopusColors.appText,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text =
                "Pick the dates, the days and when meals arrive, then tell helpers what the household needs. " +
                    "We'll build the calendar next.",
            style = PantopusTextStyle.body,
            color = PantopusColors.appTextSecondary,
        )

        Overline("DATES")
        DateRow(
            label = "Starts",
            value = formatDay(form.startDateMillis),
            onClick = { showStartPicker = true },
            testTag = "startSupportTrainStartDate",
        )
        DateRow(
            label = "Ends",
            value = formatDay(form.endDateMillis),
            onClick = { showEndPicker = true },
            testTag = "startSupportTrainEndDate",
        )

        Overline("DAYS")
        WeekdayRow(selected = form.weekdays, onToggle = onToggleWeekday)

        Overline("DROP-OFF")
        val endMinutes = StartSupportTrainSlotGenerator.endMinutes(form.startMinutes, form.slotDuration.minutes)
        DateRow(
            label = "Starts at",
            value =
                "${StartSupportTrainSlotGenerator.displayString(form.startMinutes)}–" +
                    StartSupportTrainSlotGenerator.displayString(endMinutes),
            onClick = { showTimePicker = true },
            testTag = "startSupportTrainStartTime",
            icon = PantopusIcon.Clock,
        )
        SlotDurationRow(form.slotDuration, onSelectDuration)

        scheduleProblem?.let { ProblemLine(it, testTag = "startSupportTrainScheduleProblem") }

        HouseholdSection(
            form = form,
            householdSizeProblem = householdSizeProblem,
            onHouseholdSize = onHouseholdSize,
            onAllergies = onAllergies,
            onDiet = onDiet,
            onContactless = onContactless,
            onInstructions = onInstructions,
        )
    }

    if (showStartPicker) {
        SimpleDatePickerDialog(
            initialMillis = form.startDateMillis,
            onSelect = {
                onStartDate(it)
                showStartPicker = false
            },
            onDismiss = { showStartPicker = false },
        )
    }
    if (showEndPicker) {
        SimpleDatePickerDialog(
            initialMillis = form.endDateMillis,
            earliestMillis = form.startDateMillis,
            onSelect = {
                onEndDate(it)
                showEndPicker = false
            },
            onDismiss = { showEndPicker = false },
        )
    }
    if (showTimePicker) {
        TimeOnlyPickerDialog(
            initial = LocalTime.of(form.startMinutes / 60, form.startMinutes % 60),
            onSelect = {
                onStartMinutes(it.hour * 60 + it.minute)
                showTimePicker = false
            },
            onDismiss = { showTimePicker = false },
        )
    }
}

/** S M T W T F S: the days of the week the train runs (0 = Sunday, as the server counts). */
@Composable
private fun WeekdayRow(
    selected: Set<Int>,
    onToggle: (Int) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().testTag("startSupportTrainWeekdays"),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s1),
    ) {
        WEEKDAY_NAMES.forEachIndexed { day, name ->
            val on = day in selected
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = 40.dp)
                        .clip(RoundedCornerShape(Radii.md))
                        .background(if (on) PantopusColors.primary600 else PantopusColors.appSurface)
                        .border(
                            width = 1.dp,
                            color = if (on) PantopusColors.primary600 else PantopusColors.appBorder,
                            shape = RoundedCornerShape(Radii.md),
                        )
                        .toggleable(value = on, role = Role.Checkbox, onValueChange = { onToggle(day) })
                        .semantics { contentDescription = name }
                        .testTag("startSupportTrainWeekday_$day"),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = name.take(1),
                    style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
                    color = if (on) PantopusColors.appTextInverse else PantopusColors.appTextStrong,
                )
            }
        }
    }
}

private val WEEKDAY_NAMES = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")

/**
 * What helpers are told about the household (A1, A14): its size, allergies and diet, a contactless wish and
 * instructions for the door. The drop-off window is the dates' own time.
 */
@Composable
private fun HouseholdSection(
    form: StartSupportTrainFormState,
    householdSizeProblem: String?,
    onHouseholdSize: (String) -> Unit,
    onAllergies: (String) -> Unit,
    onDiet: (String) -> Unit,
    onContactless: (Boolean) -> Unit,
    onInstructions: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2), modifier = Modifier.testTag("startSupportTrainHousehold")) {
        Overline("FOR THE HOUSEHOLD")
        LabeledField(
            label = "How many people to feed",
            value = form.householdSize,
            placeholder = "e.g. 4",
            onValueChange = onHouseholdSize,
            testTag = "startSupportTrainHouseholdSize",
            keyboardType = KeyboardType.Number,
        )
        householdSizeProblem?.let { ProblemLine(it, testTag = "startSupportTrainHouseholdProblem") }
        LabeledField(
            label = "Allergies",
            value = form.allergies,
            placeholder = "e.g. peanuts, shellfish",
            onValueChange = onAllergies,
            testTag = "startSupportTrainAllergies",
        )
        LabeledField(
            label = "Diet",
            value = form.diet,
            placeholder = "e.g. vegetarian, low salt",
            onValueChange = onDiet,
            testTag = "startSupportTrainDiet",
        )
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(Radii.md))
                    .background(PantopusColors.appSurface)
                    .border(1.dp, PantopusColors.appBorder, RoundedCornerShape(Radii.md))
                    .toggleable(value = form.contactless, role = Role.Switch, onValueChange = onContactless)
                    .padding(horizontal = Spacing.s3, vertical = Spacing.s2)
                    .testTag("startSupportTrainContactless"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Contactless drop-off",
                    style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
                    color = PantopusColors.appText,
                )
                Text(
                    text = "Helpers leave the meal at the door.",
                    style = PantopusTextStyle.caption,
                    color = PantopusColors.appTextSecondary,
                )
            }
            Switch(
                checked = form.contactless,
                onCheckedChange = null,
                colors =
                    SwitchDefaults.colors(
                        checkedThumbColor = PantopusColors.appTextInverse,
                        checkedTrackColor = PantopusColors.warmAmber,
                    ),
            )
        }
        LabeledField(
            label = "Instructions for helpers",
            value = form.instructions,
            placeholder = "Gate code, which door, a cooler on the porch…",
            onValueChange = onInstructions,
            testTag = "startSupportTrainInstructions",
            singleLine = false,
        )
        Text(
            text =
                "Household size, allergies, diet and the drop-off time show to anyone who can open the train. " +
                    "Instructions show only to people who can see the address.",
            style = PantopusTextStyle.caption,
            color = PantopusColors.appTextMuted,
        )
    }
}

@Composable
private fun LabeledField(
    label: String,
    value: String,
    placeholder: String,
    onValueChange: (String) -> Unit,
    testTag: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s1)) {
        Text(
            text = label,
            style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.appTextSecondary,
            modifier = Modifier.clearAndSetSemantics {},
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(placeholder, color = PantopusColors.appTextMuted, style = PantopusTextStyle.small) },
            singleLine = singleLine,
            minLines = if (singleLine) 1 else 2,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            colors = pantopusTextFieldColors(),
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = label }.testTag(testTag),
        )
    }
}

@Composable
private fun ProblemLine(
    message: String,
    testTag: String,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.md))
                .background(PantopusColors.errorBg)
                .padding(horizontal = Spacing.s3, vertical = Spacing.s2)
                .semantics { liveRegion = LiveRegionMode.Polite }
                .testTag(testTag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PantopusIconImage(icon = PantopusIcon.AlertCircle, contentDescription = null, size = 14.dp, tint = PantopusColors.error)
        Text(text = message, style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.Medium), color = PantopusColors.error)
    }
}

@Composable
private fun DateRow(
    label: String,
    value: String,
    onClick: () -> Unit,
    testTag: String,
    icon: PantopusIcon = PantopusIcon.Calendar,
) {
    val shape = RoundedCornerShape(Radii.md)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                // At least 48dp: large text grows the row instead of clipping it (B15).
                .heightIn(min = 48.dp)
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(width = 1.dp, color = PantopusColors.appBorder, shape = shape)
                .clickable(role = Role.Button) { onClick() }
                .padding(horizontal = Spacing.s3, vertical = Spacing.s2)
                .testTag(testTag),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
            color = PantopusColors.appText,
            modifier = Modifier.weight(1f),
        )
        PantopusIconImage(
            icon = icon,
            contentDescription = null,
            size = 14.dp,
            tint = PantopusColors.appTextSecondary,
        )
        Spacer(modifier = Modifier.width(Spacing.s2))
        Text(
            text = value,
            style = PantopusTextStyle.small,
            color = PantopusColors.appTextStrong,
        )
    }
}

@Composable
private fun SlotDurationRow(
    selected: StartSupportTrainSlotDuration,
    onSelect: (StartSupportTrainSlotDuration) -> Unit,
) {
    val scroll = rememberScrollState()
    Row(
        modifier = Modifier.horizontalScroll(scroll),
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        StartSupportTrainSlotDuration.entries.forEach { option ->
            val isActive = option == selected
            val bg = if (isActive) PantopusColors.primary600 else PantopusColors.appSurface
            val ink = if (isActive) PantopusColors.appTextInverse else PantopusColors.appTextStrong
            Row(
                modifier =
                    Modifier
                        .heightIn(min = 32.dp)
                        .clip(RoundedCornerShape(Radii.pill))
                        .background(bg)
                        .selectable(selected = isActive, role = Role.RadioButton) { onSelect(option) }
                        .padding(horizontal = Spacing.s3, vertical = Spacing.s1)
                        .testTag("startSupportTrainSlotDuration_${option.minutes}"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = option.title,
                    style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.SemiBold),
                    color = ink,
                )
            }
        }
    }
}

// ─── Step 3 · Review & launch ──────────────────────────────────────────

@Composable
internal fun ReviewStep(
    form: StartSupportTrainFormState,
    selectedBeneficiary: MailRecipientDto?,
    slots: List<StartSupportTrainSlot>,
    onSelectVisibility: (StartSupportTrainVisibility) -> Unit,
    launchError: String?,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s4)) {
        Text(
            text = "Look it over",
            style = PantopusTextStyle.h2,
            color = PantopusColors.appText,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text =
                "Here's the calendar: ${slots.size} ${if (slots.size == 1) "date" else "dates"}. " +
                    "Decide who can see this, then launch.",
            style = PantopusTextStyle.body,
            color = PantopusColors.appTextSecondary,
        )

        SummaryCard(form = form, selected = selectedBeneficiary, slotCount = slots.size)

        Overline("SLOT GRID")
        SlotGrid(slots = slots)

        HelperNotesInfo()
        VisibilityList(selected = form.visibility, onSelect = onSelectVisibility)

        launchError?.let { LaunchErrorBanner(it) }
    }
}

@Composable
private fun SummaryCard(
    form: StartSupportTrainFormState,
    selected: MailRecipientDto?,
    slotCount: Int,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.lg))
                .background(PantopusColors.appSurface)
                .padding(Spacing.s4)
                .testTag("startSupportTrainReviewSummary"),
        verticalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        val beneficiaryDisplay =
            selected?.name
                ?: MadeUpUsername.chosen(selected?.username)
                ?: form.beneficiaryQuery.ifBlank { "—" }
        SummaryLine("Recipient", beneficiaryDisplay)
        SummaryLine("Deliver to", form.delivery?.label.orEmpty())
        SummaryLine("Dates", "${formatDay(form.startDateMillis)} → ${formatDay(form.endDateMillis)}")
        SummaryLine("Days", weekdaysLabel(form.weekdays))
        val end = StartSupportTrainSlotGenerator.endMinutes(form.startMinutes, form.slotDuration.minutes)
        SummaryLine(
            "Drop-off",
            "${StartSupportTrainSlotGenerator.displayString(form.startMinutes)}–${StartSupportTrainSlotGenerator.displayString(end)}",
        )
        SummaryLine("Dates to fill", slotCount.toString())
        householdLine(form)?.let { SummaryLine("Household", it) }
        if (form.instructions.isNotBlank()) SummaryLine("Instructions", form.instructions.trim())
        if (form.reason.isNotEmpty()) {
            SummaryLine("Story", form.reason)
        }
    }
}

/** "Every day", "Weekdays", or "Mon, Wed, Fri". */
private fun weekdaysLabel(days: Set<Int>): String =
    when {
        days.size == 7 -> "Every day"
        days == setOf(1, 2, 3, 4, 5) -> "Weekdays"
        else -> days.sorted().joinToString(", ") { WEEKDAY_NAMES[it].take(3) }
    }

/** "4 people · Allergies: peanuts · Diet: vegetarian · Contactless", or null when nothing was given. */
private fun householdLine(form: StartSupportTrainFormState): String? {
    val size = form.householdSize.toIntOrNull()
    val parts =
        listOfNotNull(
            size?.let { if (it == 1) "1 person" else "$it people" },
            splitList(form.allergies).takeIf { it.isNotEmpty() }?.let { "Allergies: ${it.joinToString(", ")}" },
            splitList(form.diet).takeIf { it.isNotEmpty() }?.let { "Diet: ${it.joinToString(", ")}" },
            "Contactless".takeIf { form.contactless },
        )
    return parts.joinToString(" · ").ifEmpty { null }
}

@Composable
private fun SummaryLine(
    label: String,
    value: String,
) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Text(
            text = label.uppercase(),
            style = PantopusTextStyle.overline,
            color = PantopusColors.appTextSecondary,
            modifier = Modifier.width(110.dp),
        )
        Text(
            text = value.ifEmpty { "—" },
            style = PantopusTextStyle.small,
            color = PantopusColors.appText,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun SlotGrid(slots: List<StartSupportTrainSlot>) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Radii.lg))
                .background(PantopusColors.appSurface)
                .testTag("startSupportTrainSlotGrid"),
    ) {
        if (slots.isEmpty()) {
            Text(
                text = "Pick a date range to generate slots.",
                style = PantopusTextStyle.small,
                color = PantopusColors.appTextSecondary,
                modifier = Modifier.fillMaxWidth().padding(Spacing.s4),
            )
        } else {
            slots.forEachIndexed { index, slot ->
                SlotRow(slot)
                if (index < slots.size - 1) {
                    HorizontalDivider(
                        thickness = 1.dp,
                        color = PantopusColors.appBorderSubtle,
                        modifier = Modifier.padding(start = Spacing.s4),
                    )
                }
            }
        }
    }
}

@Composable
private fun SlotRow(slot: StartSupportTrainSlot) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(Spacing.s4)
                .testTag("startSupportTrainSlotRow_${slot.dateKey}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        Box(
            modifier =
                Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(Radii.sm))
                    .background(PantopusColors.primary50),
            contentAlignment = Alignment.Center,
        ) {
            PantopusIconImage(
                icon = PantopusIcon.Calendar,
                contentDescription = null,
                size = Radii.xl,
                tint = PantopusColors.primary600,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = slot.dayLabel,
                style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(
                text = slot.timeLabel,
                style = PantopusTextStyle.caption,
                color = PantopusColors.appTextSecondary,
            )
        }
        Box(
            modifier =
                Modifier
                    .clip(RoundedCornerShape(Radii.pill))
                    .background(PantopusColors.appSurfaceSunken)
                    .padding(horizontal = Spacing.s2, vertical = Spacing.s1),
        ) {
            Text(
                text = "OPEN",
                style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.Bold, fontSize = 10.sp),
                color = PantopusColors.appTextSecondary,
            )
        }
    }
}

@Composable
private fun HelperNotesInfo() {
    val shape = RoundedCornerShape(Radii.md)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PantopusColors.appSurface)
                .border(width = 1.dp, color = PantopusColors.appBorder, shape = shape)
                .padding(Spacing.s3)
                .testTag("startSupportTrainHelperNotes"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Helper notes",
                style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(
                text = "Helpers can leave a note when they sign up.",
                style = PantopusTextStyle.caption,
                color = PantopusColors.appTextSecondary,
            )
        }
    }
}

@Composable
private fun VisibilityList(
    selected: StartSupportTrainVisibility,
    onSelect: (StartSupportTrainVisibility) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s2)) {
        Overline("VISIBILITY")
        StartSupportTrainVisibility.entries.forEach { option ->
            VisibilityRow(option, isSelected = option == selected, onSelect = { onSelect(option) })
        }
    }
}

@Composable
private fun VisibilityRow(
    option: StartSupportTrainVisibility,
    isSelected: Boolean,
    onSelect: () -> Unit,
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
                .clickable { onSelect() }
                .padding(Spacing.s3)
                .testTag("startSupportTrainVisibility_${option.sharingModeWire}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s3),
    ) {
        SupportTrainRadioCircle(isSelected = isSelected)
        PantopusIconImage(
            icon = option.icon,
            contentDescription = null,
            size = Radii.xl,
            tint = if (isSelected) PantopusColors.primary600 else PantopusColors.appTextSecondary,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = option.title,
                style = PantopusTextStyle.small.copy(fontWeight = FontWeight.SemiBold),
                color = PantopusColors.appText,
            )
            Text(
                text = option.subtitle,
                style = PantopusTextStyle.caption,
                color = PantopusColors.appTextSecondary,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun LaunchErrorBanner(message: String) {
    // The error sits under the review's last section. Bring it into view and let TalkBack
    // read it, so a failed launch doesn't look like nothing happened.
    val requester = remember { BringIntoViewRequester() }
    LaunchedEffect(message) { requester.bringIntoView() }
    Row(
        modifier =
            Modifier
                .bringIntoViewRequester(requester)
                .clip(RoundedCornerShape(Radii.md))
                .background(PantopusColors.errorBg)
                .padding(horizontal = Spacing.s3, vertical = Spacing.s2)
                .semantics { liveRegion = LiveRegionMode.Polite }
                .testTag("startSupportTrainLaunchError"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
    ) {
        PantopusIconImage(
            icon = PantopusIcon.AlertCircle,
            contentDescription = null,
            size = 14.dp,
            tint = PantopusColors.error,
        )
        Text(
            text = message,
            style = PantopusTextStyle.caption.copy(fontWeight = FontWeight.Medium),
            color = PantopusColors.error,
        )
    }
}

// ─── Success step ─────────────────────────────────────────────────────

@Composable
internal fun SuccessStep(
    slotCount: Int,
    visibility: StartSupportTrainVisibility,
    recipientNotLinked: String? = null,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(top = Spacing.s5)
                .testTag("startSupportTrainSuccess"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.s4),
    ) {
        Box(
            modifier =
                Modifier
                    .size(96.dp)
                    .clip(CircleShape)
                    .background(PantopusColors.successBg),
            contentAlignment = Alignment.Center,
        ) {
            PantopusIconImage(
                icon = PantopusIcon.CheckCircle,
                contentDescription = null,
                size = 56.dp,
                tint = PantopusColors.success,
            )
        }
        Text(
            text = "Train launched",
            style = PantopusTextStyle.h2,
            color = PantopusColors.appText,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text =
                "$slotCount ${if (slotCount == 1) "date is" else "dates are"} open to ${visibility.audience}. " +
                    "Share the link, and manage the train from its page.",
            style = PantopusTextStyle.body,
            color = PantopusColors.appTextSecondary,
            modifier = Modifier.padding(horizontal = Spacing.s3),
        )
        recipientNotLinked?.let { name ->
            // The server keeps someone the organizer isn't connected to by name only (A13).
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(Radii.md))
                        .background(PantopusColors.warmAmberBg)
                        .padding(Spacing.s3)
                        .testTag("startSupportTrainRecipientNotLinked"),
                horizontalArrangement = Arrangement.spacedBy(Spacing.s2),
                verticalAlignment = Alignment.Top,
            ) {
                PantopusIconImage(icon = PantopusIcon.Info, contentDescription = null, size = 14.dp, tint = PantopusColors.warmAmber)
                Text(
                    text =
                        "$name isn't linked to this train because you two aren't connected, so they won't see it " +
                            "as theirs. Send them the link, or connect with them first.",
                    style = PantopusTextStyle.caption,
                    color = PantopusColors.appTextStrong,
                )
            }
        }
    }
}

// ─── Shared helpers ───────────────────────────────────────────────────

@Composable
private fun Overline(text: String) {
    Text(
        text = text,
        style = PantopusTextStyle.overline,
        color = PantopusColors.appTextSecondary,
    )
}

@Composable
private fun pantopusTextFieldColors() =
    OutlinedTextFieldDefaults.colors(
        focusedTextColor = PantopusColors.appText,
        unfocusedTextColor = PantopusColors.appText,
        focusedBorderColor = PantopusColors.primary600,
        unfocusedBorderColor = PantopusColors.appBorder,
        focusedContainerColor = PantopusColors.appSurface,
        unfocusedContainerColor = PantopusColors.appSurface,
        cursorColor = PantopusColors.primary600,
    )

@Composable
private fun SimpleDatePickerDialog(
    initialMillis: Long,
    onSelect: (Long) -> Unit,
    onDismiss: () -> Unit,
    earliestMillis: Long? = null,
) {
    // The wizard stores local calendar days; Material date pickers encode their selection at UTC midnight.
    val zone = java.time.ZoneId.systemDefault()
    app.pantopus.android.ui.components.FutureDatePickerDialog(
        initial = java.time.Instant.ofEpochMilli(initialMillis).atZone(zone).toLocalDate(),
        earliest = earliestMillis?.let { java.time.Instant.ofEpochMilli(it).atZone(zone).toLocalDate() },
        onSelect = { onSelect(it.atStartOfDay(zone).toInstant().toEpochMilli()) },
        onDismiss = onDismiss,
        confirmLabel = "Done",
    )
}
