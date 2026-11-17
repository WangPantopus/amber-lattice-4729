package app.pantopus.android.data.api.models.plans

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import java.time.Instant

/*
 * Nearby Plans: the wire shapes of `/api/plans` (the build brief's contract, section 5).
 *
 * A plan reaches the app as one [PlanDto]. Everyone allowed to see it gets the public card; the host and the
 * people who are in also get the private parts ([PlanDto.place], [PlanDto.people], [PlanDto.chatRoomId],
 * [PlanDto.myRequest]) and the host gets [PlanDto.requestsCount] and [PlanDto.autoRules]. Those fields are null
 * for everyone else, so "is the private part here" is the only test the screens need.
 *
 * Timestamps stay ISO-8601 strings on the wire; `PlanTimes` parses them.
 */

/** `area`: the public point and its name. `precision` is `area` (about 500 m) or `neighborhood` (playdates). */
@JsonClass(generateAdapter = true)
data class PlanAreaDto(
    @Json(name = "label") val label: String? = null,
    @Json(name = "latitude") val latitude: Double? = null,
    @Json(name = "longitude") val longitude: Double? = null,
    @Json(name = "precision") val precision: String? = null,
    /** The town ("Camas"). */
    @Json(name = "city") val city: String? = null,
)

/** `host`: first name and last initial, the verified badge and two counts. Never an address. */
@JsonClass(generateAdapter = true)
data class PlanHostDto(
    @Json(name = "user_id") val userId: String? = null,
    @Json(name = "display_name") val displayName: String? = null,
    @Json(name = "avatar_url") val avatarUrl: String? = null,
    @Json(name = "verified_address") val verifiedAddress: Boolean = false,
    @Json(name = "plans_hosted") val plansHosted: Int = 0,
    @Json(name = "mutual_connections") val mutualConnections: Int = 0,
    /** Ended plans of this plan's kind ("Hosted 2 playdates"). */
    @Json(name = "kind_hosted") val kindHosted: Int? = null,
    /** Median minutes the host takes to answer; null with fewer than 3 answers. */
    @Json(name = "typical_answer_minutes") val typicalAnswerMinutes: Int? = null,
)

/** `details.game`: the game a watch party is for. */
@JsonClass(generateAdapter = true)
data class PlanGameRefDto(
    @Json(name = "label") val label: String? = null,
    @Json(name = "starts_at") val startsAt: String? = null,
    @Json(name = "id") val id: String? = null,
    @Json(name = "team") val team: String? = null,
    @Json(name = "opponent") val opponent: String? = null,
    @Json(name = "home") val home: Boolean? = null,
    @Json(name = "ends_at") val endsAt: String? = null,
)

/** `details`: the per-type facts (brief section 4). Every field is optional. */
@JsonClass(generateAdapter = true)
data class PlanDetailsDto(
    @Json(name = "game") val game: PlanGameRefDto? = null,
    @Json(name = "sport") val sport: String? = null,
    @Json(name = "level") val level: String? = null,
    @Json(name = "extra_gear") val extraGear: Boolean? = null,
    @Json(name = "kids_age_bands") val kidsAgeBands: List<String>? = null,
    @Json(name = "walk_kind") val walkKind: String? = null,
    @Json(name = "pace") val pace: String? = null,
    @Json(name = "dogs_welcome") val dogsWelcome: Boolean? = null,
    /** A study group's subject ("Spanish"), 1 to 60 characters. */
    @Json(name = "subject") val subject: String? = null,
    /** A study group's `quiet` or `together` ([app.pantopus.android.data.plans.PlanStudyStyle]). */
    @Json(name = "study_style") val studyStyle: String? = null,
    // Plans step 4 (the four newer kinds, `PlanKindDetails`). Outdoors also sends `pace`.
    /** Food & drinks: `dinner` (the server's default), `potluck`, `drinks`, `brunch`, `bbq` or `other`. */
    @Json(name = "food_kind") val foodKind: String? = null,
    /** Game night: `board_games` (the default), `cards`, `trivia`, `video_games` or `other`. */
    @Json(name = "game_kind") val gameKind: String? = null,
    /** Outdoors: `hike` (the default), `bike_ride`, `run` or `other`. */
    @Json(name = "outdoor_kind") val outdoorKind: String? = null,
)

/**
 * `viewer`: where the person looking stands. `role` is `none`, `host` or `guest`; `request_status` is a
 * `PlanRequest.status`; `cannot_ask_reason` is one of the codes in `PlanCannotAsk`.
 */
@JsonClass(generateAdapter = true)
data class PlanViewerDto(
    @Json(name = "role") val role: String? = null,
    @Json(name = "request_status") val requestStatus: String? = null,
    @Json(name = "waitlist_position") val waitlistPosition: Int? = null,
    @Json(name = "can_ask") val canAsk: Boolean = false,
    @Json(name = "cannot_ask_reason") val cannotAskReason: String? = null,
    /** The rule that would let this viewer in right now (`anyone_nearby`, `verified`, `hosted_before`), or null. */
    @Json(name = "auto_rule") val autoRule: String? = null,
    /** True once this viewer answered "How was it" (A5). */
    @Json(name = "feedback_given") val feedbackGiven: Boolean = false,
    /**
     * "Bring a friend" (Plans step 1): for a guest who is in on a private plan whose host lets guests bring a friend;
     * null for everyone else and from older servers.
     */
    @Json(name = "friend_invite") val friendInvite: PlanFriendInviteDto? = null,
)

/** `viewer.friend_invite`: whether this guest may make their one friend link now, and whether they already did. */
@JsonClass(generateAdapter = true)
data class PlanFriendInviteDto(
    @Json(name = "can_invite") val canInvite: Boolean = false,
    @Json(name = "used") val used: Boolean = false,
)

/**
 * `place`: the exact place. Only in a host's or an accepted guest's [PlanDto]. An online plan's (Plans step 3) is
 * `{ name: "Online", address: null, latitude: null, longitude: null, note, link, link_host }`: no point, ever.
 */
@JsonClass(generateAdapter = true)
data class PlanPlaceDto(
    @Json(name = "name") val name: String? = null,
    @Json(name = "address") val address: String? = null,
    @Json(name = "latitude") val latitude: Double? = null,
    @Json(name = "longitude") val longitude: Double? = null,
    @Json(name = "note") val note: String? = null,
    /** An online plan only: the link people join with. Only the host and people who are in get it. */
    @Json(name = "link") val link: String? = null,
    /** An online plan only: the link's host name without a leading `www.` ("meet.google.com"). */
    @Json(name = "link_host") val linkHost: String? = null,
)

/** One of `people`: who's going. Only in a host's or an accepted guest's [PlanDto]. */
@JsonClass(generateAdapter = true)
data class PlanPersonDto(
    @Json(name = "user_id") val userId: String? = null,
    @Json(name = "display_name") val displayName: String? = null,
    @Json(name = "avatar_url") val avatarUrl: String? = null,
    @Json(name = "party_size") val partySize: Int = 1,
    @Json(name = "verified_address") val verifiedAddress: Boolean = false,
    @Json(name = "is_host") val isHost: Boolean = false,
    @Json(name = "on_my_way") val onMyWay: Boolean = false,
    /** Host view only (H9): the person's distance band, when the server adds it. */
    @Json(name = "distance_band") val distanceBand: String? = null,
    /** Host view only (H9): "you hosted Alex before". */
    @Json(name = "hosted_before") val hostedBefore: Boolean? = null,
    /** Host view only: the person's request, so the host can remove them (H9). */
    @Json(name = "request_id") val requestId: String? = null,
    @Json(name = "plans_joined") val plansJoined: Int? = null,
    @Json(name = "new_to_pantopus") val newToPantopus: Boolean? = null,
    @Json(name = "reconfirm_needed") val reconfirmNeeded: Boolean? = null,
    @Json(name = "kids_count") val kidsCount: Int? = null,
    @Json(name = "kids_age_bands") val kidsAgeBands: List<String>? = null,
    /** Plans for the holidays (`guests=1`): a guest without an account who is in, by their invitation's id. */
    @Json(name = "guest_id") val guestId: String? = null,
    @Json(name = "guest") val isGuest: Boolean = false,
    /** Business track B1, staff only: this guest's free thing (`ready` or `used`), for "Mark used". */
    @Json(name = "deal") val deal: PlanPersonDealDto? = null,
    /** Business track B2, staff only: what this guest paid and who brought them. */
    @Json(name = "paid") val paid: PlanPersonPaidDto? = null,
)

/** `my_request`: the viewer's own request, once they have one. */
@JsonClass(generateAdapter = true)
data class PlanMyRequestDto(
    @Json(name = "id") val id: String? = null,
    @Json(name = "status") val status: String? = null,
    @Json(name = "party_size") val partySize: Int? = null,
    @Json(name = "reconfirm_needed") val reconfirmNeeded: Boolean = false,
    /** What the host's change asked "Still coming?" about: "time", "place" or "both" (null from older servers). */
    @Json(name = "reconfirm_reason") val reconfirmReason: String? = null,
    @Json(name = "note") val note: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "kids_count") val kidsCount: Int? = null,
    @Json(name = "kids_age_bands") val kidsAgeBands: List<String>? = null,
    @Json(name = "on_my_way") val onMyWay: Boolean = false,
    @Json(name = "waitlist_position") val waitlistPosition: Int? = null,
    @Json(name = "decided_by") val decidedBy: String? = null,
    @Json(name = "decided_at") val decidedAt: String? = null,
    @Json(name = "asks_left") val asksLeft: Int? = null,
    /** Business track B2: a `paying` request's spot is held until then. */
    @Json(name = "hold_expires_at") val holdExpiresAt: String? = null,
)

/**
 * `business` on a business's plan (Plans with businesses, the build contract's section 5.4): the business hosting it.
 * A neighbor's plan has no `business` key, which is how the app tells the two apart.
 */
@JsonClass(generateAdapter = true)
data class PlanBusinessDto(
    @Json(name = "user_id") val userId: String? = null,
    @Json(name = "name") val name: String? = null,
    @Json(name = "avatar_url") val avatarUrl: String? = null,
    @Json(name = "verified") val verified: Boolean = false,
    @Json(name = "page_url") val pageUrl: String? = null,
    @Json(name = "plans_hosted") val plansHosted: Int = 0,
)

/** `price` on a business's plan. Step 2 sends `null`, which reads "Free"; a price is not drawn by this build. */
@JsonClass(generateAdapter = true)
data class PlanPriceDto(
    @Json(name = "cents") val cents: Int? = null,
    @Json(name = "currency") val currency: String? = null,
    @Json(name = "per") val per: String? = null,
    /** Business track B2: "$18" (the list's chip). */
    @Json(name = "text") val text: String? = null,
    /** "$18 a person": replaces "Free" in "Free, and for adults". */
    @Json(name = "line") val line: String? = null,
    /** D1's line under Join: "$18 a person. Full refund until Friday at 10:00 AM." */
    @Json(name = "join_text") val joinText: String? = null,
    @Json(name = "refund_until") val refundUntil: String? = null,
    @Json(name = "refund_text") val refundText: String? = null,
    /** B4: the price struck through beside a deal price. */
    @Json(name = "was_cents") val wasCents: Int? = null,
    @Json(name = "was_text") val wasText: String? = null,
)

/** One of a venue's later plans folded under its soonest (`more_times.items`): a short line in the list. */
@JsonClass(generateAdapter = true)
data class PlanMoreTimeDto(
    @Json(name = "id") val id: String,
    @Json(name = "title") val title: String? = null,
    @Json(name = "label") val label: String? = null,
    @Json(name = "label_text") val labelText: String? = null,
    @Json(name = "starts_at") val startsAt: String? = null,
    @Json(name = "timezone") val timezone: String? = null,
)

/** `more_times`: how many later plans the venue has in the list's window, and the first six. */
@JsonClass(generateAdapter = true)
data class PlanMoreTimesDto(
    @Json(name = "count") val count: Int = 0,
    @Json(name = "items") val items: List<PlanMoreTimeDto> = emptyList(),
)

/**
 * PlanCard, PlanDetail and the host's extras in one shape (brief section 5). The fields after [shareUrl] are
 * null unless the viewer is the host or is in.
 */
@Suppress("LongParameterList")
@JsonClass(generateAdapter = true)
data class PlanDto(
    @Json(name = "id") val id: String,
    @Json(name = "kind") val kind: String = "",
    @Json(name = "title") val title: String = "",
    @Json(name = "about") val about: String? = null,
    /** Null for a playdate until the viewer is in or hosting. */
    @Json(name = "starts_at") val startsAt: String? = null,
    @Json(name = "ends_at") val endsAt: String? = null,
    @Json(name = "day_part") val dayPart: String? = null,
    @Json(name = "timezone") val timezone: String? = null,
    /** The plan's local date (`YYYY-MM-DD`), present even when the time is hidden ("Saturday morning"). */
    @Json(name = "starts_on") val localDateRaw: String? = null,
    /** When asking closes (the start, or 30 minutes before the end for pickup games and walks); null when hidden. */
    @Json(name = "asking_closes_at") val askingClosesAt: String? = null,
    @Json(name = "area") val area: PlanAreaDto? = null,
    @Json(name = "distance_band") val distanceBand: String? = null,
    @Json(name = "place_kind") val placeKind: String? = null,
    @Json(name = "host") val host: PlanHostDto? = null,
    @Json(name = "spots") val spots: Int = 0,
    @Json(name = "going_count") val goingCount: Int = 0,
    @Json(name = "spots_left") val spotsLeft: Int = 0,
    @Json(name = "is_full") val isFull: Boolean = false,
    @Json(name = "waitlist_count") val waitlistCount: Int = 0,
    @Json(name = "details") val details: PlanDetailsDto? = null,
    @Json(name = "how_people_get_in") val howPeopleGetIn: String? = null,
    @Json(name = "join_requirement") val joinRequirement: String? = null,
    @Json(name = "state") val state: String? = null,
    @Json(name = "viewer") val viewer: PlanViewerDto? = null,
    @Json(name = "share_url") val shareUrl: String? = null,
    /**
     * Who can see it (Plans step 1): `nearby` (anyone nearby, as every plan was) or `invited` (private: only its host,
     * the people invited and the people in). Absent from an older server, which means `nearby`.
     */
    @Json(name = "audience") val audience: String? = null,
    /** How it repeats (Plans step 2), for everyone who can read the card; null when it doesn't repeat or from an older server. */
    @Json(name = "repeat") val repeat: PlanRepeatDto? = null,
    // PlanDetail: the host and people who are in. A private plan at a public place also sends `place` to the person
    // invited before they answer.
    @Json(name = "place") val place: PlanPlaceDto? = null,
    @Json(name = "people") val people: List<PlanPersonDto>? = null,
    @Json(name = "chat_room_id") val chatRoomId: String? = null,
    /** False once the chat is read-only (24 hours after the end) or the plan is cancelled. */
    @Json(name = "chat_open") val chatOpen: Boolean? = null,
    /** The host's note when they cancelled. */
    @Json(name = "cancel_note") val cancelNote: String? = null,
    /** The viewer's own request, any status (top level of the card and the detail). */
    @Json(name = "my_request") val myRequest: PlanMyRequestDto? = null,
    // The host only.
    @Json(name = "requests_count") val requestsCount: Int? = null,
    @Json(name = "auto_rules") val autoRules: List<String>? = null,
    @Json(name = "guest_note") val guestNote: String? = null,
    /** The viewer's invitation from the host, or null (planInvites.js). */
    @Json(name = "my_invite") val myInvite: PlanMyInviteDto? = null,
    /** The host only: their invitations to this plan. */
    @Json(name = "invites") val invites: PlanHostInvitesDto? = null,
    // A business's plan only (Plans with businesses): a neighbor's plan has none of these keys. Its `place` above is
    // then public, for everyone: the business's own address.
    @Json(name = "business") val business: PlanBusinessDto? = null,
    /** The label key the business chose ("clinic"). */
    @Json(name = "label") val label: String? = null,
    /** What guests read the label as ("Clinic"). */
    @Json(name = "label_text") val labelText: String? = null,
    /** Null on a business's plan is "Free". */
    @Json(name = "price") val price: PlanPriceDto? = null,
    @Json(name = "guests_can_invite") val guestsCanInvite: Boolean? = null,
    /** The venue's later plans in the list's window, folded under this one; null when there are none. */
    @Json(name = "more_times") val moreTimes: PlanMoreTimesDto? = null,
    /** Posting a private plan with `invite_user_ids` (Plans step 1): what happened to each person. */
    @Json(name = "invite_results") val inviteResults: List<PlanInviteResultDto>? = null,
    /** Posting a private plan: the invitations couldn't be sent at all (the plan is posted either way), in words to show. */
    @Json(name = "invite_error") val inviteError: String? = null,
    // Plans for the holidays, H1 (contract 6.5), with `guests=1`; absent from an older server.
    /** Guests say how many adults and how many kids. */
    @Json(name = "kids_welcome") val kidsWelcome: Boolean? = null,
    /** The host and people who are in: how many adults and kids are coming, guests without an account included. */
    @Json(name = "headcount") val headcount: PlanHeadcountDto? = null,
    /** The host only: how many people said I'm in, Maybe, or haven't answered. */
    @Json(name = "answers") val answers: PlanAnswersDto? = null,
    /** Plans for the holidays, H2 (contract 7): the bring list, for the host and people in; none without items. */
    @Json(name = "bring") val bring: PlanBringDto? = null,
    /** Plans for the holidays, H3 (contract 8): the occasion it was started from; its tag reads the occasion's name. */
    @Json(name = "occasion") val occasion: PlanOccasionRefDto? = null,
    /** Business track B1 (contract 9): a business's deal, with every word from the server; none without one. */
    @Json(name = "deal") val deal: PlanDealDto? = null,
    /** Business track B2: what the guest paid, the receipt and what leaving gives back; only for a guest who paid. */
    @Json(name = "paid") val paid: PlanPaidDto? = null,
    /** Business track B5: "Pay at {business}" for staff and guests who are in, while the plan takes the bill here. */
    @Json(name = "pay_here") val payHere: PlanPayHereDto? = null,
    /** Business track B6: a tip after a paid plan, once, for 7 days after it ends. */
    @Json(name = "tip_later") val tipLater: PlanTipLaterDto? = null,
)

/** `occasion` on a card (Plans for the holidays, H3). */
@JsonClass(generateAdapter = true)
data class PlanOccasionRefDto(
    @Json(name = "key") val key: String = "",
    @Json(name = "text") val text: String = "",
)

/** `GET /api/plans/occasions` (H3): the occasions in season for the host's date, in the strip's order. */
@JsonClass(generateAdapter = true)
data class PlanOccasionsResponse(
    @Json(name = "occasions") val occasions: List<PlanOccasionDto> = emptyList(),
)

/** One occasion: a start for a plan of an existing [kind], with what it fills in. */
@JsonClass(generateAdapter = true)
data class PlanOccasionDto(
    @Json(name = "key") val key: String,
    @Json(name = "text") val text: String = "",
    @Json(name = "kind") val kind: String = "",
    @Json(name = "details") val details: PlanDetailsDto? = null,
    @Json(name = "fills") val fills: PlanOccasionFillsDto? = null,
)

/** What an occasion fills in on the host form (contract 8); every part stays editable. */
@JsonClass(generateAdapter = true)
data class PlanOccasionFillsDto(
    @Json(name = "title") val title: String? = null,
    @Json(name = "audience") val audience: String? = null,
    @Json(name = "place_kind") val placeKind: String? = null,
    @Json(name = "kids_welcome") val kidsWelcome: Boolean? = null,
    /** The room the occasion starts with (server #4227): 12, or 20 for a holiday party or New Year's Eve. */
    @Json(name = "spots") val spots: Int? = null,
    @Json(name = "bring") val bring: PlanOccasionBringDto? = null,
    @Json(name = "starts_at") val startsAt: String? = null,
    @Json(name = "ends_at") val endsAt: String? = null,
    @Json(name = "timezone") val timezone: String? = null,
)

/** An occasion's starter bring list. */
@JsonClass(generateAdapter = true)
data class PlanOccasionBringDto(
    @Json(name = "guests_can_add") val guestsCanAdd: Boolean = true,
    @Json(name = "items") val items: List<PlanOccasionBringItemDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class PlanOccasionBringItemDto(
    @Json(name = "label") val label: String = "",
    @Json(name = "note") val note: String? = null,
)

/** The bring list on a card (Plans for the holidays, H2): what is needed and who is bringing it. */
@JsonClass(generateAdapter = true)
data class PlanBringDto(
    @Json(name = "rev") val rev: Int = 0,
    @Json(name = "guests_can_add") val guestsCanAdd: Boolean = false,
    @Json(name = "open_count") val openCount: Int = 0,
    @Json(name = "items") val items: List<PlanBringItemDto> = emptyList(),
) {
    /** How many items someone is bringing. */
    val taken: Int get() = items.count { it.claim != null }
}

/** One thing on the bring list; [claim] is who is bringing it (a first name), null while it is open. */
@JsonClass(generateAdapter = true)
data class PlanBringItemDto(
    @Json(name = "id") val id: String,
    @Json(name = "label") val label: String = "",
    @Json(name = "note") val note: String? = null,
    @Json(name = "claim") val claim: PlanBringClaimDto? = null,
)

/** Who is bringing an item: their first name, and whether it is the person looking. */
@JsonClass(generateAdapter = true)
data class PlanBringClaimDto(
    @Json(name = "name") val name: String = "",
    @Json(name = "mine") val mine: Boolean = false,
)

/** The bring list as the host sends it (create, change, `PUT …/bring`): kept items carry their id. */
@JsonClass(generateAdapter = true)
data class PlanBringInput(
    @Json(name = "items") val items: List<PlanBringItemInput>,
    @Json(name = "guests_can_add") val guestsCanAdd: Boolean,
)

/** One item the host sends; [mine] claims it for the host (true) or gives it back (false). */
@JsonClass(generateAdapter = true)
data class PlanBringItemInput(
    @Json(name = "id") val id: String? = null,
    @Json(name = "label") val label: String,
    @Json(name = "note") val note: String? = null,
    @Json(name = "mine") val mine: Boolean? = null,
)

/** `POST /api/plans/:id/bring/items`: a guest adds one thing, claimed by them. */
@JsonClass(generateAdapter = true)
data class PlanBringAddBody(
    @Json(name = "label") val label: String,
    @Json(name = "note") val note: String? = null,
)

/** Every bring-list route answers the list as it is now. */
@JsonClass(generateAdapter = true)
data class PlanBringResponse(
    @Json(name = "bring") val bring: PlanBringDto? = null,
)

/** `headcount` on a plan card and on the host's invitation list (Plans for the holidays, contract 6.4 and 6.5). */
@JsonClass(generateAdapter = true)
data class PlanHeadcountDto(
    @Json(name = "adults") val adults: Int = 0,
    @Json(name = "kids") val kids: Int = 0,
) {
    /** Everyone coming: adults and kids. */
    val total: Int get() = adults + kids
}

/** `answers` on the host's card (Plans for the holidays, contract 6.5), counted in people. */
@JsonClass(generateAdapter = true)
data class PlanAnswersDto(
    @Json(name = "in") val isIn: Int = 0,
    @Json(name = "maybe") val maybe: Int = 0,
    @Json(name = "no_answer") val noAnswer: Int = 0,
)

/**
 * One of a monthly pattern's days (Plans step 2): a weekday of one week of the month (`week` 1 to 4, or -1 for the last,
 * and `weekday` Monday 1 to Sunday 7: "the 1st Saturday") or a date (`day` 1 to 31: "the 15th"). Sent the same way.
 */
@JsonClass(generateAdapter = true)
data class PlanMonthDayDto(
    @Json(name = "week") val week: Int? = null,
    @Json(name = "weekday") val weekday: Int? = null,
    @Json(name = "day") val day: Int? = null,
)

/**
 * `repeat` on a card (Plans step 2): the pattern (`freq` weekly, biweekly or monthly; `weekdays` Monday 1 to Sunday 7;
 * `month_days`; `until` or `count`), its words ("Every Tuesday and Thursday", short "Every Tue and Thu"), which date of
 * the series this plan is of how many, and the series' last date (`YYYY-MM-DD`).
 */
@Suppress("LongParameterList")
@JsonClass(generateAdapter = true)
data class PlanRepeatDto(
    @Json(name = "freq") val freq: String? = null,
    @Json(name = "weekdays") val weekdays: List<Int>? = null,
    @Json(name = "month_days") val monthDays: List<PlanMonthDayDto>? = null,
    @Json(name = "until") val until: String? = null,
    @Json(name = "count") val count: Int? = null,
    @Json(name = "text") val text: String? = null,
    @Json(name = "short") val shortText: String? = null,
    @Json(name = "index") val index: Int? = null,
    @Json(name = "total") val total: Int? = null,
    @Json(name = "last_on") val lastOn: String? = null,
)

/** `repeat` in the create and change bodies (Plans step 2): one of [until] and [count] is sent, never both. */
@JsonClass(generateAdapter = true)
data class PlanRepeatInput(
    @Json(name = "freq") val freq: String,
    @Json(name = "weekdays") val weekdays: List<Int>? = null,
    @Json(name = "month_days") val monthDays: List<PlanMonthDayDto>? = null,
    @Json(name = "until") val until: String? = null,
    @Json(name = "count") val count: Int? = null,
)

/** `POST /api/plans/:id/cancel` with `repeat: "keep"` (Plans step 2): the date that took its place, or null when the series is over. */
@JsonClass(generateAdapter = true)
data class PlanCancelReply(
    @Json(name = "id") val id: String? = null,
    @Json(name = "next_plan_id") val nextPlanId: String? = null,
)

/** `nearest_elsewhere` (F4): the closest town with plans 5 to 15 miles away when the page is empty. */
@JsonClass(generateAdapter = true)
data class PlansElsewhereDto(
    @Json(name = "city") val city: String? = null,
    @Json(name = "count") val count: Int = 0,
    @Json(name = "miles") val miles: Int? = null,
)

/** `GET /api/plans`: the list under the map, soonest first. */
@JsonClass(generateAdapter = true)
data class PlansListResponse(
    @Json(name = "items") val items: List<PlanDto> = emptyList(),
    @Json(name = "next_cursor") val nextCursor: String? = null,
    @Json(name = "nearest_elsewhere") val nearestElsewhere: PlansElsewhereDto? = null,
    /**
     * True when a business has a plan in the area and window, whatever the filter says (Plans with businesses): the
     * All / Neighbors / Businesses filter shows only then. Absent for a person without the switch.
     */
    @Json(name = "has_business_plans") val hasBusinessPlans: Boolean? = null,
)

/**
 * `viewer` on `GET /api/plans/mine`: where the person stands. [verifiedAddress] is a verified-resident home (postcard,
 * document, landlord or admin); [seesPlaydates] is that and `plans_playdates` on. Both default to true so an older
 * server changes nothing.
 */
@JsonClass(generateAdapter = true)
data class PlansStandingDto(
    @Json(name = "verified_address") val verifiedAddress: Boolean = true,
    @Json(name = "sees_playdates") val seesPlaydates: Boolean = true,
)

/** `GET /api/plans/mine`: the list's "Your plans" and the Today cards. */
@JsonClass(generateAdapter = true)
data class MyPlansResponse(
    @Json(name = "hosting") val hosting: List<PlanDto> = emptyList(),
    @Json(name = "going") val going: List<PlanDto> = emptyList(),
    @Json(name = "asked") val asked: List<PlanDto> = emptyList(),
    @Json(name = "waitlisted") val waitlisted: List<PlanDto> = emptyList(),
    /** Invitations the viewer hasn't answered yet. */
    @Json(name = "invited") val invited: List<PlanDto> = emptyList(),
    /** Ended in the last 2 days, the viewer hosted or was in (A5). */
    @Json(name = "recent") val recent: List<PlanDto> = emptyList(),
    @Json(name = "viewer") val viewer: PlansStandingDto? = null,
)

/** One pin of `GET /api/posts/map?layers=plans`: the area point for everyone, the exact point for people in. */
@JsonClass(generateAdapter = true)
data class PlanPinDto(
    @Json(name = "layer_type") val layerType: String = "plan",
    @Json(name = "id") val id: String,
    @Json(name = "kind") val kind: String = "",
    @Json(name = "latitude") val latitude: Double? = null,
    @Json(name = "longitude") val longitude: Double? = null,
    @Json(name = "precision") val precision: String? = null,
    @Json(name = "starts_at") val startsAt: String? = null,
    @Json(name = "ends_at") val endsAt: String? = null,
    @Json(name = "day_part") val dayPart: String? = null,
    @Json(name = "timezone") val timezone: String? = null,
    @Json(name = "starts_on") val startsOn: String? = null,
    @Json(name = "area_label") val areaLabel: String? = null,
    @Json(name = "title") val title: String? = null,
    @Json(name = "spots") val spots: Int = 0,
    @Json(name = "going_count") val goingCount: Int = 0,
    @Json(name = "spots_left") val spotsLeft: Int = 0,
    @Json(name = "is_full") val isFull: Boolean = false,
    @Json(name = "state") val state: String? = null,
    @Json(name = "viewer_role") val viewerRole: String? = null,
    @Json(name = "viewer_request_status") val viewerRequestStatus: String? = null,
    @Json(name = "distance_band") val distanceBand: String? = null,
    // A business's pin only: exact for everyone, who hosts, what they call it and how many more times this week.
    @Json(name = "business") val business: PlanPinBusinessDto? = null,
    @Json(name = "label") val label: String? = null,
    @Json(name = "label_text") val labelText: String? = null,
    @Json(name = "place_name") val placeName: String? = null,
    @Json(name = "more_times") val moreTimes: Int = 0,
    /** `invited` for a private plan's pin (its host, the people invited and the people in see it); `nearby` or absent otherwise. */
    @Json(name = "audience") val audience: String? = null,
)

/** `business` on a business's map pin. */
@JsonClass(generateAdapter = true)
data class PlanPinBusinessDto(
    @Json(name = "user_id") val userId: String? = null,
    @Json(name = "name") val name: String? = null,
    @Json(name = "verified") val verified: Boolean = false,
)

/** `GET /api/posts/map` read for the Plans layer only; other layers' rows are dropped by `layer_type`. */
@JsonClass(generateAdapter = true)
data class PlanPinsResponse(
    @Json(name = "markers") val markers: List<PlanPinDto> = emptyList(),
)

/**
 * `place` in the create body. `home_id` only for `kind = home`; an online plan (Plans step 3) sends only `kind:
 * "online"`, `link` and `timezone`.
 */
@JsonClass(generateAdapter = true)
data class PlanPlaceInput(
    @Json(name = "kind") val kind: String,
    @Json(name = "name") val name: String? = null,
    @Json(name = "address") val address: String? = null,
    @Json(name = "latitude") val latitude: Double? = null,
    @Json(name = "longitude") val longitude: Double? = null,
    @Json(name = "home_id") val homeId: String? = null,
    /** The place picker's id for a public place it listed (`osm:node/123`): the venue's key. Left out otherwise. */
    @Json(name = "place_id") val placeId: String? = null,
    /** An online plan: the link people join with (https, at most 300 characters). */
    @Json(name = "link") val link: String? = null,
    /** An online plan: the phone's own IANA time zone, used when the plan has no area to read one from. */
    @Json(name = "timezone") val timezone: String? = null,
)

/** `gps` in the create body: proves the host is nearby; never the pin. */
@JsonClass(generateAdapter = true)
data class PlanGpsInput(
    @Json(name = "latitude") val latitude: Double,
    @Json(name = "longitude") val longitude: Double,
    /** ISO-8601 time of the fix. */
    @Json(name = "timestamp") val timestamp: String,
)

/** `host_as` in the create body: the business the plan is posted for (Plans with businesses). */
@JsonClass(generateAdapter = true)
data class PlanHostAsInput(
    @Json(name = "business_user_id") val businessUserId: String,
)

/** `POST /api/plans` body. A business's plan sends [hostAs], [businessLocationId] and [label], and no [place]. */
@Suppress("LongParameterList")
@JsonClass(generateAdapter = true)
data class CreatePlanBody(
    @Json(name = "kind") val kind: String,
    @Json(name = "title") val title: String,
    @Json(name = "about") val about: String? = null,
    @Json(name = "starts_at") val startsAt: String,
    @Json(name = "ends_at") val endsAt: String,
    @Json(name = "place") val place: PlanPlaceInput? = null,
    @Json(name = "spots") val spots: Int,
    @Json(name = "auto_rules") val autoRules: List<String> = emptyList(),
    @Json(name = "join_requirement") val joinRequirement: String,
    @Json(name = "details") val details: PlanDetailsDto? = null,
    @Json(name = "guest_note") val guestNote: String? = null,
    @Json(name = "gps") val gps: PlanGpsInput? = null,
    /** A5 "Host again": the plan this one copies (records the funnel). */
    @Json(name = "hosted_again_from") val hostedAgainFrom: String? = null,
    /** How it repeats (Plans step 2); left out for a plan that doesn't repeat, as before. */
    @Json(name = "repeat") val repeat: PlanRepeatInput? = null,
    @Json(name = "host_as") val hostAs: PlanHostAsInput? = null,
    /** One of the business's own locations (`host_as` only). */
    @Json(name = "business_location_id") val businessLocationId: String? = null,
    /** What guests see it called: a key from the kind's list (`host_as` only). */
    @Json(name = "label") val label: String? = null,
    /** `invited` posts a private plan (Plans step 1); left out for a plan anyone nearby can see, as before. */
    @Json(name = "audience") val audience: String? = null,
    /** A private plan only: each person invited may invite one more. */
    @Json(name = "guests_can_invite") val guestsCanInvite: Boolean? = null,
    /** A private plan only: up to 30 people (from `GET /api/plans/invites/people`) invited as it is posted. */
    @Json(name = "invite_user_ids") val inviteUserIds: List<String>? = null,
    /** Plans for the holidays, H1: guests say how many adults and kids (a private plan, sent only while it's on). */
    @Json(name = "kids_welcome") val kidsWelcome: Boolean? = null,
    /** Plans for the holidays, H2: the bring list made on the form (A3, A9); none leaves it out. */
    @Json(name = "bring") val bring: PlanBringInput? = null,
    /** Plans for the holidays, H3: the occasion the plan was started from (a key); none for an ordinary plan. */
    @Json(name = "occasion") val occasion: String? = null,
    /** Business track B1: a business's deal (D3); none leaves it out. */
    @Json(name = "deal") val deal: PlanDealInput? = null,
    /** Business track B2: a spot's price in cents ($1 to $500); none is free. */
    @Json(name = "price_cents") val priceCents: Int? = null,
    /** Business track B5: guests can pay their bill here, and take tips (the server's start value when left out). */
    @Json(name = "pay_here") val payHere: Boolean? = null,
    @Json(name = "tips_on") val tipsOn: Boolean? = null,
)

/** `PATCH /api/plans/:id` body: only the fields being changed (nulls are left out). */
@Suppress("LongParameterList")
@JsonClass(generateAdapter = true)
data class UpdatePlanBody(
    @Json(name = "title") val title: String? = null,
    @Json(name = "about") val about: String? = null,
    @Json(name = "starts_at") val startsAt: String? = null,
    @Json(name = "ends_at") val endsAt: String? = null,
    @Json(name = "place") val place: PlanPlaceInput? = null,
    @Json(name = "spots") val spots: Int? = null,
    @Json(name = "auto_rules") val autoRules: List<String>? = null,
    @Json(name = "details") val details: PlanDetailsDto? = null,
    @Json(name = "guest_note") val guestNote: String? = null,
    /**
     * A new pattern from this date on (Plans step 2). Stopping a series sends `"repeat": null`, which this body can't
     * say (nulls are left out): `PlansRepository.stopRepeating` sends that one by itself.
     */
    @Json(name = "repeat") val repeat: PlanRepeatInput? = null,
    /** A business's plan: move it to another of the business's own locations (never a `place`). */
    @Json(name = "business_location_id") val businessLocationId: String? = null,
    @Json(name = "label") val label: String? = null,
    /**
     * A fresh fix with a move to a public place or online (Plans step 3), as the create body sends one: the server
     * checks the host is nearby by their home, else this. Never for a private plan.
     */
    @Json(name = "gps") val gps: PlanGpsInput? = null,
    /** Plans for the holidays, H1: guests say how many adults and kids (null leaves it as it is). */
    @Json(name = "kids_welcome") val kidsWelcome: Boolean? = null,
    /** Business track B1: a changed deal (`409 deal_locked` once someone is in); taking it off is `removeDeal`. */
    @Json(name = "deal") val deal: PlanDealInput? = null,
    /** Business track B2: a new price (`409 price_locked` once someone is in or paying); taking it off is a raw PATCH. */
    @Json(name = "price_cents") val priceCents: Int? = null,
    /** Business track B5: the bill here and tips, at any time. */
    @Json(name = "pay_here") val payHere: Boolean? = null,
    @Json(name = "tips_on") val tipsOn: Boolean? = null,
)

/** `POST /api/plans/:id/cancel` body. */
@JsonClass(generateAdapter = true)
data class CancelPlanBody(
    @Json(name = "note") val note: String? = null,
    /** `keep` cancels this date of a repeating plan only and posts the next one (Plans step 2); left out, a cancel stops the series. */
    @Json(name = "repeat") val repeat: String? = null,
)

/** `POST /api/plans/:id/requests` body. The kids fields are for playdates only. */
@JsonClass(generateAdapter = true)
data class AskToJoinBody(
    @Json(name = "party_size") val partySize: Int,
    @Json(name = "note") val note: String? = null,
    @Json(name = "kids_count") val kidsCount: Int? = null,
    @Json(name = "kids_age_bands") val kidsAgeBands: List<String>? = null,
    @Json(name = "stays_with_kids") val staysWithKids: Boolean? = null,
    /** A fresh fix when the person browses by location (homes and saved places count without it). */
    @Json(name = "gps") val gps: PlanGpsInput? = null,
    /** How the person found a business's plan, when the app knows (`business_page`). Left out otherwise. */
    @Json(name = "via") val via: String? = null,
)

/** `POST /api/plans/:id/report` body: reason is spam, harassment, inappropriate, misinformation, safety or other. */
@JsonClass(generateAdapter = true)
data class PlanReportBody(
    @Json(name = "reason") val reason: String,
    @Json(name = "details") val details: String? = null,
)

/** `request` in the ask reply. */
@JsonClass(generateAdapter = true)
data class PlanRequestRefDto(
    @Json(name = "id") val id: String? = null,
    @Json(name = "status") val status: String? = null,
    @Json(name = "waitlist_position") val waitlistPosition: Int? = null,
    /** Business track B2: a `paying` request's spot is held until then (10 minutes). */
    @Json(name = "hold_expires_at") val holdExpiresAt: String? = null,
)

/** `POST /api/plans/:id/requests` reply: the request and the plan as the asker now sees it. */
@JsonClass(generateAdapter = true)
data class AskToJoinResponse(
    @Json(name = "request") val request: PlanRequestRefDto? = null,
    @Json(name = "plan") val plan: PlanDto? = null,
    /** Business track B2: on a priced plan with room, the payment for the shipped payment sheet. */
    @Json(name = "payment") val payment: PlanPaymentDto? = null,
)

/** `RequestView.user`: what a host sees about someone who asked. Never an address. */
@JsonClass(generateAdapter = true)
data class PlanRequestUserDto(
    @Json(name = "new_to_pantopus") val newToPantopus: Boolean = false,
    @Json(name = "user_id") val userId: String? = null,
    @Json(name = "display_name") val displayName: String? = null,
    @Json(name = "avatar_url") val avatarUrl: String? = null,
    @Json(name = "verified_address") val verifiedAddress: Boolean = false,
    @Json(name = "distance_band") val distanceBand: String? = null,
    @Json(name = "plans_joined") val plansJoined: Int = 0,
    @Json(name = "mutual_connections") val mutualConnections: Int = 0,
    @Json(name = "hosted_before") val hostedBefore: Boolean = false,
)

/** `RequestView`: one request on H10. */
@JsonClass(generateAdapter = true)
data class PlanRequestViewDto(
    @Json(name = "id") val id: String,
    @Json(name = "user") val user: PlanRequestUserDto? = null,
    @Json(name = "party_size") val partySize: Int = 1,
    @Json(name = "note") val note: String? = null,
    @Json(name = "kids_count") val kidsCount: Int? = null,
    @Json(name = "kids_age_bands") val kidsAgeBands: List<String>? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    /** The host invited them (planInvites.js). */
    @Json(name = "invited") val invited: Boolean = false,
    /** They opened the host's email invitation to this address from an account it isn't verified for. */
    @Json(name = "opened_invite_to") val openedInviteTo: String? = null,
)

/** `GET /api/plans/:id/requests` (host only). */
@JsonClass(generateAdapter = true)
data class PlanRequestsResponse(
    @Json(name = "pending") val pending: List<PlanRequestViewDto> = emptyList(),
    @Json(name = "waitlisted") val waitlisted: List<PlanRequestViewDto> = emptyList(),
)

/** `POST …/accept` body: `confirm_shares_address` the first time a host accepts someone at home (H10). */
@JsonClass(generateAdapter = true)
data class AcceptRequestBody(
    @Json(name = "confirm_shares_address") val confirmSharesAddress: Boolean? = null,
)

/** `POST /api/plans/:id/still-coming` body. `false` leaves the plan. */
@JsonClass(generateAdapter = true)
data class StillComingBody(
    @Json(name = "coming") val coming: Boolean,
)

/** `POST /api/plans/:id/feedback` body. `answer` is `great`, `ok` or `not_right`. */
@JsonClass(generateAdapter = true)
data class PlanFeedbackBody(
    @Json(name = "answer") val answer: String,
    @Json(name = "note") val note: String? = null,
)

/** One upcoming game for the watch-party composer (H2). */
@JsonClass(generateAdapter = true)
data class PlanGameDto(
    @Json(name = "id") val id: String,
    @Json(name = "label") val label: String = "",
    @Json(name = "team") val team: String? = null,
    @Json(name = "starts_at") val startsAt: String? = null,
    @Json(name = "ends_at") val endsAt: String? = null,
    @Json(name = "source") val source: String? = null,
    @Json(name = "opponent") val opponent: String? = null,
    @Json(name = "home") val home: Boolean? = null,
    @Json(name = "preseason") val preseason: Boolean? = null,
    @Json(name = "followed") val followed: Boolean = false,
) {
    fun matchupLabel(): String = if (opponent.isNullOrBlank()) label else "$label ${if (home == false) "at" else "vs"} $opponent"

    fun isAvailable(at: Instant = Instant.now()): Boolean =
        runCatching {
            if (endsAt != null) {
                Instant.parse(endsAt).minusSeconds(GAME_MIN_LEFT_SECONDS).isAfter(at)
            } else {
                startsAt?.let { Instant.parse(it).isAfter(at) } ?: false
            }
        }.getOrDefault(false)

    fun reference(): PlanGameRefDto = PlanGameRefDto(label, startsAt, id, team, opponent, home, endsAt)
}

private const val GAME_MIN_LEFT_SECONDS = 30 * 60L

/** `GET /api/plans/games`. Empty is fine: the composer then offers only "Another game". */
@JsonClass(generateAdapter = true)
data class PlanGamesResponse(
    @Json(name = "games") val games: List<PlanGameDto> = emptyList(),
    @Json(name = "sports") val sports: PlansSportsDto? = null,
)

/** `center` of a public place. */
@JsonClass(generateAdapter = true)
data class PlanPlaceCenterDto(
    @Json(name = "lat") val lat: Double? = null,
    @Json(name = "lng") val lng: Double? = null,
)

/** One public place for H6 (the `GET /api/geo/places/nearby` row shape, filtered by the server). */
@JsonClass(generateAdapter = true)
data class PlanNearbyPlaceDto(
    @Json(name = "place_id") val placeId: String? = null,
    @Json(name = "name") val name: String? = null,
    @Json(name = "category") val category: String? = null,
    /** Every kind the place is ("court", "tennis"), the main one first. */
    @Json(name = "categories") val categories: List<String>? = null,
    @Json(name = "address") val address: String? = null,
    @Json(name = "full_address") val fullAddress: String? = null,
    @Json(name = "center") val center: PlanPlaceCenterDto? = null,
    @Json(name = "latitude") val latitude: Double? = null,
    @Json(name = "longitude") val longitude: Double? = null,
    @Json(name = "kind") val kind: String? = null,
    @Json(name = "distance_m") val distanceMeters: Double? = null,
    @Json(name = "distance_band") val distanceBand: String? = null,
    /** Whether it's open for the plan's time, when the picker sent one and the place has hours. */
    @Json(name = "hours") val hours: PlanPlaceHoursDto? = null,
    /** The line under the place: hours that need a look, or open hours and a fact or two. */
    @Json(name = "detail") val detail: PlanPlaceDetailDto? = null,
    /** "Suggest places": why it suits the plan. */
    @Json(name = "why") val why: String? = null,
)

/** A place's hours for the plan's time: [status] is `open`, `closes_early`, `opens_late` or `closed`. */
@JsonClass(generateAdapter = true)
data class PlanPlaceHoursDto(
    @Json(name = "status") val status: String? = null,
    /** "Open until 11 PM", "Closes at 2 PM", "Closed on Sunday". */
    @Json(name = "text") val text: String? = null,
) {
    val isClosed: Boolean get() = status == "closed"

    /** Open for part of the plan only. */
    val isPartial: Boolean get() = status == "closes_early" || status == "opens_late"
}

/** H6's ready-made line under a place ("Open until 11 PM · Outdoor seating"); [tone] is `neutral` or `warning`. */
@JsonClass(generateAdapter = true)
data class PlanPlaceDetailDto(
    @Json(name = "text") val text: String? = null,
    @Json(name = "tone") val tone: String? = null,
) {
    val isWarning: Boolean get() = tone == "warning"
}

/**
 * `POST /api/plans/places/suggest` body: H6's "Suggest places" for the draft. [ask] is what the host typed in the
 * search box ("big screens and food"), when they asked from there.
 */
@Suppress("LongParameterList")
@JsonClass(generateAdapter = true)
data class PlanPlaceSuggestBody(
    @Json(name = "latitude") val latitude: Double,
    @Json(name = "longitude") val longitude: Double,
    @Json(name = "kind") val kind: String,
    @Json(name = "title") val title: String? = null,
    @Json(name = "about") val about: String? = null,
    @Json(name = "starts_at") val startsAt: String? = null,
    @Json(name = "ends_at") val endsAt: String? = null,
    @Json(name = "spots") val spots: Int? = null,
    @Json(name = "details") val details: PlanDetailsDto? = null,
    @Json(name = "ask") val ask: String? = null,
)

/**
 * Up to three places for the plan, best first, each with `why`. [loading] (a 202) while the area's places are still
 * on their way; [source] is `ai` when Pantopus chose them, `rules` when the list's own order did.
 */
@JsonClass(generateAdapter = true)
data class PlanPlaceSuggestionsResponse(
    @Json(name = "picks") val picks: List<PlanNearbyPlaceDto> = emptyList(),
    @Json(name = "loading") val loading: Boolean = false,
    @Json(name = "source") val source: String? = null,
)

/**
 * `GET /api/plans/places/nearby`. [loading] is true (with a 202 and no places) the first time an area is asked for
 * while the source is slow; [attribution] is the credit the list must show ("© OpenStreetMap contributors").
 */
@JsonClass(generateAdapter = true)
data class PlanNearbyPlacesResponse(
    @Json(name = "places") val places: List<PlanNearbyPlaceDto> = emptyList(),
    @Json(name = "loading") val loading: Boolean = false,
    @Json(name = "attribution") val attribution: String? = null,
)

/**
 * `GET /api/public/plans/:id` (the web page's read): the public card, or for a playdate only
 * `{ kind: "playdate", city }`. The app reads it when `GET /api/plans/:id` says 404, to tell a playdate it may not
 * see yet (J9) from a plan that is gone.
 */
@JsonClass(generateAdapter = true)
data class PublicPlanDto(
    @Json(name = "id") val id: String? = null,
    @Json(name = "kind") val kind: String? = null,
    @Json(name = "city") val city: String? = null,
    @Json(name = "title") val title: String? = null,
)

/** `GET /api/feature-flags/:flagName`: whether a flag is on for the signed-in person. */
@JsonClass(generateAdapter = true)
data class FeatureFlagResponse(
    @Json(name = "flagName") val flagName: String? = null,
    @Json(name = "enabled") val enabled: Boolean = false,
)

/** One label a business may give a plan of this kind (`{ key, text }`): "clinic" reads "Clinic". */
@JsonClass(generateAdapter = true)
data class HostAsLabelDto(
    @Json(name = "key") val key: String,
    @Json(name = "text") val text: String = "",
)

/** A kind a business may post, with what it reads for a business ("Sports") and its labels. */
@JsonClass(generateAdapter = true)
data class HostAsKindDto(
    @Json(name = "kind") val kind: String,
    @Json(name = "name") val name: String? = null,
    @Json(name = "labels") val labels: List<HostAsLabelDto> = emptyList(),
)

/** One of the business's locations a plan can meet at. */
@JsonClass(generateAdapter = true)
data class HostAsLocationDto(
    @Json(name = "id") val id: String,
    @Json(name = "label") val label: String? = null,
    @Json(name = "is_primary") val isPrimary: Boolean = false,
    @Json(name = "address") val address: String? = null,
    @Json(name = "latitude") val latitude: Double? = null,
    @Json(name = "longitude") val longitude: Double? = null,
)

/** A business's limits on a plan: spots and how far ahead. */
@JsonClass(generateAdapter = true)
data class HostAsLimitsDto(
    @Json(name = "spots_max") val spotsMax: Int = 30,
    @Json(name = "days_ahead") val daysAhead: Int = 60,
)

/** A business this person may post a plan for. */
@JsonClass(generateAdapter = true)
data class HostAsBusinessDto(
    @Json(name = "user_id") val userId: String,
    @Json(name = "name") val name: String = "",
    @Json(name = "avatar_url") val avatarUrl: String? = null,
    @Json(name = "verified") val verified: Boolean = false,
    @Json(name = "kinds") val kinds: List<HostAsKindDto> = emptyList(),
    @Json(name = "locations") val locations: List<HostAsLocationDto> = emptyList(),
    @Json(name = "limits") val limits: HostAsLimitsDto = HostAsLimitsDto(),
    /** Business track: which rows the form draws (deal, price, pay here), while a track switch is on for it. */
    @Json(name = "can") val can: HostAsCanDto? = null,
    /** Business track B2: a price can be set now; false offers the payout setup in the price row. */
    @Json(name = "payouts_ready") val payoutsReady: Boolean = false,
)

/** `GET /api/businesses/:id/plans` (B6): the business's upcoming plans, soonest first and not folded. */
@JsonClass(generateAdapter = true)
data class BusinessPlansResponse(
    @Json(name = "items") val items: List<PlanDto> = emptyList(),
    @Json(name = "plans_hosted") val plansHosted: Int = 0,
)

/** `GET /api/plans/host-as`: empty for nearly everyone; "Host as" shows only when it isn't. */
@JsonClass(generateAdapter = true)
data class HostAsResponse(
    @Json(name = "businesses") val businesses: List<HostAsBusinessDto> = emptyList(),
)
