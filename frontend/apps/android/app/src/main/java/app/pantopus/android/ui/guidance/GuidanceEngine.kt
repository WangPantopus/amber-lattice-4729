package app.pantopus.android.ui.guidance

import app.pantopus.android.data.guidance.GuidanceState
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId

/** A tab's first screen, where its card and pointers show. [key] names its visit count on this phone. */
enum class GuidanceScreen(
    val key: String,
) {
    Place("place"),
    Today("today"),
    Mail("mail"),
    Pulse("pulse"),
    Moments("moments"),
    Plans("plans"),

    /** The conversation list (card 21). */
    Messages("messages"),
}

/** What Place's root shows (its landing), for cards 1, 2, 8 and 11. */
enum class GuidancePlaceShows {
    /** The address-first screen of an account with no address yet. */
    FirstRun,

    /** An address the person saved (not a Home). */
    SavedPlace,

    /** A Home the person can open. */
    Home,

    /** A Home whose claim is in review. */
    Claim,

    /** My homes, while every Home still waits on verification. */
    Homes,
}

/** Phone-local notes (`GuidanceState.flags`). */
object GuidanceFlags {
    /** A “Your home at a glance” row was opened (pointer 12 then has nothing to teach). */
    const val PLACE_ROW_OPENED = "place_row_opened"

    /** The person posted to Pulse from this phone (pointer 13, card 18). */
    const val POSTED = "posted"

    /** Place showed an address the person saved (the Tips list then has card 2). */
    const val SAVED_ADDRESS = "saved_address"

    /** A Moment the person posted went live (card 19). */
    const val MOMENT_POSTED = "moment_posted"

    /** The person posted a plan (card 20). */
    const val PLAN_POSTED = "plan_posted"

    /** An introduction (card 28's pattern) showed in this app version: at most one per app update. */
    fun introducedIn(version: Int): String = "introduced_$version"
}

/** What a tab's first screen reports while it is on top ([GuidanceSpot]). */
data class GuidanceSpotFacts(
    val screen: GuidanceScreen,
    /** The screen finished loading and nothing of its own (an arrival step, a lock) covers it. */
    val ready: Boolean = true,
    val place: GuidancePlaceShows? = null,
    /** Today's At home | Around you switch is on screen (card 3's third line). */
    val showsAroundYou: Boolean = false,
    /** Place: the Home on screen (cards 16, 17, 23, 26 and 27). */
    val homeId: String? = null,
    /** Place: when the address on screen was saved (card 25). */
    val savedAt: String? = null,
    /** Mail: Sent has something in it (card 22). */
    val sentAny: Boolean = false,
)

/** What the guidance knows about the Home on Place's root (cards 16, 17, 23, 26 and 27). */
data class GuidanceHomeFacts(
    val homeId: String,
    /** The address is verified (Your Place says “Verified home”). */
    val verified: Boolean = false,
    /** Your Place offers “Verify address” to this person. */
    val canVerify: Boolean = false,
    /** The person joined by a household invitation (they didn't set this Home up). */
    val invited: Boolean = false,
    /** When the person's place at this Home began (set up or joined). */
    val setUpAt: String? = null,
    /** The household's members, with the person; null until read. */
    val members: Int? = null,
)

/** Everything one decision reads. */
data class GuidanceInput(
    val state: GuidanceState,
    val spot: GuidanceSpotFacts,
    /** The pointers' controls that are on screen now. */
    val anchors: Set<GuidanceTarget>,
    /** A card other than a tab's own (8–28) already showed in this app open. */
    val otherCardThisOpen: Boolean,
    /** The Mailbox is on (else the Mail tab is the conversation list and has no card). */
    val mailbox: Boolean,
    /** Writing letters is on (`mail_extras`): card 4's pencil line. */
    val writesLetters: Boolean,
    /** A card already showed on this visit to the screen (no reminder, introduction or pointer right after it). */
    val shownThisVisit: Boolean = false,
    /** Place's Home, once read ([GuidanceSpotFacts.homeId]). */
    val home: GuidanceHomeFacts? = null,
    /** Messages: the person has a connection (card 21); null until read. */
    val connected: Boolean? = null,
    /** This app's version code (introductions: at most one per app update). */
    val appVersion: Int = 0,
    val now: Instant = Instant.now(),
    val zone: ZoneId = ZoneId.systemDefault(),
)

/**
 * When a card may show (spec §2), as a pure decision over [GuidanceInput]. The host adds what this can't see: nothing
 * else up (briefings, the phone's questions, the app lock, an opening link, a sheet, the keyboard), 0.5 s after the
 * screen settled, never while a finger is on the screen.
 */
@Suppress("TooManyFunctions")
object GuidanceEngine {
    /** The pointers start on the second app open after the account's first (spec §2). */
    private const val POINTERS_FROM_OPEN = 2

    /** Pointer 14 waits for the third Pulse visit; 11, 13 and 15 for the second visit to their screen. */
    private const val SECOND_VISIT = 2
    private const val THIRD_VISIT = 3

    /** Reminders: 24 two days after sign-up, 25 three days after saving, 26 and 27 seven days after the set-up. */
    private const val ADD_ADDRESS_AFTER_DAYS = 2L
    private const val SET_UP_HOME_AFTER_DAYS = 3L
    private const val HOME_REMINDERS_AFTER_DAYS = 7L

    /** At most one reminder a week across all four, each at most twice. */
    private const val REMINDER_GAP_DAYS = 7L
    private const val REMINDER_TIMES = 2

    /**
     * The card to show on the screen on top now, or null. The tab's own card first (limited only by one on screen);
     * then, one per app open: right after doing something, introducing something new, a reminder, a pointer.
     */
    fun next(input: GuidanceInput): GuidanceCard? {
        if (!eligible(input)) return null
        val newAccount = input.state.newAccount
        return tabCard(input).takeIf { newAccount } ?: otherCard(input, newAccount)
    }

    /** Cards 8–28: one per app open. An after-action card may follow a tab card on the same visit; the rest don't. */
    private fun otherCard(
        input: GuidanceInput,
        newAccount: Boolean,
    ): GuidanceCard? {
        if (input.otherCardThisOpen) return null
        return afterAction(input).takeIf { newAccount } ?: laterCard(input, newAccount)
    }

    /** Introducing something new (older accounts too), then a reminder, then a pointer. */
    private fun laterCard(
        input: GuidanceInput,
        newAccount: Boolean,
    ): GuidanceCard? =
        when {
            input.shownThisVisit -> null
            // Older accounts get only "Introducing" cards (spec §2).
            !newAccount -> introduction(input)
            else -> introduction(input) ?: reminder(input) ?: pointer(input)
        }

    /** The server's switch is on for this person's own account, and the screen on top has loaded. */
    private fun eligible(input: GuidanceInput): Boolean {
        val state = input.state
        return state.loaded && state.enabled && !state.business && input.spot.ready
    }

    /** One pointer per app open, from the second app open, in the order 8 → 15, only where its control shows. */
    private fun pointer(input: GuidanceInput): GuidancePointer? {
        val state = input.state
        if (state.opens < POINTERS_FROM_OPEN) return null
        return GuidanceCatalog.pointers.firstOrNull { pointer ->
            !state.hasSeen(pointer.id) && pointer.target in input.anchors && pointerApplies(pointer.id, input)
        }
    }

    /** The tab's own card (1–7) the first time the tab opens; limited only by one on screen. */
    private fun tabCard(input: GuidanceInput): GuidanceCentre? {
        val state = input.state
        val spot = input.spot
        val card =
            when (spot.screen) {
                GuidanceScreen.Place ->
                    when {
                        !state.hasSeen(GuidanceIds.WELCOME) -> GuidanceCatalog.welcome(joinedByInvitation = joinedByInvitation(spot))
                        spot.place == GuidancePlaceShows.SavedPlace -> GuidanceCatalog.placeSaved()
                        else -> null
                    }
                GuidanceScreen.Today -> GuidanceCatalog.tabToday(showsAroundYou = spot.showsAroundYou)
                GuidanceScreen.Mail -> GuidanceCatalog.tabMail(writesLetters = input.writesLetters).takeIf { input.mailbox }
                GuidanceScreen.Pulse -> GuidanceCatalog.tabPulse()
                GuidanceScreen.Moments -> GuidanceCatalog.tabMoments()
                GuidanceScreen.Plans -> GuidanceCatalog.tabPlans()
                GuidanceScreen.Messages -> null
            }
        return card?.takeUnless { state.hasSeen(it.id) }
    }

    /**
     * 16–23: on the named screen, right after the app's own success (which lands there), or on the next visit when the
     * action finished elsewhere. Each while unseen and what it describes is true.
     */
    private fun afterAction(input: GuidanceInput): GuidanceCentre? {
        val state = input.state
        val spot = input.spot
        val fresh = { id: String -> !state.hasSeen(id) }
        return when (spot.screen) {
            GuidanceScreen.Place -> {
                val home = input.home?.takeIf { spot.place == GuidancePlaceShows.Home && it.homeId == spot.homeId } ?: return null
                when {
                    !home.invited && fresh(GuidanceIds.DONE_HOME_SETUP) -> GuidanceCatalog.doneHomeSetup()
                    home.verified && fresh(GuidanceIds.DONE_VERIFIED) -> GuidanceCatalog.doneVerified(input.mailbox)
                    (home.members ?: 0) >= 2 && fresh(GuidanceIds.DONE_HOUSEHOLD) -> GuidanceCatalog.doneHousehold()
                    else -> null
                }
            }
            GuidanceScreen.Pulse -> GuidanceCatalog.doneFirstPost().takeIf { GuidanceFlags.POSTED in state.flags }
            GuidanceScreen.Moments -> GuidanceCatalog.doneFirstMoment().takeIf { GuidanceFlags.MOMENT_POSTED in state.flags }
            GuidanceScreen.Plans -> GuidanceCatalog.doneFirstPlan().takeIf { GuidanceFlags.PLAN_POSTED in state.flags }
            GuidanceScreen.Mail -> GuidanceCatalog.doneFirstLetter().takeIf { input.mailbox && spot.sentAny }
            GuidanceScreen.Messages -> GuidanceCatalog.doneConnected().takeIf { input.connected == true }
            GuidanceScreen.Today -> null
        }?.takeIf { fresh(it.id) }
    }

    /** 24–27 on Place: at most one a week, never on a day another centre card showed, each at most twice. */
    private fun reminder(input: GuidanceInput): GuidanceCentre? {
        val spot = input.spot
        if (spot.screen != GuidanceScreen.Place || !reminderDayOpen(input)) return null
        val state = input.state
        val left = { id: String -> (state.seen[id]?.times ?: 0) < REMINDER_TIMES }
        val home =
            input.home?.takeIf {
                spot.place == GuidancePlaceShows.Home &&
                    it.homeId == spot.homeId &&
                    !it.invited &&
                    olderThan(it.setUpAt, HOME_REMINDERS_AFTER_DAYS, input.now)
            }
        return when {
            spot.place == GuidancePlaceShows.FirstRun &&
                olderThan(state.createdAt, ADD_ADDRESS_AFTER_DAYS, input.now) &&
                left(GuidanceIds.NEXT_ADD_ADDRESS) -> GuidanceCatalog.nextAddAddress()
            spot.place == GuidancePlaceShows.SavedPlace &&
                olderThan(spot.savedAt, SET_UP_HOME_AFTER_DAYS, input.now) &&
                left(GuidanceIds.NEXT_SETUP_HOME) -> GuidanceCatalog.nextSetupHome()
            home != null && !home.verified && home.canVerify && left(GuidanceIds.NEXT_VERIFY) -> GuidanceCatalog.nextVerify()
            home != null && home.members == 1 && left(GuidanceIds.NEXT_INVITE) -> GuidanceCatalog.nextInvite()
            else -> null
        }
    }

    /** No reminder in the last week, and no centre card closed today (here or on another app). */
    private fun reminderDayOpen(input: GuidanceInput): Boolean {
        val state = input.state
        val lastReminder = GuidanceIds.reminders.mapNotNull { instant(state.seen[it]?.lastAt) }.maxOrNull()
        if (lastReminder != null && Duration.between(lastReminder, input.now).toDays() < REMINDER_GAP_DAYS) return false
        val today = input.now.atZone(input.zone).toLocalDate()
        if (state.lastCentreDay == today.toString()) return false
        return GuidanceIds.centreCards.none { id ->
            instant(state.seen[id]?.lastAt)?.atZone(input.zone)?.toLocalDate() == today
        }
    }

    /** 28's pattern: the first switched-on introduction not seen yet, at most one per app update (older accounts too). */
    private fun introduction(input: GuidanceInput): GuidanceCentre? {
        val state = input.state
        if (GuidanceFlags.introducedIn(input.appVersion) in state.flags) return null
        return GuidanceIntroductions.active.firstOrNull { !state.hasSeen(it) }?.let(GuidanceIntroductions::card)
    }

    private fun olderThan(
        iso: String?,
        days: Long,
        now: Instant,
    ): Boolean = instant(iso)?.let { Duration.between(it, now).toDays() >= days } == true

    /** A server time: an ISO instant, with a zone offset or a Z (Postgres writes `+00:00`). */
    private fun instant(iso: String?): Instant? =
        iso?.takeIf { it.isNotBlank() }?.let { raw ->
            runCatching { OffsetDateTime.parse(raw).toInstant() }.getOrNull() ?: runCatching { Instant.parse(raw) }.getOrNull()
        }

    /**
     * Someone who joined by a household invitation never typed an address: their first arrival on Place already shows
     * a Home they belong to, where everyone else first meets the address-first screen or the address they saved.
     */
    private fun joinedByInvitation(spot: GuidanceSpotFacts): Boolean =
        spot.place == GuidancePlaceShows.Home || spot.place == GuidancePlaceShows.Homes

    /** Each pointer's own condition (spec §5), beside its control being on screen. */
    private val pointerConditions: Map<String, (GuidanceInput) -> Boolean> =
        mapOf(
            GuidanceIds.TIP_ASK to { input ->
                input.spot.screen == GuidanceScreen.Place &&
                    input.spot.place in setOf(GuidancePlaceShows.Home, GuidancePlaceShows.Claim, GuidancePlaceShows.SavedPlace)
            },
            GuidanceIds.TIP_MESSAGES to { input -> input.spot.screen != GuidanceScreen.Mail },
            GuidanceIds.TIP_MENU to { _ -> true },
            GuidanceIds.TIP_VERIFY to { input ->
                on(input, GuidanceScreen.Place, SECOND_VISIT) && input.spot.place == GuidancePlaceShows.Home
            },
            GuidanceIds.TIP_PLACE_ROW to { input ->
                input.spot.screen == GuidanceScreen.Place && GuidanceFlags.PLACE_ROW_OPENED !in input.state.flags
            },
            GuidanceIds.TIP_PULSE_POST to { input ->
                on(input, GuidanceScreen.Pulse, SECOND_VISIT) && GuidanceFlags.POSTED !in input.state.flags
            },
            GuidanceIds.TIP_PULSE_AREA to { input -> on(input, GuidanceScreen.Pulse, THIRD_VISIT) },
            GuidanceIds.TIP_MAIL_ME_HOME to { input -> on(input, GuidanceScreen.Mail, SECOND_VISIT) },
        )

    /** [screen] is on top, on its [visit]th visit on this phone or later. */
    private fun on(
        input: GuidanceInput,
        screen: GuidanceScreen,
        visit: Int,
    ): Boolean = input.spot.screen == screen && input.state.visitsTo(screen.key) >= visit

    private fun pointerApplies(
        id: String,
        input: GuidanceInput,
    ): Boolean = pointerConditions[id]?.invoke(input) == true

    /** The tab cards on for this account, for the Tips list (spec §4): 1, 2 once an address is saved, 3–7 where on. */
    fun tipsCards(
        hasSavedAddress: Boolean,
        mailbox: Boolean,
        writesLetters: Boolean,
        moments: Boolean,
        plans: Boolean,
    ): List<GuidanceCentre> =
        listOfNotNull(
            GuidanceCatalog.welcome(),
            GuidanceCatalog.placeSaved().takeIf { hasSavedAddress },
            GuidanceCatalog.tabToday(showsAroundYou = false),
            GuidanceCatalog.tabMail(writesLetters).takeIf { mailbox },
            GuidanceCatalog.tabPulse(),
            GuidanceCatalog.tabMoments().takeIf { moments },
            GuidanceCatalog.tabPlans().takeIf { plans },
        )

    /** A card forced by the debug switch, on whatever screen is on top (its variant from that screen's facts). */
    fun forced(
        id: String,
        input: GuidanceInput,
    ): GuidanceCard? =
        when (id) {
            GuidanceIds.WELCOME -> GuidanceCatalog.welcome(joinedByInvitation(input.spot))
            GuidanceIds.TAB_TODAY -> GuidanceCatalog.tabToday(input.spot.showsAroundYou)
            GuidanceIds.TAB_MAIL -> GuidanceCatalog.tabMail(input.writesLetters)
            GuidanceIds.DONE_VERIFIED -> GuidanceCatalog.doneVerified(input.mailbox)
            else ->
                plainCards[id]?.invoke()
                    ?: GuidanceIntroductions.card(id)
                    ?: GuidanceCatalog.pointer(id)?.takeIf { it.target in input.anchors }
        }

    /** The centre cards without a variant, by id (the debug switch). */
    private val plainCards: Map<String, () -> GuidanceCentre> =
        mapOf(
            GuidanceIds.PLACE_SAVED to GuidanceCatalog::placeSaved,
            GuidanceIds.TAB_PULSE to GuidanceCatalog::tabPulse,
            GuidanceIds.TAB_MOMENTS to GuidanceCatalog::tabMoments,
            GuidanceIds.TAB_PLANS to GuidanceCatalog::tabPlans,
            GuidanceIds.DONE_HOME_SETUP to GuidanceCatalog::doneHomeSetup,
            GuidanceIds.DONE_FIRST_POST to GuidanceCatalog::doneFirstPost,
            GuidanceIds.DONE_FIRST_MOMENT to GuidanceCatalog::doneFirstMoment,
            GuidanceIds.DONE_FIRST_PLAN to GuidanceCatalog::doneFirstPlan,
            GuidanceIds.DONE_CONNECTED to GuidanceCatalog::doneConnected,
            GuidanceIds.DONE_FIRST_LETTER to GuidanceCatalog::doneFirstLetter,
            GuidanceIds.DONE_HOUSEHOLD to GuidanceCatalog::doneHousehold,
            GuidanceIds.NEXT_ADD_ADDRESS to GuidanceCatalog::nextAddAddress,
            GuidanceIds.NEXT_SETUP_HOME to GuidanceCatalog::nextSetupHome,
            GuidanceIds.NEXT_VERIFY to GuidanceCatalog::nextVerify,
            GuidanceIds.NEXT_INVITE to GuidanceCatalog::nextInvite,
        )
}

/** Introducing something new (card 28's pattern): older accounts too. */
object GuidanceIntroductions {
    /** The introductions switched on. Ships empty: the founder picks the first one later (spec §2). */
    val active: List<String> = emptyList()

    fun card(id: String): GuidanceCentre? =
        when (id) {
            GuidanceIds.NEW_PLANS -> GuidanceCatalog.newPlans()
            else -> null
        }
}
