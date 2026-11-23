//
//  MailDates.swift
//  Pantopus
//
//  Date reading and the postal date words for the Mailbox's drawn mail (moved out of MailPieceModel.swift).
//

import Foundation

/// Date reading and the postal date words.
enum MailDates {
    static func parse(_ iso: String?) -> Date? {
        guard let iso, !iso.isEmpty else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    /// A calendar day ("2026-11-07"), at noon so no zone moves it a day.
    static func parseDay(_ day: String) -> Date? {
        let parts = day.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var components = DateComponents()
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        components.hour = 12
        return Calendar.current.date(from: components)
    }

    static func daysBetween(_ start: Date, _ end: Date, calendar: Calendar) -> Int {
        let from = calendar.startOfDay(for: start)
        let to = calendar.startOfDay(for: end)
        return calendar.dateComponents([.day], from: from, to: to).day ?? 0
    }

    /// "OCT 27".
    static func postmarkDay(_ date: Date, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date).uppercased()
    }

    /// "7:42 a.m." today, "Mon" within the week, "Oct 12" before that.
    static func arrivalLabel(_ date: Date, now: Date, calendar: Calendar) -> String {
        let days = daysBetween(date, now, calendar: calendar)
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US")
        switch days {
        case ..<1:
            return time(date, calendar: calendar)
        case 1..<7:
            formatter.dateFormat = "EEE"
        default:
            formatter.dateFormat = "MMM d"
        }
        return formatter.string(from: date)
    }

    /// "7:42 a.m."
    static func time(_ date: Date, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
            .replacingOccurrences(of: "AM", with: "a.m.")
            .replacingOccurrences(of: "PM", with: "p.m.")
    }

    /// "Fri, Nov 7".
    static func dueDay(_ date: Date, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "EEE, MMM d"
        return formatter.string(from: date)
    }

    /// "$184.00".
    static func money(cents: Int, currency: String?) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = (currency ?? "usd").uppercased()
        formatter.locale = Locale(identifier: "en_US")
        return formatter.string(from: NSNumber(value: Double(cents) / 100)) ?? "$\(cents / 100)"
    }

    /// The list's day sections, newest first.
    static func sectionTitle(for date: Date, now: Date, calendar: Calendar) -> (id: String, title: String) {
        switch daysBetween(date, now, calendar: calendar) {
        case ..<1: ("today", "Today")
        case 1: ("yesterday", "Yesterday")
        case 2..<7: ("week", "This past week")
        default: ("earlier", "Earlier")
        }
    }
}
