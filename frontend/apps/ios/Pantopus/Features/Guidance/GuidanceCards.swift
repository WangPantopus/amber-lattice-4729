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

    /// A tab's own card (cards 1 to 7): it shows the first time its tab opens,
    /// limited only by one card on screen at a time.
    var isTabCard: Bool {
        GuidanceCardID.tabCards.contains(self)
    }

    static let tabCards: [GuidanceCardID] = [.welcome, .placeSaved, .tabToday, .tabMail, .tabPulse, .tabMoments, .tabPlans]
    static let pointers: [GuidanceCardID] = [
        .tipAsk, .tipMessages, .tipMenu, .tipVerify, .tipPlaceRow, .tipPulsePost, .tipPulseArea, .tipMailMeHome
    ]
}

/// The screens a card belongs to: each tab's first screen.
enum GuidanceScreen: String {
    case place
    case today
    case mail
    case pulse
    case moments
    case plans
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
}

/// The words of every card (GUIDE spec §5), exactly as approved.
enum GuidanceCatalog {
    static func centre(_ id: GuidanceCardID, variants: GuidanceVariants = GuidanceVariants()) -> GuidanceCentreCard? {
        switch id {
        case .welcome: welcome(variants)
        case .placeSaved: placeSaved
        case .tabToday: tabToday(variants)
        case .tabMail: tabMail(variants)
        case .tabPulse: tabPulse
        case .tabMoments: tabMoments
        case .tabPlans: tabPlans
        default: nil
        }
    }

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

    /// The tab card a screen shows the first time it opens.
    static func tabCard(for screen: GuidanceScreen) -> GuidanceCardID {
        switch screen {
        case .place: .welcome
        case .today: .tabToday
        case .mail: .tabMail
        case .pulse: .tabPulse
        case .moments: .tabMoments
        case .plans: .tabPlans
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
