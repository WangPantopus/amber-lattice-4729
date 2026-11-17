//
//  GuidanceRecord.swift
//  Pantopus
//
//  What the phone keeps about the guidance cards for one account (GUIDE spec
//  §2 "Seen"): every closed card at once, so a relaunch never shows it again
//  even offline; the closes the server hasn't heard yet; the last server state;
//  and the device's own counts (app opens, visits per screen). The server's
//  record wins: it is merged in on every profile read.
//

import Foundation

struct GuidanceRecord: Codable, Equatable {
    /// Every closed card: the server's map plus the closes it hasn't heard yet.
    var seen: [String: GuidanceSeenDTO] = [:]
    /// Card ids closed here and not yet acknowledged by the server, oldest first.
    var unsent: [String] = []
    /// The server's switch and the account's age, as last read.
    var enabled = false
    var newAccount = false
    /// The server has answered at least once.
    var known = false
    /// App opens on this device for this account (a cold start, or back after 30 minutes away).
    var opens = 0
    /// Visits to each screen on this device (`GuidanceScreen.rawValue`).
    var visits: [String: Int] = [:]
    /// Things the person did here that some pointers wait for (`GuidanceFact.rawValue`).
    var facts: Set<String> = []
    /// The day (yyyy-MM-dd, the phone's calendar) a centre card last showed.
    var lastCentreDay: String?

    func hasSeen(_ id: GuidanceCardID) -> Bool {
        (seen[id.rawValue]?.times ?? 0) > 0
    }

    func has(_ fact: GuidanceFact) -> Bool {
        facts.contains(fact.rawValue)
    }

    /// A close made here: counted at once and queued for the server.
    mutating func markSeen(_ id: GuidanceCardID, at date: Date) {
        let previous = seen[id.rawValue]?.times ?? 0
        seen[id.rawValue] = GuidanceSeenDTO(times: previous + 1, lastAt: date.ISO8601Format())
        unsent.append(id.rawValue)
    }

    /// The server's state wins; closes it hasn't heard yet stay on top of it.
    mutating func merge(_ server: GuidanceStateDTO) {
        enabled = server.enabled
        newAccount = server.newAccount
        known = true
        var merged = server.seen
        for id in Set(unsent) {
            let pending = unsent.filter { $0 == id }.count
            let base = server.seen[id]?.times ?? 0
            let local = seen[id]
            merged[id] = GuidanceSeenDTO(times: max(base + pending, local?.times ?? 0), lastAt: local?.lastAt)
        }
        seen = merged
    }

    /// The server took one close of this card.
    mutating func acknowledge(_ id: String) {
        if let index = unsent.firstIndex(of: id) { unsent.remove(at: index) }
    }

    static func day(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}

/// Things done on this device that change which pointer may show.
enum GuidanceFact: String {
    /// A "Your home at a glance" row was opened.
    case placeRowOpened = "place_row_opened"
    /// The person has posted to Pulse.
    case posted
    /// Place has shown an address the person saved or a home (card 2 joins the tips list).
    case placeHasAddress = "place_has_address"
    /// Today showed the At home | Around you switch (card 3's third line in the tips list).
    case todayAroundYou = "today_around_you"
    /// Card 1 showed without its address line (a household invitation; the tips list follows it).
    case joinedByInvite = "joined_by_invite"
}

/// The record on disk, one per account.
@MainActor
enum GuidanceRecordStore {
    private static let prefix = "pantopus.guidance.v1."

    static func load(account: String, defaults: UserDefaults = .standard) -> GuidanceRecord {
        guard let data = defaults.data(forKey: prefix + account),
              let record = try? JSONDecoder().decode(GuidanceRecord.self, from: data) else { return GuidanceRecord() }
        return record
    }

    static func save(_ record: GuidanceRecord, account: String, defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(record) else { return }
        defaults.set(data, forKey: prefix + account)
    }
}
