@file:Suppress("PackageNaming", "TooManyFunctions", "LongMethod", "MagicNumber", "LargeClass")

package app.pantopus.android.ui.screens.support_trains.start_train

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.core.identity.MadeUpUsername
import app.pantopus.android.data.api.models.geo.NormalizedAddress
import app.pantopus.android.data.api.models.mail_compose.MailRecipientDto
import app.pantopus.android.data.api.models.support_trains.CreateSupportTrainBody
import app.pantopus.android.data.api.models.support_trains.GenerateSupportTrainSlotsBody
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.displayMessage
import app.pantopus.android.data.homes.HomesRepository
import app.pantopus.android.data.mail_compose.MailComposeRepository
import app.pantopus.android.data.support_trains.DATES_PASSED_WHERE_TRAIN_IS
import app.pantopus.android.data.support_trains.SupportTrainRecipientDetails
import app.pantopus.android.data.support_trains.SupportTrainsRepository
import app.pantopus.android.ui.screens.shared.wizard.WizardChrome
import app.pantopus.android.ui.screens.shared.wizard.WizardLeadingControl
import app.pantopus.android.ui.screens.shared.wizard.WizardModel
import app.pantopus.android.ui.screens.shared.wizard.WizardProgressLabel
import app.pantopus.android.ui.screens.shared.wizard.WizardSecondaryCta
import app.pantopus.android.ui.screens.support_trains.start_train.components.SupportTrainHomes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.util.Calendar
import java.util.concurrent.TimeUnit
import javax.inject.Inject

/**
 * P2.6 — Start-a-Support-Train wizard view model. Owns the three-step
 * state machine + recipient autocomplete + the launch sequence (create
 * draft with where help goes → the household's details → the schedule →
 * publish). On success, emits `OpenTrain` so the host stack can pop the
 * wizard and push the new train's page.
 *
 * The form lives in [SavedStateHandle], so the wizard comes back as it was after Android ends the app in the
 * background (B8).
 */
@HiltViewModel
class StartSupportTrainViewModel
    @Inject
    constructor(
        private val supportTrains: SupportTrainsRepository,
        private val mailCompose: MailComposeRepository,
        private val homes: HomesRepository,
        private val savedState: SavedStateHandle,
    ) : ViewModel(), WizardModel {
        private val _form = MutableStateFlow(restoreForm() ?: StartSupportTrainFormState())
        val form: StateFlow<StartSupportTrainFormState> = _form.asStateFlow()

        private val _beneficiaryResults = MutableStateFlow<List<MailRecipientDto>>(emptyList())
        val beneficiaryResults: StateFlow<List<MailRecipientDto>> = _beneficiaryResults.asStateFlow()

        private val _selectedBeneficiary = MutableStateFlow(restoreBeneficiary())
        val selectedBeneficiary: StateFlow<MailRecipientDto?> = _selectedBeneficiary.asStateFlow()

        private val _isSearching = MutableStateFlow(false)
        val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

        /** The last recipient search failed (offline, server error). A failed
         *  search found nobody, so the "no one by that name" branch stays hidden. */
        private val _beneficiarySearchFailed = MutableStateFlow(false)
        val beneficiarySearchFailed: StateFlow<Boolean> = _beneficiarySearchFailed.asStateFlow()

        /** The recipient field is being edited. The no-match card replaces the
         *  field, so it waits until editing ends instead of swallowing the rest
         *  of a name mid-typing. */
        private val _isEditingBeneficiaryQuery = MutableStateFlow(false)
        val isEditingBeneficiaryQuery: StateFlow<Boolean> = _isEditingBeneficiaryQuery.asStateFlow()

        private val _isSubmitting = MutableStateFlow(false)
        val isSubmitting: StateFlow<Boolean> = _isSubmitting.asStateFlow()

        private val _launchError = MutableStateFlow<String?>(null)
        val launchError: StateFlow<String?> = _launchError.asStateFlow()

        private val _pendingEvent = MutableStateFlow<StartSupportTrainEvent?>(null)
        val pendingEvent: StateFlow<StartSupportTrainEvent?> = _pendingEvent.asStateFlow()

        /** How many dates the server saved (it skips a date that had passed where the train is). */
        private val _savedDateCount = MutableStateFlow(savedState.get<Int>(KEY_SAVED_DATES))
        val savedDateCount: StateFlow<Int?> = _savedDateCount.asStateFlow()

        private val _publishedTrainId = MutableStateFlow(savedState.get<String>(KEY_PUBLISHED_ID))
        val publishedTrainId: StateFlow<String?> = _publishedTrainId.asStateFlow()

        /** The organizer's homes a train can go to (homes they belong to), for "Deliver to". */
        private val _homeOptions = MutableStateFlow<List<StartSupportTrainHomeOption>>(emptyList())
        val homeOptions: StateFlow<List<StartSupportTrainHomeOption>> = _homeOptions.asStateFlow()

        /**
         * The person named by account wasn't linked to the train (the organizer isn't connected to them), so the
         * success step says so (A13). Their name, or null.
         */
        private val _recipientNotLinked = MutableStateFlow(savedState.get<String>(KEY_NOT_LINKED))
        val recipientNotLinked: StateFlow<String?> = _recipientNotLinked.asStateFlow()

        /** A half-built draft a failed launch couldn't delete; the next launch removes it first. */
        private var leftoverTrainId: String? = savedState.get<String>(KEY_LEFTOVER_ID)
            set(value) {
                field = value
                savedState[KEY_LEFTOVER_ID] = value
            }

        /**
         * The create's request id, kept until its reply arrives: a retry after a lost reply
         * then reaches the draft the server already made instead of making a second train.
         */
        private var createRequestId: String? = savedState.get<String>(KEY_CREATE_REQUEST_ID)
            set(value) {
                field = value
                savedState[KEY_CREATE_REQUEST_ID] = value
            }

        private var searchJob: Job? = null

        init {
            viewModelScope.launch {
                combine(_form, _selectedBeneficiary) { form, beneficiary -> form to beneficiary }
                    .collect { (form, beneficiary) -> persist(form, beneficiary) }
            }
            viewModelScope.launch { loadHomes() }
        }

        // ─── Step 1 actions ─────────────────────────────────────────────

        fun updateBeneficiaryQuery(value: String) {
            _form.value = _form.value.copy(beneficiaryQuery = value)
            val current = _selectedBeneficiary.value
            if (current != null && value != displayName(current)) {
                _selectedBeneficiary.value = null
            }
            _beneficiarySearchFailed.value = false
            val trimmed = value.trim()
            searchJob?.cancel()
            if (trimmed.length < 2) {
                _beneficiaryResults.value = emptyList()
                _isSearching.value = false
                return
            }
            scheduleBeneficiarySearch(trimmed)
        }

        /** Re-runs the recipient search for the current text (the "Try again"
         *  after a failed search). */
        fun retryBeneficiarySearch() {
            val trimmed = _form.value.beneficiaryQuery.trim()
            if (trimmed.length < 2) return
            _beneficiarySearchFailed.value = false
            scheduleBeneficiarySearch(trimmed)
        }

        /** The recipient field gained or lost focus. */
        fun setEditingBeneficiaryQuery(editing: Boolean) {
            _isEditingBeneficiaryQuery.value = editing
        }

        fun selectBeneficiary(recipient: MailRecipientDto) {
            _selectedBeneficiary.value = recipient
            _form.value = _form.value.copy(beneficiaryQuery = displayName(recipient))
            _beneficiaryResults.value = emptyList()
            _isEditingBeneficiaryQuery.value = false
        }

        /** "Change" on the chosen recipient: start a fresh search. Keeping the
         *  chosen name in the field with no results read as "no one by that
         *  name" for a person who is on Pantopus. */
        fun clearBeneficiary() = searchAgain()

        fun searchAgain() {
            searchJob?.cancel()
            _selectedBeneficiary.value = null
            _beneficiaryResults.value = emptyList()
            _isSearching.value = false
            _beneficiarySearchFailed.value = false
            _isEditingBeneficiaryQuery.value = false
            _form.value = _form.value.copy(beneficiaryQuery = "")
        }

        fun updateReason(value: String) {
            val clamped =
                if (value.length > StartSupportTrainFormState.REASON_CHAR_LIMIT) {
                    value.substring(0, StartSupportTrainFormState.REASON_CHAR_LIMIT)
                } else {
                    value
                }
            _form.value = _form.value.copy(reason = clamped)
        }

        // Step 1's two switches and the review's Visibility are one setting, so the review shows what launches.
        fun toggleInviteOnly(value: Boolean) {
            val current = _form.value
            val blockVisible = current.blockVisible && !value
            _form.value =
                current.copy(
                    inviteOnly = value,
                    blockVisible = blockVisible,
                    visibility = StartSupportTrainVisibility.from(value, blockVisible),
                )
        }

        fun toggleBlockVisible(value: Boolean) {
            val current = _form.value
            val inviteOnly = current.inviteOnly && !value
            _form.value =
                current.copy(
                    inviteOnly = inviteOnly,
                    blockVisible = value,
                    visibility = StartSupportTrainVisibility.from(inviteOnly, value),
                )
        }

        fun selectInviteMethod(value: StartSupportTrainInviteMethod) {
            _form.value = _form.value.copy(inviteMethod = value)
        }

        // ─── Where help goes ────────────────────────────────────────────

        /** One of the organizer's homes. */
        fun selectHome(option: StartSupportTrainHomeOption) {
            _form.value = _form.value.copy(delivery = SupportTrainHomes.homeDelivery(option), typingAddress = false)
        }

        /** "Another address": the field shows; a pick from its suggestions sets the address. */
        fun chooseAnotherAddress() {
            val current = _form.value
            _form.value = current.copy(typingAddress = true, delivery = current.delivery?.takeIf { !it.isHome })
        }

        fun updateAddressQuery(value: String) {
            val current = _form.value
            // Typing again un-picks the address until a suggestion is chosen.
            _form.value = current.copy(addressQuery = value, delivery = current.delivery?.takeIf { it.isHome || it.label == value })
        }

        /** A suggestion was picked and resolved to its parts and point. */
        fun pickAddress(address: NormalizedAddress) {
            val delivery = SupportTrainHomes.addressDelivery(address) ?: return
            _form.value = _form.value.copy(typingAddress = true, addressQuery = delivery.label, delivery = delivery)
        }

        // ─── Step 2 actions ─────────────────────────────────────────────

        fun setStartDate(millis: Long) {
            val current = _form.value
            val newStart = stripToStartOfDay(millis)
            val adjustedEnd = if (current.endDateMillis < newStart) newStart else current.endDateMillis
            _form.value = current.copy(startDateMillis = newStart, endDateMillis = adjustedEnd)
            _launchError.value = null
        }

        fun setEndDate(millis: Long) {
            val current = _form.value
            val newEnd = stripToStartOfDay(millis)
            val clampedEnd = if (newEnd < current.startDateMillis) current.startDateMillis else newEnd
            _form.value = current.copy(endDateMillis = clampedEnd)
        }

        /** Turns one day of the week (0 = Sunday) on or off. */
        fun toggleWeekday(day: Int) {
            val current = _form.value
            val days = if (day in current.weekdays) current.weekdays - day else current.weekdays + day
            _form.value = current.copy(weekdays = days)
        }

        /** When each drop-off window opens, minutes after midnight. */
        fun setStartMinutes(minutes: Int) {
            _form.value = _form.value.copy(startMinutes = minutes.coerceIn(0, 23 * 60 + 59))
        }

        fun selectSlotDuration(value: StartSupportTrainSlotDuration) {
            _form.value = _form.value.copy(slotDuration = value)
        }

        fun updateHouseholdSize(value: String) {
            _form.value = _form.value.copy(householdSize = value.filter { it.isDigit() }.take(2))
        }

        fun updateAllergies(value: String) {
            _form.value = _form.value.copy(allergies = value.take(LIST_TEXT_LIMIT))
        }

        fun updateDiet(value: String) {
            _form.value = _form.value.copy(diet = value.take(LIST_TEXT_LIMIT))
        }

        fun setContactless(value: Boolean) {
            _form.value = _form.value.copy(contactless = value)
        }

        fun updateInstructions(value: String) {
            _form.value = _form.value.copy(instructions = value.take(StartSupportTrainFormState.INSTRUCTIONS_CHAR_LIMIT))
        }

        // ─── Step 3 actions ─────────────────────────────────────────────

        fun selectVisibility(value: StartSupportTrainVisibility) {
            _form.value =
                _form.value.copy(
                    visibility = value,
                    inviteOnly = value == StartSupportTrainVisibility.Connections,
                    blockVisible = value == StartSupportTrainVisibility.Nearby,
                )
        }

        // ─── Derived projections ────────────────────────────────────────

        fun generatedSlots(): List<StartSupportTrainSlot> {
            val current = _form.value
            return StartSupportTrainSlotGenerator.generate(
                startMillis = current.startDateMillis,
                endMillis = current.endDateMillis,
                durationMinutes = current.slotDuration.minutes,
                startMinutes = current.startMinutes,
                weekdays = current.weekdays,
            )
        }

        fun reasonRemainingChars(): Int = (StartSupportTrainFormState.REASON_CHAR_LIMIT - _form.value.reason.length).coerceAtLeast(0)

        fun derivedTitle(): String {
            val current = _form.value
            val selected = _selectedBeneficiary.value
            val raw =
                selected?.name
                    ?: MadeUpUsername.chosen(selected?.username)
                    ?: current.beneficiaryQuery.trim()
            val name = raw.ifBlank { "someone" }
            return "${SupportTrainMeals.TITLE} for $name"
        }

        fun canAdvanceFromWhoAndWhy(): Boolean {
            val current = _form.value
            val hasBeneficiary =
                _selectedBeneficiary.value != null || current.beneficiaryQuery.trim().length >= 2
            return hasBeneficiary && current.delivery != null
        }

        /** The typed name matched no one: shown only after a search that
         *  worked, and once the field is no longer being edited. */
        fun isInviteRecipientBranch(): Boolean {
            val current = _form.value
            return _selectedBeneficiary.value == null &&
                current.beneficiaryQuery.trim().length >= 2 &&
                _beneficiaryResults.value.isEmpty() &&
                !_isSearching.value &&
                !_beneficiarySearchFailed.value &&
                !_isEditingBeneficiaryQuery.value
        }

        /**
         * Why step 2's schedule can't launch yet, in words, or null. A start date that has passed, a range longer
         * than the server takes (said, not cut), no day of the week, or none of the chosen days in the range.
         */
        fun scheduleProblem(): String? {
            val current = _form.value
            val today = stripToStartOfDay(System.currentTimeMillis())
            val rangeDays = TimeUnit.MILLISECONDS.toDays(current.endDateMillis - current.startDateMillis + HALF_DAY_MILLIS)
            val start = current.startMinutes
            return when {
                current.startDateMillis < today -> "Pick a start date from today on."
                rangeDays > StartSupportTrainFormState.MAX_RANGE_DAYS -> {
                    val lastDay =
                        Calendar.getInstance().apply {
                            timeInMillis = current.startDateMillis
                            add(Calendar.DAY_OF_YEAR, StartSupportTrainFormState.MAX_RANGE_DAYS)
                        }.timeInMillis
                    "A train can run for up to 90 days. Pick an end date on or before ${formatDay(lastDay)}; " +
                        "you can add more dates later from Manage."
                }
                current.weekdays.isEmpty() -> "Pick at least one day of the week."
                generatedSlots().isEmpty() -> "None of the chosen days fall between these dates."
                StartSupportTrainSlotGenerator.endMinutes(start, current.slotDuration.minutes) <= start ->
                    "Pick an earlier start time, so the drop-off window ends the same day."
                else -> null
            }
        }

        /** The household size, when typed, must be 1 to 50. */
        fun householdSizeProblem(): String? {
            val text = _form.value.householdSize
            if (text.isEmpty()) return null
            val size = text.toIntOrNull()
            return if (size == null || size !in 1..MAX_HOUSEHOLD) "Enter a household size from 1 to 50." else null
        }

        fun canAdvanceFromWhatAndWhen(): Boolean =
            scheduleProblem() == null && householdSizeProblem() == null &&
                listItemProblem(_form.value.allergies, "allergy") == null &&
                listItemProblem(_form.value.diet, "diet") == null

        /** Mutual connections shared with the selected recipient, for the
         *  recipient card's micro-avatar strip. There is no mutuals lookup
         *  yet, so none are shown (the sample names were shown for everyone). */
        fun recipientMutuals(): List<StartSupportTrainMutual> = emptyList()

        /** The Frame-2 invite candidate when the typed name matched no one on
         *  Pantopus. Contact handles are stubbed (real contact-picker is out of
         *  scope); only the typed name is live. */
        fun inviteCandidate(): StartSupportTrainInviteCandidate? {
            if (!isInviteRecipientBranch()) return null
            // No contact handles: sample ones must never reach the live card.
            return StartSupportTrainInviteCandidate(
                typedName = _form.value.beneficiaryQuery.trim(),
                phone = "",
                email = "",
            )
        }

        // ─── WizardModel ────────────────────────────────────────────────

        override val chrome: WizardChrome
            get() {
                val current = _form.value
                val number = current.step.stepNumber
                val total = StartSupportTrainStep.PROGRESS_TOTAL
                return WizardChrome(
                    title = titleFor(current.step),
                    progressLabel =
                        number?.let { WizardProgressLabel.StepOf(it, total) }
                            ?: WizardProgressLabel.Hidden,
                    progressFraction = number?.toFloat()?.div(total.toFloat()),
                    leading =
                        if (current.step == StartSupportTrainStep.WhoAndWhy) {
                            WizardLeadingControl.Close
                        } else {
                            WizardLeadingControl.Back
                        },
                    primaryCtaLabel = primaryCtaLabelFor(current.step),
                    primaryCtaEnabled = primaryEnabledFor(current.step),
                    secondaryCta = secondaryCtaFor(current.step),
                    isSubmitting = _isSubmitting.value,
                    dirty = dirtyFor(current.step),
                    showsProgressBar = current.step != StartSupportTrainStep.Success,
                )
            }

        override fun onLeading() {
            val step = _form.value.step
            when (step) {
                StartSupportTrainStep.WhoAndWhy -> _pendingEvent.value = StartSupportTrainEvent.Dismiss
                StartSupportTrainStep.WhatAndWhen ->
                    _form.value = _form.value.copy(step = StartSupportTrainStep.WhoAndWhy)
                StartSupportTrainStep.ReviewAndLaunch ->
                    _form.value = _form.value.copy(step = StartSupportTrainStep.WhatAndWhen)
                StartSupportTrainStep.Success -> _pendingEvent.value = StartSupportTrainEvent.Dismiss
            }
        }

        override fun onDiscard() {
            _pendingEvent.value = StartSupportTrainEvent.Dismiss
        }

        override fun onPrimary() {
            when (_form.value.step) {
                StartSupportTrainStep.WhoAndWhy -> {
                    if (!canAdvanceFromWhoAndWhy()) return
                    _form.value = _form.value.copy(step = StartSupportTrainStep.WhatAndWhen)
                }
                StartSupportTrainStep.WhatAndWhen -> {
                    if (!canAdvanceFromWhatAndWhen()) return
                    _form.value = _form.value.copy(step = StartSupportTrainStep.ReviewAndLaunch)
                }
                StartSupportTrainStep.ReviewAndLaunch -> {
                    if (_isSubmitting.value) return
                    launch()
                }
                StartSupportTrainStep.Success -> handleSuccessExit()
            }
        }

        /** "Search again" belongs to the recipient step; "Back to trains" returns to the list. */
        override fun onSecondary() {
            val step = _form.value.step
            if (step == StartSupportTrainStep.WhoAndWhy && isInviteRecipientBranch()) {
                searchAgain()
            } else if (step == StartSupportTrainStep.Success) {
                _pendingEvent.value = StartSupportTrainEvent.Dismiss
            }
        }

        fun acknowledgePendingEvent() {
            _pendingEvent.value = null
        }

        // ─── Helpers ────────────────────────────────────────────────────

        private fun titleFor(step: StartSupportTrainStep): String =
            when (step) {
                StartSupportTrainStep.WhoAndWhy -> "Start a support train"
                StartSupportTrainStep.WhatAndWhen -> "What & when"
                StartSupportTrainStep.ReviewAndLaunch -> "Review & launch"
                StartSupportTrainStep.Success -> "Train launched"
            }

        private fun primaryCtaLabelFor(step: StartSupportTrainStep): String =
            when (step) {
                StartSupportTrainStep.WhoAndWhy ->
                    // No invite is sent from the wizard, so the CTA doesn't promise one.
                    "Continue"
                StartSupportTrainStep.WhatAndWhen -> "Continue"
                StartSupportTrainStep.ReviewAndLaunch -> "Launch train"
                StartSupportTrainStep.Success -> "Open train"
            }

        private fun secondaryCtaFor(step: StartSupportTrainStep): WizardSecondaryCta? =
            when {
                step == StartSupportTrainStep.Success ->
                    WizardSecondaryCta(
                        label = "Back to trains",
                        testTag = "startSupportTrainBackToList",
                    )
                step == StartSupportTrainStep.WhoAndWhy && isInviteRecipientBranch() ->
                    WizardSecondaryCta(
                        label = "Search again",
                        testTag = "startSupportTrainSearchAgain",
                    )
                else -> null
            }

        private fun primaryEnabledFor(step: StartSupportTrainStep): Boolean =
            when (step) {
                StartSupportTrainStep.WhoAndWhy -> canAdvanceFromWhoAndWhy()
                StartSupportTrainStep.WhatAndWhen -> canAdvanceFromWhatAndWhen()
                StartSupportTrainStep.ReviewAndLaunch -> !_isSubmitting.value && canAdvanceFromWhatAndWhen()
                StartSupportTrainStep.Success -> true
            }

        private fun dirtyFor(step: StartSupportTrainStep): Boolean =
            when (step) {
                StartSupportTrainStep.WhoAndWhy ->
                    canAdvanceFromWhoAndWhy() ||
                        _form.value.beneficiaryQuery.isNotEmpty() ||
                        _form.value.reason.isNotEmpty() ||
                        _form.value.delivery != null ||
                        _form.value.addressQuery.isNotEmpty() ||
                        _form.value.inviteOnly ||
                        _form.value.blockVisible
                StartSupportTrainStep.WhatAndWhen, StartSupportTrainStep.ReviewAndLaunch -> true
                StartSupportTrainStep.Success -> false
            }

        private fun displayName(recipient: MailRecipientDto?): String =
            recipient?.name ?: MadeUpUsername.chosen(recipient?.username).orEmpty()

        private fun scheduleBeneficiarySearch(query: String) {
            searchJob?.cancel()
            searchJob =
                viewModelScope.launch {
                    delay(250)
                    searchBeneficiary(query)
                }
        }

        private suspend fun searchBeneficiary(query: String) {
            _isSearching.value = true
            try {
                when (val result = mailCompose.recipients(query)) {
                    is NetworkResult.Success -> {
                        _beneficiaryResults.value = result.data.recipients
                        _beneficiarySearchFailed.value = false
                    }
                    is NetworkResult.Failure -> {
                        _beneficiaryResults.value = emptyList()
                        _beneficiarySearchFailed.value = true
                    }
                }
            } finally {
                _isSearching.value = false
            }
        }

        /** The organizer's homes a train may name: ones they live in or run (a current, trusted occupancy). */
        private suspend fun loadHomes() {
            val list = runCatching { homes.myHomesStored().data?.homes }.getOrNull().orEmpty()
            _homeOptions.value = SupportTrainHomes.options(list)
        }

        @Suppress("CyclomaticComplexMethod")
        private fun launch() {
            _isSubmitting.value = true
            _launchError.value = null
            val current = _form.value
            val trimmedReason = current.reason.trim()
            val requestId = createRequestId ?: java.util.UUID.randomUUID().toString()
            createRequestId = requestId
            val beneficiary = _selectedBeneficiary.value
            val body =
                CreateSupportTrainBody(
                    draftPayload = CreateSupportTrainBody.DraftPayload(story = trimmedReason),
                    title = derivedTitle(),
                    recipientUserId = beneficiary?.userId,
                    sharingMode = current.visibility.sharingModeWire,
                    clientRequestId = requestId,
                    deliveryLocation = current.delivery?.let(SupportTrainHomes::body),
                )
            viewModelScope.launch {
                try {
                    leftoverTrainId?.let { leftover ->
                        when (discardDraft(leftover)) {
                            DraftDiscard.Deleted -> leftoverTrainId = null
                            // The last launch went live; only its reply was lost.
                            DraftDiscard.Live -> {
                                showLaunched(leftover)
                                return@launch
                            }
                            DraftDiscard.Failed -> Unit
                        }
                    }
                    val created =
                        when (val result = supportTrains.create(body)) {
                            is NetworkResult.Success -> result.data
                            is NetworkResult.Failure -> {
                                _launchError.value = launchFailure(result.error, "Couldn't launch the train. Try again.")
                                return@launch
                            }
                        }
                    createRequestId = null
                    _publishedTrainId.value = created.id
                    savedState[KEY_PUBLISHED_ID] = created.id
                    _recipientNotLinked.value =
                        if (created.recipientLinked == false && beneficiary != null) displayName(beneficiary).ifBlank { null } else null
                    savedState[KEY_NOT_LINKED] = _recipientNotLinked.value
                    // What helpers are told about the household, and the drop-off window the dates use.
                    when (val details = supportTrains.updateRecipientDetails(created.id, recipientDetails(current))) {
                        is NetworkResult.Success -> Unit
                        is NetworkResult.Failure -> {
                            _launchError.value = launchFailure(details.error, "Couldn't save the household's details. Try again.")
                            discardDraft(created.id)
                            return@launch
                        }
                    }
                    // The whole schedule in one request: a request per slot ran a long train into the write limits.
                    val slots = generatedSlots()
                    if (slots.isNotEmpty()) {
                        val schedule =
                            GenerateSupportTrainSlotsBody(
                                startDate = slots.first().dateKey,
                                endDate = slots.last().dateKey,
                                startTime = slots.first().startTime,
                                endTime = slots.first().endTime,
                                slotLabel = SupportTrainMeals.SLOT_LABEL,
                                supportMode = SupportTrainMeals.SUPPORT_MODE,
                                weekdays = current.weekdays.sorted().takeIf { current.weekdays.size < ALL_DAYS },
                            )
                        when (val result = supportTrains.generateSlots(created.id, schedule, slots.size)) {
                            is NetworkResult.Success -> {
                                _savedDateCount.value = result.data
                                savedState[KEY_SAVED_DATES] = result.data
                            }
                            is NetworkResult.Failure -> {
                                val datePassed = (result.error as? NetworkError.Decoding)?.cause?.message == DATES_PASSED_WHERE_TRAIN_IS
                                _launchError.value =
                                    if (datePassed) {
                                        "That date has already passed where the train is. Pick a later date and launch again."
                                    } else {
                                        launchFailure(result.error, "Couldn't add the dates. Try again.")
                                    }
                                // The half-built train goes, so the next launch makes exactly one; what was typed stays.
                                discardDraft(created.id)
                                if (datePassed) _form.value = _form.value.copy(step = StartSupportTrainStep.WhatAndWhen)
                                return@launch
                            }
                        }
                    }
                    when (val result = supportTrains.publish(created.id)) {
                        is NetworkResult.Success -> {
                            _form.value = _form.value.copy(step = StartSupportTrainStep.Success)
                        }
                        is NetworkResult.Failure -> {
                            if (discardDraft(created.id) == DraftDiscard.Live) {
                                // Publish went through; only its reply was lost.
                                showLaunched(created.id)
                            } else {
                                _launchError.value = launchFailure(result.error, "Couldn't publish the train. Try again.")
                            }
                        }
                    }
                } finally {
                    _isSubmitting.value = false
                }
            }
        }

        /** The server's own sentence for a refusal (4xx); the fallback for a lost connection or a server error. */
        private fun launchFailure(
            error: NetworkError,
            fallback: String,
        ): String = if (error is NetworkError.ClientError || error is NetworkError.Forbidden) error.displayMessage(fallback) else fallback

        private fun recipientDetails(form: StartSupportTrainFormState): SupportTrainRecipientDetails {
            val start = form.startMinutes
            val end = StartSupportTrainSlotGenerator.endMinutes(start, form.slotDuration.minutes)
            return SupportTrainRecipientDetails(
                householdSize = form.householdSize.toIntOrNull()?.takeIf { it in 1..MAX_HOUSEHOLD },
                allergies = splitList(form.allergies),
                dietaryStyles = splitList(form.diet),
                dropoffStart = StartSupportTrainSlotGenerator.wireString(start),
                dropoffEnd = StartSupportTrainSlotGenerator.wireString(end),
                contactlessPreferred = form.contactless,
                specialInstructions = form.instructions.trim().ifEmpty { null },
            )
        }

        private enum class DraftDiscard { Deleted, Live, Failed }

        /**
         * Launching is several calls. If a later one fails, remove the half-built
         * draft so trying again makes exactly one train. The server keeps a train
         * that is no longer a draft (`draftOnly`), so a launch that went live is
         * never undone.
         */
        private suspend fun discardDraft(trainId: String): DraftDiscard {
            _publishedTrainId.value = null
            savedState[KEY_PUBLISHED_ID] = null
            _savedDateCount.value = null
            savedState[KEY_SAVED_DATES] = null
            return when (val result = supportTrains.deleteTrain(trainId, draftOnly = true)) {
                is NetworkResult.Success -> DraftDiscard.Deleted
                is NetworkResult.Failure -> {
                    val error = result.error
                    if (error is NetworkError.ClientError && error.code == 409 && error.body?.contains("NOT_A_DRAFT") == true) {
                        DraftDiscard.Live
                    } else {
                        leftoverTrainId = trainId
                        DraftDiscard.Failed
                    }
                }
            }
        }

        /** The train is live after all: finish the way a launch does. */
        private fun showLaunched(trainId: String) {
            leftoverTrainId = null
            _publishedTrainId.value = trainId
            savedState[KEY_PUBLISHED_ID] = trainId
            _launchError.value = null
            _form.value = _form.value.copy(step = StartSupportTrainStep.Success)
        }

        private fun handleSuccessExit() {
            val id = _publishedTrainId.value
            _pendingEvent.value =
                if (id != null) StartSupportTrainEvent.OpenTrain(id) else StartSupportTrainEvent.Dismiss
        }

        private fun stripToStartOfDay(millis: Long): Long {
            val cal = java.util.Calendar.getInstance()
            cal.timeInMillis = millis
            cal.stripTime()
            return cal.timeInMillis
        }

        // ─── Process death ──────────────────────────────────────────────

        private fun persist(
            form: StartSupportTrainFormState,
            beneficiary: MailRecipientDto?,
        ) {
            savedState[KEY_STEP] = form.step.name
            savedState[KEY_QUERY] = form.beneficiaryQuery
            savedState[KEY_REASON] = form.reason
            savedState[KEY_VISIBILITY] = form.visibility.sharingModeWire
            savedState[KEY_START_DATE] = form.startDateMillis
            savedState[KEY_END_DATE] = form.endDateMillis
            savedState[KEY_WEEKDAYS] = form.weekdays.sorted().toIntArray()
            savedState[KEY_START_MINUTES] = form.startMinutes
            savedState[KEY_DURATION] = form.slotDuration.name
            savedState[KEY_TYPING_ADDRESS] = form.typingAddress
            savedState[KEY_ADDRESS_QUERY] = form.addressQuery
            savedState[KEY_HOUSEHOLD] = form.householdSize
            savedState[KEY_ALLERGIES] = form.allergies
            savedState[KEY_DIET] = form.diet
            savedState[KEY_CONTACTLESS] = form.contactless
            savedState[KEY_INSTRUCTIONS] = form.instructions
            val delivery = form.delivery
            savedState[KEY_DELIVERY] =
                delivery?.let {
                    arrayOf(
                        it.label,
                        it.homeId,
                        it.address,
                        it.city,
                        it.state,
                        it.zip,
                        it.latitude?.toString(),
                        it.longitude?.toString(),
                        it.placeId,
                    )
                }
            savedState[KEY_BENEFICIARY] =
                beneficiary?.let { arrayOf(it.userId, it.name, it.username, it.homeAddress, it.isVerified?.toString()) }
        }

        @Suppress("CyclomaticComplexMethod")
        private fun restoreForm(): StartSupportTrainFormState? {
            val step = savedState.get<String>(KEY_STEP) ?: return null
            val defaults = StartSupportTrainFormState()
            val visibility = StartSupportTrainVisibility.fromWire(savedState[KEY_VISIBILITY]) ?: defaults.visibility
            val delivery =
                savedState.get<Array<String?>>(KEY_DELIVERY)?.takeIf { it.size == DELIVERY_FIELDS }?.let { parts ->
                    StartSupportTrainDelivery(
                        label = parts[0].orEmpty(),
                        homeId = parts[1],
                        address = parts[2],
                        city = parts[3],
                        state = parts[4],
                        zip = parts[5],
                        latitude = parts[6]?.toDoubleOrNull(),
                        longitude = parts[7]?.toDoubleOrNull(),
                        placeId = parts[8],
                    )
                }
            return defaults.copy(
                step = runCatching { StartSupportTrainStep.valueOf(step) }.getOrDefault(defaults.step),
                beneficiaryQuery = savedState[KEY_QUERY] ?: "",
                reason = savedState[KEY_REASON] ?: "",
                visibility = visibility,
                inviteOnly = visibility == StartSupportTrainVisibility.Connections,
                blockVisible = visibility == StartSupportTrainVisibility.Nearby,
                startDateMillis = savedState[KEY_START_DATE] ?: defaults.startDateMillis,
                endDateMillis = savedState[KEY_END_DATE] ?: defaults.endDateMillis,
                weekdays = savedState.get<IntArray>(KEY_WEEKDAYS)?.toSet() ?: defaults.weekdays,
                startMinutes = savedState[KEY_START_MINUTES] ?: defaults.startMinutes,
                slotDuration =
                    StartSupportTrainSlotDuration.entries.firstOrNull { it.name == savedState.get<String>(KEY_DURATION) }
                        ?: defaults.slotDuration,
                delivery = delivery,
                typingAddress = savedState[KEY_TYPING_ADDRESS] ?: false,
                addressQuery = savedState[KEY_ADDRESS_QUERY] ?: "",
                householdSize = savedState[KEY_HOUSEHOLD] ?: "",
                allergies = savedState[KEY_ALLERGIES] ?: "",
                diet = savedState[KEY_DIET] ?: "",
                contactless = savedState[KEY_CONTACTLESS] ?: false,
                instructions = savedState[KEY_INSTRUCTIONS] ?: "",
            )
        }

        private fun restoreBeneficiary(): MailRecipientDto? =
            savedState.get<Array<String?>>(KEY_BENEFICIARY)?.takeIf { it.size == BENEFICIARY_FIELDS }?.let { parts ->
                val userId = parts[0] ?: return@let null
                MailRecipientDto(
                    userId = userId,
                    name = parts[1],
                    username = parts[2],
                    homeAddress = parts[3],
                    isVerified = parts[4]?.toBooleanStrictOrNull(),
                    isOnPantopus = true,
                )
            }

        private companion object {
            const val MAX_HOUSEHOLD = 50
            const val LIST_TEXT_LIMIT = 400
            const val ALL_DAYS = 7
            const val HALF_DAY_MILLIS = 12L * 60 * 60 * 1000
            const val DELIVERY_FIELDS = 9
            const val BENEFICIARY_FIELDS = 5
            const val KEY_STEP = "startTrain.step"
            const val KEY_QUERY = "startTrain.query"
            const val KEY_REASON = "startTrain.reason"
            const val KEY_VISIBILITY = "startTrain.visibility"
            const val KEY_START_DATE = "startTrain.startDate"
            const val KEY_END_DATE = "startTrain.endDate"
            const val KEY_WEEKDAYS = "startTrain.weekdays"
            const val KEY_START_MINUTES = "startTrain.startMinutes"
            const val KEY_DURATION = "startTrain.duration"
            const val KEY_TYPING_ADDRESS = "startTrain.typingAddress"
            const val KEY_ADDRESS_QUERY = "startTrain.addressQuery"
            const val KEY_HOUSEHOLD = "startTrain.household"
            const val KEY_ALLERGIES = "startTrain.allergies"
            const val KEY_DIET = "startTrain.diet"
            const val KEY_CONTACTLESS = "startTrain.contactless"
            const val KEY_INSTRUCTIONS = "startTrain.instructions"
            const val KEY_DELIVERY = "startTrain.delivery"
            const val KEY_BENEFICIARY = "startTrain.beneficiary"
            const val KEY_SAVED_DATES = "startTrain.savedDates"
            const val KEY_PUBLISHED_ID = "startTrain.publishedId"
            const val KEY_NOT_LINKED = "startTrain.notLinked"
            const val KEY_LEFTOVER_ID = "startTrain.leftoverId"
            const val KEY_CREATE_REQUEST_ID = "startTrain.createRequestId"
        }
    }
