//
//  GuidanceCards.swift
//  Pantopus
//
//  The guidance cards that explain the app to someone who just signed up
//  (founder approval 2026-11-16, design draft 2; GUIDE spec §5). Two shapes:
//  a centre card that explains a whole screen, and a pointer that explains one
//  control where it is. The ids, the words and the test ids are the same on
//  iPhone, Android and the web. Card 1's first two lines are the founder's own
//  words: never change their wording or punctuation.
//

import SwiftUI

/// A card's id, the same on every app and on the server (`User.guidance_seen`).
enum GuidanceCardID: String, CaseIterable {
    // First open of each screen (centre cards).
    case welcome
    case placeSaved = "place_saved"
    case tabToday = "tab_today"
    case tabMail = "tab_mail"
    case tabPulse = "tab_pulse"
    case tabMoments = "tab_moments"
    case tabPlans = "tab_plans"
    // Pointers at single controls, in their order of preference.
    case tipAsk = "tip_ask"
    case tipMessages = "tip_messages"
    case tipMenu = "tip_menu"
    case tipVerify = "tip_verify"
    case tipPlaceRow = "tip_place_row"
    case tipPulsePost = "tip_pulse_post"
    case tipPulseArea = "tip_pulse_area"
    case tipMailMeHome = "tip_mail_me_home"
    // Right after doing something for the first time (centre cards).
    case doneHomeSetup = "done_home_setup"
    case doneVerified = "done_verified"
    case doneFirstPost = "done_first_post"
    case doneFirstMoment = "done_first_moment"
    case doneFirstPlan = "done_first_plan"
    case doneConnected = "done_connected"
    case doneFirstLetter = "done_first_letter"
    case doneHousehold = "done_household"
    // Reminders of the next step (centre cards on Place).
    case nextAddAddress = "next_add_address"
    case nextSetupHome = "next_setup_home"
    case nextVerify = "next_verify"
    case nextInvite = "next_invite"
    /// Introducing something new (older accounts too).
    case newPlans = "new_plans"

    /// A tab's own card (cards 1 to 7): it shows the first time its tab opens,
    /// limited only by one card on screen at a time.
    var isTabCard: Bool {
        GuidanceCardID.tabCards.contains(self)
    }

    static let tabCards: [GuidanceCardID] = [.welcome, .placeSaved, .tabToday, .tabMail, .tabPulse, .tabMoments, .tabPlans]
    static let pointers: [GuidanceCardID] = [
        .tipAsk, .tipMessages, .tipMenu, .tipVerify, .tipPlaceRow, .tipPulsePost, .tipPulseArea, .tipMailMeHome
    ]
    static let reminders: [GuidanceCardID] = [.nextAddAddress, .nextSetupHome, .nextVerify, .nextInvite]
    static let introductions: [GuidanceCardID] = [.newPlans]

    /// A centre card (everything but the pointers).
    var isCentre: Bool {
        !GuidanceCardID.pointers.contains(self)
    }

    var isIntroduction: Bool {
        GuidanceCardID.introductions.contains(self)
    }

    /// The screen a centre card that isn't a tab's own shows on; nil for an introduction (whichever tab is open).
    var centreScreen: GuidanceScreen? {
        switch self {
        case .doneHomeSetup, .doneVerified, .doneHousehold, .nextAddAddress, .nextSetupHome, .nextVerify, .nextInvite: .place
        case .doneFirstPost: .pulse
        case .doneFirstMoment: .moments
        case .doneFirstPlan: .plans
        case .doneConnected: .messages
        case .doneFirstLetter: .mail
        default: nil
        }
    }
}

/// The screens a card belongs to: each tab's first screen.
enum GuidanceScreen: String {
    case place
    case today
    case mail
    case pulse
    case moments
    case plans
    /// Messages' chat list: no card of its own, only "You're connected".
    case messages
}

/// One line of a centre card: an outlined icon beside its text.
struct GuidanceRow: Hashable {
    let icon: PantopusIcon
    let text: String
}

/// A centre card's words, as shown (variants already applied).
struct GuidanceCentreCard: Hashable {
    let id: GuidanceCardID
    let title: String
    let rows: [GuidanceRow]
    let button: String
}

/// A pointer's words.
struct GuidancePointerCard: Hashable {
    let id: GuidanceCardID
    let title: String
    let sentence: String
}

/// What a screen knows when its card is chosen; the variants follow it.
struct GuidanceVariants: Equatable {
    /// Card 1: the person joined by a household invitation and never typed an address.
    var joinedByInvite = false
    /// Card 3: the At home | Around you switch is on the screen.
    var aroundYouSwitch = true
    /// Card 4: writing letters is switched on (the pencil shows).
    var writesLetters = LaunchFeatures.mailExtras
    /// Card 2: Place's root is an address the person saved.
    var savedAddress = false
    /// Place shows an address or a home (card 2 joins the tips list).
    var placeHasAddress = false
    /// Card 17: the mail line shows while the Mailbox is on.
    var mailbox = LaunchFeatures.mailbox
    /// Place is the first-run screen: no saved address and no home (card 24).
    var firstRun = false
    /// When the address Place shows was saved (ISO 8601; card 25).
    var savedPlaceAt: String?
    /// The home Place shows, not a claim still in review (cards 16, 17, 23, 26, 27).
    var home: GuidanceHomeFacts?
    /// Mail: this person has sent a letter or a card (card 22).
    var sentAny = false
}

/// What the Place dashboard knows about its home for the cards that follow setting it up.
struct GuidanceHomeFacts: Equatable {
    let id: String
    /// The address is verified (tier 4).
    let verified: Bool
    /// "Verify address" is offered here.
    let verifiable: Bool
    /// When the person's place in the home started (ISO 8601): the occupancy's start, else the home's creation.
    let setUpAt: String?
    /// The person joined by a household invitation (they didn't set it up).
    let invited: Bool
    /// The home has no pickup schedule of its own yet (card 16's button opens the pickup editor).
    var needsPickupDay = false
}

/// The words of every card (GUIDE spec §5), exactly as approved.
enum GuidanceCatalog {
    static func centre(_ id: GuidanceCardID, variants: GuidanceVariants = GuidanceVariants()) -> GuidanceCentreCard? {
        switch id {
        case .welcome: welcome(variants)
        case .tabToday: tabToday(variants)
        case .tabMail: tabMail(variants)
        case .doneHomeSetup: doneHomeSetup(variants)
        case .doneVerified: doneVerified(variants)
        default: fixedCards[id]
        }
    }

    /// The centre cards whose words never change.
    private static let fixedCards = Dictionary(uniqueKeysWithValues: [
        placeSaved, tabPulse, tabMoments, tabPlans,
        doneFirstPost, doneFirstMoment, doneFirstPlan, doneConnected, doneFirstLetter, doneHousehold,
        nextAddAddress, nextSetupHome, nextVerify, nextInvite,
        newPlans
    ].map { ($0.id, $0) })

    /// The introductions switched on (GUIDE spec §2 "Introducing"). Ships empty: the founder picks the first one.
    static let activeIntroductions: [GuidanceCardID] = []

    static func pointer(_ id: GuidanceCardID) -> GuidancePointerCard? {
        switch id {
        case .tipAsk:
            GuidancePointerCard(
                id: id,
                title: "Ask Pantopus",
                sentence: "Ask a question about your home, or about how to do something in the app."
            )
        case .tipMessages:
            GuidancePointerCard(id: id, title: "Messages", sentence: "Your chats with people and groups open here.")
        case .tipMenu:
            GuidancePointerCard(id: id, title: "Menu", sentence: "Your homes, your profile, settings and help are here.")
        case .tipVerify:
            GuidancePointerCard(
                id: id,
                title: "Verify your address",
                sentence: "Prove you live here. Then you get a Verified badge and can send a message to homes near you."
            )
        case .tipPlaceRow:
            GuidancePointerCard(id: id, title: "See more", sentence: "Tap + to open a row and read the details.")
        case .tipPulsePost:
            GuidancePointerCard(
                id: id,
                title: "Post to Pulse",
                sentence: "Ask a question, recommend a place or share an event with people near you."
            )
        case .tipPulseArea:
            GuidancePointerCard(id: id, title: "Your area", sentence: "Tap here to change how far around you Pulse looks.")
        case .tipMailMeHome:
            GuidancePointerCard(
                id: id,
                title: "Me and Home",
                sentence: "“Me” is mail for you. “Home” is mail for everyone at your address."
            )
        default:
            nil
        }
    }

    /// The tab card a screen shows the first time it opens (Messages has none).
    static func tabCard(for screen: GuidanceScreen) -> GuidanceCardID? {
        switch screen {
        case .place: .welcome
        case .today: .tabToday
        case .mail: .tabMail
        case .pulse: .tabPulse
        case .moments: .tabMoments
        case .plans: .tabPlans
        case .messages: nil
        }
    }

    // MARK: - First open of each screen

    private static func welcome(_ variants: GuidanceVariants) -> GuidanceCentreCard {
        // The founder's own words (lines 1 and 2): never reword or repunctuate them.
        var rows = [GuidanceRow(icon: .house, text: "Pantopus starts with your home.")]
        if !variants.joinedByInvite {
            rows.append(GuidanceRow(
                icon: .lock,
                text: "Only you see the address you type, others see your first name, never your address."
            ))
        }
        rows.append(GuidanceRow(
            icon: .panelBottom,
            text: "The tabs at the bottom open each part of the app. The menu at the top left has everything else."
        ))
        return GuidanceCentreCard(id: .welcome, title: "Welcome to Pantopus", rows: rows, button: "Get started")
    }

    private static let placeSaved = GuidanceCentreCard(
        id: .placeSaved,
        title: "This is your Place",
        rows: [
            GuidanceRow(icon: .list, text: "This page shows what is public about your address: weather, risks, pickup days and more."),
            GuidanceRow(icon: .lock, text: "It is saved privately. Only you can see it."),
            GuidanceRow(
                icon: .house,
                text: "Live here? Tap “Set up this Home” to get pickup and radon reminders and to share tasks with your household."
            )
        ],
        button: "Got it"
    )

    private static func tabToday(_ variants: GuidanceVariants) -> GuidanceCentreCard {
        var rows = [
            GuidanceRow(icon: .sun, text: "Today shows the weather and daylight where you live, hour by hour."),
            GuidanceRow(icon: .circleCheck, text: "It also lists what needs you today, like pickup day or a task that is due.")
        ]
        if variants.aroundYouSwitch {
            rows.append(GuidanceRow(icon: .newspaper, text: "Switch to “Around you” for local headlines and events."))
        }
        return GuidanceCentreCard(id: .tabToday, title: "Today", rows: rows, button: "Got it")
    }

    private static func tabMail(_ variants: GuidanceVariants) -> GuidanceCentreCard {
        var rows = [
            GuidanceRow(
                icon: .mail,
                text: "This is your mailbox in Pantopus. Letters and cards sent to you arrive once a day, in the morning."
            ),
            GuidanceRow(
                icon: .inbox,
                text: "“Counter” holds mail that needs you to do something, like pay a bill. “Vault” keeps mail you want to save."
            )
        ]
        if variants.writesLetters {
            rows.append(GuidanceRow(icon: .pencil, text: "Tap the pencil to write a letter or send a card."))
        }
        return GuidanceCentreCard(id: .tabMail, title: "Mail", rows: rows, button: "Got it")
    }

    private static let tabPulse = GuidanceCentreCard(
        id: .tabPulse,
        title: "Pulse",
        rows: [
            GuidanceRow(icon: .activity, text: "Pulse is where people near you post: questions, recommendations, events and more."),
            GuidanceRow(icon: .map, text: "“List” shows the posts. “Map” shows the same posts on a map."),
            GuidanceRow(icon: .users, text: "“Nearby” is everyone near you. “Connections” is only the people you are connected with.")
        ],
        button: "Got it"
    )

    private static let tabMoments = GuidanceCentreCard(
        id: .tabMoments,
        title: "Moments",
        rows: [
            GuidanceRow(
                icon: .circleDashed,
                text: "A Moment is a photo, a short video or a few words about what is happening at a place right now."
            ),
            GuidanceRow(
                icon: .mapPin,
                text: "Each one sits on the map where it was posted, and goes away by itself when its time is up."
            ),
            GuidanceRow(icon: .plus, text: "Tap + to share one.")
        ],
        button: "Got it"
    )

    private static let tabPlans = GuidanceCentreCard(
        id: .tabPlans,
        title: "Plans",
        rows: [
            GuidanceRow(icon: .calendar, text: "Plans are get-togethers near you: a walk, a game night, a dinner."),
            GuidanceRow(icon: .circleCheck, text: "Tap a plan to see the details and say you are going."),
            GuidanceRow(icon: .link, text: "To host one, slide the list down and tap “Host”. Then share its link to invite people.")
        ],
        button: "Got it"
    )

    // MARK: - Right after doing something for the first time

    /// While the home has no pickup schedule, the button opens the pickup editor (JOURNEYS 1).
    private static func doneHomeSetup(_ variants: GuidanceVariants) -> GuidanceCentreCard {
        GuidanceCentreCard(
            id: .doneHomeSetup,
            title: "Your home is set up",
            rows: [
                GuidanceRow(icon: .circleCheck, text: "“Tasks” is a shared to-do list for your home."),
                GuidanceRow(icon: .users, text: "“Members” is where you invite the people you live with."),
                GuidanceRow(icon: .bell, text: "Tell Pantopus your pickup day and it will remind you the night before.")
            ],
            button: variants.home?.needsPickupDay == true ? "Set pickup day" : "Got it"
        )
    }

    private static func doneVerified(_ variants: GuidanceVariants) -> GuidanceCentreCard {
        var rows = [
            GuidanceRow(icon: .shieldCheck, text: "Your profile now shows a Verified badge."),
            GuidanceRow(icon: .messageCircle, text: "You can now send a message to homes near you.")
        ]
        if variants.mailbox {
            rows.append(GuidanceRow(icon: .mail, text: "“Home” in Mail is now open, for mail to everyone at your address."))
        }
        return GuidanceCentreCard(id: .doneVerified, title: "You're verified", rows: rows, button: "Got it")
    }

    private static let doneFirstPost = GuidanceCentreCard(
        id: .doneFirstPost,
        title: "Your post is up",
        rows: [
            GuidanceRow(icon: .users, text: "People near you can see it and reply."),
            GuidanceRow(icon: .bell, text: "The bell at the top tells you when someone replies."),
            GuidanceRow(icon: .list, text: "Find your posts again in the menu, under “My Pulse”.")
        ],
        button: "Got it"
    )

    private static let doneFirstMoment = GuidanceCentreCard(
        id: .doneFirstMoment,
        title: "Your Moment is up",
        rows: [
            GuidanceRow(icon: .mapPin, text: "It shows on the map where you posted it."),
            GuidanceRow(icon: .clock, text: "It goes away by itself when its time is up.")
        ],
        button: "Got it"
    )

    private static let doneFirstPlan = GuidanceCentreCard(
        id: .doneFirstPlan,
        title: "Your plan is posted",
        rows: [
            GuidanceRow(icon: .link, text: "Share its link to invite people."),
            GuidanceRow(icon: .bell, text: "You'll get a notice when someone says they are coming.")
        ],
        button: "Got it"
    )

    private static let doneConnected = GuidanceCentreCard(
        id: .doneConnected,
        title: "You're connected",
        rows: [
            GuidanceRow(icon: .messageCircle, text: "You two can now message each other."),
            GuidanceRow(icon: .activity, text: "Their posts show in Pulse under “Connections”.")
        ],
        button: "Got it"
    )

    private static let doneFirstLetter = GuidanceCentreCard(
        id: .doneFirstLetter,
        title: "It's on its way",
        rows: [
            GuidanceRow(icon: .mail, text: "It arrives with the morning mail."),
            GuidanceRow(icon: .send, text: "See everything you have sent under “Sent”.")
        ],
        button: "Got it"
    )

    private static let doneHousehold = GuidanceCentreCard(
        id: .doneHousehold,
        title: "Your household",
        rows: [
            GuidanceRow(icon: .users, text: "Everyone in your household sees the same tasks and reminders."),
            GuidanceRow(icon: .lock, text: "Each person still has their own private mail and messages.")
        ],
        button: "Got it"
    )

    // MARK: - Reminders of the next step

    private static let nextAddAddress = GuidanceCentreCard(
        id: .nextAddAddress,
        title: "Add your address",
        rows: [
            GuidanceRow(icon: .house, text: "Type your address to see flood risk, air quality and pickup days for your home."),
            GuidanceRow(icon: .lock, text: "Only you see it.")
        ],
        button: "Add my address"
    )

    private static let nextSetupHome = GuidanceCentreCard(
        id: .nextSetupHome,
        title: "Set up your home",
        rows: [
            GuidanceRow(icon: .bell, text: "Get reminders for pickup day and for testing your home for radon."),
            GuidanceRow(icon: .circleCheck, text: "Keep a to-do list for your home and share it with the people you live with.")
        ],
        button: "Set up this Home"
    )

    private static let nextVerify = GuidanceCentreCard(
        id: .nextVerify,
        title: "Verify your address",
        rows: [
            GuidanceRow(icon: .shieldCheck, text: "Prove you live here to get your Verified badge."),
            GuidanceRow(icon: .messageCircle, text: "Verified people can send a message to homes near them.")
        ],
        button: "Verify address"
    )

    private static let nextInvite = GuidanceCentreCard(
        id: .nextInvite,
        title: "Invite your household",
        rows: [
            GuidanceRow(icon: .users, text: "Add the people you live with."),
            GuidanceRow(icon: .circleCheck, text: "You will all see the same tasks and reminders for your home.")
        ],
        button: "Invite someone"
    )

    // MARK: - Introducing something new

    private static let newPlans = GuidanceCentreCard(
        id: .newPlans,
        title: "Introducing Plans",
        rows: [
            GuidanceRow(icon: .calendar, text: "Plans are get-togethers near you: a walk, a game night, a dinner."),
            GuidanceRow(icon: .panelBottom, text: "They have their own tab at the bottom of the screen.")
        ],
        button: "Continue"
    )
}

/// What a pointer needs from the device's own counts (GUIDE spec §5 "Pointers").
extension GuidanceCardID {
    /// The screen a pointer belongs to, and the visit there it may start on; nil for any tab's first screen.
    var pointerVisit: (screen: GuidanceScreen, from: Int)? {
        switch self {
        case .tipVerify: (.place, 2)
        case .tipPulsePost: (.pulse, 2)
        case .tipPulseArea: (.pulse, 3)
        case .tipMailMeHome: (.mail, 2)
        case .tipAsk, .tipPlaceRow: (.place, 1)
        default: nil
        }
    }
}
