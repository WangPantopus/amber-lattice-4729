//
//  LocationRecheck.swift
//  Pantopus
//
//  "We check once more on another day when you open Pantopus at home."
//  (FASTVERIFY phase 5): when Place opens and a location check waits for its
//  second day, or ends within 30 days (a match then renews it for a year), the
//  app reads the location once more, quietly. Only when Pantopus may already
//  use the location: it never asks for it here. Once a day per Home.
//

import CoreLocation
import Foundation

@MainActor
enum LocationRecheck {
    private static var triedToday: Set<String> = []

    /// True when a quiet check counted (the answer changed): read verify-options again.
    static func runIfDue(_ options: HomeVerifyOptions, homeId: String, now: Date = Date()) async -> Bool {
        guard options.level == .fast, let fast = options.fast, fast.kind == "location" else { return false }
        let awaitingSecondDay = fast.recheckDueAt != nil && !isToday(fast.at, now: now)
        let endingSoon = date(fast.expiresAt).map { $0.timeIntervalSince(now) < 30 * 86400 } ?? false
        guard awaitingSecondDay || endingSoon else { return false }
        let status = CLLocationManager().authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways else { return false }
        let key = "\(homeId.lowercased())|\(Calendar.current.startOfDay(for: now).timeIntervalSince1970)"
        guard !triedToday.contains(key) else { return false }
        triedToday.insert(key)
        let check = LocationCheckViewModel(homeId: homeId, address: "")
        await check.check()
        return check.stage == .verified
    }

    private static func date(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    private static func isToday(_ iso: String?, now: Date) -> Bool {
        guard let day = date(iso) else { return false }
        return Calendar.current.isDate(day, inSameDayAs: now)
    }
}
