package app.pantopus.android.ui.screens.plans.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.PlanFromPlanBody
import app.pantopus.android.data.api.models.plans.PlanPastPeopleDto
import app.pantopus.android.data.api.models.plans.PlanPastPlanDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanExtrasRepository
import app.pantopus.android.data.plans.PlansFeature
import app.pantopus.android.data.plans.planCode
import app.pantopus.android.data.plans.planMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Which part of board 30 is over the invite sheet. */
enum class PastPeoplePage { Closed, Plans, People }

/** Board 30 (08-extras section 6): the host's past plans, then one plan's people with a check each. */
data class PlanPastPeopleUi(
    /** `plans_same_people` is on for the host and the plan takes it (a private plan of a person's, not a playdate). */
    val on: Boolean = false,
    val plans: List<PlanPastPlanDto> = emptyList(),
    val page: PastPeoplePage = PastPeoplePage.Closed,
    val people: PlanPastPeopleDto? = null,
    val loadingPeople: Boolean = false,
    /** The keys the host took out (sent as `skip`). */
    val skipped: Set<String> = emptySet(),
    val sending: Boolean = false,
    val error: String? = null,
    /** At a home, the first invitation asks the host to agree that people who are in see the address. */
    val asksAboutAddress: Boolean = false,
    /** The server's line once they went ("Invited 4. 1 can only be reached by text."), for the sheet to show. */
    val done: String? = null,
) {
    /** The invite sheet's row shows: the switch is on and the host has a past plan with people in. */
    val showsRow: Boolean get() = on && plans.isNotEmpty()

    /** People who will be invited: those who can be, minus the ones taken out. */
    val chosenCount: Int get() = people?.people.orEmpty().count { it.canInvite && it.key !in skipped }
}

/** The same people again: past plans, their people, and `from-plan` (server #4234). */
@HiltViewModel
class PlanPastPeopleViewModel
    @Inject
    constructor(
        private val repository: PlanExtrasRepository,
        private val feature: PlansFeature,
    ) : ViewModel() {
        private val _ui = MutableStateFlow(PlanPastPeopleUi())
        val ui: StateFlow<PlanPastPeopleUi> = _ui.asStateFlow()
        private var planId = ""
        private var addressAgreed = false

        /** The invite sheet opened for [id]; [eligible]: a private plan of a person's that isn't a playdate. */
        fun start(
            id: String,
            eligible: Boolean,
        ) {
            if (planId == id) return
            planId = id
            addressAgreed = false
            val on = eligible && feature.flags.value.samePeopleOn
            _ui.value = PlanPastPeopleUi(on = on)
            if (!on) return
            viewModelScope.launch {
                val result = repository.pastPlans()
                if (result is NetworkResult.Success) _ui.update { it.copy(plans = result.data.plans) }
            }
        }

        /** "People from a past plan": board 30 over the sheet. */
        fun open() {
            if (_ui.value.showsRow) _ui.update { it.copy(page = PastPeoplePage.Plans, error = null) }
        }

        /** Back: from a plan's people to the plans, from the plans to the sheet. */
        fun back() {
            _ui.update {
                when (it.page) {
                    PastPeoplePage.People -> it.copy(page = PastPeoplePage.Plans, people = null, skipped = emptySet(), error = null)
                    else -> it.copy(page = PastPeoplePage.Closed, error = null)
                }
            }
        }

        /** "Invite all" on a plan: its people, every one checked who can be invited, before anything goes. */
        /** Straight to [postId]'s people, for "Plan the next one with the same people" (board 29). */
        fun openPeopleOf(postId: String) {
            if (_ui.value.on) choosePlan(PlanPastPlanDto(postId = postId))
        }

        fun choosePlan(plan: PlanPastPlanDto) {
            if (_ui.value.loadingPeople) return
            _ui.update { it.copy(loadingPeople = true, error = null) }
            viewModelScope.launch {
                when (val result = repository.pastPeople(plan.postId)) {
                    is NetworkResult.Success ->
                        _ui.update {
                            it.copy(loadingPeople = false, page = PastPeoplePage.People, people = result.data, skipped = emptySet())
                        }
                    is NetworkResult.Failure -> _ui.update { it.copy(loadingPeople = false, error = result.error.planMessage) }
                }
            }
        }

        /** Takes a person out, or puts them back. A person reached only by text can't be chosen. */
        fun toggle(key: String) {
            val person = _ui.value.people?.people?.firstOrNull { it.key == key } ?: return
            if (!person.canInvite) return
            _ui.update { it.copy(skipped = if (key in it.skipped) it.skipped - key else it.skipped + key, error = null) }
        }

        /** Sends the invitations; at a home the first one asks about the address first. */
        fun send() {
            val ui = _ui.value
            val from = ui.people ?: return
            if (ui.sending || ui.chosenCount == 0) return
            _ui.update { it.copy(sending = true, error = null) }
            viewModelScope.launch {
                val body =
                    PlanFromPlanBody(
                        fromPostId = from.postId,
                        skip = ui.skipped.toList(),
                        confirmSharesAddress = addressAgreed.takeIf { it },
                    )
                when (val result = repository.inviteFromPlan(planId, body)) {
                    is NetworkResult.Success ->
                        _ui.update {
                            it.copy(
                                sending = false,
                                page = PastPeoplePage.Closed,
                                people = null,
                                skipped = emptySet(),
                                done = result.data.text ?: "Invited ${result.data.invited}.",
                            )
                        }
                    is NetworkResult.Failure ->
                        if (result.error.planCode == "confirm_shares_address") {
                            _ui.update { it.copy(sending = false, asksAboutAddress = true) }
                        } else {
                            _ui.update { it.copy(sending = false, error = result.error.planMessage) }
                        }
                }
            }
        }

        fun agreeToShareAddress() {
            addressAgreed = true
            _ui.update { it.copy(asksAboutAddress = false) }
            send()
        }

        fun declineToShareAddress() {
            _ui.update { it.copy(asksAboutAddress = false) }
        }

        /** The sheet showed the server's line and read its invitations again. */
        fun doneShown() {
            _ui.update { it.copy(done = null) }
        }
    }
