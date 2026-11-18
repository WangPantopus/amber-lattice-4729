@file:Suppress("PackageNaming", "MagicNumber", "TooManyFunctions", "LongMethod")

package app.pantopus.android.ui.screens.support_trains.edit_signup

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.support_trains.SupportTrainMyReservationDto
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.displayMessage
import app.pantopus.android.data.support_trains.SupportTrainSignupEdit
import app.pantopus.android.data.support_trains.SupportTrainsRepository
import app.pantopus.android.ui.screens.shared.form.FormAggregate
import app.pantopus.android.ui.screens.shared.form.FormFieldState
import app.pantopus.android.ui.screens.shared.form.FormValidator
import app.pantopus.android.ui.screens.shared.form.all
import app.pantopus.android.ui.screens.shared.form.maxLength
import app.pantopus.android.ui.screens.shared.form.timeHHmm
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject

/** Stable identifiers for every editable Edit Signup field. */
enum class EditSignupField(val key: String) {
    /**
     * Meal description for cook / groceries, restaurant name for
     * takeout. The active label + placeholder swap on
     * `contributionMode`.
     */
    Contribution("contribution"),

    /** `HH:mm` arrival, as the clock time where the train is. */
    DropoffTime("dropoffTime"),

    /** The helper's note to the family (`note_to_recipient`). */
    NoteToRecipient("noteToRecipient"),

    /** The helper's private note to the organizers (`private_note_to_organizer`). */
    DietaryNotes("dietaryNotes"),
}

/** Tiny tone+text bundle the screen turns into a toast. */
data class EditSignupToastPayload(
    val text: String,
    val isError: Boolean,
)

/** Aggregate UI state for the Edit Signup form. */
data class EditSignupUiState(
    val reservation: SupportTrainMyReservationDto? = null,
    val fields: Map<EditSignupField, FormFieldState> =
        EditSignupField.entries.associateWith { FormFieldState(id = it.key) },
    val isSaving: Boolean = false,
    val toast: EditSignupToastPayload? = null,
    val shouldDismiss: Boolean = false,
    /** The signup isn't the viewer's own reserved one any more (delivered, cancelled, gone): nothing to edit. */
    val isMissingSeed: Boolean = false,
    /** The train is being read. */
    val isLoading: Boolean = false,
    /** The date the signup is for (`YYYY-MM-DD`), and the train's zone, where the drop-off time is read. */
    val slotDate: String? = null,
    val timezone: String? = null,
) {
    val aggregate: FormAggregate
        get() = FormAggregate.from(EditSignupField.entries.mapNotNull { fields[it] })

    val isValid: Boolean get() = aggregate.isValid
    val isDirty: Boolean get() = aggregate.isDirty

    val contributionLabel: String
        get() =
            when (reservation?.contributionMode) {
                "cook" -> "Meal description"
                "groceries" -> "Groceries description"
                "takeout" -> "Restaurant"
                else -> "Contribution"
            }

    val contributionPlaceholder: String
        get() =
            when (reservation?.contributionMode) {
                "cook" -> "e.g. Veggie chili with cornbread"
                "groceries" -> "e.g. Pantry staples + fresh produce"
                "takeout" -> "e.g. Sweetgreen on Market"
                else -> "What you're bringing"
            }

    val contributionMapsToRestaurant: Boolean
        get() = reservation?.contributionMode == "takeout"
}

/**
 * P3.7 — Edit Signup form ViewModel: a helper changes their own signup (B1) with
 * `PATCH /:id/reservations/:reservationId`. It reads the train for the signup (no stale copy handed over), sends every
 * field (unchanged ones with their current values) and the version it started from; a change made meanwhile is
 * answered 409, and the form reloads with what's there now.
 */
@HiltViewModel
class EditSignupFormViewModel
    @Inject
    constructor(
        private val repo: SupportTrainsRepository,
        savedStateHandle: SavedStateHandle,
    ) : ViewModel() {
        private val trainId: String = savedStateHandle.get<String>(TRAIN_ID_KEY).orEmpty()
        private val reservationId: String = savedStateHandle.get<String>(RESERVATION_ID_KEY).orEmpty()

        private val _state = MutableStateFlow(EditSignupUiState(isLoading = true))
        val state: StateFlow<EditSignupUiState> = _state.asStateFlow()

        init {
            load()
        }

        /** Reads the train and finds the viewer's own signup; only a reserved one (still ahead) can be edited. */
        fun load() {
            _state.update { it.copy(isLoading = true) }
            viewModelScope.launch {
                when (val result = repo.detail(trainId)) {
                    is NetworkResult.Success -> {
                        val dto = result.data
                        val mine = dto.myReservations.orEmpty().firstOrNull { it.id == reservationId }
                        val slotDate = mine?.slotId?.let { id -> dto.slots.orEmpty().firstOrNull { it.id == id }?.slotDate }
                        if (mine == null || (mine.status ?: "reserved") != "reserved" || mine.updatedAt.isNullOrBlank()) {
                            _state.update { it.copy(isLoading = false, isMissingSeed = true, reservation = null) }
                        } else {
                            _state.update {
                                it.copy(
                                    isLoading = false,
                                    isMissingSeed = false,
                                    reservation = mine,
                                    slotDate = slotDate,
                                    timezone = dto.timezone,
                                    fields = seedFields(mine, zone(dto.timezone)),
                                )
                            }
                        }
                    }
                    is NetworkResult.Failure ->
                        _state.update {
                            it.copy(
                                isLoading = false,
                                isMissingSeed = it.reservation == null,
                                toast = EditSignupToastPayload(result.error.displayMessage("Couldn't load your signup."), isError = true),
                            )
                        }
                }
            }
        }

        /**
         * Update a field's value and re-run its validator. Idempotent —
         * setting a field to its current value clears any prior error.
         */
        fun update(
            field: EditSignupField,
            value: String,
        ) {
            _state.update { current ->
                val snapshot =
                    current.fields[field]?.copy(
                        value = value,
                        touched = true,
                        error = validator(field).validate(value),
                    ) ?: FormFieldState(id = field.key, value = value, touched = true)
                current.copy(fields = current.fields + (field to snapshot))
            }
        }

        fun dismissToast() {
            _state.update { it.copy(toast = null) }
        }

        fun acknowledgeDismiss() {
            _state.update { it.copy(shouldDismiss = false) }
        }

        /** Run all validators. Returns the first invalid field, if any. */
        fun validateAll(): EditSignupField? {
            var firstInvalid: EditSignupField? = null
            _state.update { current ->
                val updated =
                    current.fields.mapValues { (field, snapshot) ->
                        val message = validator(field).validate(snapshot.value)
                        if (firstInvalid == null && message != null) firstInvalid = field
                        snapshot.copy(error = message, touched = true)
                    }
                current.copy(fields = updated)
            }
            return firstInvalid
        }

        /** Saves the edit on the server; the form closes only once the server has it. */
        fun submit() {
            val current = _state.value
            if (current.reservation == null || current.isSaving) return
            if (validateAll() != null) {
                _state.update { it.copy(toast = EditSignupToastPayload("Fix the highlighted field.", isError = true)) }
                return
            }
            val edit = buildEdit() ?: return
            _state.update { it.copy(isSaving = true) }
            viewModelScope.launch {
                when (val result = repo.editSignup(trainId, reservationId, edit)) {
                    is NetworkResult.Success -> {
                        _state.update {
                            it.copy(isSaving = false, toast = EditSignupToastPayload("Signup updated.", isError = false))
                        }
                        // Hold the success toast on screen briefly before the host
                        // pops the nav stack — mirrors iOS cadence.
                        delay(700)
                        _state.update { it.copy(shouldDismiss = true) }
                    }
                    is NetworkResult.Failure -> {
                        _state.update {
                            it.copy(
                                isSaving = false,
                                toast = EditSignupToastPayload(result.error.displayMessage("Couldn't save your signup."), isError = true),
                            )
                        }
                        // Changed meanwhile (409): show what's there now.
                        if (result.error is NetworkError.ClientError && result.error.code == CONFLICT) load()
                    }
                }
            }
        }

        // MARK: - Private

        private fun validator(field: EditSignupField): FormValidator =
            when (field) {
                // Optional on the wire (Joi `.allow(null, '')`) but capped at 200 chars, as the reserve schema.
                EditSignupField.Contribution -> FormValidator.all(listOf(FormValidator.maxLength(200)))
                EditSignupField.DropoffTime -> FormValidator.all(listOf(FormValidator.timeHHmm()))
                EditSignupField.NoteToRecipient -> FormValidator.all(listOf(FormValidator.maxLength(1000)))
                EditSignupField.DietaryNotes -> FormValidator.all(listOf(FormValidator.maxLength(1000)))
            }

        private fun buildEdit(): SupportTrainSignupEdit? {
            val current = _state.value
            val seed = current.reservation ?: return null
            val contribution = (current.fields[EditSignupField.Contribution]?.value ?: "").trim().ifEmpty { null }
            val dishTitle: String?
            val restaurantName: String?
            if (current.contributionMapsToRestaurant) {
                dishTitle = seed.dishTitle
                restaurantName = contribution
            } else {
                dishTitle = contribution
                restaurantName = seed.restaurantName
            }
            return SupportTrainSignupEdit(
                dishTitle = dishTitle,
                restaurantName = restaurantName,
                estimatedArrivalAt = newArrivalIso(seed),
                privateNoteToOrganizer = (current.fields[EditSignupField.DietaryNotes]?.value ?: "").trim().ifEmpty { null },
                noteToRecipient = (current.fields[EditSignupField.NoteToRecipient]?.value ?: "").trim().ifEmpty { null },
                expectedUpdatedAt = seed.updatedAt.orEmpty(),
            )
        }

        /**
         * The picked `HH:mm` on the signup's day, as that clock time where the train is (B4). An untouched time keeps
         * the saved instant exactly; a cleared one clears it.
         */
        @Suppress("ReturnCount")
        private fun newArrivalIso(seed: SupportTrainMyReservationDto): String? {
            val field = _state.value.fields[EditSignupField.DropoffTime]
            val value = field?.value?.trim().orEmpty()
            if (field != null && value == field.originalValue) return seed.estimatedArrivalAt
            if (value.isEmpty()) return null
            val clock = runCatching { LocalTime.parse(value) }.getOrNull() ?: return seed.estimatedArrivalAt
            val zone = zone(_state.value.timezone)
            val savedDay =
                seed.estimatedArrivalAt?.let { iso ->
                    runCatching { OffsetDateTime.parse(iso).atZoneSameInstant(zone).toLocalDate() }.getOrNull()
                }
            val day =
                savedDay
                    ?: _state.value.slotDate?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
                    ?: return seed.estimatedArrivalAt
            return day.atTime(clock).atZone(zone).format(ISO_FMT)
        }

        private fun seedFields(
            seed: SupportTrainMyReservationDto,
            zone: ZoneId,
        ): Map<EditSignupField, FormFieldState> {
            val contribution = if (seed.contributionMode == "takeout") seed.restaurantName.orEmpty() else seed.dishTitle.orEmpty()
            val dropoff =
                seed.estimatedArrivalAt
                    ?.let { runCatching { OffsetDateTime.parse(it).atZoneSameInstant(zone).format(TIME_FMT) }.getOrNull() }
                    .orEmpty()
            val values =
                mapOf(
                    EditSignupField.Contribution to contribution,
                    EditSignupField.DropoffTime to dropoff,
                    EditSignupField.NoteToRecipient to seed.noteToRecipient.orEmpty(),
                    EditSignupField.DietaryNotes to seed.privateNoteToOrganizer.orEmpty(),
                )
            return values.mapValues { (field, value) -> FormFieldState(id = field.key, value = value, originalValue = value) }
        }

        private fun zone(id: String?): ZoneId = id?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()

        companion object {
            /** Nav-arg keys; mirror `ChildRoutes.EDIT_SIGNUP_*` in `RootTabScreen.kt`. */
            const val TRAIN_ID_KEY = "supportTrainId"
            const val RESERVATION_ID_KEY = "reservationId"

            private const val CONFLICT = 409
            private val TIME_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
            private val ISO_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX")
        }
    }
