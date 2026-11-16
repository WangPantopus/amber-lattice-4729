package app.pantopus.android.ui.screens.plans.guests

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanInviteListDto
import app.pantopus.android.data.api.models.plans.PlanInviteRowDto
import app.pantopus.android.data.api.models.plans.PlanPersonDto
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlansRepository
import app.pantopus.android.data.plans.planCode
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.data.plans.takesKids
import app.pantopus.android.ui.screens.plans.PlansRoutes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** How a row is taken off the plan: an invitation (a guest, or one not answered yet) or an account's place. */
enum class PlanGuestRemoval { Invite, Request }

/**
 * One person on Who's coming (Plans for the holidays, A5): an account (its name and picture), a guest without an
 * account (the typed name and its first letter), an address, or a text invite.
 */
data class PlanGuestRow(
    val key: String,
    val name: String,
    val line: String,
    val userId: String? = null,
    val avatarUrl: String? = null,
    /** No person to draw: an address or a text invite, drawn with its glyph. */
    val channel: String? = null,
    val inviteId: String? = null,
    val requestId: String? = null,
    val removal: PlanGuestRemoval? = null,
    /** How many come with this row: adults (or people) and kids. */
    val adults: Int = 1,
    val kids: Int = 0,
)

/** The counts at the top: "{9} coming · {6 adults, 3 kids}", "{2} maybe", "{3} haven't answered". */
data class PlanGuestCounts(
    val coming: Int,
    /** "6 adults, 3 kids", only with kids welcome. */
    val adultsKids: String?,
    val maybe: Int,
    val noAnswer: Int,
)

/** The counts as a plan card carries them (`answers` and `headcount`, contract 6.5), for the host's page. */
fun PlanDto.guestCounts(): PlanGuestCounts? {
    val answers = answers ?: return null
    return PlanGuestCounts(
        coming = headcount?.total ?: answers.isIn,
        adultsKids = headcount?.takeIf { takesKids }?.let { PlanFormat.headcount(it.adults, it.kids) },
        maybe = answers.maybe,
        noAnswer = answers.noAnswer,
    )
}

/** The whole screen. */
data class PlanGuestsUi(
    val plan: PlanDto? = null,
    val list: PlanInviteListDto? = null,
    val loading: Boolean = true,
    val failed: String? = null,
    /** Invitations (or requests) being let in or removed. */
    val working: Set<String> = emptySet(),
    val reminding: Boolean = false,
    /** "Remind" was used today (the server allows one a day). */
    val remindedToday: Boolean = false,
    val notice: String? = null,
    /** "Remove {name}?" is open for this row. */
    val confirmRemove: PlanGuestRow? = null,
    /** The invite sheet (A4) is open over the list. */
    val inviting: Boolean = false,
) {
    private val rows: List<PlanInviteRowDto> get() = list?.invites.orEmpty()
    private val kidsWelcome: Boolean get() = plan?.takesKids == true

    val counts: PlanGuestCounts?
        get() {
            val list = list ?: return null
            val counts = list.counts
            val headcount = list.headcount ?: plan?.headcount
            return PlanGuestCounts(
                coming = headcount?.total ?: counts?.isIn ?: 0,
                adultsKids = headcount?.takeIf { kidsWelcome }?.let { PlanFormat.headcount(it.adults, it.kids) },
                maybe = counts?.maybe ?: 0,
                noAnswer = counts?.noAnswer ?: 0,
            )
        }

    /** "Waiting for you": guests from the open link who wait for the host's yes. */
    val waiting: List<PlanInviteRowDto> get() = rows.filter { it.state == STATE_WAITING || it.canOk }

    /** "Coming": the invitations that are in, then anyone else in the plan's people (an ask, a friend's friend). */
    val coming: List<PlanGuestRow>
        get() {
            val people = plan?.people.orEmpty().filter { !it.isHost }
            val invited = rows.filter { it.state == STATE_IN && !it.canOk }.map { inviteRow(it, people) }
            val shown = invited.mapNotNull { it.userId }.toSet() + invited.mapNotNull { it.requestId }.toSet()
            val inviteIds = rows.map { it.id }.toSet()
            val others =
                people
                    // A guest without an account is on the list already, by their invitation.
                    .filter { !(it.isGuest && (list != null || it.guestId in inviteIds)) }
                    .filter { it.userId == null || it.userId !in shown }
                    .filter { it.requestId == null || it.requestId !in shown }
                    .map { person ->
                        PlanGuestRow(
                            key = "person-${person.userId ?: person.requestId}",
                            name = person.displayName.orEmpty(),
                            line = personLine(person),
                            userId = person.userId,
                            avatarUrl = person.avatarUrl,
                            requestId = person.requestId,
                            removal = PlanGuestRemoval.Request.takeIf { person.requestId != null },
                            adults = person.partySize,
                            kids = person.kidsCount ?: 0,
                        )
                    }
            return invited + others
        }

    /** "Maybe". */
    val maybe: List<PlanGuestRow> get() = rows.filter { it.state == STATE_MAYBE }.map { inviteRow(it, plan?.people.orEmpty()) }

    /** "Haven't answered": accounts, addresses, opened text invites, then one row a text invite nobody opened. */
    val noAnswer: List<PlanGuestRow>
        get() {
            val open =
                rows.filter { it.state in NO_ANSWER_STATES }.map { row ->
                    PlanGuestRow(
                        key = "invite-${row.id}",
                        name = row.title,
                        line =
                            when {
                                row.state == "asked" -> "Waiting for your yes in Requests"
                                row.emailFailed -> "Couldn't email this address"
                                row.person != null && row.channel == "link" -> "Opened your text invite"
                                row.person != null -> "Invited on Pantopus"
                                row.channel == "email" -> "Invited by email"
                                else -> "Not opened yet"
                            },
                        userId = row.person?.userId,
                        avatarUrl = row.person?.avatarUrl,
                        channel = row.channel.takeIf { row.person == null },
                        inviteId = row.id,
                        removal = PlanGuestRemoval.Invite.takeIf { row.canCancel },
                    )
                }
            val unopened =
                (1..(list?.unopenedLinks ?: 0)).map { n ->
                    PlanGuestRow(key = "unopened-$n", name = "A text invite", line = "Not opened yet", channel = "link")
                }
            return open + unopened
        }

    /** "Can't make it": the shipped list showed them, so they stay, last. */
    val cantMakeIt: List<PlanGuestRow>
        get() =
            rows.filter { it.state == "cant_make_it" }.map { row ->
                PlanGuestRow(
                    key = "invite-${row.id}",
                    name = row.title,
                    line = "Can't make it",
                    userId = row.person?.userId,
                    avatarUrl = row.person?.avatarUrl,
                    channel = row.channel.takeIf { row.person == null && row.guest == null },
                )
            }

    /** The people "Remind" reaches (the server's count): an account or an address that hasn't answered. */
    val remindable: Int
        get() =
            list?.remind?.count
                ?: rows.count { it.state in REMINDABLE_STATES && (it.person != null || it.email != null) && !it.emailFailed }

    /** Today's reminder went: the server says so, or it went from this screen. */
    val remindedTodayNow: Boolean get() = remindedToday || list?.remind?.remindedToday == true

    /** A text invite nobody opened has nobody to remind: the footer says so. */
    val hasUnopenedText: Boolean get() = (list?.unopenedLinks ?: 0) > 0

    /** "2 adults, 1 kid · answered from your link" for a waiting guest. */
    fun waitingLine(row: PlanInviteRowDto): String {
        val guest = row.guest
        val count = guest?.let { countWords(it.adults, it.kids) }
        return listOfNotNull(count, "answered from your link").joinToString(" · ")
    }

    private fun inviteRow(
        row: PlanInviteRowDto,
        people: List<PlanPersonDto>,
    ): PlanGuestRow {
        val guest = row.guest
        val person = row.person
        val match = people.firstOrNull { p -> sameAs(row, p) }
        val line =
            when {
                guest != null -> "${countWords(guest.adults, guest.kids)} · answered in a browser"
                match != null -> personLine(match)
                else -> countWords(1, 0)
            }
        return PlanGuestRow(
            key = "invite-${row.id}",
            name = row.title,
            line = line,
            userId = person?.userId,
            avatarUrl = person?.avatarUrl,
            channel = row.channel.takeIf { person == null && guest == null },
            inviteId = row.id,
            requestId = row.requestId ?: match?.requestId,
            removal = removalFor(row, match),
            adults = guest?.adults ?: match?.partySize ?: 1,
            kids = guest?.kids ?: match?.kidsCount ?: 0,
        )
    }

    /**
     * The people line on the host's page (A6 item 2): "Dana + 2 kids, Sam, Priya + 1 and 2 more", the first four of
     * the people coming with what they bring along; null with nobody coming.
     */
    val comingLine: String?
        get() {
            val names = coming.map { row -> withParty(row) }
            if (names.isEmpty()) return null
            val shown = names.take(LINE_NAMES)
            val rest = names.size - shown.size
            return when {
                rest > 0 -> shown.joinToString(", ") + " and $rest more"
                shown.size > 1 -> shown.dropLast(1).joinToString(", ") + " and " + shown.last()
                else -> shown.first()
            }
        }

    /** "Dana + 2 kids", "Priya + 1", "Sam"; without kids welcome only "+ n". */
    private fun withParty(row: PlanGuestRow): String {
        val first = PlanFormat.firstName(row.name)
        val extra =
            if (kidsWelcome) {
                listOfNotNull(
                    (row.adults - 1).takeIf { it > 0 }?.let { "+ $it" },
                    row.kids.takeIf { it > 0 }?.let { "+ $it ${if (it == 1) "kid" else "kids"}" },
                )
            } else {
                listOfNotNull((row.adults + row.kids - 1).takeIf { it > 0 }?.let { "+ $it" })
            }
        return (listOf(first) + extra).joinToString(" ")
    }

    /** The person in the plan's people this invitation is: the same request, or the same account. */
    private fun sameAs(
        row: PlanInviteRowDto,
        person: PlanPersonDto,
    ): Boolean {
        val sameRequest = row.requestId != null && person.requestId == row.requestId
        val sameAccount = row.person != null && person.userId == row.person.userId
        return sameRequest || sameAccount
    }

    /** A guest or an unanswered invitation goes by the invitation; an account who is in by its request. */
    private fun removalFor(
        row: PlanInviteRowDto,
        match: PlanPersonDto?,
    ): PlanGuestRemoval? =
        when {
            row.guest != null -> PlanGuestRemoval.Invite
            (row.requestId ?: match?.requestId) != null -> PlanGuestRemoval.Request
            row.canCancel -> PlanGuestRemoval.Invite
            else -> null
        }

    /** Nobody has answered, nobody waits and nobody is invited yet. */
    val nobodyYet: Boolean get() = coming.isEmpty() && maybe.isEmpty() && noAnswer.isEmpty() && waiting.isEmpty()

    private fun personLine(person: PlanPersonDto): String = countWords(person.partySize, person.kidsCount ?: 0)

    /** With kids welcome "2 adults, 1 kid"; otherwise how many people ("1 person", "3 people"). */
    private fun countWords(
        adults: Int,
        kids: Int,
    ): String =
        if (kidsWelcome) {
            PlanFormat.people(adults, kids)
        } else {
            val total = (adults + kids).coerceAtLeast(1)
            if (total == 1) "1 person" else "$total people"
        }

    companion object {
        const val STATE_IN = "in"
        const val STATE_MAYBE = "maybe"
        const val STATE_WAITING = "waiting_ok"
        private const val LINE_NAMES = 4
        private val NO_ANSWER_STATES = setOf("invited", "opened", "asked")
        private val REMINDABLE_STATES = setOf("invited", "opened")
    }
}

/**
 * Who's coming (Plans for the holidays, board 17, spec A5): the host's list of answers in sections, with Let in,
 * Remove and Remind. Reads `GET /api/plans/:id/invites` (with `guests=1`) and the plan for its people.
 */
@HiltViewModel
class PlanGuestsViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: PlansRepository,
    ) : ViewModel() {
        private val planId: String = savedStateHandle.get<String>(PlansRoutes.PLAN_ID_KEY).orEmpty()
        private val _ui = MutableStateFlow(PlanGuestsUi(plan = repository.card(planId)))
        val ui: StateFlow<PlanGuestsUi> = _ui.asStateFlow()
        private var loadJob: Job? = null

        fun load() {
            loadJob?.cancel()
            _ui.update { it.copy(loading = it.list == null, failed = null) }
            loadJob =
                viewModelScope.launch {
                    val planRead = async { repository.plan(planId) }
                    val listRead = async { repository.invites(planId) }
                    val plan = planRead.await()
                    val list = listRead.await()
                    _ui.update { current ->
                        current.copy(
                            loading = false,
                            plan = (plan as? NetworkResult.Success)?.data ?: current.plan,
                            list = (list as? NetworkResult.Success)?.data ?: current.list,
                            failed = (list as? NetworkResult.Failure)?.error?.planMessage?.takeIf { current.list == null },
                        )
                    }
                }
        }

        /** "Let in": the guest is in and their email goes. */
        fun letIn(row: PlanInviteRowDto) {
            if (row.id in _ui.value.working) return
            _ui.update { it.copy(working = it.working + row.id) }
            viewModelScope.launch {
                val result = repository.letIn(planId, row.id)
                _ui.update {
                    when (result) {
                        is NetworkResult.Success ->
                            it.copy(working = it.working - row.id, list = result.data, notice = "${PlanFormat.firstName(row.title)} is in.")
                        is NetworkResult.Failure -> it.copy(working = it.working - row.id, notice = result.error.planMessage)
                    }
                }
                load()
            }
        }

        /** "Not this time" on a waiting guest: the same as Remove, asked first. */
        fun askNotThisTime(row: PlanInviteRowDto) {
            _ui.update {
                it.copy(
                    confirmRemove =
                        PlanGuestRow(
                            key = "invite-${row.id}",
                            name = row.title,
                            line = "",
                            inviteId = row.id,
                            removal = PlanGuestRemoval.Invite,
                        ),
                )
            }
        }

        fun askRemove(row: PlanGuestRow) {
            if (row.removal == null) return
            _ui.update { it.copy(confirmRemove = row) }
        }

        fun keep() {
            _ui.update { it.copy(confirmRemove = null) }
        }

        /** "Remove": a guest or an invitation by `DELETE …/invites/:inviteId`, an account in the plan by its request. */
        fun remove() {
            val row = _ui.value.confirmRemove ?: return
            val key = row.inviteId ?: row.requestId ?: return
            _ui.update { it.copy(confirmRemove = null, working = it.working + key) }
            viewModelScope.launch {
                val result =
                    when (row.removal) {
                        PlanGuestRemoval.Request -> row.requestId?.let { repository.remove(planId, it) }
                        PlanGuestRemoval.Invite -> row.inviteId?.let { repository.cancelInvite(planId, it) }
                        null -> null
                    }
                _ui.update {
                    when (result) {
                        is NetworkResult.Failure -> it.copy(working = it.working - key, notice = result.error.planMessage)
                        else -> it.copy(working = it.working - key, notice = "${PlanFormat.firstName(row.name)} is off the list.")
                    }
                }
                repository.changed(planId)
                load()
            }
        }

        /** "Remind {n} people": once a plan a day; then "Reminded {n} people." and the button reads "Reminded today". */
        fun remind() {
            if (_ui.value.reminding || _ui.value.remindedTodayNow) return
            _ui.update { it.copy(reminding = true) }
            viewModelScope.launch {
                val result = repository.remind(planId)
                _ui.update {
                    when (result) {
                        is NetworkResult.Success -> {
                            val n = result.data.reminded
                            val notice = if (n == 1) "Reminded 1 person." else "Reminded $n people."
                            it.copy(reminding = false, remindedToday = true, notice = notice)
                        }
                        is NetworkResult.Failure ->
                            if (result.error.planCode in REMINDED_CODES) {
                                it.copy(reminding = false, remindedToday = true)
                            } else {
                                it.copy(reminding = false, notice = result.error.planMessage)
                            }
                    }
                }
            }
        }

        fun openInvite() {
            _ui.update { it.copy(inviting = true) }
        }

        fun closeInvite() {
            _ui.update { it.copy(inviting = false) }
            load()
        }

        fun noticeShown() {
            _ui.update { it.copy(notice = null) }
        }

        private companion object {
            /** The server's answer when today's reminder was already sent. */
            val REMINDED_CODES = setOf("reminded_today", "too_many")
        }
    }
