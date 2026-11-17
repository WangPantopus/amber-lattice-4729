package app.pantopus.android.ui.guidance

import app.pantopus.android.data.guidance.GuidanceState

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

    /** The person posted to Pulse from this phone (pointer 13). */
    const val POSTED = "posted"

    /** Place showed an address the person saved (the Tips list then has card 2). */
    const val SAVED_ADDRESS = "saved_address"
}

/** What a tab's first screen reports while it is on top ([GuidanceSpot]). */
data class GuidanceSpotFacts(
    val screen: GuidanceScreen,
    /** The screen finished loading and nothing of its own (an arrival step, a lock) covers it. */
    val ready: Boolean = true,
    val place: GuidancePlaceShows? = null,
    /** Today's At home | Around you switch is on screen (card 3's third line). */
    val showsAroundYou: Boolean = false,
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
)

/**
 * When a card may show (spec §2), as a pure decision over [GuidanceInput]. The host adds what this can't see: nothing
 * else up (briefings, the phone's questions, the app lock, an opening link, a sheet, the keyboard), 0.5 s after the
 * screen settled, never while a finger is on the screen.
 */
object GuidanceEngine {
    /** The pointers start on the second app open after the account's first (spec §2). */
    private const val POINTERS_FROM_OPEN = 2

    /** Pointer 14 waits for the third Pulse visit; 11, 13 and 15 for the second visit to their screen. */
    private const val SECOND_VISIT = 2
    private const val THIRD_VISIT = 3

    /** The card to show on the screen on top now, or null. */
    fun next(input: GuidanceInput): GuidanceCard? {
        // Older accounts get only "Introducing" cards, and none is switched on yet (spec §2: the active list is empty).
        if (!eligible(input) || !input.state.newAccount) return null
        return tabCard(input) ?: pointer(input)
    }

    /** The server's switch is on for this person's own account, and the screen on top has loaded. */
    private fun eligible(input: GuidanceInput): Boolean {
        val state = input.state
        return state.loaded && state.enabled && !state.business && input.spot.ready
    }

    /** One pointer per app open, from the second app open, in the order 8 → 15, only where its control shows. */
    private fun pointer(input: GuidanceInput): GuidancePointer? {
        val state = input.state
        if (input.otherCardThisOpen || state.opens < POINTERS_FROM_OPEN) return null
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
            }
        return card?.takeUnless { state.hasSeen(it.id) }
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
            GuidanceIds.PLACE_SAVED -> GuidanceCatalog.placeSaved()
            GuidanceIds.TAB_TODAY -> GuidanceCatalog.tabToday(input.spot.showsAroundYou)
            GuidanceIds.TAB_MAIL -> GuidanceCatalog.tabMail(input.writesLetters)
            GuidanceIds.TAB_PULSE -> GuidanceCatalog.tabPulse()
            GuidanceIds.TAB_MOMENTS -> GuidanceCatalog.tabMoments()
            GuidanceIds.TAB_PLANS -> GuidanceCatalog.tabPlans()
            else -> GuidanceCatalog.pointer(id)?.takeIf { it.target in input.anchors }
        }
}
