//
//  PlanRepeatRules.swift
//  Pantopus
//
//  Plans step 2, repeating plans: a pattern's dates and words worked out on
//  the phone the way the server works them out (planSeries.js `matches`,
//  `datesAfter`, `totalOf`, `lastOn`, `patternText`, `checkedRepeat`), so the
//  Details row, the Repeats screen's summary and the preview say what the
//  server will say once it answers. Days are local days in the plan's time
//  zone, weeks start on Monday, and weekdays are Monday 1 … Sunday 7.
//

import Foundation

/// A pattern as the phone holds it while it is being chosen.
struct PlanRepeatPattern: Hashable {
    var freq: PlanRepeatFreq
    /// Every week, every two weeks: the days, sorted.
    var weekdays: [Int] = []
    /// Every month: 1 to 4 days, in the order chosen (the server keeps that order, and so do its words).
    var monthDays: [PlanMonthDay] = []
    /// The last local day it may fall on (start of that day), or nil when it ends after `count`.
    var until: Date?
    var count: Int?
}

enum PlanRepeatRules {
    /// A series runs for a year at most (from its first date), for 2 to 100 dates, with up to 4 days a month.
    static let maxDays = 366
    static let countRange = 2...100
    static let defaultWeeks = 12
    static let monthDayLimit = 4

    static let weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    static let shortNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    /// The day buttons' letters, Monday first.
    static let letters = ["M", "T", "W", "T", "F", "S", "S"]

    // MARK: - Days

    /// A Gregorian calendar in `base`'s time zone, weeks from Monday (as Luxon's `startOf('week')`).
    static func calendar(_ base: Calendar) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = base.timeZone
        calendar.firstWeekday = 2
        calendar.locale = Locale(identifier: "en_US_POSIX")
        return calendar
    }

    /// Monday 1 … Sunday 7.
    static func weekday(_ day: Date, _ calendar: Calendar) -> Int {
        (calendar.component(.weekday, from: day) + 5) % 7 + 1
    }

    /// The week of the month as the server counts it: days 1–7 are the 1st, 8–14 the 2nd, and so on.
    static func weekOfMonth(_ day: Date, _ calendar: Calendar) -> Int {
        (calendar.component(.day, from: day) + 6) / 7
    }

    /// The last such weekday of its month: a week later is next month.
    static func isLastOfMonth(_ day: Date, _ calendar: Calendar) -> Bool {
        guard let later = calendar.date(byAdding: .day, value: 7, to: day) else { return false }
        return calendar.component(.month, from: later) != calendar.component(.month, from: day)
    }

    static func add(days: Int, to day: Date, _ calendar: Calendar) -> Date {
        calendar.date(byAdding: .day, value: days, to: day) ?? day.addingTimeInterval(TimeInterval(days) * 86400)
    }

    static func daysBetween(_ from: Date, _ to: Date, _ calendar: Calendar) -> Int {
        calendar.dateComponents([.day], from: calendar.startOfDay(for: from), to: calendar.startOfDay(for: to)).day ?? 0
    }

    /// The day a start falls on, as the rule for it: "the 3rd Saturday" (the last one from the 29th on), or "the 21st".
    static func monthDay(for start: Date, byDate: Bool, _ calendar: Calendar) -> PlanMonthDay {
        if byDate { return .date(calendar.component(.day, from: start)) }
        let week = weekOfMonth(start, calendar)
        return .weekday(week: week > 4 ? -1 : week, weekday: weekday(start, calendar))
    }

    /// Does this local day belong to the pattern? (`matches`)
    static func matches(_ pattern: PlanRepeatPattern, day: Date, anchor: Date, _ calendar: Calendar) -> Bool {
        if pattern.freq == .monthly {
            return pattern.monthDays.contains { matches($0, day: day, calendar) }
        }
        guard pattern.weekdays.contains(weekday(day, calendar)) else { return false }
        guard pattern.freq == .biweekly else { return true }
        let weeks = daysBetween(monday(of: anchor, calendar), monday(of: day, calendar), calendar)
        return Int((Double(weeks) / 7).rounded()) % 2 == 0
    }

    static func matches(_ rule: PlanMonthDay, day: Date, _ calendar: Calendar) -> Bool {
        switch rule {
        case let .date(date):
            return calendar.component(.day, from: day) == date
        case let .weekday(week, weekdayNumber):
            guard weekday(day, calendar) == weekdayNumber else { return false }
            return week == -1 ? isLastOfMonth(day, calendar) : weekOfMonth(day, calendar) == week
        }
    }

    /// The pattern's days after `after`, in order, through its end date and within a year of its first date
    /// (`datesAfter`); at most `limit`.
    static func days(after: Date, pattern: PlanRepeatPattern, anchor: Date, limit: Int, _ calendar: Calendar) -> [Date] {
        let last = add(days: maxDays, to: calendar.startOfDay(for: anchor), calendar)
        let until = pattern.until.map { calendar.startOfDay(for: $0) }
        var found: [Date] = []
        var day = add(days: 1, to: calendar.startOfDay(for: after), calendar)
        while day <= last, found.count < limit {
            if let until, day > until { break }
            if matches(pattern, day: day, anchor: anchor, calendar) { found.append(day) }
            day = add(days: 1, to: day, calendar)
        }
        return found
    }

    /// The first date, the last date and how many in all, counted from `first` (the plan's own date): its count,
    /// or its dates through the end date (`totalOf`, `lastOn`).
    static func span(_ pattern: PlanRepeatPattern, first: Date, _ calendar: Calendar) -> (last: Date, total: Int) {
        let start = calendar.startOfDay(for: first)
        let limit = pattern.count.map { max($0 - 1, 0) } ?? Int.max
        let later = days(after: start, pattern: pattern, anchor: start, limit: limit, calendar)
        return (later.last ?? start, pattern.count ?? later.count + 1)
    }

    // MARK: - Words

    /// "1st", "2nd", "3rd", "11th", "21st".
    static func nth(_ number: Int) -> String {
        let tail = number % 100
        if (11...13).contains(tail) { return "\(number)th" }
        let suffix = switch number % 10 {
        case 1: "st"
        case 2: "nd"
        case 3: "rd"
        default: "th"
        }
        return "\(number)\(suffix)"
    }

    /// "1st" … "4th", "last".
    static func ordinal(week: Int) -> String {
        week == -1 ? "last" : nth(week)
    }

    /// "A", "A and B", "A, B and C".
    static func list(_ items: [String]) -> String {
        guard items.count > 1, let last = items.last else { return items.joined() }
        return "\(items.dropLast().joined(separator: ", ")) and \(last)"
    }

    /// "Every Tuesday and Thursday", "Every day", "Every 2 weeks on Friday", "The 1st and 3rd Saturday of each
    /// month"; `short`: "Every Tue and Thu", "Monthly on the 1st and 3rd Sat" (`patternText`).
    static func text(_ pattern: PlanRepeatPattern, short: Bool = false) -> String {
        let names = short ? shortNames : weekdayNames
        if pattern.freq == .monthly {
            let weekdays: [Int] = pattern.monthDays.compactMap { rule in
                if case let .weekday(_, weekday) = rule { return weekday }
                return nil
            }
            let said: String
            if pattern.monthDays.count > 1, weekdays.count == pattern.monthDays.count, Set(weekdays).count == 1,
               let weekday = weekdays.first, (1...7).contains(weekday) {
                let weeks: [String] = pattern.monthDays.compactMap { rule in
                    if case let .weekday(week, _) = rule { return ordinal(week: week) }
                    return nil
                }
                said = "\(list(weeks)) \(names[weekday - 1])"
            } else {
                said = list(pattern.monthDays.map { words($0, names: names) })
            }
            return short ? "Monthly on the \(said)" : "The \(said) of each month"
        }
        let days = pattern.weekdays.sorted().filter { (1...7).contains($0) }.map { names[$0 - 1] }
        if pattern.freq == .biweekly { return "Every 2 weeks on \(list(days))" }
        return days.count == 7 ? "Every day" : "Every \(list(days))"
    }

    /// "3rd Saturday", "21st".
    static func words(_ rule: PlanMonthDay, names: [String] = weekdayNames) -> String {
        switch rule {
        case let .date(day): nth(day)
        case let .weekday(week, weekday): "\(ordinal(week: week)) \((1...7).contains(weekday) ? names[weekday - 1] : "")"
        }
    }

    /// A monthly row: "The 1st Saturday", "The 15th".
    static func rowTitle(_ rule: PlanMonthDay) -> String {
        "The \(words(rule))"
    }

    // MARK: - Dates in words

    /// "Thu, Feb 4".
    static func dayName(_ day: Date, _ calendar: Calendar) -> String {
        formatted(day, "EEE, MMM d", calendar)
    }

    /// "Feb 4".
    static func shortDate(_ day: Date, _ calendar: Calendar) -> String {
        formatted(day, "MMM d", calendar)
    }

    /// "Thursday".
    static func weekdayName(_ day: Date, _ calendar: Calendar) -> String {
        weekdayNames[weekday(day, calendar) - 1]
    }

    /// "2027-02-04" as the start of that local day.
    static func day(from iso: String?, _ calendar: Calendar) -> Date? {
        guard let iso, iso.count == 10 else { return nil }
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /// A local day as "2027-02-04".
    static func iso(_ day: Date, _ calendar: Calendar) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: day)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    private static func formatted(_ date: Date, _ template: String, _ calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = template
        return formatter.string(from: date)
    }

    // MARK: - Private helpers

    private static func monday(of day: Date, _ calendar: Calendar) -> Date {
        add(days: -(weekday(day, calendar) - 1), to: calendar.startOfDay(for: day), calendar)
    }
}
