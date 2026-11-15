//
//  PlanKind+Style.swift
//  Pantopus
//
//  Nearby Plans board P1: each kind's name, color, tint and glyph. The
//  colors are the `cat-plan-*` tokens (the four newer kinds' from the Plans
//  boards' more.css); the glyphs are the Plans icons.
//

import SwiftUI

extension PlanKind {
    /// The kind's name, as tags and chips show it.
    var title: String {
        switch self {
        case .watchParty: "Watch party"
        case .playdate: "Playdate"
        case .pickupGame: "Pickup game"
        case .walkCoffee: "Walk & coffee"
        case .studyGroup: "Study group"
        case .foodDrinks: "Food & drinks"
        case .gameNight: "Game night"
        case .outdoors: "Outdoors"
        case .somethingElse: "Something else"
        }
    }

    /// The name VoiceOver reads ("Walk and coffee", not "Walk ampersand coffee").
    var spokenTitle: String {
        switch self {
        case .walkCoffee: "Walk and coffee"
        case .foodDrinks: "Food and drinks"
        default: title
        }
    }

    /// The pin, swatch and tile glyph color.
    var color: Color {
        switch self {
        case .watchParty: Theme.Color.categoryPlanWatch
        case .playdate: Theme.Color.categoryPlanPlaydate
        case .pickupGame: Theme.Color.categoryPlanPickup
        case .walkCoffee: Theme.Color.categoryPlanWalk
        case .studyGroup: Theme.Color.categoryPlanStudy
        case .foodDrinks: Theme.Color.categoryPlanFood
        case .gameNight: Theme.Color.categoryPlanGame
        case .outdoors: Theme.Color.categoryPlanOutdoors
        case .somethingElse: Theme.Color.categoryPlanElse
        }
    }

    /// The soft fill behind tiles, tags and the type card.
    var tint: Color {
        switch self {
        case .watchParty: Theme.Color.categoryPlanWatchTint
        case .playdate: Theme.Color.categoryPlanPlaydateTint
        case .pickupGame: Theme.Color.categoryPlanPickupTint
        case .walkCoffee: Theme.Color.categoryPlanWalkTint
        case .studyGroup: Theme.Color.categoryPlanStudyTint
        case .foodDrinks: Theme.Color.categoryPlanFoodTint
        case .gameNight: Theme.Color.categoryPlanGameTint
        case .outdoors: Theme.Color.categoryPlanOutdoorsTint
        case .somethingElse: Theme.Color.categoryPlanElseTint
        }
    }

    /// Fork and knife, a die, a mountain and a plus for the newer kinds (the boards' glyphs).
    var icon: PantopusIcon {
        switch self {
        case .watchParty: .planWatch
        case .playdate: .planPlaydate
        case .pickupGame: .planPickup
        case .walkCoffee: .planWalk
        case .studyGroup: .planStudy
        case .foodDrinks: .utensils
        case .gameNight: .planGame
        case .outdoors: .mountain
        case .somethingElse: .plus
        }
    }

    /// The order of the map's type chips and the host's type grid.
    static let displayOrder: [PlanKind] = [.watchParty, .playdate, .pickupGame, .walkCoffee, .studyGroup]

    /// Plans step 4's kinds, after the first five wherever kinds are listed (only with `plans_kinds` on for
    /// posting and filtering; a plan of one of them always reads).
    static let newer: [PlanKind] = [.foodDrinks, .gameNight, .outdoors, .somethingElse]

    /// One of step 4's kinds: "New" on the type picker, never a business's.
    var isNewer: Bool {
        Self.newer.contains(self)
    }

    /// The kinds to list, with step 4's when `plans_kinds` is on.
    static func listed(withNewer: Bool) -> [PlanKind] {
        withNewer ? displayOrder + newer : displayOrder
    }
}
