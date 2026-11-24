//
//  ProfileRings.swift
//  Pantopus
//
//  The profile with sources (`~/pantopus-profile-sources/SPEC.md` §2, §3): one
//  ring a year, January at the top, drawn from month data the server sends as
//  one string a year per lane ("0" nothing, "1" said, "2" signed, "3" seen).
//  This file reads those strings; `ProfileRingViews.swift` draws them. The
//  geometry follows the design's `make_assets.py` (`header_mark`, `full_chart`).
//

import Foundation

/// How we know a line (SPEC §2): Seen, Pantopus's own records show it; Signed,
/// a named other party confirmed it; Said, the person's own words. The ink is
/// always the server's; the app never raises one. Anything it can't read is Said.
enum ProfileInk: String, Hashable, CaseIterable {
    case seen
    case signed
    case said

    /// Stronger inks win where two lanes share a month.
    var rank: Int {
        switch self {
        case .seen: 3
        case .signed: 2
        case .said: 1
        }
    }

    /// The word that always goes with the mark: ink is never told by colour or line style alone.
    var word: String {
        switch self {
        case .seen: "Seen"
        case .signed: "Signed"
        case .said: "Said"
        }
    }

    /// One month of a ring string.
    init?(digit: Character) {
        switch digit {
        case "3": self = .seen
        case "2": self = .signed
        case "1": self = .said
        default: return nil
        }
    }

    /// The server's word; unknown or missing reads as Said (rule 4.1: unsure means Said).
    init(serverValue: String?) {
        self = serverValue.flatMap { ProfileInk(rawValue: $0.lowercased()) } ?? .said
    }

    static func strongest(_ a: ProfileInk?, _ b: ProfileInk?) -> ProfileInk? {
        switch (a, b) {
        case let (a?, b?): a.rank >= b.rank ? a : b
        case let (a?, nil): a
        case let (nil, b?): b
        case (nil, nil): nil
        }
    }
}

/// A lane of the full chart: the app's home, business and personal colours.
enum ProfileLane: String, Hashable, CaseIterable {
    case home
    case work
    case others

    /// The legend's word.
    var title: String {
        switch self {
        case .home: "Home"
        case .work: "Work"
        case .others: "With others"
        }
    }
}

/// A run of months in one ink on one ring: months `start..<end` (0 = January;
/// the current year's last run may end part way through a month).
struct ProfileRingRun: Equatable {
    let start: Double
    let end: Double
    let ink: ProfileInk
}

/// The rings of one person, as the server sent them (`header.rings`).
struct ProfileRings: Equatable {
    /// The first year drawn: the centre ring.
    let firstYear: Int
    /// Today, for the growing edge of the outer ring.
    let nowYear: Int
    /// Today's month, 0-based, plus how far through it we are (0..<1).
    let nowMonth: Double
    /// Each lane's months, a row of 12 a year from `firstYear`. A lane the
    /// viewer may not see (the full chart drops it, rule 4.3) is absent.
    let lanes: [ProfileLane: [[ProfileInk?]]]

    /// The years drawn, oldest first.
    var years: [Int] {
        let count = lanes.values.map(\.count).max() ?? 0
        guard count > 0 else { return [] }
        return Array(firstYear..<(firstYear + count))
    }

    /// The mark around a portrait: one line a year, the strongest ink of any lane each month.
    var merged: [[ProfileInk?]] {
        let rows = years.count
        return (0..<rows).map { index in
            (0..<12).map { month in
                lanes.values.reduce(nil) { best, lane in
                    let ink = index < lane.count ? lane[index][month] : nil
                    return ProfileInk.strongest(best, ink)
                }
            }
        }
    }

    /// The runs of one row. The current year stops at today, so the outer ring grows through the month.
    func runs(of row: [ProfileInk?], year: Int) -> [ProfileRingRun] {
        var out: [ProfileRingRun] = []
        var month = 0
        while month < 12 {
            guard let ink = row[month] else {
                month += 1
                continue
            }
            var end = month
            while end < 12, row[end] == ink {
                end += 1
            }
            out.append(ProfileRingRun(start: Double(month), end: Double(end), ink: ink))
            month = end
        }
        if year == nowYear {
            out = out.compactMap { run in
                let end = min(run.end, nowMonth)
                return end > run.start ? ProfileRingRun(start: run.start, end: end, ink: run.ink) : nil
            }
        } else if year > nowYear {
            return []
        }
        return out
    }

    /// The strongest ink of a month on any lane shown.
    func ink(year: Int, month: Int) -> ProfileInk? {
        guard let index = years.firstIndex(of: year), (0..<12).contains(month) else { return nil }
        return merged[index][month]
    }

    /// True when any month on any lane shown is Seen.
    var hasSeen: Bool {
        lanes.values.contains { $0.contains { $0.contains(.seen) } }
    }

    /// The same rings without the lanes this chart doesn't show.
    func keeping(_ shown: Set<ProfileLane>) -> ProfileRings {
        ProfileRings(firstYear: firstYear, nowYear: nowYear, nowMonth: nowMonth, lanes: lanes.filter { shown.contains($0.key) })
    }
}

extension ProfileRings {
    /// Reads the server's rings: `from` (the first year), `now` ("2026-11-23") and a list of 12-digit strings a year
    /// per lane. Nil when there is nothing to draw. A short or odd string is read as far as it goes.
    init?(from: Int?, now: String?, lanes raw: [ProfileLane: [String]], calendar: Calendar = .current, today: Date = Date()) {
        let parsed = raw.mapValues { rows in
            rows.map { row -> [ProfileInk?] in
                let digits = Array(row.prefix(12))
                return (0..<12).map { $0 < digits.count ? ProfileInk(digit: digits[$0]) : nil }
            }
        }
        let count = parsed.values.map(\.count).max() ?? 0
        guard count > 0 else { return nil }
        let (year, month) = Self.today(now, calendar: calendar, fallback: today)
        let first = from ?? (year - count + 1)
        self.init(firstYear: first, nowYear: year, nowMonth: month, lanes: parsed)
    }

    /// "2026-11-23" → (2026, 10.73): the month 0-based plus the part of it gone by.
    static func today(_ iso: String?, calendar: Calendar, fallback: Date) -> (Int, Double) {
        var parts = DateComponents()
        if let iso {
            let bits = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
            if bits.count == 3 {
                parts.year = bits[0]
                parts.month = bits[1]
                parts.day = bits[2]
            }
        }
        if parts.year == nil {
            parts = calendar.dateComponents([.year, .month, .day], from: fallback)
        }
        let year = parts.year ?? 2026
        let month = max(1, min(12, parts.month ?? 1))
        let day = max(1, parts.day ?? 1)
        var first = DateComponents()
        first.year = year
        first.month = month
        first.day = 1
        let days = calendar.date(from: first).flatMap { calendar.range(of: .day, in: .month, for: $0)?.count } ?? 30
        return (year, Double(month - 1) + min(0.999, Double(day - 1) / Double(days)))
    }
}

/// What the ring on an avatar shows (board 6): one ring, thicker with years on
/// record, dotted until something is seen.
struct ProfileMarkSummary: Equatable {
    /// Years from the first month on record to today.
    let yearsOnRecord: Double
    let hasSeen: Bool

    /// The ring's width at a 40 pt avatar: this week 1, two years 2.5, nine years and more 4 (board 6).
    var width: Double {
        1 + 3 * (min(max(yearsOnRecord, 0), 9) / 9).squareRoot()
    }

    /// "Since 2015-01" → years to today.
    init(since: String?, hasSeen: Bool, calendar: Calendar = .current, today: Date = Date()) {
        self.hasSeen = hasSeen
        let bits = (since ?? "").split(separator: "-").compactMap { Int($0) }
        let now = calendar.dateComponents([.year, .month, .day], from: today)
        if bits.count >= 2, let year = now.year, let month = now.month {
            let months = Double((year - bits[0]) * 12 + (month - bits[1])) + Double((now.day ?? 1) - 1) / 30
            yearsOnRecord = max(0, months / 12)
        } else {
            yearsOnRecord = 0
        }
    }

    init(yearsOnRecord: Double, hasSeen: Bool) {
        self.yearsOnRecord = yearsOnRecord
        self.hasSeen = hasSeen
    }

    init(rings: ProfileRings) {
        var first: Double?
        for (index, row) in rings.merged.enumerated() {
            if let month = row.firstIndex(where: { $0 != nil }) {
                first = Double(rings.firstYear + index) * 12 + Double(month)
                break
            }
        }
        let now = Double(rings.nowYear) * 12 + rings.nowMonth
        yearsOnRecord = first.map { max(0, (now - $0) / 12) } ?? 0
        hasSeen = rings.hasSeen
    }
}
