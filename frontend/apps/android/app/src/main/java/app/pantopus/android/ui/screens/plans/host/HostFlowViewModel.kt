@file:Suppress("TooManyFunctions", "MagicNumber")

package app.pantopus.android.ui.screens.plans.host

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.CreatePlanBody
import app.pantopus.android.data.api.models.plans.HostAsBusinessDto
import app.pantopus.android.data.api.models.plans.HostAsLabelDto
import app.pantopus.android.data.api.models.plans.HostAsLocationDto
import app.pantopus.android.data.api.models.plans.PlanDetailsDto
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanGameDto
import app.pantopus.android.data.api.models.plans.PlanGpsInput
import app.pantopus.android.data.api.models.plans.PlanInviteCandidateDto
import app.pantopus.android.data.api.models.plans.PlanNearbyPlaceDto
import app.pantopus.android.data.api.models.plans.PlanPlaceInput
import app.pantopus.android.data.api.models.plans.PlanPlaceSuggestBody
import app.pantopus.android.data.api.models.plans.PlansSportsDto
import app.pantopus.android.data.api.net.NetworkError
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.api.net.safeApiCall
import app.pantopus.android.data.api.services.GeoApi
import app.pantopus.android.data.location.ViewingLocationRepository
import app.pantopus.android.data.plans.PlanAudience
import app.pantopus.android.data.plans.PlanAutoRule
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlanKind
import app.pantopus.android.data.plans.PlanLocationResolver
import app.pantopus.android.data.plans.PlanPlaceQuery
import app.pantopus.android.data.plans.PlanPostedInvite
import app.pantopus.android.data.plans.PlanStudyStyle
import app.pantopus.android.data.plans.PlansEvents
import app.pantopus.android.data.plans.PlansFeature
import app.pantopus.android.data.plans.PlansRepository
import app.pantopus.android.data.plans.isPrivate
import app.pantopus.android.data.plans.planCode
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.screens.plans.PlansRoutes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import javax.inject.Inject
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** The host flow's steps (boards H1, H2 to H5, H7) and the place picker (H6) over them. */
enum class HostStep { Type, Details, Place, Preview }

/** A public place picked on H6 (or found by "You're here now" for a pickup game). */
data class PickedPlace(
    val name: String,
    val address: String?,
    val latitude: Double,
    val longitude: Double,
    val category: String?,
    val distanceMeters: Double?,
    /** H6's row words ("Court · tennis"); the first is [category]. */
    val categories: List<String> = emptyList(),
    /** Found by "You're here now": H4 says so under the place's name. */
    val hereNow: Boolean = false,
    /** The picker's id for a place it listed (`osm:node/123`), sent as `place.place_id`: the venue's key (step 1). */
    val placeId: String? = null,
)

/** What H6's "You're here now" row says while it looks, or after it found nothing. */
enum class HereNowState { Idle, Locating, NoPlace, NoLocation }

/** The host's home, for "My place" (H2) and "My porch" (H5). */
data class HostHome(
    val id: String,
    val name: String?,
    val city: String?,
    val latitude: Double?,
    val longitude: Double?,
)

/** Everything the host is filling in. */
data class HostDraft(
    val kind: PlanKind? = null,
    val title: String = "",
    val titleEdited: Boolean = false,
    val about: String = "",
    val start: LocalDateTime? = null,
    val end: LocalDateTime? = null,
    val gameId: String? = null,
    val atHome: Boolean = false,
    val place: PickedPlace? = null,
    val spots: Int = 6,
    val approveEach: Boolean = true,
    val autoRule: String? = null,
    val hostedBefore: Boolean = false,
    val note: String = "",
    val sport: String = "pickleball",
    val level: String = "any",
    val extraGear: Boolean = false,
    val kidsAgeBands: Set<String> = emptySet(),
    val walkKind: String = "walk",
    val pace: String = "easy",
    val dogsWelcome: Boolean = false,
    val pickupNow: Boolean = true,
    /** A study group's subject (required) and how it studies. */
    val subject: String = "",
    val studyStyle: PlanStudyStyle = PlanStudyStyle.QUIET,
    /** Posting for a business (Plans with businesses, B1): its account; null posts as yourself. */
    val hostAs: String? = null,
    /** What guests see it called (B2): a key from the kind's labels. */
    val label: String? = null,
    /** Which of the business's own locations it meets at (B2). */
    val locationId: String? = null,
    /** "Only people I invite" (Plans step 1): a private plan. False is "Anyone nearby", as every plan was. */
    val isPrivate: Boolean = false,
    /** A private plan: "Guests can bring a friend" (each person invited may invite one more). */
    val guestsCanInvite: Boolean = false,
    /** A private plan: the people chosen on the preview, in the order chosen, invited as it is posted. */
    val inviteIds: List<String> = emptyList(),
)

/** A private plan's preview: the people the host can invite before it exists (`GET /api/plans/invites/people`). */
sealed interface HostInvitePeople {
    data object Idle : HostInvitePeople

    data object Loading : HostInvitePeople

    data class Loaded(
        val people: List<PlanInviteCandidateDto>,
    ) : HostInvitePeople

    data class Failed(
        val message: String,
    ) : HostInvitePeople
}

/** H1 to H8. */
data class HostUi(
    val step: HostStep = HostStep.Type,
    val draft: HostDraft = HostDraft(),
    val zone: ZoneId = ZoneId.systemDefault(),
    val games: List<PlanGameDto> = emptyList(),
    val sports: PlansSportsDto? = null,
    val home: HostHome? = null,
    val places: List<PlanNearbyPlaceDto> = emptyList(),
    val placesLoading: Boolean = false,
    /** The server is still gathering the area's places (a first look can take up to a minute). */
    val placesGathering: Boolean = false,
    /** Why H6's places couldn't load, shown with "Try again". */
    val placesError: String? = null,
    val placesQuery: String = "",
    /** The places' credit, shown under the list ("© OpenStreetMap contributors"). */
    val placesAttribution: String? = null,
    /** H6's "Suggest places" (or "Ask Pantopus" for the search text). */
    val suggestions: PlaceSuggestions = PlaceSuggestions.Idle,
    val placeCandidate: PickedPlace? = null,
    val hereNow: HereNowState = HereNowState.Idle,
    /** Every home of the host's with a point: "You're here now" never picks a place right at one. */
    val homePoints: List<Pair<Double, Double>> = emptyList(),
    val origin: Pair<Double, Double>? = null,
    val playdatesOn: Boolean = false,
    /** The host's address is verified (`/mine`): H7's "Verified" badge, as neighbors will see it. Unknown means no. */
    val hostVerified: Boolean = false,
    val hostName: String = "You",
    val hostAvatar: String? = null,
    val posting: Boolean = false,
    val error: String? = null,
    val postedId: String? = null,
    /** H7's "Near Camas": the city of the plan's place (or home), looked up when the preview opens (as on iOS). */
    val previewArea: String? = null,
    /** The businesses this person may post for (`GET /api/plans/host-as`); "Host as" shows only when there are any. */
    val businesses: List<HostAsBusinessDto> = emptyList(),
    /** H1's "Host as" choice: a business's account, or null for yourself. Kept while the kind is chosen again. */
    val hostAsChoice: String? = null,
    /** `plans_private` is on for this person: "Who can see this" shows on a person's own plan (Plans step 1). */
    val privateOn: Boolean = false,
    /** "Who can see this" as last chosen (or the empty state's "Plan with people you know"), kept while the kind changes. */
    val privateChoice: Boolean = false,
    /** A private plan's preview: the people to invite. */
    val invitePeople: HostInvitePeople = HostInvitePeople.Idle,
) {
    /** "Who can see this" shows: the switch is on and the plan is the person's own (a business's plan is never private). */
    val showsAudience: Boolean get() = privateOn && business == null

    /** The draft is a private plan: chosen, and still allowed. */
    val isPrivate: Boolean get() = showsAudience && draft.isPrivate

    /** The business the draft is posted for, or null for a neighbor's own plan. */
    val business: HostAsBusinessDto? get() = draft.hostAs?.let { id -> businesses.firstOrNull { it.userId == id } }

    /** The business chosen on H1 ("Host as"), before a kind is picked. */
    val chosenBusiness: HostAsBusinessDto? get() = hostAsChoice?.let { id -> businesses.firstOrNull { it.userId == id } }

    /** The labels the draft's kind may carry for its business ("Clinic", "Open play"…). */
    val labels: List<HostAsLabelDto>
        get() = business?.kinds?.firstOrNull { it.kind == draft.kind?.wire }?.labels.orEmpty()

    /** The business location the draft meets at. */
    val location: HostAsLocationDto? get() = business?.locations?.firstOrNull { it.id == draft.locationId }
}

/**
 * Host a plan (boards H1 to H8). The rules come from the brief: hosting needs a home or GPS within 3 miles (the
 * fix proves you're nearby and never becomes the pin); playdates meet in public places and the host approves each
 * family (no verified address since November 7); study groups meet in public places too; at home the host approves each person,
 * with "people I've hosted" the only rule allowed; anyone nearby is only for pickup games and walks.
 */
// The whole host flow (H1 to H8) in one place, now with posting for a business (B1, B2), whose drafts live in
// HostBusinessDrafts.kt; splitting the flow's state across view-models would make its steps harder to follow.
@Suppress("LargeClass")
@HiltViewModel
class HostFlowViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: PlansRepository,
        private val locations: PlanLocationResolver,
        private val viewing: ViewingLocationRepository,
        private val events: PlansEvents,
        private val geo: GeoApi,
        private val feature: PlansFeature,
    ) : ViewModel() {
        /** The plan "Host again" copies (A5), sent as `hosted_again_from`. */
        private var againFrom: String? = null

        private var placesSearch: Job? = null
        private var placesRead: Job? = null
        private var suggestJob: Job? = null
        private var gamesGeneration = 0

        private val _ui =
            MutableStateFlow(
                HostUi(
                    playdatesOn = feature.flags.value.playdatesOn,
                    hostName = shortName(feature.viewer?.displayName),
                    hostAvatar = feature.viewer?.avatarUrl,
                    privateOn = feature.flags.value.privateOn,
                    privateChoice = feature.flags.value.privateOn && savedStateHandle.get<Boolean>(PlansRoutes.PRIVATE_KEY) == true,
                ),
            )
        val ui: StateFlow<HostUi> = _ui.asStateFlow()

        init {
            val kind = PlanKind.from(savedStateHandle.get<String>(PlansRoutes.KIND_KEY))
            val gameId = savedStateHandle.get<String>(PlansRoutes.GAME_KEY)?.takeIf(String::isNotBlank)
            val again = savedStateHandle.get<String>(PlansRoutes.AGAIN_KEY)?.takeIf(String::isNotBlank)
            viewModelScope.launch {
                loadContext(gameId)
                if (again != null) copyFrom(again)
            }
            if (kind != null && (kind != PlanKind.PLAYDATE || _ui.value.playdatesOn)) choose(kind)
        }

        /** "Host again" (A5): the same plan a week later, ready to preview. */
        private suspend fun copyFrom(planId: String) {
            val plan = (repository.plan(planId) as? NetworkResult.Success)?.data ?: return
            // A business's plan is copied as the business's, or not at all: never as a neighbor's at its address.
            if (plan.business != null) copyBusinessPlan(plan) else copyNeighborPlan(planId, plan)
        }

        /** A neighbor's own plan, a week on (A5). */
        private fun copyNeighborPlan(
            planId: String,
            plan: PlanDto,
        ) {
            againFrom = planId
            val kind = PlanKind.from(plan.kind) ?: return
            val zone = PlanFormat.zone(plan.timezone)
            var start = PlanFormat.instant(plan.startsAt)?.atZone(zone)?.toLocalDateTime() ?: return
            var end = PlanFormat.instant(plan.endsAt)?.atZone(zone)?.toLocalDateTime() ?: start.plusHours(1)
            val now = LocalDateTime.now(zone)
            while (!start.isAfter(now)) {
                start = start.plusWeeks(1)
                end = end.plusWeeks(1)
            }
            // A private plan is hosted again as a private one, with nobody invited yet.
            val keepPrivate = plan.isPrivate && _ui.value.privateOn
            val draft = copiedDraft(plan, kind, start, end, keepPrivate)
            _ui.update { it.copy(zone = zone, step = HostStep.Details, draft = draft, privateChoice = keepPrivate) }
            showCopy(plan)
        }

        /**
         * "Host again" opens the preview (board A5 → H7, as on iOS); a copy that needs a fix opens its details. A private
         * plan copied while private plans are off is never posted for everyone without a word.
         */
        private fun showCopy(plan: PlanDto) {
            if (plan.isPrivate && !_ui.value.privateOn) {
                _ui.update { it.copy(error = "Private plans aren't available right now. This copy would be seen by people nearby.") }
                return
            }
            if (validate(_ui.value.draft) == null) {
                _ui.update { it.copy(step = HostStep.Preview) }
                loadPreviewArea()
                if (_ui.value.isPrivate) loadInvitePeople()
            }
        }

        private suspend fun loadContext(gameId: String?) {
            val generation = ++gamesGeneration
            val payload = (viewing.current() as? NetworkResult.Success)?.data ?: viewing.currentCopy()
            val home = payload?.homes?.firstOrNull()?.let { HostHome(it.id, it.name, it.city, it.latitude, it.longitude) }
            val homePoints = payload?.homes.orEmpty().mapNotNull { h -> h.latitude?.let { lat -> h.longitude?.let { lat to it } } }
            val reply = (repository.games("composer") as? NetworkResult.Success)?.data
            val games = reply?.games.orEmpty()
            val verified = (repository.mineCopy() ?: repository.mine().data)?.viewer?.verifiedAddress ?: false
            // "Host as" (B1): the businesses this person may post for; none for nearly everyone.
            val businesses = repository.hostAs().filter { it.locations.isNotEmpty() }
            _ui.update {
                it.copy(
                    home = home,
                    homePoints = homePoints,
                    hostVerified = verified,
                    businesses = businesses,
                    hostAsChoice = it.hostAsChoice?.takeIf { id -> businesses.any { b -> b.userId == id } },
                )
            }
            warmPlaces(home)
            if (generation != gamesGeneration) return
            _ui.update { it.copy(games = games, sports = reply?.sports) }
            val draft = _ui.value.draft
            when {
                gameId != null -> games.firstOrNull { it.id == gameId }?.let(::pickGame)
                // A watch party chosen before the games came back starts on the soonest one (see choose).
                draft.kind == PlanKind.WATCH_PARTY && draft.gameId == null && !draft.titleEdited -> automaticGame()?.let(::pickGame)
            }
        }

        private fun automaticGame(): PlanGameDto? =
            _ui.value.games.firstOrNull {
                it.isAvailable() && (_ui.value.sports?.canChoose != true || it.followed)
            }

        fun refreshGames() {
            val generation = ++gamesGeneration
            viewModelScope.launch {
                val reply = (repository.games("composer") as? NetworkResult.Success)?.data ?: return@launch
                if (generation != gamesGeneration) return@launch
                _ui.update { it.copy(games = reply.games, sports = reply.sports) }
                if (_ui.value.draft.gameId != null && reply.games.none { it.id == _ui.value.draft.gameId }) {
                    pickGame(null)
                    edit { if (it.titleEdited) it else it.copy(title = "") }
                }
            }
        }

        // ---- H1 ----

        fun choose(kind: PlanKind) {
            val now = LocalDateTime.now(_ui.value.zone)
            val start = sensibleStart(kind, now)
            _ui.value.chosenBusiness?.let { business ->
                chooseForBusiness(business, kind, start)
                return
            }
            val draft =
                when (kind) {
                    PlanKind.WATCH_PARTY -> HostDraft(kind = kind, spots = 8, atHome = _ui.value.home != null)
                    PlanKind.PLAYDATE -> HostDraft(kind = kind, spots = 4, title = "Playground morning")
                    PlanKind.PICKUP_GAME ->
                        HostDraft(
                            kind = kind,
                            spots = 2,
                            approveEach = false,
                            autoRule = PlanAutoRule.ANYONE_NEARBY,
                            title = "Pickleball, need 2",
                        )
                    PlanKind.WALK_COFFEE ->
                        HostDraft(kind = kind, spots = 6, approveEach = false, autoRule = PlanAutoRule.VERIFIED, title = "Coffee walk")
                    // A watch party's defaults (as on iOS), always at a public place.
                    PlanKind.STUDY_GROUP -> HostDraft(kind = kind, spots = 8)
                }
            val hours = if (kind == PlanKind.WATCH_PARTY || kind == PlanKind.STUDY_GROUP) 3L else 1L
            val timed =
                if (kind == PlanKind.PICKUP_GAME) {
                    draft.copy(start = now.plusMinutes(PICKUP_LEAD_MINUTES), end = now.plusHours(2))
                } else {
                    draft.copy(start = start, end = start.plusHours(hours))
                }.copy(isPrivate = _ui.value.privateChoice && _ui.value.privateOn)
            _ui.update { it.copy(step = HostStep.Details, draft = timed, error = null) }
            // A watch party starts on the soonest game, its chip checked and its title and time filled in (board H2, as on iOS).
            if (kind == PlanKind.WATCH_PARTY) automaticGame()?.let(::pickGame)
        }

        /**
         * Two hours from now on the hour, unless that falls at night (or, for a playdate, outside the daytime): then
         * the next sensible time, a playdate at 10 AM, a walk at 8 AM, a watch party at 7 PM.
         */
        private fun sensibleStart(
            kind: PlanKind,
            now: LocalDateTime,
        ): LocalDateTime {
            val soon = now.plusHours(2).truncatedTo(ChronoUnit.HOURS)
            val (earliest, latest, preferred) =
                when (kind) {
                    PlanKind.PLAYDATE -> Triple(DAY_START, PLAYDATE_LATEST, PLAYDATE_HOUR)
                    PlanKind.WALK_COFFEE -> Triple(WALK_EARLIEST, NIGHT_START, WALK_HOUR)
                    else -> Triple(DAY_START, NIGHT_START, EVENING_HOUR)
                }
            if (soon.hour in earliest until latest) return soon
            val day = if (soon.hour >= latest) soon.toLocalDate().plusDays(1) else soon.toLocalDate()
            return day.atTime(preferred, 0)
        }

        // ---- H2 to H5 ----

        fun edit(transform: (HostDraft) -> HostDraft) {
            _ui.update { it.copy(draft = transform(it.draft), error = null) }
        }

        fun setTitle(value: String) = edit { it.copy(title = value.take(TITLE_MAX), titleEdited = true) }

        /** A study group's subject: at most 60 characters, as the server allows. */
        fun setSubject(value: String) = edit { it.copy(subject = value.take(SUBJECT_MAX)) }

        /** A game fills in the title and the time (H2). */
        fun pickGame(game: PlanGameDto?) {
            if (game == null) {
                edit { it.copy(gameId = null) }
                return
            }
            val zone = _ui.value.zone
            val now = LocalDateTime.now(zone)
            val gameStart = PlanFormat.instant(game.startsAt)?.atZone(zone)?.toLocalDateTime()
            val gameEnd = PlanFormat.instant(game.endsAt)?.atZone(zone)?.toLocalDateTime() ?: gameStart?.plusHours(3)
            // A plan can't start in the past: a game already on starts at the next quarter hour at least 5 minutes away
            // (time to choose the place), until the game ends.
            val soon = now.plusMinutes(GAME_ON_LEAD_MINUTES).truncatedTo(ChronoUnit.MINUTES)
            val start =
                if (gameStart != null && gameStart.isBefore(now)) {
                    soon.truncatedTo(ChronoUnit.HOURS).plusMinutes((soon.minute + QUARTER_HOUR - 1) / QUARTER_HOUR * QUARTER_HOUR)
                } else {
                    gameStart
                }
            val end = if (start != null && gameEnd != null) maxOf(gameEnd, start.plusMinutes(MIN_MINUTES)) else gameEnd
            edit { draft ->
                draft.copy(
                    gameId = game.id,
                    title = if (draft.titleEdited) draft.title else "${game.label} game on the big screen",
                    start = start ?: draft.start,
                    end = end ?: draft.end,
                )
            }
        }

        fun setStart(value: LocalDateTime) =
            edit { draft ->
                val length = if (draft.start != null && draft.end != null) Duration.between(draft.start, draft.end) else Duration.ofHours(1)
                draft.copy(start = value, end = value.plus(length))
            }

        fun setEnd(value: LocalDateTime) = edit { it.copy(end = value) }

        /** "A public place" or "My place" / "My porch". At home the host always approves each person (D6, D7). */
        fun setAtHome(atHome: Boolean) =
            edit { draft ->
                if (atHome) {
                    draft.copy(atHome = true, approveEach = true, autoRule = null)
                } else {
                    draft.copy(atHome = false)
                }
            }

        /** Now or later, for a pickup game (H4). */
        fun setPickupNow(now: Boolean) {
            val zone = _ui.value.zone
            val clock = LocalDateTime.now(zone)
            edit { draft ->
                if (now) {
                    draft.copy(pickupNow = true, start = clock.plusMinutes(PICKUP_LEAD_MINUTES), end = clock.plusHours(2))
                } else {
                    val start = clock.plusHours(3).truncatedTo(ChronoUnit.HOURS)
                    draft.copy(pickupNow = false, start = start, end = start.plusHours(2))
                }
            }
        }

        /** "Who can see this" (Plans step 1): anyone nearby, or only the people the host invites. */
        fun setPrivate(invitedOnly: Boolean) {
            if (!_ui.value.showsAudience) return
            _ui.update { it.copy(privateChoice = invitedOnly, draft = it.draft.copy(isPrivate = invitedOnly), error = null) }
        }

        /** "Guests can bring a friend" on a private plan. */
        fun setGuestsCanInvite(on: Boolean) = edit { it.copy(guestsCanInvite = on) }

        /** A person on the private preview's list, chosen or not (up to 30 invited as it is posted). */
        fun toggleInvite(userId: String) {
            val chosen = _ui.value.draft.inviteIds
            if (userId !in chosen && chosen.size >= MAX_INVITES_AT_POST) {
                _ui.update { it.copy(error = "You can invite up to $MAX_INVITES_AT_POST people as you post. Invite more after.") }
                return
            }
            edit { it.copy(inviteIds = if (userId in chosen) chosen - userId else chosen + userId) }
        }

        /** The private preview's people: read when it opens, and again from "Try again". */
        fun loadInvitePeople() {
            if (_ui.value.invitePeople == HostInvitePeople.Loading) return
            _ui.update { it.copy(invitePeople = HostInvitePeople.Loading) }
            viewModelScope.launch {
                val next =
                    when (val result = repository.invitePeopleBefore()) {
                        is NetworkResult.Success -> HostInvitePeople.Loaded(result.data.people)
                        is NetworkResult.Failure -> HostInvitePeople.Failed(result.error.planMessage)
                    }
                _ui.update { it.copy(invitePeople = next) }
            }
        }

        // ---- H6 ----

        fun openPlaces() {
            suggestJob?.cancel()
            _ui.update {
                it.copy(
                    step = HostStep.Place,
                    placeCandidate = it.draft.place,
                    hereNow = HereNowState.Idle,
                    placesError = null,
                    suggestions = PlaceSuggestions.Idle,
                )
            }
            placesRead?.cancel()
            placesRead = viewModelScope.launch { loadPlaces() }
        }

        /** "Try again" under H6's list: the same read again (the search's, while searching). */
        fun retryPlaces() {
            val origin = _ui.value.origin
            val query = _ui.value.placesQuery.trim().takeIf(String::isNotEmpty)
            placesRead?.cancel()
            placesRead = viewModelScope.launch { if (origin == null) loadPlaces() else fetchPlaces(origin, query) }
        }

        /**
         * Starts the server gathering the public places around the host when the flow opens, so H6 usually opens on a
         * full list: a new area can take the map servers up to a minute (as on iOS). Nothing is shown from it.
         */
        private fun warmPlaces(home: HostHome?) {
            viewModelScope.launch {
                val point =
                    locations.gpsFix()?.let { it.latitude to it.longitude }
                        ?: home?.let { h -> if (h.latitude != null && h.longitude != null) h.latitude to h.longitude else null }
                        ?: return@launch
                repository.nearbyPlaces(point.first, point.second, wait = false)
            }
        }

        private suspend fun loadPlaces() {
            val gps = locations.gpsFix()
            val home = _ui.value.home
            val origin =
                gps?.let { it.latitude to it.longitude }
                    ?: home?.let { h -> if (h.latitude != null && h.longitude != null) h.latitude to h.longitude else null }
                    ?: locations.resolve()?.let { it.latitude to it.longitude }
            if (origin == null) {
                _ui.update { it.copy(placesError = "Share your location or add your home to find places nearby.") }
                return
            }
            _ui.update { it.copy(origin = origin) }
            fetchPlaces(origin, query = null)
        }

        /** What H6's list and suggestions are for: the draft's kind, a pickup game's sport, and its time. */
        private fun planPlaceQuery(): PlanPlaceQuery? {
            val ui = _ui.value
            val kind = ui.draft.kind ?: return null
            val start = ui.draft.start ?: return null
            return placeQuery(kind, ui.draft.sport, start, ui.draft.end, ui.zone)
        }

        /**
         * One places read, ordered for the plan. A first ask for an area may come back `loading` while OpenStreetMap is
         * slow: the list keeps its skeleton (saying why after the first such answer) and the read asks again.
         */
        private suspend fun fetchPlaces(
            origin: Pair<Double, Double>,
            query: String?,
        ) {
            val stillAsked = { query == _ui.value.placesQuery.trim().takeIf(String::isNotEmpty) }
            _ui.update { it.copy(placesLoading = true, placesGathering = false, placesError = null) }
            val result =
                repository.nearbyPlacesWhenReady(origin.first, origin.second, query, planPlaceQuery()) { reply ->
                    if (stillAsked()) {
                        _ui.update { it.copy(placesGathering = true, placesAttribution = reply.attribution ?: it.placesAttribution) }
                    }
                }
            if (!stillAsked()) return
            _ui.update {
                when (result) {
                    is NetworkResult.Success ->
                        if (result.data.loading) {
                            it.copy(placesLoading = false, placesGathering = false, placesError = PLACES_SLOW)
                        } else {
                            it.copy(
                                placesLoading = false,
                                placesGathering = false,
                                places = result.data.places,
                                placesAttribution = result.data.attribution ?: it.placesAttribution,
                            )
                        }
                    is NetworkResult.Failure ->
                        it.copy(placesLoading = false, placesGathering = false, placesError = placesFailure(result.error))
                }
            }
        }

        /** Search by name: the list filters at once, and the server looks further than the nearest 40. */
        fun searchPlaces(query: String) {
            if (query.trim() != _ui.value.placesQuery.trim()) {
                // Suggestions answer the words they were asked with (as on iOS).
                suggestJob?.cancel()
                _ui.update { it.copy(suggestions = PlaceSuggestions.Idle) }
            }
            _ui.update { it.copy(placesQuery = query) }
            placesSearch?.cancel()
            val origin = _ui.value.origin ?: return
            placesSearch =
                viewModelScope.launch {
                    delay(SEARCH_DEBOUNCE_MS)
                    fetchPlaces(origin, query.trim().takeIf(String::isNotEmpty))
                }
        }

        /** H6's "Suggest places" ([ask] null), or "Ask Pantopus" for what the host typed in the search box. */
        fun suggestPlaces(ask: String?) {
            val ui = _ui.value
            val origin = ui.origin ?: return
            val draft = ui.draft
            val kind = draft.kind ?: return
            val plan = planPlaceQuery() ?: return
            val body =
                PlanPlaceSuggestBody(
                    latitude = origin.first,
                    longitude = origin.second,
                    kind = kind.wire,
                    title = draft.title.trim().takeIf(String::isNotEmpty),
                    about = draft.about.trim().takeIf(String::isNotEmpty),
                    startsAt = plan.startsAt,
                    endsAt = plan.endsAt,
                    spots = draft.spots,
                    details = details(kind, draft, ui.games.firstOrNull { it.id == draft.gameId }),
                    ask = ask,
                )
            suggestJob?.cancel()
            _ui.update { it.copy(suggestions = PlaceSuggestions.Loading(gathering = false)) }
            suggestJob =
                viewModelScope.launch {
                    val result =
                        repository.suggestPlacesWhenReady(body) {
                            _ui.update { it.copy(suggestions = PlaceSuggestions.Loading(gathering = true)) }
                        }
                    _ui.update { it.copy(suggestions = PlaceSuggestions.from(result, ask)) }
                }
        }

        fun pickPlaceCandidate(place: PickedPlace) {
            _ui.update { it.copy(placeCandidate = place, hereNow = HereNowState.Idle) }
        }

        /**
         * "You're here now" (board H4): a fresh fix, then the nearest named public place within about 150 m of it from
         * H6's own list, never the fix itself (decision D2). A place right at one of the host's homes doesn't count:
         * the server refuses a public place that close to a home (HOME_GUARD_METERS in planRules.js).
         */
        fun pickHereNow() {
            if (_ui.value.hereNow == HereNowState.Locating) return
            _ui.update { it.copy(hereNow = HereNowState.Locating, error = null) }
            viewModelScope.launch {
                val fix = locations.newFix()
                if (fix == null) {
                    _ui.update { it.copy(hereNow = HereNowState.NoLocation) }
                    return@launch
                }
                val homes = _ui.value.homePoints
                val spot =
                    placesAround(fix.latitude to fix.longitude)
                        .mapNotNull { it.toPicked() }
                        .map { it to (it.distanceMeters ?: metersBetween(fix.latitude, fix.longitude, it.latitude, it.longitude)) }
                        .filter { (place, meters) -> meters <= HERE_NOW_METERS && !atHome(place, homes) }
                        .minByOrNull { (_, meters) -> meters }
                        ?.first
                _ui.update {
                    if (spot == null) {
                        it.copy(hereNow = HereNowState.NoPlace)
                    } else {
                        it.copy(hereNow = HereNowState.Idle, placeCandidate = spot.copy(hereNow = true))
                    }
                }
            }
        }

        private fun atHome(
            place: PickedPlace,
            homes: List<Pair<Double, Double>>,
        ): Boolean = homes.any { (lat, lng) -> metersBetween(lat, lng, place.latitude, place.longitude) <= HOME_GUARD_METERS }

        /** The public places around a point, nearest first; a first ask for an area may answer `loading` (as on H6). */
        private suspend fun placesAround(point: Pair<Double, Double>): List<PlanNearbyPlaceDto> {
            repeat(PLACES_ATTEMPTS) { attempt ->
                val reply = (repository.nearbyPlaces(point.first, point.second) as? NetworkResult.Success)?.data ?: return emptyList()
                if (!reply.loading || attempt == PLACES_ATTEMPTS - 1) return reply.places
                delay(PLACES_RETRY_MS)
            }
            return emptyList()
        }

        fun usePlace() {
            val place = _ui.value.placeCandidate ?: return
            _ui.update { it.copy(step = HostStep.Details, draft = it.draft.copy(place = place, atHome = false)) }
        }

        fun closePlaces() {
            _ui.update { it.copy(step = HostStep.Details) }
        }

        // ---- B1 and B2: posting for a business (Plans with businesses) ----

        /** H1's "Host as": yourself (null) or one of the businesses this person may post for. */
        fun chooseHostAs(businessUserId: String?) {
            _ui.update { it.copy(hostAsChoice = businessUserId?.takeIf { id -> it.businesses.any { b -> b.userId == id } }) }
        }

        /** B2: what guests see it called. */
        fun pickLabel(key: String) = edit { it.copy(label = key) }

        /** B2: one of the business's own locations. */
        fun pickLocation(id: String) = edit { it.copy(locationId = id) }

        /** A business's plan of [kind] (board B2): see [businessDraft]. */
        private fun chooseForBusiness(
            business: HostAsBusinessDto,
            kind: PlanKind,
            start: LocalDateTime,
        ) {
            _ui.update { it.copy(step = HostStep.Details, draft = businessDraft(business, kind, start), error = null) }
        }

        /** "Host again" for a business's plan: posted as the business again, or not at all. */
        private fun copyBusinessPlan(plan: PlanDto) {
            val business = _ui.value.businesses.firstOrNull { it.userId == plan.business?.userId } ?: return
            val (zone, draft) = copiedBusinessDraft(plan, business) ?: return
            _ui.update { it.copy(zone = zone, step = HostStep.Details, hostAsChoice = business.userId, draft = draft) }
        }

        // ---- H7 ----

        fun preview() {
            val problem = validate(_ui.value.draft)
            if (problem != null) {
                _ui.update { it.copy(error = problem) }
                return
            }
            _ui.update { it.copy(step = HostStep.Preview, error = null) }
            loadPreviewArea()
            if (_ui.value.isPrivate && _ui.value.invitePeople !is HostInvitePeople.Loaded) loadInvitePeople()
        }

        /** The city the place is in, for the preview's "Near Camas" (iOS reverse-geocodes the same point). */
        private fun loadPreviewArea() {
            val ui = _ui.value
            val point =
                if (ui.draft.atHome) {
                    ui.home?.let { h -> if (h.latitude != null && h.longitude != null) h.latitude to h.longitude else null }
                } else {
                    ui.draft.place?.let { it.latitude to it.longitude }
                }
            _ui.update { it.copy(previewArea = null) }
            point ?: return
            viewModelScope.launch {
                val city =
                    when (val reply = safeApiCall { geo.reverse(point.first, point.second) }) {
                        is NetworkResult.Success -> reply.data.normalized.city?.trim()
                        is NetworkResult.Failure -> null
                    }
                if (!city.isNullOrEmpty()) _ui.update { it.copy(previewArea = "Near $city") }
            }
        }

        fun back(): Boolean {
            val step = _ui.value.step
            val previous =
                when (step) {
                    HostStep.Type -> return false
                    HostStep.Details -> HostStep.Type
                    HostStep.Place -> HostStep.Details
                    HostStep.Preview -> HostStep.Details
                }
            _ui.update { it.copy(step = previous, error = null) }
            return true
        }

        /**
         * Posts the plan. [then] is a private plan's "Text a link" or "Email" on the preview: the invite sheet opens over
         * the posted plan.
         */
        fun post(then: PlanPostedInvite? = null) {
            val ui = _ui.value
            val draft = ui.draft
            val kind = draft.kind ?: return
            if (ui.posting || ui.postedId != null) return
            validate(draft)?.let { problem ->
                _ui.update { it.copy(error = problem) }
                return
            }
            _ui.update { it.copy(posting = true, error = null) }
            viewModelScope.launch {
                val business = ui.business
                val body =
                    if (business != null) {
                        businessCreateBody(kind, draft, ui.zone, business)
                    } else {
                        // A private plan can be anywhere: no fix is needed to prove the host is nearby.
                        val fix = if (ui.isPrivate) null else locations.gpsFix()
                        buildBody(kind, draft, ui, fix?.let { PlanGpsInput(it.latitude, it.longitude, it.at.toString()) })
                    }
                when (val result = repository.create(body)) {
                    is NetworkResult.Success -> {
                        events.posted(result.data.id, then.takeIf { ui.isPrivate }, inviteNote(result.data))
                        _ui.update { it.copy(posting = false, postedId = result.data.id) }
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(posting = false, error = postError(result.error)) }
                }
            }
        }

        /**
         * What went wrong with the invitations a private plan sent as it was posted: the server's sentence when none went
         * out, or how many people couldn't be invited; null when all went well.
         */
        private fun inviteNote(plan: PlanDto): String? {
            plan.inviteError?.trim()?.takeIf(String::isNotEmpty)?.let { return it }
            val missed = plan.inviteResults.orEmpty().count { it.outcome == "unavailable" }
            return when (missed) {
                0 -> null
                1 -> "Couldn't invite 1 person. You can invite people from your plan."
                else -> "Couldn't invite $missed people. You can invite people from your plan."
            }
        }

        /** Why posting didn't work, in the server's words where it has them (Plans step 1 adds the private plan's refusals). */
        private fun postError(error: NetworkError): String =
            when (error.planCode) {
                "not_near" -> "You can host within 3 miles of where you live or where you are now."
                "private_unavailable" -> {
                    // The switch went off since this screen opened: read it again for the other screens. This one keeps
                    // "Who can see this", so the host chooses Anyone nearby themselves; nothing goes public unasked.
                    feature.refresh()
                    "Private plans aren't available right now. Choose Anyone nearby to post it."
                }
                else -> error.planMessage
            }

        private fun buildBody(
            kind: PlanKind,
            draft: HostDraft,
            ui: HostUi,
            gps: PlanGpsInput?,
        ): CreatePlanBody {
            val zone = ui.zone
            val home = ui.home
            val place =
                if (draft.atHome && home != null) {
                    PlanPlaceInput(kind = "home", name = "${ui.hostName.substringBefore(' ')}'s place", homeId = home.id)
                } else {
                    val picked = draft.place
                    PlanPlaceInput(
                        kind = "public",
                        name = picked?.name,
                        address = picked?.address,
                        latitude = picked?.latitude,
                        longitude = picked?.longitude,
                        placeId = picked?.placeId,
                    )
                }
            val rules =
                buildList {
                    if (kind != PlanKind.PLAYDATE) {
                        if (!draft.approveEach && !draft.atHome) draft.autoRule?.let(::add)
                        // Not for a pickup game: its form has no such box (board H4), as on iOS.
                        if (draft.hostedBefore && kind != PlanKind.PICKUP_GAME) add(PlanAutoRule.HOSTED_BEFORE)
                    }
                }.distinct()
            val game = ui.games.firstOrNull { it.id == draft.gameId }
            val invitedOnly = ui.isPrivate
            return CreatePlanBody(
                kind = kind.wire,
                title = draft.title.trim(),
                about = draft.about.trim().takeIf(String::isNotEmpty),
                startsAt = draft.start!!.atZone(zone).toInstant().toString(),
                endsAt = draft.end!!.atZone(zone).toInstant().toString(),
                place = place,
                spots = draft.spots,
                autoRules = rules,
                // Who can ask (as on iOS): anyone on Pantopus nearby. Since November 7 the server reads no verified address
                // for any kind; a playdate still sends `verified`, which its table requires. "Verified neighbors get in right
                // away" is the `verified` rule above; others still ask.
                joinRequirement = if (kind == PlanKind.PLAYDATE) "verified" else "located",
                details = details(kind, draft, game),
                guestNote = draft.note.trim().takeIf(String::isNotEmpty),
                gps = gps,
                hostedAgainFrom = againFrom,
                // A private plan (Plans step 1); a plan anyone nearby can see sends none of these, as before.
                audience = PlanAudience.INVITED.takeIf { invitedOnly },
                guestsCanInvite = draft.guestsCanInvite.takeIf { invitedOnly },
                inviteUserIds = draft.inviteIds.take(MAX_INVITES_AT_POST).takeIf { invitedOnly && it.isNotEmpty() },
            )
        }

        private fun details(
            kind: PlanKind,
            draft: HostDraft,
            game: PlanGameDto?,
        ): PlanDetailsDto =
            when (kind) {
                PlanKind.WATCH_PARTY -> PlanDetailsDto(game = game?.reference())
                PlanKind.PLAYDATE -> PlanDetailsDto(kidsAgeBands = draft.kidsAgeBands.toList())
                PlanKind.PICKUP_GAME -> PlanDetailsDto(sport = draft.sport, level = draft.level, extraGear = draft.extraGear)
                PlanKind.WALK_COFFEE -> PlanDetailsDto(walkKind = draft.walkKind, pace = draft.pace, dogsWelcome = draft.dogsWelcome)
                PlanKind.STUDY_GROUP -> PlanDetailsDto(subject = draft.subject.cleanSubject(), studyStyle = draft.studyStyle.wire)
            }

        private fun validate(draft: HostDraft): String? {
            _ui.value.businesses.firstOrNull { it.userId == draft.hostAs }?.let { return businessDraftProblem(draft, it, _ui.value.zone) }
            val now = LocalDateTime.now(_ui.value.zone)
            val start = draft.start
            val end = draft.end
            val minutes = if (start != null && end != null) Duration.between(start, end).toMinutes() else 0
            val kindProblem = kindProblem(draft)
            val tooFar = tooFarAhead(draft, now)
            return when {
                draft.title.isBlank() -> "Give your plan a title."
                start == null || end == null -> "Pick when it starts and ends."
                start.isBefore(now.minusMinutes(1)) -> "Pick a time that hasn't passed."
                tooFar != null -> tooFar
                minutes < MIN_MINUTES -> "A plan lasts at least 15 minutes."
                minutes > MAX_MINUTES -> "A plan lasts at most 8 hours."
                kindProblem != null -> kindProblem
                draft.atHome && _ui.value.home == null -> "Add your home to host there, or choose a public place."
                !draft.atHome && draft.place == null -> "Choose a place."
                else -> null
            }
        }

        /** A start too far ahead: 14 days for a plan anyone nearby can see, 60 for a private one (Plans step 1); else null. */
        private fun tooFarAhead(
            draft: HostDraft,
            now: LocalDateTime,
        ): String? {
            val start = draft.start ?: return null
            val invitedOnly = _ui.value.showsAudience && draft.isPrivate
            return when {
                invitedOnly && start.isAfter(now.plusDays(MAX_PRIVATE_DAYS_AHEAD)) -> "Private plans can start up to 60 days ahead."
                !invitedOnly && start.isAfter(now.plusDays(MAX_DAYS_AHEAD)) -> "Plans can start up to 14 days from now."
                else -> null
            }
        }

        /** What the chosen kind still needs: a playdate's kids' ages, a study group's subject; null when nothing. */
        private fun kindProblem(draft: HostDraft): String? =
            when (draft.kind) {
                PlanKind.PLAYDATE -> "Pick the kids' ages.".takeIf { draft.kidsAgeBands.isEmpty() }
                PlanKind.STUDY_GROUP -> "Add what you're studying.".takeIf { draft.subject.cleanSubject().isEmpty() }
                else -> null
            }

        private companion object {
            const val TITLE_MAX = 80
            const val SUBJECT_MAX = 60
            const val PICKUP_LEAD_MINUTES = 15L
            const val DAY_START = 8
            const val WALK_EARLIEST = 7
            const val NIGHT_START = 21
            const val PLAYDATE_LATEST = 18
            const val PLAYDATE_HOUR = 10
            const val WALK_HOUR = 8
            const val EVENING_HOUR = 19
            const val MAX_DAYS_AHEAD = 14L
            const val MAX_PRIVATE_DAYS_AHEAD = 60L
            const val MAX_INVITES_AT_POST = 30
            const val MIN_MINUTES = 15L
            const val QUARTER_HOUR = 15L
            const val GAME_ON_LEAD_MINUTES = 5L
            const val MAX_MINUTES = 8 * 60L
            const val PLACES_ATTEMPTS = 8
            const val PLACES_RETRY_MS = 3_000L
            const val SEARCH_DEBOUNCE_MS = 350L

            /** How close a public place must be to the host's fix to be "here" (about a city block). */
            const val HERE_NOW_METERS = 150.0

            /** The server refuses a public place this close to one of the host's homes. */
            const val HOME_GUARD_METERS = 50.0
            const val EARTH_RADIUS_METERS = 6_371_000.0

            fun metersBetween(
                fromLat: Double,
                fromLng: Double,
                toLat: Double,
                toLng: Double,
            ): Double {
                val dLat = Math.toRadians(toLat - fromLat)
                val dLng = Math.toRadians(toLng - fromLng)
                val a = sin(dLat / 2).pow(2) + cos(Math.toRadians(fromLat)) * cos(Math.toRadians(toLat)) * sin(dLng / 2).pow(2)
                return EARTH_RADIUS_METERS * 2 * atan2(sqrt(a), sqrt(1 - a))
            }

            /** The subject as the server keeps it: trimmed, with runs of spaces made one. */
            fun String.cleanSubject(): String = trim().replace(Regex("\\s+"), " ")

            /** "Sam Rivera" → "Sam R." (first name and last initial, as everyone sees a host). */
            fun shortName(name: String?): String {
                val parts = name?.trim()?.split(Regex("\\s+")).orEmpty().filter(String::isNotBlank)
                return when {
                    parts.isEmpty() -> "You"
                    parts.size == 1 -> parts[0]
                    else -> "${parts.first()} ${parts.last().first()}."
                }
            }
        }
    }

/** "Host again" (A5): a person's own plan as a new draft starting [start]; [keepPrivate] keeps a private plan private. */
private fun copiedDraft(
    plan: PlanDto,
    kind: PlanKind,
    start: LocalDateTime,
    end: LocalDateTime,
    keepPrivate: Boolean,
): HostDraft {
    val place =
        plan.place?.takeIf { plan.placeKind != "home" }?.let { p ->
            val lat = p.latitude
            val lng = p.longitude
            if (lat != null && lng != null) PickedPlace(p.name ?: "The same place", p.address, lat, lng, null, null) else null
        }
    val rules = plan.autoRules.orEmpty()
    val d = plan.details
    return HostDraft(
        kind = kind,
        title = plan.title,
        titleEdited = true,
        about = plan.about.orEmpty(),
        start = start,
        end = end,
        atHome = plan.placeKind == "home",
        place = place,
        spots = plan.spots.coerceIn(1, 30),
        approveEach = rules.none { r -> r == PlanAutoRule.VERIFIED || r == PlanAutoRule.ANYONE_NEARBY },
        autoRule = rules.firstOrNull { r -> r == PlanAutoRule.VERIFIED || r == PlanAutoRule.ANYONE_NEARBY },
        hostedBefore = PlanAutoRule.HOSTED_BEFORE in rules,
        note = plan.place?.note.orEmpty(),
        sport = d?.sport ?: "pickleball",
        level = d?.level ?: "any",
        extraGear = d?.extraGear == true,
        kidsAgeBands = d?.kidsAgeBands.orEmpty().toSet(),
        walkKind = d?.walkKind ?: "walk",
        pace = d?.pace ?: "easy",
        dogsWelcome = d?.dogsWelcome == true,
        pickupNow = false,
        subject = d?.subject.orEmpty(),
        studyStyle = PlanStudyStyle.from(d?.studyStyle),
        isPrivate = keepPrivate,
        guestsCanInvite = keepPrivate && plan.guestsCanInvite == true,
    )
}
