package app.pantopus.android.ui.screens.plans.change

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.HostAsBusinessDto
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanGpsInput
import app.pantopus.android.data.api.models.plans.PlanNearbyPlaceDto
import app.pantopus.android.data.api.models.plans.PlanPlaceSuggestBody
import app.pantopus.android.data.api.models.plans.UpdatePlanBody
import app.pantopus.android.data.api.net.NetworkResult
import app.pantopus.android.data.plans.PlanFormat
import app.pantopus.android.data.plans.PlanLocation
import app.pantopus.android.data.plans.PlanLocationResolver
import app.pantopus.android.data.plans.PlanPlaceQuery
import app.pantopus.android.data.plans.PlanRepeatPattern
import app.pantopus.android.data.plans.PlanRepeatWords
import app.pantopus.android.data.plans.PlansFeature
import app.pantopus.android.data.plans.PlansRepository
import app.pantopus.android.data.plans.isAtHome
import app.pantopus.android.data.plans.isOnline
import app.pantopus.android.data.plans.isPrivate
import app.pantopus.android.data.plans.planKind
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.screens.plans.PlansRoutes
import app.pantopus.android.ui.screens.plans.host.LINK_INPUT_MAX
import app.pantopus.android.ui.screens.plans.host.PLACES_SLOW
import app.pantopus.android.ui.screens.plans.host.PickedPlace
import app.pantopus.android.ui.screens.plans.host.PlaceSuggestions
import app.pantopus.android.ui.screens.plans.host.placeQuery
import app.pantopus.android.ui.screens.plans.host.placesFailure
import app.pantopus.android.ui.screens.plans.repeat.PlanRepeatSetup
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
import javax.inject.Inject
import kotlin.math.abs

/** H11's state. */
data class PlanChangeUi(
    val plan: PlanDto? = null,
    val zone: ZoneId = ZoneId.systemDefault(),
    val originalStart: LocalDateTime? = null,
    val originalEnd: LocalDateTime? = null,
    val start: LocalDateTime? = null,
    val end: LocalDateTime? = null,
    /** A public plan's new place (H6 over H11, as on iOS); null while it stays where it is. */
    val newPlace: PickedPlace? = null,
    val picking: Boolean = false,
    val placeCandidate: PickedPlace? = null,
    val placesQuery: String = "",
    val places: List<PlanNearbyPlaceDto> = emptyList(),
    val placesLoading: Boolean = false,
    /** The server is still gathering the area's places (a first look can take up to a minute). */
    val placesGathering: Boolean = false,
    /** Why H6's places couldn't load, shown with "Try again". */
    val placesError: String? = null,
    val placesAttribution: String? = null,
    /** H6's "Suggest places" (or "Ask Pantopus" for the search text), for the plan at its new time. */
    val suggestions: PlaceSuggestions = PlaceSuggestions.Idle,
    val saving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
    /** A business's plan (Plans with businesses): its business as the viewer may post for it, with its locations. */
    val business: HostAsBusinessDto? = null,
    /** The plan's location among them (matched by its point), and the one chosen instead; null while unchanged. */
    val currentLocationId: String? = null,
    val newLocationId: String? = null,
    /** `plans_repeat` is on (Plans step 2): the Repeats row shows for a plan that doesn't repeat yet too. */
    val repeatOn: Boolean = false,
    /** How the plan repeats now (its card's pattern), null when it doesn't. */
    val originalRepeat: PlanRepeatPattern? = null,
    /** The pattern chosen on the Repeats screen (null: "Doesn't repeat"), once [repeatChosen]. */
    val newRepeat: PlanRepeatPattern? = null,
    val repeatChosen: Boolean = false,
    /** The Repeats screen is open over this one. */
    val repeatsOpen: Boolean = false,
    /** Online or a place, and the link (Plans step 3, PlanChangeOnline.kt). */
    val online: PlanChangeOnline = PlanChangeOnline(),
) {
    /** The Repeats row shows on a person's plan (never a business's): with the switch on, or when it already repeats. */
    val showsRepeats: Boolean get() = plan != null && plan.business == null && (repeatOn || originalRepeat != null)

    /**
     * The pattern this screen sends: the one changed on the Repeats screen, moved to the start chosen here; null otherwise.
     * A pattern starts at this date, whichever date of its series it is (contract step 2, "Changing the pattern on any
     * date"): its days, every-2-weeks rhythm, year and count are measured from here.
     */
    val repeatToSend: PlanRepeatPattern?
        get() {
            val date = start?.toLocalDate() ?: return null
            return newRepeat?.takeIf { repeatChosen }?.alignedTo(date, date)
        }

    /** "Doesn't repeat" was chosen for a plan that repeats: Save stops the series (this date stays). */
    val stopsRepeating: Boolean get() = repeatChosen && newRepeat == null && originalRepeat != null

    /**
     * The host changed how it repeats on the Repeats screen (any choice made there, even one that ends where it began,
     * or a pattern the screen moved to this date): Save sends it. "Doesn't repeat" on a plan that doesn't repeat sends
     * nothing.
     */
    val repeatChanged: Boolean get() = repeatChosen && (newRepeat != null || originalRepeat != null)

    /** The Repeats row's value: the choice made here, else the plan's own short words, else "Doesn't repeat". */
    val repeatsValue: String?
        get() =
            when {
                !showsRepeats -> null
                repeatChosen -> PlanRepeatWords.rowValue(repeatToSend)
                else -> plan?.repeat?.shortText?.takeIf(String::isNotBlank) ?: PlanRepeatWords.rowValue(originalRepeat)
            }

    /**
     * What the Repeats screen opens with: the start chosen here and the pattern so far, its end date or count as the card
     * has them (the card's count is the dates from this one through the last, so sent back unchanged it ends there).
     */
    val repeatSetup: PlanRepeatSetup?
        get() {
            val at = start ?: return null
            val initial = if (repeatChosen) newRepeat else originalRepeat?.copy(chosenFor = originalStart?.toLocalDate())
            return PlanRepeatSetup(
                start = at,
                end = end,
                kind = plan?.kind,
                walkKind = plan?.details?.walkKind,
                initial = initial,
            )
        }

    /** A business's plan moves only between the business's own locations, and only when it has more than one. */
    val canChangeLocation: Boolean get() = business != null && business.locations.size > 1

    /** The location moved: everyone in is asked "Still coming?", as for a new place. */
    val locationMoved: Boolean get() = newLocationId != null && newLocationId != currentLocationId

    /** People in, not counting the host; a party counts in full ("Alex + 1" is two), as on iOS and board H11. */
    val peopleIn: Int get() = plan?.people.orEmpty().filter { !it.isHost }.sumOf { it.partySize.coerceAtLeast(1) }

    /** The start moved by more than 30 minutes. */
    val timeMoved: Boolean
        get() {
            val a = originalStart ?: return false
            val b = start ?: return false
            return abs(Duration.between(a, b).toMinutes()) > STILL_COMING_MINUTES
        }

    /** Moving the start more than 30 minutes, or the place (or the link), asks everyone in "Still coming?" (brief section 5). */
    val asksStillComing: Boolean get() = peopleIn > 0 && (timeMoved || newPlace != null || locationMoved || onlineChanged)

    /**
     * A public plan can move to another public place; a plan at home keeps its place (as on iOS). A business's plan
     * never meets at a place picked here: it moves only between the business's own locations.
     */
    val canChangePlace: Boolean get() = plan?.isAtHome == false && plan.business == null

    /**
     * Where H6 looks for places: around the plan's own place, else its area; an online plan with no area (Plans step 3)
     * looks from the host's home or a fresh fix ([PlanChangeOnline.origin]).
     */
    val placesOrigin: Pair<Double, Double>?
        get() {
            val place = plan?.place
            if (place?.latitude != null && place.longitude != null) return place.latitude to place.longitude
            val area = plan?.area
            if (area?.latitude != null && area.longitude != null) return area.latitude to area.longitude
            return online.origin
        }

    /** The start or the end moved: only then are the times sent (and checked), as on iOS. */
    val timesMoved: Boolean get() = start != originalStart || end != originalEnd

    /** Anything to save besides how it repeats (the link and online or a place included, Plans step 3). */
    val changedBesidesRepeat: Boolean get() = timesMoved || newPlace != null || locationMoved || onlineChanged

    val changed: Boolean get() = changedBesidesRepeat || repeatChanged

    private companion object {
        const val STILL_COMING_MINUTES = 30
    }
}

/**
 * Change the time, or a public plan's place (board H11, as on iOS). The server sends "Still coming?" when the start
 * moves more than 30 minutes or the place changes. Plans step 2 adds the Repeats screen's calls and step 3 the link's.
 */
@Suppress("TooManyFunctions")
@HiltViewModel
class PlanChangeViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val repository: PlansRepository,
        private val feature: PlansFeature,
        private val locations: PlanLocationResolver,
    ) : ViewModel() {
        private val planId: String = savedStateHandle.get<String>(PlansRoutes.PLAN_ID_KEY).orEmpty()
        private val _ui = MutableStateFlow(PlanChangeUi())
        val ui: StateFlow<PlanChangeUi> = _ui.asStateFlow()
        private var placesRead: Job? = null
        private var suggestJob: Job? = null

        fun load() {
            if (_ui.value.plan != null) return
            viewModelScope.launch {
                when (val result = repository.plan(planId)) {
                    is NetworkResult.Success -> {
                        val plan = result.data
                        val zone = PlanFormat.zone(plan.timezone)
                        val start = PlanFormat.instant(plan.startsAt)?.atZone(zone)?.toLocalDateTime()
                        val end = PlanFormat.instant(plan.endsAt)?.atZone(zone)?.toLocalDateTime()
                        // A business's plan: its locations, when the viewer may post for the business (the owner and
                        // editors may; someone who only runs plans keeps its place).
                        val business = plan.business?.userId?.let { id -> repository.hostAs().firstOrNull { it.userId == id } }
                        val current =
                            business?.locations?.firstOrNull {
                                it.latitude == plan.place?.latitude && it.longitude == plan.place?.longitude
                            }
                        _ui.update {
                            PlanChangeUi(
                                plan = plan,
                                zone = zone,
                                originalStart = start,
                                originalEnd = end,
                                start = start,
                                end = end,
                                business = business,
                                currentLocationId = current?.id,
                                repeatOn = feature.flags.value.repeatOn,
                                originalRepeat = PlanRepeatPattern.from(plan.repeat),
                                online =
                                    PlanChangeOnline(
                                        switchOn = feature.flags.value.onlineOn,
                                        chosen = plan.isOnline,
                                        link = plan.place?.link.orEmpty(),
                                    ),
                            )
                        }
                        lookForOrigin()
                    }
                    is NetworkResult.Failure -> _ui.update { it.copy(error = result.error.planMessage) }
                }
            }
        }

        /**
         * An online plan with no area (a private one posted by a host with no home and no fix, Plans step 3) has nowhere
         * for H6 to look from: the host's home, else a fresh fix, as the host flow finds its own. With neither, "A place"
         * isn't offered and the screen says why ([noPlaceReason]).
         */
        private suspend fun lookForOrigin() {
            val ui = _ui.value
            if (ui.plan?.isOnline != true || ui.placesOrigin != null) return
            val home = locations.home()?.takeIf { it.source == PlanLocation.Source.HOME }
            val origin = home?.let { it.latitude to it.longitude } ?: locations.gpsFix()?.let { it.latitude to it.longitude }
            _ui.update { it.copy(online = it.online.copy(origin = origin, originLooked = true)) }
        }

        /** A new start keeps the plan's length. */
        fun setStart(value: LocalDateTime) {
            _ui.update { ui ->
                val length = if (ui.start != null && ui.end != null) Duration.between(ui.start, ui.end) else Duration.ofHours(2)
                ui.copy(start = value, end = value.plus(length), error = null)
            }
        }

        fun setEnd(value: LocalDateTime) {
            _ui.update { it.copy(end = value, error = null) }
        }

        /** The Repeats row (Plans step 2): the Repeats screen over this one. */
        fun openRepeats() {
            if (_ui.value.showsRepeats && _ui.value.start != null) _ui.update { it.copy(repeatsOpen = true, error = null) }
        }

        /** Done (or Back) on the Repeats screen after a change: its pattern, or null for "Doesn't repeat"; Save sends it. */
        fun closeRepeats(pattern: PlanRepeatPattern?) {
            _ui.update { it.copy(repeatsOpen = false, newRepeat = pattern, repeatChosen = true, error = null) }
        }

        /** Done (or Back) on the Repeats screen with nothing changed: Save sends no `repeat`. */
        fun leaveRepeats() {
            _ui.update { it.copy(repeatsOpen = false) }
        }

        /** A business's plan: another of the business's own locations. */
        fun pickLocation(id: String) {
            _ui.update { it.copy(newLocationId = id.takeIf { picked -> picked != it.currentLocationId }, error = null) }
        }

        /** Where (Plans step 3): online, or a public place; choosing Online drops a place picked here. */
        fun setOnline(on: Boolean) {
            if (on && !_ui.value.canGoOnline) return
            _ui.update { it.copy(online = it.online.copy(chosen = on), newPlace = if (on) null else it.newPlace, error = null) }
        }

        /** An online plan's link, as typed or pasted (up to [LINK_INPUT_MAX]; the check refuses past 300). */
        fun setLink(value: String) {
            _ui.update { it.copy(online = it.online.copy(link = value.take(LINK_INPUT_MAX)), error = null) }
        }

        // ---- Where (H6 over H11, public plans only) ----

        fun openPlaces() {
            if (!_ui.value.canChangePlace) return
            suggestJob?.cancel()
            _ui.update {
                it.copy(picking = true, placeCandidate = it.newPlace, error = null, suggestions = PlaceSuggestions.Idle)
            }
            // Read again when the time changed since: each place says whether it's open for the plan's new time.
            findPlaces(query = _ui.value.placesQuery.trim().takeIf(String::isNotEmpty), debounce = false)
        }

        /** Search by name: the list filters at once, and the server looks further than the nearest 40. */
        fun searchPlaces(query: String) {
            if (query.trim() != _ui.value.placesQuery.trim()) {
                // Suggestions answer the words they were asked with (as on iOS).
                suggestJob?.cancel()
                _ui.update { it.copy(suggestions = PlaceSuggestions.Idle) }
            }
            _ui.update { it.copy(placesQuery = query) }
            findPlaces(query.trim().takeIf(String::isNotEmpty), debounce = true)
        }

        /** "Try again" under H6's list. */
        fun retryPlaces() {
            findPlaces(_ui.value.placesQuery.trim().takeIf(String::isNotEmpty), debounce = false)
        }

        /** What H6's list and suggestions are for: the plan's kind and sport, at the time chosen here. */
        private fun planPlaceQuery(): PlanPlaceQuery? {
            val ui = _ui.value
            val plan = ui.plan ?: return null
            val kind = plan.planKind ?: return null
            val start = ui.start ?: return null
            return placeQuery(kind, plan.details?.sport, start, ui.end, ui.zone)
        }

        /** H6's "Suggest places" ([ask] null), or "Ask Pantopus" for what the host typed in the search box. */
        fun suggestPlaces(ask: String?) {
            val ui = _ui.value
            val plan = ui.plan ?: return
            val origin = ui.placesOrigin ?: return
            val query = planPlaceQuery() ?: return
            val body =
                PlanPlaceSuggestBody(
                    latitude = origin.first,
                    longitude = origin.second,
                    kind = query.kind,
                    title = plan.title.trim().takeIf(String::isNotEmpty),
                    about = plan.about?.trim()?.takeIf(String::isNotEmpty),
                    startsAt = query.startsAt,
                    endsAt = query.endsAt,
                    spots = plan.spots.takeIf { it > 0 },
                    details = plan.details,
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
            _ui.update { it.copy(placeCandidate = place) }
        }

        /** "Use …": the plan moves there on Save; picking the place it's at already changes nothing. */
        fun usePlace() {
            val place = _ui.value.placeCandidate ?: return
            val current = _ui.value.plan?.place
            val same =
                current != null &&
                    current.name == place.name &&
                    current.latitude == place.latitude &&
                    current.longitude == place.longitude
            _ui.update { it.copy(picking = false, newPlace = if (same) null else place, error = null) }
        }

        fun closePlaces() {
            _ui.update { it.copy(picking = false) }
        }

        /**
         * One places read, ordered for the plan at its new time; a first read for an area may come back `loading` while
         * OpenStreetMap is slow, and the read asks again (as on H6).
         */
        private fun findPlaces(
            query: String?,
            debounce: Boolean,
        ) {
            val origin = _ui.value.placesOrigin ?: return
            placesRead?.cancel()
            placesRead =
                viewModelScope.launch {
                    if (debounce) delay(SEARCH_DEBOUNCE_MS)
                    _ui.update { it.copy(placesLoading = true, placesGathering = false, placesError = null) }
                    val result =
                        repository.nearbyPlacesWhenReady(origin.first, origin.second, query, planPlaceQuery()) { reply ->
                            _ui.update { it.copy(placesGathering = true, placesAttribution = reply.attribution ?: it.placesAttribution) }
                        }
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
        }

        fun save() {
            val ui = _ui.value
            val start = ui.start ?: return
            val end = ui.end ?: return
            // A repeating plan's later date may already be further out than a new plan may start (a monthly one is
            // posted up to 62 days ahead): the times are checked, and sent, only when they moved. Where (an online plan's
            // link, or the place it moves to) is checked whatever moved (Plans step 3).
            val timesProblem = if (ui.timesMoved) validate(start, end, startMoved = start != ui.originalStart) else null
            val problem = timesProblem ?: ui.whereProblem()
            if (problem != null) {
                _ui.update { it.copy(error = problem) }
                return
            }
            _ui.update { it.copy(saving = true, error = null) }
            viewModelScope.launch {
                // A move to a public place, or online, proves the host is nearby with a fresh fix, as posting does.
                val fix = if (ui.sendsFix) locations.gpsFix() else null
                val body =
                    UpdatePlanBody(
                        startsAt = start.atZone(ui.zone).toInstant().toString().takeIf { ui.timesMoved },
                        endsAt = end.atZone(ui.zone).toInstant().toString().takeIf { ui.timesMoved },
                        // A new public place, or (Plans step 3) the link: moving online or changing it.
                        place = ui.changedPlace(),
                        businessLocationId = ui.newLocationId.takeIf { ui.locationMoved },
                        // A new pattern from this date on (Plans step 2); "Doesn't repeat" adds `"repeat": null`, below.
                        repeat = ui.repeatToSend?.toInput()?.takeIf { ui.repeatChanged },
                        gps = fix?.let { PlanGpsInput(it.latitude, it.longitude, it.at.toString()) },
                    )
                // One request either way: "Doesn't repeat" goes with the other changes as a raw body.
                val result = if (ui.stopsRepeating) repository.updateStoppingRepeat(planId, body) else repository.update(planId, body)
                when (result) {
                    is NetworkResult.Success -> _ui.update { it.copy(saving = false, saved = true) }
                    is NetworkResult.Failure -> _ui.update { it.copy(saving = false, error = result.error.planMessage) }
                }
            }
        }

        /** Moved times: not passed, 15 minutes to 8 hours, and a moved start within the days ahead a plan may start. */
        private fun validate(
            start: LocalDateTime,
            end: LocalDateTime,
            startMoved: Boolean,
        ): String? {
            val now = LocalDateTime.now(_ui.value.zone)
            val minutes = Duration.between(start, end).toMinutes()
            val tooFar = if (startMoved) tooFarAhead(start, now) else null
            return when {
                start.isBefore(now) -> "Pick a time that hasn't passed."
                tooFar != null -> tooFar
                minutes < MIN_MINUTES -> "A plan lasts at least 15 minutes."
                minutes > MAX_MINUTES -> "A plan lasts at most 8 hours."
                else -> null
            }
        }

        /** A start too far ahead: 14 days, 60 for a private plan (Plans step 1); else null. */
        private fun tooFarAhead(
            start: LocalDateTime,
            now: LocalDateTime,
        ): String? {
            val invitedOnly = _ui.value.plan?.isPrivate == true
            return when {
                invitedOnly && start.isAfter(now.plusDays(MAX_PRIVATE_DAYS_AHEAD)) -> "Private plans can start up to 60 days ahead."
                !invitedOnly && start.isAfter(now.plusDays(MAX_DAYS_AHEAD)) -> "Plans can start up to 14 days from now."
                else -> null
            }
        }

        private companion object {
            const val MAX_DAYS_AHEAD = 14L
            const val MAX_PRIVATE_DAYS_AHEAD = 60L
            const val MIN_MINUTES = 15L
            const val MAX_MINUTES = 8 * 60L
            const val SEARCH_DEBOUNCE_MS = 350L
        }
    }
