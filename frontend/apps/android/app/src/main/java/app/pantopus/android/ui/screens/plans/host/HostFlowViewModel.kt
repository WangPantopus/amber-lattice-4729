@file:Suppress("TooManyFunctions", "MagicNumber")

package app.pantopus.android.ui.screens.plans.host

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pantopus.android.data.api.models.plans.CreatePlanBody
import app.pantopus.android.data.api.models.plans.HostAsBusinessDto
import app.pantopus.android.data.api.models.plans.HostAsLabelDto
import app.pantopus.android.data.api.models.plans.HostAsLocationDto
import app.pantopus.android.data.api.models.plans.PlanChipInInput
import app.pantopus.android.data.api.models.plans.PlanDealPreviewResponse
import app.pantopus.android.data.api.models.plans.PlanDetailsDto
import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanGameDto
import app.pantopus.android.data.api.models.plans.PlanGpsInput
import app.pantopus.android.data.api.models.plans.PlanInviteCandidateDto
import app.pantopus.android.data.api.models.plans.PlanNearbyPlaceDto
import app.pantopus.android.data.api.models.plans.PlanOccasionBringDto
import app.pantopus.android.data.api.models.plans.PlanOccasionDto
import app.pantopus.android.data.api.models.plans.PlanOccasionFillsDto
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
import app.pantopus.android.data.plans.PlanOnlineLink
import app.pantopus.android.data.plans.PlanPlaceQuery
import app.pantopus.android.data.plans.PlanPostedInvite
import app.pantopus.android.data.plans.PlanRepeatPattern
import app.pantopus.android.data.plans.PlanRepeatWords
import app.pantopus.android.data.plans.PlanStudyStyle
import app.pantopus.android.data.plans.PlansEvents
import app.pantopus.android.data.plans.PlansFeature
import app.pantopus.android.data.plans.PlansRepository
import app.pantopus.android.data.plans.isOnline
import app.pantopus.android.data.plans.isPrivate
import app.pantopus.android.data.plans.planCode
import app.pantopus.android.data.plans.planField
import app.pantopus.android.data.plans.planMessage
import app.pantopus.android.ui.screens.plans.PlansRoutes
import app.pantopus.android.ui.screens.plans.bring.BringDraft
import app.pantopus.android.ui.screens.plans.bring.BringDraftItem
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
import java.time.temporal.ChronoUnit
import javax.inject.Inject
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The host flow's steps (boards H1, H2 to H5, H7), the place picker (H6) over them, and a business's deal step between
 * the details and the preview (Plans for the holidays, business track D3: "3 of 4").
 */
enum class HostStep { Type, Details, Deal, Place, Preview }

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
    /** How it repeats (Plans step 2), as last chosen on the Repeats screen; null doesn't repeat. */
    val repeat: PlanRepeatPattern? = null,
    /** Where is "Online" (Plans step 3): people join with [link]; no place, no home. */
    val online: Boolean = false,
    /** An online plan's link, as typed or pasted (checked by `PlanOnlineLink`). */
    val link: String = "",
    /** Plans step 4's details (`PlanKindDetails`), each starting on the server's default. Outdoors also uses [pace]. */
    val foodKind: String = "dinner",
    val gameKind: String = "board_games",
    val outdoorKind: String = "hike",
    /** "Kids welcome" in "Add to this plan" (Plans for the holidays, H1): guests say how many adults and kids. */
    val kidsWelcome: Boolean = false,
    /** "Bring list" in "Add to this plan" (Plans for the holidays, H2): the list made on A9; null while it's off. */
    val bring: BringDraft? = null,
    /** The occasion the plan was started from (Plans for the holidays, H3): its key, and its name for the title. */
    val occasion: String? = null,
    val occasionText: String? = null,
    /** A business's deal (business track B1, D3); "No deal" until the business picks one. */
    val deal: DealDraft = DealDraft(),
    /** The deal's starting values were set (the first time the deal step opened). */
    val dealStarted: Boolean = false,
    /** Business track B2: "Price a spot" is on, and the amount as typed in dollars ($1 to $500). */
    val priceOn: Boolean = false,
    val priceDollars: String = "",
    /** Business track B5: "Guests can pay their bill here", and "Take tips" (null: the kind's start, as the server's). */
    val payHere: Boolean = false,
    val tipsOn: Boolean? = null,
    /** The holidays' chip in (extras section 3): the amount each person, what for, and the payment link; null while off. */
    val chipIn: ChipInDraft? = null,
    /** The holidays' find a date (extras section 2): the times offered, earliest first; null while off. */
    val dateOptions: List<DateOptionDraft>? = null,
    /** The holidays' gift exchange (extras section 4): how much each spends and when names are drawn; null while off. */
    val gift: GiftDraft? = null,
)

/** "Chip in" as typed: dollars each person, what for, and the host's own Venmo, PayPal or Cash App link. */
data class ChipInDraft(
    val amount: String = "",
    val note: String = "",
    val link: String = "",
) {
    companion object
}

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
    /** "Plan the next one with the same people" (the holidays' board 29): the posted plan's page opens, not the map. */
    val postedOpensPlan: Boolean = false,
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
    /** `plans_repeat` is on for this person: the Repeats row shows on a person's own plan (Plans step 2). */
    val repeatOn: Boolean = false,
    /** The Repeats screen is open over the details. */
    val repeatsOpen: Boolean = false,
    /** `plans_online` is on for this person: Where offers "Online" for the kinds that can meet online (Plans step 3). */
    val onlineOn: Boolean = false,
    /** `plans_kinds` is on for this person: the type picker shows nine kinds (Plans step 4). */
    val kindsOn: Boolean = false,
    /** `plans_guest_answers` is on for this person (Plans for the holidays, H1): "Room for" and "Add to this plan". */
    val guestAnswersOn: Boolean = false,
    /** `plans_bring_list` is on for this person (Plans for the holidays, H2): the "Bring list" row. */
    val bringOn: Boolean = false,
    /** The bring list (A9) is open over the details. */
    val bringOpen: Boolean = false,
    /** `plans_occasions` is on for this person (Plans for the holidays, H3). */
    val occasionsOn: Boolean = false,
    /** The occasions in season (`GET /api/plans/occasions`); empty draws no strip. */
    val occasions: List<PlanOccasionDto> = emptyList(),
    /** The deal step's "Guests will read" and field errors (business track B1). */
    val dealPreview: DealPreviewState = DealPreviewState(),
    /** The deal step's "Preview" is asking the server about the deal. */
    val dealChecking: Boolean = false,
    /** `plans_chip_in` is on for this person (the holidays' extras, section 3): the "Chip in" row. */
    val chipInOn: Boolean = false,
    /** `plans_find_date` is on for this person (extras section 2): the "Let guests pick the date" row. */
    val findDateOn: Boolean = false,
    /** `plans_gift_exchange` is on for this person (extras section 4): the "Gift exchange" row. */
    val giftOn: Boolean = false,
    /** The server's sentence under a gift field it refused (`budget_cents` or `draw_at`). */
    val giftErrors: Map<String, String> = emptyMap(),
    /** The server's sentence under a chip-in field it refused (`amount_cents`, `note` or `link`). */
    val chipInErrors: Map<String, String> = emptyMap(),
) {
    /** A business that takes deals gets the deal step (business track B1, D3); a person's own plan never does. */
    val showsDealStep: Boolean get() = business?.takesDeals == true

    /** "Price a spot" shows on a business's form while its switch is on (host-as `can.price`, business track B2). */
    val showsPrice: Boolean get() = business?.can?.price == true

    /** "Guests can pay their bill here" shows on a business's form while its switch is on (host-as `can.pay_here`, B5). */
    val showsPayHere: Boolean get() = business?.can?.payHere == true

    /** The plan is posted taking the bill here: the row is on and the business can charge. */
    val payHereOn: Boolean get() = showsPayHere && business?.payoutsReady == true && draft.payHere

    /** "Take tips" as it shows: the business's choice, else on for a watch party and a walk or coffee (B5). */
    val tipsShownOn: Boolean get() = draft.tipsOn ?: (draft.kind?.wire in TIPS_START_KINDS)

    /** The spot's price in cents the plan is posted with: the row is on, the business can charge, the amount reads. */
    val priceCents: Int?
        get() = if (showsPrice && business?.payoutsReady == true && draft.priceOn) centsOf(draft.priceDollars) else null

    /** How many steps the bar counts: "of 4" with deals on and a business chosen, else "of 3" (07-screens, settled). */
    val stepTotal: Int get() = if ((business ?: chosenBusiness)?.takesDeals == true) DEAL_STEPS else PLAIN_STEPS

    /**
     * A private plan's room reads "Room for", to 100 (Plans for the holidays, board 3), for the kinds whose row says how
     * many people: not a playdate (families) or a pickup game (players needed).
     */
    val showsRoomFor: Boolean get() = guestAnswersOn && isPrivate && draft.kind?.countsPeople == true

    /** The most the room stepper allows: 100 for "Room for", 30 otherwise. */
    val spotsMax: Int get() = if (showsRoomFor) ROOM_FOR_MAX else MAX_SPOTS

    /** "Kids welcome" shows in the card (H1). */
    val showsKidsWelcome: Boolean get() = showsRoomFor

    /** "Bring list" shows in the card (H2): a private plan of a person's, for the kinds that count people. */
    val showsBringRow: Boolean get() = bringOn && isPrivate && draft.kind?.countsPeople == true

    /** The "Add to this plan" card shows (Plans for the holidays, board 3) while any of its rows does. */
    val showsAddToPlan: Boolean get() = showsKidsWelcome || showsBringRow || showsChipIn || showsFindDate || showsGift

    /** "Gift exchange" shows in the card (extras section 4): a private plan of a person's, never a playdate. */
    val showsGift: Boolean get() = giftOn && isPrivate && business == null && draft.kind?.countsPeople == true

    /** The plan is posted with a gift exchange: the row shows and is on. */
    val postsGift: Boolean get() = showsGift && draft.gift != null

    /**
     * "Let guests pick the date" shows in the card (extras section 2): a private plan of a person's, never a playdate,
     * and never one set to repeat (the server's own rule).
     */
    val showsFindDate: Boolean
        get() = findDateOn && isPrivate && business == null && draft.kind?.countsPeople == true && repeat == null

    /** The plan is posted with times to pick from: the row shows and is on. */
    val postsFindDate: Boolean get() = showsFindDate && draft.dateOptions != null

    /** "Chip in" shows in the card (extras section 3): a private plan of a person's, never a playdate. */
    val showsChipIn: Boolean get() = chipInOn && isPrivate && business == null && draft.kind != PlanKind.PLAYDATE

    /** The plan is posted with chip in: the row shows and is on. */
    val postsChipIn: Boolean get() = showsChipIn && draft.chipIn != null

    /** The Repeats row shows: the switch is on and the plan is the person's own (a business's plan can't repeat). */
    val showsRepeats: Boolean get() = repeatOn && business == null

    /** How the draft repeats, moved to its current start (a new start moves the pre-selected day); null when it doesn't. */
    val repeat: PlanRepeatPattern?
        get() {
            val date = draft.start?.toLocalDate() ?: return null
            return draft.repeat?.takeIf { showsRepeats }?.alignedTo(date, date)
        }

    /** The Repeats row's value ("Doesn't repeat", "Every Tue and Thu"), or null while the row doesn't show. */
    val repeatsValue: String? get() = if (showsRepeats) PlanRepeatWords.rowValue(repeat) else null

    /** The preview's line: "Every Tue and Thu until Feb 4". */
    val repeatLine: String?
        get() {
            val date = draft.start?.toLocalDate() ?: return null
            return repeat?.let { PlanRepeatWords.draftLine(it, date) }
        }

    /** What the Repeats screen opens with: the draft's start and end, its kind, and the pattern so far. */
    val repeatSetup: PlanRepeatSetup?
        get() {
            val start = draft.start ?: return null
            return PlanRepeatSetup(start = start, end = draft.end, kind = draft.kind?.wire, walkKind = draft.walkKind, initial = repeat)
        }

    /** "Who can see this" shows: the switch is on and the plan is the person's own (a business's plan is never private). */
    val showsAudience: Boolean get() = privateOn && business == null

    /** The draft is a private plan: chosen, and still allowed. */
    val isPrivate: Boolean get() = showsAudience && draft.isPrivate

    /** Where offers "Online": the switch is on, the kind can meet online, and the plan is the person's own. */
    val showsOnline: Boolean get() = onlineOn && business == null && draft.kind?.canBeOnline == true

    /** The draft is an online plan: chosen, and still allowed. */
    val isOnline: Boolean get() = showsOnline && draft.online

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
                    repeatOn = feature.flags.value.repeatOn,
                    onlineOn = feature.flags.value.onlineOn,
                    kindsOn = feature.flags.value.kindsOn,
                    guestAnswersOn = feature.flags.value.guestAnswersOn,
                    bringOn = feature.flags.value.bringOn,
                    occasionsOn = feature.flags.value.occasionsOn,
                    chipInOn = feature.flags.value.chipInOn,
                    findDateOn = feature.flags.value.findDateOn,
                    giftOn = feature.flags.value.giftOn,
                ),
            )
        val ui: StateFlow<HostUi> = _ui.asStateFlow()

        /** "Plan the next one with the same people": the past plan this one copies, whose people are invited next. */
        private var samePeopleFrom: String? = null

        init {
            val kind = PlanKind.from(savedStateHandle.get<String>(PlansRoutes.KIND_KEY))
            val gameId = savedStateHandle.get<String>(PlansRoutes.GAME_KEY)?.takeIf(String::isNotBlank)
            val again = savedStateHandle.get<String>(PlansRoutes.AGAIN_KEY)?.takeIf(String::isNotBlank)
            // The holidays' board 29: copying a plan to invite the same people opens their list once it's posted.
            samePeopleFrom = events.takeSamePeopleNext()?.takeIf { it == again }
            viewModelScope.launch {
                loadContext(gameId)
                if (again != null) copyFrom(again)
            }
            // The kind picker's "Coming up" (Plans for the holidays, H3): nothing is drawn until, or unless, it answers.
            if (_ui.value.occasionsOn && again == null) {
                viewModelScope.launch {
                    val occasions = (repository.occasions() as? NetworkResult.Success)?.data?.occasions.orEmpty()
                    _ui.update { it.copy(occasions = occasions.filter { o -> PlanKind.from(o.kind) != null }) }
                }
            }
            // A newer kind only while its switch is on (Plans step 4); otherwise the type step shows, saying why.
            val switchedOff = kind?.isNew == true && !_ui.value.kindsOn
            if (switchedOff) _ui.update { it.copy(error = KINDS_UNAVAILABLE) }
            val playdateOk = kind != PlanKind.PLAYDATE || _ui.value.playdatesOn
            if (kind != null && !switchedOff && playdateOk) choose(kind)
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
            if (kind.isNew && !_ui.value.kindsOn) {
                // The switch for the newer kinds is off (Plans step 4): say so rather than let the server refuse it.
                _ui.update { it.copy(error = KINDS_UNAVAILABLE) }
                return
            }
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
            val roomMax = if (keepPrivate && _ui.value.guestAnswersOn && kind.countsPeople) ROOM_FOR_MAX else MAX_SPOTS
            val draft = copiedDraft(plan, kind, start, end, keepPrivate, roomMax)
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
            if (plan.isOnline && !_ui.value.showsOnline) {
                // Online plans are off now (Plans step 3): the copy waits on its details for a place, saying why.
                _ui.update { it.copy(error = ONLINE_COPY_OFF) }
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
                    // Plans step 4, with iPhone's defaults (HostOnline.kt).
                    else -> newKindDraft(kind)
                }
            val hours = hostedHours(kind)
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
                    // Plans step 4, as on iPhone: an outing by day (9 AM next), food & drinks at dinner time (6 PM).
                    PlanKind.OUTDOORS -> Triple(WALK_EARLIEST, OUTING_LATEST, OUTING_HOUR)
                    PlanKind.FOOD_DRINKS -> Triple(DAY_START, NIGHT_START, DINNER_HOUR)
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
                    draft.copy(atHome = true, approveEach = true, autoRule = null, online = false)
                } else {
                    draft.copy(atHome = false, online = false)
                }
            }

        /** Where (Plans step 3): "A place", "My place" / "My porch", or "Online" ([HostWhere]). */
        fun setWhere(choice: String) {
            if (choice != HostWhere.ONLINE) {
                setAtHome(choice == HostWhere.HOME)
                return
            }
            if (!_ui.value.showsOnline) return
            edit { it.copy(online = true, atHome = false) }
        }

        /** An online plan's link, as typed or pasted (up to [LINK_INPUT_MAX]; the check refuses past 300). */
        fun setLink(value: String) = edit { it.copy(link = value.take(LINK_INPUT_MAX)) }

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
            _ui.update {
                // A plan anyone nearby can see keeps to 30 (Plans for the holidays: only a private plan has room for 100).
                val spots = if (invitedOnly) it.draft.spots else it.draft.spots.coerceAtMost(MAX_SPOTS)
                it.copy(privateChoice = invitedOnly, draft = it.draft.copy(isPrivate = invitedOnly, spots = spots), error = null)
            }
        }

        /** "Kids welcome" in "Add to this plan" (Plans for the holidays, H1). */
        fun setKidsWelcome(on: Boolean) = edit { it.copy(kidsWelcome = on) }

        /** "Chip in" on or off (extras section 3); off forgets what was typed. */
        fun setChipIn(on: Boolean) {
            _ui.update {
                val chip = if (on) it.draft.chipIn ?: ChipInDraft() else null
                it.copy(draft = it.draft.copy(chipIn = chip), chipInErrors = emptyMap())
            }
        }

        /** "Let guests pick the date" on or off (extras section 2): on, the form's own time is the first offered. */
        fun setFindDate(on: Boolean) =
            edit { draft ->
                val start = draft.start
                val end = draft.end
                val first = if (start != null && end != null) listOf(DateOptionDraft(key = 1, start = start, end = end)) else emptyList()
                draft.copy(dateOptions = if (on) draft.dateOptions ?: first else null)
            }

        /** "Add a time": the plan's own time follows the earliest offered (the server's rule). */
        fun addDateOption(
            start: LocalDateTime,
            end: LocalDateTime,
        ) = edit { draft -> draft.withDateOptions(draft.dateOptions.orEmpty().adding(start, end)) }

        /** "Remove" on an offered time. */
        fun removeDateOption(key: Int) = edit { draft -> draft.withDateOptions(draft.dateOptions.orEmpty().filter { it.key != key }) }

        /** "Gift exchange" on (names drawn the day before at noon) or off (forgets what was set). */
        fun setGift(on: Boolean) {
            _ui.update {
                val now = LocalDateTime.now(it.zone)
                val gift = if (on) it.draft.gift ?: GiftDraft.startingFor(it.draft.start, now) else null
                it.copy(draft = it.draft.copy(gift = gift), giftErrors = emptyMap())
            }
        }

        /** A gift field changed; its refusal goes. */
        fun editGift(
            field: String,
            transform: (GiftDraft) -> GiftDraft,
        ) {
            _ui.update { ui ->
                val gift = ui.draft.gift ?: return@update ui
                ui.copy(draft = ui.draft.copy(gift = transform(gift)), giftErrors = ui.giftErrors - field, error = null)
            }
        }

        /** A chip-in field typed into; its refusal goes. */
        fun editChipIn(
            field: String,
            transform: (ChipInDraft) -> ChipInDraft,
        ) {
            _ui.update { ui ->
                val chip = ui.draft.chipIn ?: return@update ui
                ui.copy(draft = ui.draft.copy(chipIn = transform(chip)), chipInErrors = ui.chipInErrors - field, error = null)
            }
        }

        /**
         * An occasion on the kind picker (Plans for the holidays, A2): its kind's form, with what it fills in (title,
         * private, at home, kids welcome, a starter bring list, the time) and its name as the screen's title.
         * Everything stays editable; a part whose switch is off for the host is left out.
         */
        fun chooseOccasion(occasion: PlanOccasionDto) {
            val kind = PlanKind.from(occasion.kind) ?: return
            choose(kind)
            if (_ui.value.step != HostStep.Details) return
            _ui.update { ui ->
                ui.copy(draft = filledFrom(ui, occasion), privateChoice = ui.privateChoice || occasionIsPrivate(ui, occasion))
            }
        }

        /** "Bring list" switched on opens the list (A9); off takes it away (Plans for the holidays, H2). */
        fun setBringList(on: Boolean) {
            _ui.update {
                if (on) {
                    it.copy(draft = it.draft.copy(bring = it.draft.bring ?: BringDraft()), bringOpen = true, error = null)
                } else {
                    it.copy(draft = it.draft.copy(bring = null), bringOpen = false, error = null)
                }
            }
        }

        /** Tapping the "Bring list" row while it's on opens the list. */
        fun openBringList() {
            if (_ui.value.draft.bring != null) _ui.update { it.copy(bringOpen = true) }
        }

        /** The list as the host edits it. */
        fun editBringList(bring: BringDraft) = edit { it.copy(bring = bring) }

        /** Done or Back on the list: back to the details, the list kept. */
        fun closeBringList() {
            _ui.update { it.copy(bringOpen = false) }
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

        // ---- Repeats (Plans step 2) ----

        /** The Repeats row: the Repeats screen over the details. */
        fun openRepeats() {
            if (_ui.value.showsRepeats && _ui.value.draft.start != null) _ui.update { it.copy(repeatsOpen = true, error = null) }
        }

        /** Done (or Back) on the Repeats screen after a change: its pattern, or null for "Doesn't repeat". */
        fun closeRepeats(pattern: PlanRepeatPattern?) {
            _ui.update { it.copy(repeatsOpen = false, draft = it.draft.copy(repeat = pattern), error = null) }
        }

        /** Done (or Back) on the Repeats screen with nothing changed. */
        fun leaveRepeats() {
            _ui.update { it.copy(repeatsOpen = false) }
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
            _ui.update { it.copy(step = HostStep.Details, draft = it.draft.copy(place = place, atHome = false, online = false)) }
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
            if (_ui.value.step == HostStep.Details && _ui.value.showsDealStep) {
                openDealStep()
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
            if (_ui.value.bringOpen) {
                closeBringList()
                return true
            }
            val step = _ui.value.step
            val previous =
                when (step) {
                    HostStep.Type -> return false
                    HostStep.Details -> HostStep.Type
                    HostStep.Deal -> HostStep.Details
                    HostStep.Place -> HostStep.Details
                    HostStep.Preview -> if (_ui.value.showsDealStep) HostStep.Deal else HostStep.Details
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
                        businessCreateBody(kind, draft, ui.zone, business, deal = draft.deal.toInput(ui.zone).takeIf { ui.showsDealStep })
                            .copy(
                                priceCents = ui.priceCents,
                                payHere = true.takeIf { ui.payHereOn },
                                tipsOn = ui.tipsShownOn.takeIf { ui.payHereOn },
                            )
                    } else {
                        // A private plan can be anywhere: no fix is needed to prove the host is nearby.
                        val fix = if (ui.isPrivate) null else locations.gpsFix()
                        buildBody(kind, draft, ui, fix?.let { PlanGpsInput(it.latitude, it.longitude, it.at.toString()) })
                    }
                when (val result = repository.create(body)) {
                    is NetworkResult.Success -> {
                        // The holidays' board 29: the new plan's page opens, with its invite sheet on the past plan's people.
                        val same = samePeopleFrom?.takeIf { ui.isPrivate }
                        events.posted(result.data.id, then.takeIf { ui.isPrivate }, inviteNote(result.data), samePeopleFrom = same)
                        _ui.update { it.copy(posting = false, postedId = result.data.id, postedOpensPlan = same != null) }
                    }
                    is NetworkResult.Failure -> postFailed(result.error)
                }
            }
        }

        /** Posting refused: a deal's field goes back to the deal step with the server's sentence under it (D3). */
        private fun postFailed(error: NetworkError) {
            val field = error.planField
            // A chip-in field: back to the form with the server's sentence under it (and over Post, should it be another).
            if (field != null && field in CHIP_IN_FIELDS && _ui.value.postsChipIn) {
                val message = error.planMessage
                _ui.update { it.copy(posting = false, step = HostStep.Details, chipInErrors = mapOf(field to message), error = message) }
                return
            }
            // A gift field: the same, under "Spend up to" or "Draw names".
            if (field != null && field in GIFT_FIELDS && _ui.value.postsGift) {
                val message = error.planMessage
                _ui.update { it.copy(posting = false, step = HostStep.Details, giftErrors = mapOf(field to message), error = message) }
                return
            }
            if (field != null && field in DEAL_FIELDS && _ui.value.showsDealStep) {
                val errors = mapOf(field to error.planMessage)
                _ui.update {
                    it.copy(posting = false, step = HostStep.Deal, dealPreview = it.dealPreview.copy(errors = errors, checked = true))
                }
                return
            }
            _ui.update { it.copy(posting = false, error = postError(error)) }
        }

        // ---- Business track B1: the deal step (D3) ----

        private var dealJob: Job? = null

        /** Opens the deal step, with a group deal's starting values the first time. */
        private fun openDealStep() {
            _ui.update { ui ->
                val draft = ui.draft
                val deal =
                    if (draft.dealStarted) {
                        draft.deal
                    } else {
                        DealDraft.startingFor(draft.spots, draft.start, LocalDateTime.now(ui.zone))
                    }
                ui.copy(step = HostStep.Deal, error = null, draft = draft.copy(deal = deal, dealStarted = true))
            }
            askDealPreview(debounce = false)
        }

        /** A change on the deal step; the server is asked again what guests will read. */
        fun editDeal(transform: (DealDraft) -> DealDraft) {
            _ui.update { it.copy(draft = it.draft.copy(deal = transform(it.draft.deal)), error = null) }
            askDealPreview(debounce = true)
        }

        private fun askDealPreview(debounce: Boolean) {
            dealJob?.cancel()
            val ui = _ui.value
            if (ui.draft.deal.scope == DealScope.NONE) {
                _ui.update { it.copy(dealPreview = DealPreviewState()) }
                return
            }
            dealJob =
                viewModelScope.launch {
                    if (debounce) delay(DEAL_PREVIEW_DEBOUNCE_MS)
                    readDealPreview()
                }
        }

        /**
         * Asks the server what guests will read for the deal as it is now; null when it couldn't be asked. [checked]: the
         * step's "Preview" asked, so every error shows from now on.
         */
        private suspend fun readDealPreview(checked: Boolean = false): PlanDealPreviewResponse? {
            val ui = _ui.value
            val business = ui.business ?: return null
            val facts = DealPlanFacts(spots = ui.draft.spots, start = ui.draft.start, priceCents = ui.priceCents, bill = ui.payHereOn)
            val body = dealPreviewBody(business, ui.draft.deal, facts, ui.zone) ?: return null
            _ui.update { it.copy(dealPreview = it.dealPreview.copy(loading = true, failed = null)) }
            return when (val result = repository.dealPreview(body)) {
                is NetworkResult.Success -> {
                    val answer = result.data
                    _ui.update {
                        val shown = checked || it.dealPreview.checked
                        val preview = DealPreviewState(answer = answer.takeIf { a -> a.ok }, errors = answer.errors, checked = shown)
                        it.copy(dealPreview = preview)
                    }
                    answer
                }
                is NetworkResult.Failure -> {
                    _ui.update { it.copy(dealPreview = it.dealPreview.copy(loading = false, failed = result.error.planMessage)) }
                    null
                }
            }
        }

        /** The deal step's "Preview": on to the preview once the server accepts the deal (or with "No deal"). */
        fun dealNext() {
            val ui = _ui.value
            if (ui.dealChecking) return
            if (ui.draft.deal.scope == DealScope.NONE) {
                dealJob?.cancel()
                _ui.update { it.copy(step = HostStep.Preview, error = null, dealPreview = DealPreviewState()) }
                loadPreviewArea()
                return
            }
            dealJob?.cancel()
            _ui.update { it.copy(dealChecking = true, error = null) }
            viewModelScope.launch {
                val answer = readDealPreview(checked = true)
                _ui.update { it.copy(dealChecking = false) }
                if (answer?.ok == true) {
                    _ui.update { it.copy(step = HostStep.Preview) }
                    loadPreviewArea()
                } else if (answer == null) {
                    _ui.update { it.copy(error = "Couldn't check the deal. Try again.") }
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
                // The same for Repeats (Plans step 2): the row stays, so the host can choose "Doesn't repeat". Plans steps
                // 3 and 4 likewise: the server's sentence says the switch went off, and the host's choice stays as it was.
                "repeat_unavailable", "online_unavailable", "kinds_unavailable" -> {
                    feature.refresh()
                    error.planMessage
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
                if (ui.isOnline) {
                    onlinePlaceInput(draft.link)
                } else if (draft.atHome && home != null) {
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
                    // "Anyone nearby" is for meeting in person, and only for pickup games and walks (Plans steps 3 and 4).
                }.distinct().filter { it != PlanAutoRule.ANYONE_NEARBY || (!ui.isOnline && !kind.isNew) }
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
                // How it repeats (Plans step 2): left out for a plan that doesn't, as before.
                repeat = ui.repeat?.toInput(),
                // A private plan (Plans step 1); a plan anyone nearby can see sends none of these, as before.
                audience = PlanAudience.INVITED.takeIf { invitedOnly },
                guestsCanInvite = draft.guestsCanInvite.takeIf { invitedOnly },
                inviteUserIds = draft.inviteIds.take(MAX_INVITES_AT_POST).takeIf { invitedOnly && it.isNotEmpty() },
                // Plans for the holidays, H1: sent only while the card shows, so the body is as before without it.
                kidsWelcome = draft.kidsWelcome.takeIf { ui.showsKidsWelcome },
                // H2: the bring list made on A9, when it has something on it.
                bring = draft.bring?.takeIf { ui.showsBringRow && it.items.isNotEmpty() }?.toInput(),
                // H3: the occasion it was started from.
                occasion = draft.occasion,
                // Extras section 3: chip in; the server checks the amount, the note and the link, and says why in words.
                chipIn = draft.chipIn?.takeIf { ui.showsChipIn }?.toInput(),
                // Extras section 2: the times guests tick; the plan's own time above is the earliest of them.
                dateOptions = draft.dateOptions?.takeIf { ui.postsFindDate }?.map { it.toInput(zone) },
                // Extras section 4: the gift exchange; the server checks the budget and the draw time.
                gift = draft.gift?.takeIf { ui.postsGift }?.toInput(zone),
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
                PlanKind.FOOD_DRINKS -> PlanDetailsDto(foodKind = draft.foodKind)
                PlanKind.GAME_NIGHT -> PlanDetailsDto(gameKind = draft.gameKind)
                PlanKind.OUTDOORS -> PlanDetailsDto(outdoorKind = draft.outdoorKind, pace = draft.pace)
                // Something else has no details: its title says what it is.
                PlanKind.SOMETHING_ELSE -> PlanDetailsDto()
            }

        private fun validate(draft: HostDraft): String? {
            _ui.value.businesses.firstOrNull { it.userId == draft.hostAs }?.let { return businessDraftProblem(draft, it, _ui.value.zone) }
            val now = LocalDateTime.now(_ui.value.zone)
            val start = draft.start
            val end = draft.end
            val minutes = if (start != null && end != null) Duration.between(start, end).toMinutes() else 0
            val kindProblem = kindProblem(draft)
            val tooFar = tooFarAhead(draft, now)
            val extras = extrasProblem(draft)
            return when {
                draft.title.isBlank() -> "Give your plan a title."
                extras != null -> extras
                start == null || end == null -> "Pick when it starts and ends."
                start.isBefore(now.minusMinutes(1)) -> "Pick a time that hasn't passed."
                tooFar != null -> tooFar
                minutes < MIN_MINUTES -> "A plan lasts at least 15 minutes."
                minutes > MAX_MINUTES -> "A plan lasts at most 8 hours."
                kindProblem != null -> kindProblem
                else -> placeProblem(draft)
            }
        }

        /** What the holidays' extras still need: find a date's two times, the gift exchange's amount and draw time; else null. */
        private fun extrasProblem(draft: HostDraft): String? =
            when {
                _ui.value.postsFindDate && draft.dateOptions.orEmpty().size < DATE_OPTIONS_FEWEST -> DATE_OPTIONS_TOO_FEW
                _ui.value.postsGift && (draft.gift?.drawAt == null || centsOf(draft.gift.amount) == null) -> GIFT_INCOMPLETE
                else -> null
            }

        /** What Where still needs: an online plan's link (Plans step 3), the host's home, or a place; null when nothing. */
        private fun placeProblem(draft: HostDraft): String? =
            when {
                // Checked as the server checks it; an online plan has no place.
                _ui.value.isOnline -> PlanOnlineLink.problem(draft.link)
                draft.atHome && _ui.value.home == null -> "Add your home to host there, or choose a public place."
                !draft.atHome && draft.place == null -> "Choose a place."
                else -> null
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
            /** The server's sentence while `plans_kinds` is off (422 `kinds_unavailable`). */
            const val KINDS_UNAVAILABLE = "That kind of plan isn't available yet."

            /** "Host again" of an online plan while `plans_online` is off. */
            const val ONLINE_COPY_OFF = "Online plans aren't available yet. Choose a place for this one."
            const val TITLE_MAX = 80
            const val SUBJECT_MAX = 60
            const val PICKUP_LEAD_MINUTES = 15L
            const val DAY_START = 8
            const val WALK_EARLIEST = 7
            const val NIGHT_START = 21
            const val PLAYDATE_LATEST = 18
            const val PLAYDATE_HOUR = 10
            const val WALK_HOUR = 8
            const val OUTING_LATEST = 19
            const val OUTING_HOUR = 9
            const val DINNER_HOUR = 18
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
    /** The most the copy's room may be: 100 for a private plan's "Room for" (Plans for the holidays), else 30. */
    roomMax: Int = MAX_SPOTS,
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
        spots = plan.spots.coerceIn(1, roomMax),
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
        // Plans steps 3 and 4: an online plan is hosted again online with the same link (while Online is offered).
        online = plan.isOnline,
        link = plan.place?.link.orEmpty(),
        foodKind = d?.foodKind ?: "dinner",
        gameKind = d?.gameKind ?: "board_games",
        outdoorKind = d?.outdoorKind ?: "hike",
        kidsWelcome = keepPrivate && plan.kidsWelcome == true,
        bring = copiedBring(plan, keepPrivate),
    )
}

/** The occasion asks for a private plan, and the host can post one. */
private fun occasionIsPrivate(
    ui: HostUi,
    occasion: PlanOccasionDto,
): Boolean = occasion.fills?.audience == PlanAudience.INVITED && ui.showsAudience

/** The draft [choose] made, with what [occasion] fills in (Plans for the holidays, H3). */
private fun filledFrom(
    ui: HostUi,
    occasion: PlanOccasionDto,
): HostDraft {
    val draft = ui.draft
    val fills = occasion.fills
    val (start, end) = occasionTimes(draft, fills, ui.zone)
    val title = fills?.title?.takeIf(String::isNotBlank)
    val isPrivate = occasionIsPrivate(ui, occasion) || draft.isPrivate
    // The occasion's room (server #4227), within what this form allows once who it's for is set.
    val privateHere = isPrivate && ui.showsAudience
    val roomMax = if (ui.guestAnswersOn && privateHere && draft.kind?.countsPeople == true) ROOM_FOR_MAX else MAX_SPOTS
    val spots = fills?.spots?.takeIf { it > 0 }?.coerceAtMost(roomMax) ?: draft.spots
    return draft.copy(
        title = title ?: draft.title,
        titleEdited = title != null || draft.titleEdited,
        isPrivate = isPrivate,
        spots = spots,
        atHome = (fills?.placeKind == "home" && ui.home != null) || draft.atHome,
        start = start,
        end = end,
        kidsWelcome = fills?.kidsWelcome == true && ui.guestAnswersOn,
        bring = occasionBring(ui, fills?.bring),
        foodKind = occasion.details?.foodKind ?: draft.foodKind,
        gameKind = occasion.details?.gameKind ?: draft.gameKind,
        outdoorKind = occasion.details?.outdoorKind ?: draft.outdoorKind,
        occasion = occasion.key,
        occasionText = occasion.text.takeIf(String::isNotBlank),
    )
}

/** An occasion's start and end on the host's clock; without an end, a new start keeps the draft's length. */
private fun occasionTimes(
    draft: HostDraft,
    fills: PlanOccasionFillsDto?,
    zone: ZoneId,
): Pair<LocalDateTime?, LocalDateTime?> {
    val start = fills?.startsAt?.let { localTime(it, zone) }
    val end = fills?.endsAt?.let { localTime(it, zone) }
    val length = if (draft.start != null && draft.end != null) Duration.between(draft.start, draft.end) else null
    return (start ?: draft.start) to (end ?: start?.let { s -> length?.let { s.plus(it) } } ?: draft.end)
}

/** An occasion's starter bring list, while the host's form offers one (Plans for the holidays, H2). */
private fun occasionBring(
    ui: HostUi,
    list: PlanOccasionBringDto?,
): BringDraft? {
    if (list == null || !ui.bringOn || list.items.isEmpty()) return null
    val items = list.items.map { BringDraftItem(label = it.label, note = it.note.orEmpty()) }
    return BringDraft(items = items, guestsCanAdd = list.guestsCanAdd)
}

/** An occasion's ISO time on the host's clock. */
private fun localTime(
    iso: String,
    zone: ZoneId,
): LocalDateTime? = runCatching { java.time.Instant.parse(iso).atZone(zone).toLocalDateTime() }.getOrNull()

/** Host again keeps what was on the bring list, with nobody bringing anything yet (Plans for the holidays, H2). */
private fun copiedBring(
    plan: PlanDto,
    keepPrivate: Boolean,
): BringDraft? {
    val list = plan.bring?.takeIf { keepPrivate && it.items.isNotEmpty() } ?: return null
    val items = list.items.map { BringDraftItem(label = it.label, note = it.note.orEmpty()) }
    return BringDraft(items = items, guestsCanAdd = list.guestsCanAdd)
}

/** The draft with these times offered, and its own time the earliest of them (as the server sets it). */
private fun HostDraft.withDateOptions(options: List<DateOptionDraft>): HostDraft {
    val first = options.minByOrNull { it.start } ?: return copy(dateOptions = options)
    return copy(dateOptions = options.sortedBy { it.start }, start = first.start, end = first.end)
}

/** The fields a chip-in refusal names (`field`), 08-extras section 3. */
internal val CHIP_IN_FIELDS = setOf(CHIP_IN_AMOUNT, CHIP_IN_NOTE, CHIP_IN_LINK)

/** The chip in as the server takes it: cents each person (null when it isn't an amount: the server says so). */
internal fun ChipInDraft.toInput(): PlanChipInInput = PlanChipInInput(amountCents = centsOf(amount), note = note.trim(), link = link.trim())
