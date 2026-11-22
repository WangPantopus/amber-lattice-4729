//
//  TodayHouseSwitch.swift
//  Pantopus
//
//  The house on Today's server switch (JOURNEYS section 3): the profile's
//  `today_house`, read with the profile the app already loads
//  (`GuidanceCenter.refresh`). A missing key means off, and with it off
//  Today is exactly as it was. The last answer is kept for the account, so
//  the next launch draws Today the way it ended before the profile answers.
//

import Foundation
import Observation

@Observable
@MainActor
final class TodayHouseSwitch {
    static let shared = TodayHouseSwitch()

    private(set) var isOn = false

    private init() {}

    /// What the profile just said, for this account.
    func set(_ on: Bool, account: String) {
        UserDefaults.standard.set(on, forKey: Self.key(account))
        if isOn != on { isOn = on }
    }

    /// The account changed (nil: signed out): its last answer until its profile is read.
    func restore(account: String?) {
        let on = account.map { UserDefaults.standard.bool(forKey: Self.key($0)) } ?? false
        if isOn != on { isOn = on }
    }

    private static func key(_ account: String) -> String {
        "todayHouse.on.\(account)"
    }
}
