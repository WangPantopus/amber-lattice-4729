package app.pantopus.android.ui.guidance

/**
 * The guidance cards (founder approval 2026-11-16; spec `~/pantopus-guidance-cards/SPEC.md` §5): ids and words. The
 * words are the spec's exactly, curly quotes (“ ”) and straight apostrophes included, word for word with iPhone and
 * the web. Never "neighbor" or "neighborhood" in a card. Card 1's first two lines are the founder's own words.
 */
object GuidanceIds {
    const val WELCOME = "welcome"
    const val PLACE_SAVED = "place_saved"
    const val TAB_TODAY = "tab_today"
    const val TAB_MAIL = "tab_mail"
    const val TAB_PULSE = "tab_pulse"
    const val TAB_MOMENTS = "tab_moments"
    const val TAB_PLANS = "tab_plans"

    const val TIP_ASK = "tip_ask"
    const val TIP_MESSAGES = "tip_messages"
    const val TIP_MENU = "tip_menu"
    const val TIP_VERIFY = "tip_verify"
    const val TIP_PLACE_ROW = "tip_place_row"
    const val TIP_PULSE_POST = "tip_pulse_post"
    const val TIP_PULSE_AREA = "tip_pulse_area"
    const val TIP_MAIL_ME_HOME = "tip_mail_me_home"

    /** The tab cards (1–7): each shows the first time its tab opens, limited only by one on screen. */
    val tabCards = setOf(WELCOME, PLACE_SAVED, TAB_TODAY, TAB_MAIL, TAB_PULSE, TAB_MOMENTS, TAB_PLANS)
}

/** One icon row of a centre card. */
data class GuidanceLine(
    val icon: GuidanceIcon,
    val text: String,
)

/** A card the guidance can show: a centre card or a pointer. */
sealed interface GuidanceCard {
    val id: String
}

/** The centre card: a title with an X, up to three lines, one full-width button; the screen behind dimmed. */
data class GuidanceCentre(
    override val id: String,
    val title: String,
    val lines: List<GuidanceLine>,
    val button: String,
) : GuidanceCard

/** The control a pointer rings (spec §5, cards 8–15). */
enum class GuidanceTarget {
    /** Place's purple sparkle (Ask Pantopus). */
    Ask,

    /** The chat button at the top right of a tab's first screen. */
    Messages,

    /** The ☰ button at the top left of a tab's first screen. */
    Menu,

    /** Place's “Verify address”. */
    Verify,

    /** The + on the first “Your home at a glance” row. */
    PlaceRow,

    /** Pulse's pencil button. */
    PulsePost,

    /** Pulse's “Near …” row. */
    PulseArea,

    /** Mail's “Me” and “Home” chips (one ring around both). */
    MailMeHome,
}

/** The pointer: a ring around [target] and a blue bubble with a title, one sentence and “Got it”. */
data class GuidancePointer(
    override val id: String,
    val target: GuidanceTarget,
    val title: String,
    val sentence: String,
) : GuidanceCard

/** The cards' words, with the variants spec §5 names. */
object GuidanceCatalog {
    private const val GOT_IT = "Got it"

    /** 1. Place, the first time a new account reaches it. Without the second line for someone who joined by invitation. */
    fun welcome(joinedByInvitation: Boolean = false): GuidanceCentre =
        GuidanceCentre(
            id = GuidanceIds.WELCOME,
            title = "Welcome to Pantopus",
            lines =
                listOfNotNull(
                    GuidanceLine(GuidanceIcon.House, "Pantopus starts with your home."),
                    GuidanceLine(GuidanceIcon.Lock, "Only you see the address you type, others see your first name, never your address.")
                        .takeUnless { joinedByInvitation },
                    GuidanceLine(
                        GuidanceIcon.PanelBottom,
                        "The tabs at the bottom open each part of the app. The menu at the top left has everything else.",
                    ),
                ),
            button = "Get started",
        )

    /** 2. Place, the first time it shows an address the person has just saved. */
    fun placeSaved(): GuidanceCentre =
        GuidanceCentre(
            id = GuidanceIds.PLACE_SAVED,
            title = "This is your Place",
            lines =
                listOf(
                    GuidanceLine(
                        GuidanceIcon.ListIcon,
                        "This page shows what is public about your address: weather, risks, pickup days and more.",
                    ),
                    GuidanceLine(GuidanceIcon.Lock, "It is saved privately. Only you can see it."),
                    GuidanceLine(
                        GuidanceIcon.House,
                        "Live here? Tap “Set up this Home” to get pickup and radon reminders and to share tasks with your household.",
                    ),
                ),
            button = GOT_IT,
        )

    /** 3. Today, first open. The third line only while the At home | Around you switch is on screen. */
    fun tabToday(showsAroundYou: Boolean): GuidanceCentre =
        GuidanceCentre(
            id = GuidanceIds.TAB_TODAY,
            title = "Today",
            lines =
                listOfNotNull(
                    GuidanceLine(GuidanceIcon.Sun, "Today shows the weather and daylight where you live, hour by hour."),
                    GuidanceLine(GuidanceIcon.CircleCheck, "It also lists what needs you today, like pickup day or a task that is due."),
                    GuidanceLine(
                        GuidanceIcon.Newspaper,
                        "Switch to “Around you” for local headlines and events.",
                    ).takeIf { showsAroundYou },
                ),
            button = GOT_IT,
        )

    /** 4. Mail, first open (after the identity check). The pencil line only while writing letters is on (`mail_extras`). */
    fun tabMail(writesLetters: Boolean): GuidanceCentre =
        GuidanceCentre(
            id = GuidanceIds.TAB_MAIL,
            title = "Mail",
            lines =
                listOfNotNull(
                    GuidanceLine(
                        GuidanceIcon.Mail,
                        "This is your mailbox in Pantopus. Letters and cards sent to you arrive once a day, in the morning.",
                    ),
                    GuidanceLine(
                        GuidanceIcon.Inbox,
                        "“Counter” holds mail that needs you to do something, like pay a bill. “Vault” keeps mail you want to save.",
                    ),
                    GuidanceLine(GuidanceIcon.Pencil, "Tap the pencil to write a letter or send a card.").takeIf { writesLetters },
                ),
            button = GOT_IT,
        )

    /** 5. Pulse, first open. */
    fun tabPulse(): GuidanceCentre =
        GuidanceCentre(
            id = GuidanceIds.TAB_PULSE,
            title = "Pulse",
            lines =
                listOf(
                    GuidanceLine(
                        GuidanceIcon.Activity,
                        "Pulse is where people near you post: questions, recommendations, events and more.",
                    ),
                    GuidanceLine(GuidanceIcon.MapIcon, "“List” shows the posts. “Map” shows the same posts on a map."),
                    GuidanceLine(
                        GuidanceIcon.Users,
                        "“Nearby” is everyone near you. “Connections” is only the people you are connected with.",
                    ),
                ),
            button = GOT_IT,
        )

    /** 6. Moments, first open, where Moments is on. */
    fun tabMoments(): GuidanceCentre =
        GuidanceCentre(
            id = GuidanceIds.TAB_MOMENTS,
            title = "Moments",
            lines =
                listOf(
                    GuidanceLine(
                        GuidanceIcon.CircleDashed,
                        "A Moment is a photo, a short video or a few words about what is happening at a place right now.",
                    ),
                    GuidanceLine(
                        GuidanceIcon.MapPin,
                        "Each one sits on the map where it was posted, and goes away by itself when its time is up.",
                    ),
                    GuidanceLine(GuidanceIcon.Plus, "Tap + to share one."),
                ),
            button = GOT_IT,
        )

    /** 7. Plans, first open, where Plans is on. */
    fun tabPlans(): GuidanceCentre =
        GuidanceCentre(
            id = GuidanceIds.TAB_PLANS,
            title = "Plans",
            lines =
                listOf(
                    GuidanceLine(GuidanceIcon.Calendar, "Plans are get-togethers near you: a walk, a game night, a dinner."),
                    GuidanceLine(GuidanceIcon.CircleCheck, "Tap a plan to see the details and say you are going."),
                    GuidanceLine(
                        GuidanceIcon.Link,
                        "To host one, slide the list down and tap “Host”. Then share its link to invite people.",
                    ),
                ),
            button = GOT_IT,
        )

    /** Pointers 8–15, in their order of preference. */
    val pointers: List<GuidancePointer> =
        listOf(
            GuidancePointer(
                GuidanceIds.TIP_ASK,
                GuidanceTarget.Ask,
                "Ask Pantopus",
                "Ask a question about your home, or about how to do something in the app.",
            ),
            GuidancePointer(GuidanceIds.TIP_MESSAGES, GuidanceTarget.Messages, "Messages", "Your chats with people and groups open here."),
            GuidancePointer(GuidanceIds.TIP_MENU, GuidanceTarget.Menu, "Menu", "Your homes, your profile, settings and help are here."),
            GuidancePointer(
                GuidanceIds.TIP_VERIFY,
                GuidanceTarget.Verify,
                "Verify your address",
                "Prove you live here. Then you get a Verified badge and can send a message to homes near you.",
            ),
            GuidancePointer(GuidanceIds.TIP_PLACE_ROW, GuidanceTarget.PlaceRow, "See more", "Tap + to open a row and read the details."),
            GuidancePointer(
                GuidanceIds.TIP_PULSE_POST,
                GuidanceTarget.PulsePost,
                "Post to Pulse",
                "Ask a question, recommend a place or share an event with people near you.",
            ),
            GuidancePointer(
                GuidanceIds.TIP_PULSE_AREA,
                GuidanceTarget.PulseArea,
                "Your area",
                "Tap here to change how far around you Pulse looks.",
            ),
            GuidancePointer(
                GuidanceIds.TIP_MAIL_ME_HOME,
                GuidanceTarget.MailMeHome,
                "Me and Home",
                "“Me” is mail for you. “Home” is mail for everyone at your address.",
            ),
        )

    fun pointer(id: String): GuidancePointer? = pointers.firstOrNull { it.id == id }
}
