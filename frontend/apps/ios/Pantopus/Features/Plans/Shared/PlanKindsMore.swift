//
//  PlanKindsMore.swift
//  Pantopus
//
//  Plans step 4 (CONTRACT-step3-4.md section 2): the four newer kinds' words.
//  Food & drinks, game night, outdoors and "Something else": their choices
//  (`food_kind`, `game_kind`, `outdoor_kind` and pace), the nouns the server's
//  notices use (planNotifications.js `noun`), the type picker's lines (board
//  Type), the form's hints and the places that suit each (planPlaces.js).
//  "Something else" has no choices: its title says what it is.
//

import Foundation

enum PlanKindsMore {
    /// Food & drinks' "Kind" (dinner first, the server's default).
    static let foodKinds: [(value: String, label: String)] = [
        ("dinner", "Dinner"),
        ("potluck", "Potluck"),
        ("drinks", "Drinks"),
        ("brunch", "Brunch"),
        ("bbq", "BBQ"),
        ("other", "Other")
    ]

    /// Game night's "Kind" (board games first, the server's default).
    static let gameKinds: [(value: String, label: String)] = [
        ("board_games", "Board games"),
        ("cards", "Cards"),
        ("trivia", "Trivia"),
        ("video_games", "Video games"),
        ("other", "Other")
    ]

    /// Outdoors' "Kind" (a hike first, the server's default); its pace is the walk's.
    static let outdoorKinds: [(value: String, label: String)] = [
        ("hike", "Hike"),
        ("bike_ride", "Bike ride"),
        ("run", "Run"),
        ("other", "Other")
    ]

    /// The noun a sentence uses, as the server's notices say it ("Your happy hour is today").
    private static let foodNouns = [
        "dinner": "dinner",
        "potluck": "potluck",
        "drinks": "happy hour",
        "brunch": "brunch",
        "bbq": "barbecue"
    ]
    private static let outdoorNouns = ["hike": "hike", "bike_ride": "bike ride", "run": "run"]

    /// "dinner", "happy hour", "game night", "bike ride", "plan"; nil for the first five kinds.
    static func noun(_ kind: PlanKind, details: PlanDetailsDTO?) -> String? {
        switch kind {
        case .foodDrinks: foodNouns[details?.foodKind ?? "dinner"] ?? "get-together"
        case .gameNight: "game night"
        case .outdoors: outdoorNouns[details?.outdoorKind ?? "hike"] ?? "outing"
        case .somethingElse: "plan"
        case .watchParty, .playdate, .pickupGame, .walkCoffee, .studyGroup: nil
        }
    }

    /// The plan page's details line: "Potluck", "Trivia", "Bike ride · Brisk pace". Nothing for "Something else".
    static func details(_ kind: PlanKind, _ details: PlanDetailsDTO?) -> [String] {
        guard let details else { return [] }
        switch kind {
        case .foodDrinks:
            return label(details.foodKind, in: foodKinds).map { [$0] } ?? []
        case .gameNight:
            return label(details.gameKind, in: gameKinds).map { [$0] } ?? []
        case .outdoors:
            let pace = details.pace.flatMap { label($0, in: PlanComposerOptions.paces) }.map { "\($0) pace" }
            return [label(details.outdoorKind, in: outdoorKinds), pace].compactMap { $0 }
        default:
            return []
        }
    }

    /// Board Type's line under each newer kind.
    static func blurb(_ kind: PlanKind) -> String {
        switch kind {
        case .foodDrinks: "Dinner, potluck, happy hour"
        case .gameNight: "Board games, cards, trivia"
        case .outdoors: "Hike, bike ride, run"
        case .somethingElse: "You name it: book club, craft night, a trip"
        case .watchParty, .playdate, .pickupGame, .walkCoffee, .studyGroup: ""
        }
    }

    static func titlePlaceholder(_ kind: PlanKind) -> String {
        switch kind {
        case .foodDrinks: "Potluck dinner in the backyard"
        case .gameNight: "Board games and snacks"
        case .outdoors: "Saturday hike around the lake"
        default: "Book club at the café"
        }
    }

    static func notePlaceholder(_ kind: PlanKind, online: Bool) -> String {
        if online { return "Join a few minutes early. Cameras optional." }
        switch kind {
        case .foodDrinks: return "Bring a side to share. We'll have drinks."
        case .gameNight: return "Bring a game if you like. Snacks are on me."
        case .outdoors: return "Meet at the trailhead lot. Bring water."
        default: return "Meet by the front door."
        }
    }

    /// The places that suit each kind first (planPlaces.js `PREFERRED`).
    static func preferredCategories(_ kind: PlanKind) -> [String] {
        switch kind {
        case .foodDrinks: ["restaurant", "cafe", "bar"]
        case .gameNight: ["cafe", "community_center", "library", "bar"]
        case .outdoors: ["trail", "park"]
        default: ["cafe", "community_center", "park"]
        }
    }

    private static func label(_ value: String?, in options: [(value: String, label: String)]) -> String? {
        options.first { $0.value == value }?.label
    }
}

extension PlanKind {
    /// The kinds people may join with a link (planRules.js `ONLINE_KINDS`): playdates, pickup games and
    /// outdoor plans meet in person.
    var canBeOnline: Bool {
        switch self {
        case .watchParty, .walkCoffee, .studyGroup, .gameNight, .somethingElse, .foodDrinks: true
        case .playdate, .pickupGame, .outdoors: false
        }
    }
}
