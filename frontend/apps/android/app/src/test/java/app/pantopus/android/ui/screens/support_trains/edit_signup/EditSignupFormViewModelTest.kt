@file:Suppress("LongMethod", "PackageNaming")

package app.pantopus.android.ui.screens.support_trains.edit_signup

import androidx.lifecycle.SavedStateHandle
import app.pantopus.android.data.api.models.support_trains.SupportTrainDetailDto
import app.pantopus.android.data.api.models.support_trains.SupportTrainMyReservationDto
import app.pantopus.android.data.api.models.support_trains.SupportTrainSlotDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.support_trains.SupportTrainSignupEdit
import app.pantopus.android.data.support_trains.SupportTrainsRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * P3.7 — Edit Signup form ViewModel, on the real route (B1). Covers:
 *  - prefill from the helper's own signup on the train (contribution / drop-off time in the train's zone / notes)
 *  - dirty/valid bookkeeping (Save disabled until a real change)
 *  - contribution-mode label & wire-field swap (takeout → restaurant)
 *  - drop-off time validator rejects nonsense, accepts HH:mm
 *  - submit sends every field with the version it started from
 *  - a signup that isn't the viewer's reserved one surfaces the recovery state
 */
@OptIn(ExperimentalCoroutinesApi::class)
class EditSignupFormViewModelTest {
    private val repo: SupportTrainsRepository = mockk()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        coEvery { repo.editSignup(any(), any(), any()) } returns NetworkResult.Success(Unit)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun reservation(
        mode: String = "cook",
        dish: String? = "Veggie chili",
        restaurant: String? = null,
        privateNote: String? = null,
        arrival: String? = "2026-05-22T22:00:00Z",
        status: String = "reserved",
    ) = SupportTrainMyReservationDto(
        id = "r1",
        slotId = "s1",
        status = status,
        contributionMode = mode,
        dishTitle = dish,
        restaurantName = restaurant,
        estimatedArrivalAt = arrival,
        noteToRecipient = "Knock on the door.",
        createdAt = "2026-05-15T10:00:00Z",
        updatedAt = "2026-05-15T10:00:00.123456Z",
        privateNoteToOrganizer = privateNote,
    )

    private fun make(
        seed: SupportTrainMyReservationDto? = reservation(),
        reservationId: String = "r1",
    ): EditSignupFormViewModel {
        coEvery { repo.detail("t1") } returns
            NetworkResult.Success(
                SupportTrainDetailDto(
                    id = "t1",
                    timezone = "America/Los_Angeles",
                    slots = listOf(SupportTrainSlotDto(id = "s1", slotDate = "2026-05-22")),
                    myReservations = listOfNotNull(seed),
                ),
            )
        return EditSignupFormViewModel(
            repo,
            SavedStateHandle(
                mapOf(
                    EditSignupFormViewModel.TRAIN_ID_KEY to "t1",
                    EditSignupFormViewModel.RESERVATION_ID_KEY to reservationId,
                ),
            ),
        )
    }

    // MARK: - Prefill

    @Test
    fun prefills_contribution_from_dish_title_for_cook_mode() =
        runTest {
            val state = make().state.value
            assertEquals("Meal description", state.contributionLabel)
            assertEquals("Veggie chili", state.fields[EditSignupField.Contribution]?.value)
            assertFalse(state.contributionMapsToRestaurant)
        }

    @Test
    fun prefills_contribution_from_restaurant_for_takeout_mode() =
        runTest {
            val state = make(seed = reservation(mode = "takeout", dish = null, restaurant = "Sweetgreen")).state.value
            assertEquals("Restaurant", state.contributionLabel)
            assertEquals("Sweetgreen", state.fields[EditSignupField.Contribution]?.value)
            assertTrue(state.contributionMapsToRestaurant)
        }

    @Test
    fun prefills_notes_and_the_drop_off_time_where_the_train_is() =
        runTest {
            val state = make(seed = reservation(privateNote = "Strictly vegetarian.")).state.value
            assertEquals("Strictly vegetarian.", state.fields[EditSignupField.DietaryNotes]?.value)
            assertEquals("Knock on the door.", state.fields[EditSignupField.NoteToRecipient]?.value)
            // 22:00 UTC is 3:00 PM in Pacific daylight time (B4).
            assertEquals("15:00", state.fields[EditSignupField.DropoffTime]?.value)
        }

    // MARK: - Dirty / valid

    @Test
    fun initial_state_is_clean_and_valid() =
        runTest {
            val state = make().state.value
            assertFalse(state.isDirty)
            assertTrue(state.isValid)
        }

    @Test
    fun editing_contribution_flips_dirty() =
        runTest {
            val vm = make()
            vm.update(EditSignupField.Contribution, "Veggie chili + cornbread")
            assertTrue(vm.state.value.isDirty)
            assertTrue(vm.state.value.isValid)
        }

    @Test
    fun too_long_contribution_marks_invalid() =
        runTest {
            val vm = make()
            vm.update(EditSignupField.Contribution, "x".repeat(201))
            assertNotNull(vm.state.value.fields[EditSignupField.Contribution]?.error)
            assertFalse(vm.state.value.isValid)
        }

    // MARK: - Drop-off time validator

    @Test
    fun dropoff_time_rejects_garbage() =
        runTest {
            val vm = make()
            vm.update(EditSignupField.DropoffTime, "two pm")
            assertNotNull(vm.state.value.fields[EditSignupField.DropoffTime]?.error)
            assertFalse(vm.state.value.isValid)
        }

    @Test
    fun dropoff_time_accepts_HHmm() =
        runTest {
            val vm = make()
            vm.update(EditSignupField.DropoffTime, "18:30")
            assertNull(vm.state.value.fields[EditSignupField.DropoffTime]?.error)
            assertTrue(vm.state.value.isValid)
        }

    // MARK: - Save

    @Test
    fun submit_sends_every_field_with_the_version_it_started_from() =
        runTest {
            val vm = make()
            vm.update(EditSignupField.Contribution, "Veggie chili + cornbread")
            vm.update(EditSignupField.DropoffTime, "18:30")
            vm.update(EditSignupField.DietaryNotes, "Strictly vegetarian.")
            val sent = slot<SupportTrainSignupEdit>()
            coEvery { repo.editSignup("t1", "r1", capture(sent)) } returns NetworkResult.Success(Unit)
            vm.submit()
            assertEquals("Veggie chili + cornbread", sent.captured.dishTitle)
            assertEquals("Strictly vegetarian.", sent.captured.privateNoteToOrganizer)
            assertEquals("Knock on the door.", sent.captured.noteToRecipient)
            assertNull(sent.captured.restaurantName)
            assertEquals("2026-05-15T10:00:00.123456Z", sent.captured.expectedUpdatedAt)
            // 6:30 PM on the signup's day, where the train is.
            assertEquals("2026-05-22T18:30:00-07:00", sent.captured.estimatedArrivalAt)
            assertTrue(vm.state.value.toast?.isError == false)
        }

    @Test
    fun submit_maps_contribution_to_restaurant_for_takeout_mode() =
        runTest {
            val vm = make(seed = reservation(mode = "takeout", dish = null, restaurant = "Sweetgreen"))
            vm.update(EditSignupField.Contribution, "Sage & Stone")
            val sent = slot<SupportTrainSignupEdit>()
            coEvery { repo.editSignup("t1", "r1", capture(sent)) } returns NetworkResult.Success(Unit)
            vm.submit()
            assertEquals("Sage & Stone", sent.captured.restaurantName)
            assertNull(sent.captured.dishTitle)
            // An untouched time keeps the saved instant exactly.
            assertEquals("2026-05-22T22:00:00Z", sent.captured.estimatedArrivalAt)
        }

    @Test
    fun submit_with_invalid_field_short_circuits_with_error_toast() =
        runTest {
            val vm = make()
            vm.update(EditSignupField.DropoffTime, "midnight-ish")
            vm.submit()
            assertEquals(true, vm.state.value.toast?.isError)
            coVerify(exactly = 0) { repo.editSignup(any(), any(), any()) }
        }

    // MARK: - Nothing to edit

    @Test
    fun missing_signup_surfaces_recovery_state() =
        runTest {
            assertTrue(make(seed = null).state.value.isMissingSeed)
        }

    @Test
    fun delivered_signup_surfaces_recovery_state() =
        runTest {
            assertTrue(make(seed = reservation(status = "delivered")).state.value.isMissingSeed)
        }

    @Test
    fun another_signup_id_surfaces_recovery_state() =
        runTest {
            assertTrue(make(reservationId = "different").state.value.isMissingSeed)
        }
}
