//
//  AddHomeShortSwitch.swift
//  Pantopus
//
//  Add Home in two steps (FASTVERIFY, `home_short_add`). Add Home runs before
//  the person has a Home, so it reads the switch from the generic flag route
//  (`backend/routes/featureFlags.js:30`); a verify-options answer for any Home
//  also carries it. Off, unread or unreadable: today's four steps.
//

import Foundation

@MainActor
enum AddHomeShortSwitch {
    /// The last answer this run; nil until one was read.
    private(set) static var cached: Bool?

    static func remember(_ on: Bool) {
        cached = on
    }

    /// Reads the switch; a failed read keeps the last answer (off when there is none).
    static func load(api: APIClient = .shared) async -> Bool {
        if let flag: FeatureFlagDTO = try? await api.request(PlansEndpoints.flag("home_short_add")),
           flag.flagName == "home_short_add" {
            cached = flag.enabled
        }
        return cached ?? false
    }
}
