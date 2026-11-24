@file:Suppress("PackageNaming", "LongMethod", "TooManyFunctions", "MagicNumber")

package app.pantopus.android.ui.screens.ceremonial_mail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.ai.AIComposerDraft
import app.pantopus.android.data.ai.AIComposerDrafts
import app.pantopus.android.data.api.models.mail_compose.MailHomeContextResponse
import app.pantopus.android.data.api.models.mail_compose.MailRecipientDto
import app.pantopus.android.data.api.models.mail_compose.SendMailBody
import app.pantopus.android.data.api.models.mail_compose.SendMailObject
import app.pantopus.android.data.api.models.mail_compose.SendMailPayload
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.mail_compose.MailComposeRepository
import app.pantopus.android.data.mailbox.HolidayCardsRepository
import app.pantopus.android.ui.screens.shared.wizard.WizardChrome
import app.pantopus.android.ui.screens.shared.wizard.WizardLeadingControl
import app.pantopus.android.ui.screens.shared.wizard.WizardModel
import app.pantopus.android.ui.screens.shared.wizard.WizardProgressLabel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CeremonialMailViewModel
    @Inject
    constructor(
        private val repository: MailComposeRepository,
        savedStateHandle: SavedStateHandle = SavedStateHandle(),
    ) : ViewModel(), WizardModel {
        private val _form = MutableStateFlow(CeremonialMailFormState())
        val form: StateFlow<CeremonialMailFormState> = _form.asStateFlow()

        private val _recipientResults = MutableStateFlow<List<MailRecipientDto>>(emptyList())
        val recipientResults: StateFlow<List<MailRecipientDto>> = _recipientResults.asStateFlow()

        private val _selectedRecipient = MutableStateFlow<MailRecipientDto?>(null)
        val selectedRecipient: StateFlow<MailRecipientDto?> = _selectedRecipient.asStateFlow()

        private val _homeContext = MutableStateFlow<MailHomeContextResponse?>(null)
        val homeContext: StateFlow<MailHomeContextResponse?> = _homeContext.asStateFlow()

        private val _isSearching = MutableStateFlow(false)
        val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

        private val _isSubmitting = MutableStateFlow(false)
        val isSubmitting: StateFlow<Boolean> = _isSubmitting.asStateFlow()

        private val _submitError = MutableStateFlow<String?>(null)
        val submitError: StateFlow<String?> = _submitError.asStateFlow()

        private val _voiceStatus = MutableStateFlow<VoicePostscriptStatus>(VoicePostscriptStatus.Empty)
        val voiceStatus: StateFlow<VoicePostscriptStatus> = _voiceStatus.asStateFlow()

        private val _pendingEvent = MutableStateFlow<CeremonialMailEvent?>(null)
        val pendingEvent: StateFlow<CeremonialMailEvent?> = _pendingEvent.asStateFlow()

        private var searchJob: Job? = null

        /**
         * Opened from a letter the assistant drafted ("Open in Mail" in the Pantopus AI thread): who it is to (a row of
         * the recipient search, as picking them by hand gives), the kind of letter and the letter. The address step,
         * paper, ink, seal and "Seal and send" stay the writer's.
         */
        private val draft: AIComposerDraft.Letter? =
            AIComposerDrafts.find(savedStateHandle.get<String>(AIComposerDrafts.KEY)) as? AIComposerDraft.Letter

        /** The person a letter's Reply chose (its sender) or the assistant's draft names, until the writer picks someone else. */
        private val replyTo: MailRecipientDto? =
            draft?.recipient
                ?: savedStateHandle.get<String>(LETTER_TO_USER_KEY)?.takeIf { it.isNotBlank() }?.let { userId ->
                    val name = savedStateHandle.get<String>(LETTER_TO_NAME_KEY)?.takeIf { it.isNotBlank() }
                    MailRecipientDto(userId = userId, name = name)
                }

        init {
            replyTo?.let { to ->
                selectRecipient(to)
                // A draft's recipient is already the search's own row.
                if (draft == null) completeReplyTo(to)
            }
            draft?.let { letter ->
                CeremonialMailIntent.entries.firstOrNull { it.wire == letter.intent }?.let(::selectIntent)
                updateBody(letter.body)
            }
        }

        /**
         * The chosen sender as the recipient search knows them (their Home and town when they're a connection), so a
         * Reply reads and sends as picking them by hand would. Not found: they stay chosen by their name alone.
         */
        private fun completeReplyTo(to: MailRecipientDto) {
            val name = to.name?.trim().orEmpty()
            if (name.length < 2) return
            viewModelScope.launch {
                val found =
                    (repository.recipients(name) as? NetworkResult.Success)
                        ?.data
                        ?.recipients
                        ?.firstOrNull { it.userId == to.userId }
                        ?: return@launch
                // Only while the writer hasn't chosen someone else meanwhile.
                if (_selectedRecipient.value == to) selectRecipient(found)
            }
        }

        // MARK: - Step 1: decide

        fun updateRecipientQuery(value: String) {
            _form.value = _form.value.copy(recipientQuery = value)
            val current = _selectedRecipient.value
            if (current != null && value != displayName(current)) {
                _selectedRecipient.value = null
                _homeContext.value = null
            }
            val trimmed = value.trim()
            searchJob?.cancel()
            if (trimmed.length < 2) {
                _recipientResults.value = emptyList()
                _isSearching.value = false
                return
            }
            searchJob =
                viewModelScope.launch {
                    delay(250)
                    searchRecipients(trimmed)
                }
        }

        fun selectRecipient(recipient: MailRecipientDto) {
            _selectedRecipient.value = recipient
            _form.value = _form.value.copy(recipientQuery = displayName(recipient), addressConfirmed = false)
            _homeContext.value = null
        }

        fun selectIntent(intent: CeremonialMailIntent) {
            _form.value = _form.value.copy(intent = intent)
        }

        // MARK: - Step 2: verify

        fun loadHomeContext() {
            val homeId = _selectedRecipient.value?.homeId ?: return
            viewModelScope.launch {
                when (val result = repository.homeContext(homeId)) {
                    is NetworkResult.Success -> _homeContext.value = result.data
                    is NetworkResult.Failure -> _homeContext.value = null
                }
            }
        }

        fun toggleAddressConfirmed(value: Boolean) {
            _form.value = _form.value.copy(addressConfirmed = value)
        }

        fun toggleReturnAddressShared(value: Boolean) {
            _form.value = _form.value.copy(returnAddressShared = value)
        }

        // MARK: - Step 3: compose

        fun selectStationery(value: CeremonialMailStationery) {
            _form.value = _form.value.copy(stationery = value)
        }

        fun selectInk(value: CeremonialMailInk) {
            _form.value = _form.value.copy(ink = value)
        }

        fun selectSeal(value: CeremonialMailSeal) {
            _form.value = _form.value.copy(seal = value)
        }

        fun updateBody(value: String) {
            _form.value = _form.value.copy(bodyText = value)
        }

        fun voicePostscriptDidStartRecording() {
            _voiceStatus.value = VoicePostscriptStatus.Recording
        }

        /** View calls this after capturing audio. We accept the
         *  local URI; the upload helper that wraps `/api/files/upload`
         *  is host-provided so tests can inject a mock. */
        fun voicePostscriptDidCapture(localUri: String) {
            _voiceStatus.value = VoicePostscriptStatus.Captured(localUri)
        }

        /** Apply an upload result from the platform helper. */
        fun voicePostscriptDidUpload(remoteUrl: String) {
            _voiceStatus.value = VoicePostscriptStatus.Uploaded(remoteUrl)
        }

        fun voicePostscriptDidFail(message: String) {
            _voiceStatus.value = VoicePostscriptStatus.Error(message)
        }

        fun clearVoicePostscript() {
            _voiceStatus.value = VoicePostscriptStatus.Empty
        }

        // MARK: - Step 4: commit

        fun selectSendTiming(value: CeremonialMailSendTiming) {
            _form.value = _form.value.copy(sendTiming = value)
        }

        fun submit() {
            if (_isSubmitting.value) return
            val recipient = _selectedRecipient.value ?: return
            val form = _form.value
            _isSubmitting.value = true
            _submitError.value = null
            val voiceUri =
                (_voiceStatus.value as? VoicePostscriptStatus.Uploaded)?.remoteUrl
            val body =
                SendMailBody(
                    recipientUserId = recipient.userId,
                    recipientHomeId = recipient.homeId,
                    type = "letter",
                    subject = subjectFromIntent(form.intent),
                    content = form.bodyText.trim(),
                    `object` =
                        SendMailObject(
                            title = subjectFromIntent(form.intent),
                            content = form.bodyText.trim(),
                            payload =
                                SendMailPayload(
                                    stationeryTheme = form.stationery.wire,
                                    inkSelection = form.ink.wire,
                                    sealChoice = form.seal.wire,
                                    intent = form.intent.wire,
                                    returnAddressShared = form.returnAddressShared,
                                    voicePostscriptUri = voiceUri,
                                ),
                        ),
                    expiresAt = null,
                )
            viewModelScope.launch {
                when (val result = repository.send(body)) {
                    is NetworkResult.Success -> {
                        result.data.mail?.id?.let(HolidayCardsRepository::announceMovedOn)
                        _isSubmitting.value = false
                        _form.value = form.copy(step = CeremonialMailStep.Success)
                        // Stay on confirmation; the recipient owns the sent letter.
                    }
                    is NetworkResult.Failure -> {
                        _isSubmitting.value = false
                        // A refusal says why in the server's words ("You can't send mail to this person."):
                        // trying again won't help.
                        _submitError.value = (result.error as? NetworkError.Forbidden)?.reason
                            ?: "Couldn't send your letter. Try again."
                    }
                }
            }
        }

        fun acknowledgePendingEvent() {
            _pendingEvent.value = null
        }

        // MARK: - WizardModel

        override val chrome: WizardChrome
            get() {
                val current = _form.value
                val total = CeremonialMailStep.PROGRESS_TOTAL
                val number = current.step.stepNumber
                return WizardChrome(
                    title = titleFor(current.step),
                    progressLabel =
                        number?.let { WizardProgressLabel.StepOf(it, total) }
                            ?: WizardProgressLabel.Hidden,
                    progressFraction = number?.toFloat()?.div(total.toFloat()),
                    leading = if (current.step == CeremonialMailStep.Decide) WizardLeadingControl.Close else WizardLeadingControl.Back,
                    primaryCtaLabel = primaryCtaLabelFor(current.step),
                    primaryCtaEnabled = primaryEnabledFor(current),
                    isSubmitting = _isSubmitting.value,
                    dirty = dirtyFor(current),
                    showsProgressBar = current.step != CeremonialMailStep.Success,
                )
            }

        override fun onLeading() {
            val step = _form.value.step
            if (step == CeremonialMailStep.Decide) {
                _pendingEvent.value = CeremonialMailEvent.Dismiss
                return
            }
            _form.value =
                _form.value.copy(
                    step =
                        when (step) {
                            CeremonialMailStep.Verify -> CeremonialMailStep.Decide
                            CeremonialMailStep.Compose -> CeremonialMailStep.Verify
                            CeremonialMailStep.Commit -> CeremonialMailStep.Compose
                            CeremonialMailStep.Success -> CeremonialMailStep.Commit
                            CeremonialMailStep.Decide -> CeremonialMailStep.Decide
                        },
                )
            if (step == CeremonialMailStep.Success) _pendingEvent.value = CeremonialMailEvent.Dismiss
        }

        override fun onDiscard() {
            _pendingEvent.value = CeremonialMailEvent.Dismiss
        }

        override fun onPrimary() {
            val step = _form.value.step
            when (step) {
                CeremonialMailStep.Decide -> {
                    if (_selectedRecipient.value == null) return
                    _form.value = _form.value.copy(step = CeremonialMailStep.Verify)
                    loadHomeContext()
                }
                CeremonialMailStep.Verify -> {
                    if (!_form.value.addressConfirmed) return
                    _form.value = _form.value.copy(step = CeremonialMailStep.Compose)
                }
                CeremonialMailStep.Compose -> {
                    if (_form.value.bodyText.trim().isEmpty()) return
                    _form.value = _form.value.copy(step = CeremonialMailStep.Commit)
                }
                CeremonialMailStep.Commit -> submit()
                CeremonialMailStep.Success -> _pendingEvent.value = CeremonialMailEvent.Dismiss
            }
        }

        // MARK: - Helpers

        private fun titleFor(step: CeremonialMailStep): String =
            // T6.5e — Step titles match the ceremonial-compose design
            // (Porch Call · Address It · Write It · Seal & Send) while
            // the internal enum stays decide / verify / compose / commit
            // so existing tests and analytics events keep their stable
            // names.
            when (step) {
                CeremonialMailStep.Decide -> "Porch Call"
                CeremonialMailStep.Verify -> "Address It"
                CeremonialMailStep.Compose -> "Write It"
                CeremonialMailStep.Commit -> "Seal & Send"
                CeremonialMailStep.Success -> "Letter on its way"
            }

        private fun primaryCtaLabelFor(step: CeremonialMailStep): String =
            when (step) {
                CeremonialMailStep.Decide -> "Continue"
                CeremonialMailStep.Verify -> "Continue to letter"
                CeremonialMailStep.Compose -> "Continue"
                CeremonialMailStep.Commit -> "Seal and send"
                CeremonialMailStep.Success -> "Done"
            }

        private fun primaryEnabledFor(form: CeremonialMailFormState): Boolean =
            when (form.step) {
                CeremonialMailStep.Decide -> _selectedRecipient.value != null
                CeremonialMailStep.Verify -> form.addressConfirmed
                CeremonialMailStep.Compose -> form.bodyText.trim().isNotEmpty()
                CeremonialMailStep.Commit -> !_isSubmitting.value
                CeremonialMailStep.Success -> true
            }

        private fun dirtyFor(form: CeremonialMailFormState): Boolean =
            when (form.step) {
                // The sender a Reply chose isn't the writer's own change, nor is the assistant's draft as it came; words
                // already written (back from step 3) are.
                CeremonialMailStep.Decide ->
                    _selectedRecipient.value?.userId.let { it != null && it != replyTo?.userId } ||
                        (form.recipientQuery.isNotEmpty() && form.recipientQuery != displayName(replyTo)) ||
                        (form.bodyText.isNotBlank() && form.bodyText != draft?.body)
                CeremonialMailStep.Verify, CeremonialMailStep.Compose, CeremonialMailStep.Commit -> true
                CeremonialMailStep.Success -> false
            }

        private fun subjectFromIntent(intent: CeremonialMailIntent): String =
            when (intent) {
                CeremonialMailIntent.SayHello -> "A note from a friend"
                CeremonialMailIntent.Congratulations -> "Congratulations!"
                CeremonialMailIntent.Condolences -> "Thinking of you"
                CeremonialMailIntent.BusinessNote -> "A business note"
                CeremonialMailIntent.JustBecause -> "Just because"
            }

        private fun displayName(recipient: MailRecipientDto?): String = recipient?.name ?: recipient?.username ?: ""

        private suspend fun searchRecipients(query: String) {
            _isSearching.value = true
            try {
                when (val result = repository.recipients(query)) {
                    is NetworkResult.Success -> _recipientResults.value = result.data.recipients
                    is NetworkResult.Failure -> _recipientResults.value = emptyList()
                }
            } finally {
                _isSearching.value = false
            }
        }

        companion object {
            /** The nav arguments naming the person a letter's Reply writes to: their user id and their name. */
            const val LETTER_TO_USER_KEY = "toUser"
            const val LETTER_TO_NAME_KEY = "toName"
        }
    }
