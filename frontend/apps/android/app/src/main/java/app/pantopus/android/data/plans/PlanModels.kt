package app.pantopus.android.data.plans

import app.pantopus.android.data.api.models.plans.PlanDto
import app.pantopus.android.data.api.models.plans.PlanPinDto

/**
 * The kinds of plan (decision D3, study groups from 2026-10-17, and the four of Plans step 4 from 2026-11-14), in the
 * order the chips and the empty state show them. [wire] is the API value, [label] the name people see. A kind this
 * app doesn't know reads as null ([from]), and its plan is left out wherever plans are listed.
 */
enum class PlanKind(
    val wire: String,
    val label: String,
) {
    WATCH_PARTY("watch_party", "Watch party"),
    PLAYDATE("playdate", "Playdate"),
    PICKUP_GAME("pickup_game", "Pickup game"),
    WALK_COFFEE("walk_coffee", "Walk & coffee"),
    STUDY_GROUP("study_group", "Study group"),

    // Plans step 4, while `plans_kinds` is on for posting new ones; a plan of these kinds already posted always reads.
    FOOD_DRINKS("food_drinks", "Food & drinks"),
    GAME_NIGHT("game_night", "Game night"),
    OUTDOORS("outdoors", "Outdoors"),
    SOMETHING_ELSE("something_else", "Something else"),
    ;

    /**
     * The noun used in sentences: "Host your own watch party", "How was Sunday's pickup game?". The newer kinds use
     * the server's word for them when no detail says more ("get-together", "outing", "plan").
     */
    val noun: String
        get() =
            when (this) {
                FOOD_DRINKS -> "get-together"
                OUTDOORS -> "outing"
                SOMETHING_ELSE -> "plan"
                else -> label.lowercase()
            }

    /** One of the four kinds of Plans step 4 (`plans_kinds`); a business never hosts these. */
    val isNew: Boolean get() = this in NEW

    /** It can meet online (Plans step 3): not a playdate, a pickup game or an outdoor plan, which meet in person. */
    val canBeOnline: Boolean get() = this != PLAYDATE && this != PICKUP_GAME && this != OUTDOORS

    /**
     * Its room counts people (Plans for the holidays, "Room for"): not a playdate, which counts families, or a pickup
     * game, which counts the players it needs.
     */
    val countsPeople: Boolean get() = this != PLAYDATE && this != PICKUP_GAME

    companion object {
        fun from(wire: String?): PlanKind? = entries.firstOrNull { it.wire == wire }

        /** The four newer kinds (Plans step 4). */
        val NEW: List<PlanKind> = listOf(FOOD_DRINKS, GAME_NIGHT, OUTDOORS, SOMETHING_ELSE)

        /**
         * The type picker's order with the newer kinds (board Type): the grid, then "Something else" as a wide row.
         * Without them it keeps the five in [entries] order, as it always was.
         */
        val PICKER_ORDER: List<PlanKind> =
            listOf(WATCH_PARTY, PICKUP_GAME, WALK_COFFEE, STUDY_GROUP, FOOD_DRINKS, GAME_NIGHT, OUTDOORS, PLAYDATE, SOMETHING_ELSE)
    }
}

/** `PlanRequest.status`. */
enum class PlanRequestStatus(
    val wire: String,
) {
    PENDING("pending"),
    WAITLISTED("waitlisted"),
    ACCEPTED("accepted"),
    DECLINED("declined"),
    WITHDRAWN("withdrawn"),
    LEFT("left"),
    REMOVED("removed"),
    EXPIRED("expired"),

    /** Business track B2: the spot is held for 10 minutes while the guest pays. */
    PAYING("paying"),
    ;

    companion object {
        fun from(wire: String?): PlanRequestStatus? = entries.firstOrNull { it.wire == wire }
    }
}

/** `state` of a plan. */
enum class PlanState(
    val wire: String,
) {
    UPCOMING("upcoming"),
    LIVE("live"),
    ENDED("ended"),
    CANCELLED("cancelled"),
    ;

    companion object {
        fun from(wire: String?): PlanState = entries.firstOrNull { it.wire == wire } ?: UPCOMING
    }
}

/** The map's time window (`window` on the pins and list routes). */
enum class PlanWindow(
    val wire: String,
    val label: String,
) {
    NOW("now", "Happening now"),
    TODAY("today", "Today"),
    WEEK("week", "This week"),
    WEEKEND("weekend", "This weekend"),
}

/**
 * The list's All / People / Businesses filter (Plans with businesses, board G2). Shown only when the list says a
 * business has a plan in the area. It filters the list and the pins on the phone, as the kind chips do, so the
 * requests stay as they were (as on iOS); [wire] is how the choice is remembered.
 */
enum class PlanHostFilter(
    val wire: String,
    val label: String,
) {
    ALL("all", "All"),

    /** "People" since November 14 (no "neighbor" in Plans); the remembered value stays `neighbors`. */
    NEIGHBORS("neighbors", "People"),
    BUSINESSES("businesses", "Businesses"),
    ;

    /** Whether a plan (or pin) a business hosts, or not, passes this filter. */
    fun passes(business: Boolean): Boolean =
        when (this) {
            ALL -> true
            NEIGHBORS -> !business
            BUSINESSES -> business
        }

    companion object {
        fun from(wire: String?): PlanHostFilter = entries.firstOrNull { it.wire == wire } ?: ALL
    }
}

/** Where the viewer stands with a plan, from the card's `viewer` block (or a pin's two viewer fields). */
enum class PlanViewerStanding {
    NONE,
    HOSTING,
    REQUESTED,
    WAITLISTED,
    IN,
    DECLINED,
    REMOVED,
    LEFT,

    /** Business track B2: paying for a held spot (Join reopens the payment). */
    PAYING,
    ;

    companion object {
        fun of(
            role: String?,
            requestStatus: String?,
        ): PlanViewerStanding =
            when {
                role == "host" -> HOSTING
                else ->
                    when (PlanRequestStatus.from(requestStatus)) {
                        PlanRequestStatus.ACCEPTED -> IN
                        PlanRequestStatus.PENDING -> REQUESTED
                        PlanRequestStatus.WAITLISTED -> WAITLISTED
                        PlanRequestStatus.DECLINED, PlanRequestStatus.EXPIRED -> DECLINED
                        PlanRequestStatus.REMOVED -> REMOVED
                        PlanRequestStatus.LEFT, PlanRequestStatus.WITHDRAWN -> LEFT
                        PlanRequestStatus.PAYING -> PAYING
                        null -> NONE
                    }
            }
    }
}

val PlanDto.planKind: PlanKind? get() = PlanKind.from(kind)
val PlanDto.planState: PlanState get() = PlanState.from(state)
val PlanDto.standing: PlanViewerStanding
    get() = PlanViewerStanding.of(viewer?.role, viewer?.requestStatus ?: myRequest?.status)

/**
 * True when the private part (place, note, people) came with this copy: the viewer hosts it or is in. A business's
 * plan carries its place for everyone (it is the business's own address), so only the people count there; so does a
 * private plan's place shown to the person invited before they answer.
 */
val PlanDto.hasPrivatePart: Boolean get() = (place != null && business == null && !placeShownToInvitee) || people != null

/** `audience` values (Plans step 1). An older server sends none, which is a plan anyone nearby can see. */
object PlanAudience {
    const val NEARBY = "nearby"
    const val INVITED = "invited"
}

/** A private plan (Plans step 1): only its host, the people invited and the people in see it. */
val PlanDto.isPrivate: Boolean get() = audience == PlanAudience.INVITED

/** The holidays' find a date: the host is still picking from the times offered (extras section 2). */
val PlanDto.isPicking: Boolean get() = dates?.state == "picking"

/** A private plan's pin. */
val PlanPinDto.isPrivate: Boolean get() = audience == PlanAudience.INVITED

/**
 * A private plan's place as the person invited reads it before answering (at a public place the server sends it to
 * them): not the private part of someone who is in.
 */
val PlanDto.placeShownToInvitee: Boolean
    get() = isPrivate && place != null && standing != PlanViewerStanding.HOSTING && standing != PlanViewerStanding.IN

/** A business hosts this plan (Plans with businesses): the server sends `business` only then. */
val PlanDto.isBusiness: Boolean get() = business != null

/** A business's pin. */
val PlanPinDto.isBusiness: Boolean get() = business != null

/** The viewer's invitation, not answered yet. */
val PlanDto.invitedNoAnswer: Boolean get() = standing == PlanViewerStanding.NONE && myInvite?.status == PlanInviteStatus.PENDING

/**
 * The viewer said Maybe to their invitation (Plans for the holidays, H1; sent only with `guests=1`). Saying Maybe after
 * "I'm in" leaves the plan, so the request may read left or withdrawn: only being in, asking, waiting or hosting
 * outranks it.
 */
val PlanDto.saidMaybe: Boolean
    get() = myInvite?.status == PlanInviteStatus.MAYBE && standing !in OUTRANKS_MAYBE

/** Standings that outrank an invitation's Maybe. */
private val OUTRANKS_MAYBE =
    setOf(PlanViewerStanding.HOSTING, PlanViewerStanding.IN, PlanViewerStanding.REQUESTED, PlanViewerStanding.WAITLISTED)

/** A private plan whose guests say how many adults and kids (Plans for the holidays, H1). */
val PlanDto.takesKids: Boolean get() = kidsWelcome == true && !isPlaydate

/** `my_invite.status` values. */
object PlanInviteStatus {
    const val PENDING = "pending"
    const val MAYBE = "maybe"
}

/**
 * What a plan's tag reads in place of its kind's name: the occasion it was started from (Plans for the holidays, H3,
 * "Thanksgiving dinner"), or what a business calls its plan ("Clinic"); null reads the kind's name.
 */
val PlanDto.tagLabel: String?
    get() = occasion?.text?.takeIf(String::isNotBlank) ?: labelText.takeIf { isBusiness }

val PlanDto.isPlaydate: Boolean get() = planKind == PlanKind.PLAYDATE
val PlanDto.isAtHome: Boolean get() = placeKind == "home"
val PlanDto.hostApproves: Boolean get() = howPeopleGetIn != "automatic"

val PlanPinDto.planKind: PlanKind? get() = PlanKind.from(kind)
val PlanPinDto.planState: PlanState get() = PlanState.from(state)
val PlanPinDto.standing: PlanViewerStanding get() = PlanViewerStanding.of(viewerRole, viewerRequestStatus)

/** The automatic rules a host can pick (brief section 4). */
object PlanAutoRule {
    const val VERIFIED = "verified"
    const val HOSTED_BEFORE = "hosted_before"
    const val ANYONE_NEARBY = "anyone_nearby"

    /** A business's plan only: anyone gets in right away. */
    const val OPEN = "open"
}

/** Why someone can't ask (`viewer.cannot_ask_reason`). */
object PlanCannotAsk {
    const val NEEDS_VERIFIED_ADDRESS = "needs_verified_address"
    const val TOO_FAR = "too_far"
    const val NEEDS_LOCATION = "needs_location"
    const val FULL_USE_WAITLIST = "full_use_waitlist"
    const val DECLINED = "declined"
    const val REMOVED = "removed"
    const val BLOCKED = "blocked"
    const val TOO_MANY_REQUESTS = "too_many_requests"
    const val ENDED = "ended"
}

/** How a study group studies (`details.study_style`), with the words the chips and the plan page use. */
enum class PlanStudyStyle(
    val wire: String,
    val label: String,
) {
    QUIET("quiet", "Quiet study"),
    TOGETHER("together", "Work through it together"),
    ;

    companion object {
        /** Quiet study unless the plan says otherwise, as the server defaults it. */
        fun from(wire: String?): PlanStudyStyle = entries.firstOrNull { it.wire == wire } ?: QUIET
    }
}

/** Kids' age bands for playdates (wire value to label). [low] and [high] are the ages the band covers. */
enum class KidsAgeBand(
    val wire: String,
    val label: String,
    val low: Int,
    val high: Int,
) {
    UNDER_2("under_2", "Under 2", 0, 1),
    AGE_2_3("2_3", "2–3", 2, 3),
    AGE_4_5("4_5", "4–5", 4, 5),
    AGE_6_8("6_8", "6–8", 6, 8),
    AGE_9_12("9_12", "9–12", 9, 12),
    ;

    companion object {
        fun from(wire: String?): KidsAgeBand? = entries.firstOrNull { it.wire == wire }

        /** "ages 2–5" from a set of bands (the lowest age to the highest); "under 4" when they start under 2 (as iOS says it). */
        fun rangeLabel(wires: List<String>?): String? {
            val bands = wires.orEmpty().mapNotNull(::from)
            if (bands.isEmpty()) return null
            val low = bands.minOf { it.low }
            val high = bands.maxOf { it.high }
            // Non-breaking spaces: "ages 2–5" never splits across lines.
            return if (low == 0) "under\u00A0${high + 1}" else "ages\u00A0$low–$high"
        }
    }
}
