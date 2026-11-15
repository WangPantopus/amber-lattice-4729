//
//  PlanRepeatParts.swift
//  Pantopus
//
//  Plans step 2, repeating plans: the parts a repeating plan adds wherever a
//  plan shows. The repeat line under the date line ("Every Tue and Thu until
//  Feb 4", boards Preview and Invited), the Repeats row in the When card
//  (board Details), and the words they share. A plan the server says repeats
//  shows its lines whatever `plans_repeat` says.
//

import SwiftUI

/// The words repeating plans share (the same on Android).
enum PlanRepeatCopy {
    /// What a summary counts: "24 walks", "6 times".
    struct Noun: Equatable {
        let one: String
        let many: String
    }

    static let times = Noun(one: "time", many: "times")

    /// The kind's short noun, or "times" where it has none (coffee, a study group, something else). The newer kinds
    /// count by their details (`details`: "hikes", "happy hours"), as the server's nouns go.
    static func noun(kind: PlanKind, walkKind: String?, details: PlanDetailsDTO? = nil) -> Noun {
        switch kind {
        case .foodDrinks, .gameNight, .outdoors, .somethingElse:
            PlanKindsMore.repeatNoun(kind, details).map { Noun(one: $0.one, many: $0.many) } ?? times
        case .watchParty: Noun(one: "watch party", many: "watch parties")
        case .playdate: Noun(one: "playdate", many: "playdates")
        case .pickupGame: Noun(one: "game", many: "games")
        case .studyGroup: times
        case .walkCoffee:
            switch walkKind {
            case "coffee": times
            case "dog_walk": Noun(one: "dog walk", many: "dog walks")
            case "stroller_walk": Noun(one: "stroller walk", many: "stroller walks")
            default: Noun(one: "walk", many: "walks")
            }
        }
    }

    /// "Every Tue and Thu until Feb 4".
    static func line(short: String, lastOn: Date?, calendar: Calendar) -> String {
        guard let lastOn else { return short }
        return "\(short) until \(PlanRepeatRules.shortDate(lastOn, PlanRepeatRules.calendar(calendar)))"
    }

    /// A card's repeat line: the server's short words, "until" its last date.
    static func line(_ card: PlanCardDTO) -> String? {
        guard let repeats = card.repeats else { return nil }
        let calendar = PlanRepeatRules.calendar(PlanFormat.calendar(for: card.timezone))
        return line(short: short(repeats), lastOn: PlanRepeatRules.day(from: repeats.lastOn, calendar), calendar: calendar)
    }

    /// What VoiceOver reads for a line: the full words, "Every Tuesday and Thursday until February 4".
    static func spoken(text: String, lastOn: Date?, calendar: Calendar) -> String {
        guard let lastOn else { return text }
        return "\(text) until \(PlanRepeatRules.longDate(lastOn, PlanRepeatRules.calendar(calendar)))"
    }

    /// A card's line as VoiceOver reads it: the server's `text` (the days' full names), until its last date.
    static func spoken(_ card: PlanCardDTO) -> String? {
        guard let repeats = card.repeats else { return nil }
        let calendar = PlanRepeatRules.calendar(PlanFormat.calendar(for: card.timezone))
        return spoken(text: text(repeats), lastOn: PlanRepeatRules.day(from: repeats.lastOn, calendar), calendar: calendar)
    }

    /// The server's full words, or the phone's when an older answer has none.
    static func text(_ repeats: PlanRepeatDTO) -> String {
        if let text = repeats.text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty { return text }
        return PlanRepeatRules.text(pattern(repeats))
    }

    /// The host line as VoiceOver reads it: "Every Tuesday and Thursday, 6:30 AM".
    static func hostSpoken(_ card: PlanCardDTO) -> String {
        let words = card.repeats.map { text($0) } ?? ""
        guard let start = card.startsAtDate else { return words }
        return "\(words), \(PlanFormat.time(start, calendar: PlanFormat.calendar(for: card.timezone)))"
    }

    /// The board Regulars line on the host's card: "Every Tue and Thu · 6:30 AM".
    static func hostLine(_ card: PlanCardDTO) -> String {
        let words = card.repeats.map { short($0) } ?? ""
        guard let start = card.startsAtDate else { return words }
        return "\(words) · \(PlanFormat.time(start, calendar: PlanFormat.calendar(for: card.timezone)))"
    }

    /// The server's short words, or the phone's when an older answer has none.
    static func short(_ repeats: PlanRepeatDTO) -> String {
        if let short = repeats.short?.trimmingCharacters(in: .whitespacesAndNewlines), !short.isEmpty { return short }
        return PlanRepeatRules.text(pattern(repeats), short: true)
    }

    static func pattern(_ repeats: PlanRepeatDTO) -> PlanRepeatPattern {
        PlanRepeatPattern(freq: repeats.freq, weekdays: repeats.weekdays.sorted(), monthDays: repeats.monthDays)
    }

    /// Board Invited, for someone asked to one date of a repeating plan.
    static let invitedLine = "Say yes to this one; you'll be asked again for each one."

    /// The Repeats screen's two lines.
    static let eachDateLine = "Each date is its own plan. The next one is posted when the last one ends."
    static let askedLine = "People who came before are asked each time: "
        + "\u{201C}I'm in\u{201D} or \u{201C}Can't make it\u{201D}."

    /// After a date is skipped or cancelled on its own (`repeat: "keep"`): on the next date's screen when one was
    /// posted; otherwise whether that was the series' last date (the card said so) or the next one wasn't posted
    /// (the server answers no `next_plan_id` for a limit or an error too).
    static let skippedToast = "Cancelled. The next date is posted."
    static let lastDateToast = "Cancelled. That was the last date."
    static let notPostedToast = "Cancelled. The next date wasn't posted."

    /// The confirm before "Stop repeating".
    static let stopMessage = "This date stays. No more are posted after it."

    /// "Skip Thursday" on the host's card, in the plan's time zone.
    static func skipTitle(_ card: PlanCardDTO) -> String {
        guard let start = card.startsAtDate else { return "Skip this date" }
        let calendar = PlanRepeatRules.calendar(PlanFormat.calendar(for: card.timezone))
        return "Skip \(PlanRepeatRules.weekdayName(start, calendar))"
    }

    /// "Skip Thursday's walk?" and its sentence.
    static func skipQuestion(_ card: PlanCardDTO) -> (title: String, message: String) {
        let calendar = PlanRepeatRules.calendar(PlanFormat.calendar(for: card.timezone))
        let day = card.startsAtDate.map { "\(PlanRepeatRules.weekdayName($0, calendar))'s" } ?? "this"
        return ("Skip \(day) \(PlanCardLines.noun(card))?", "The people who are in are told, and the next date is posted.")
    }

    /// The well on the host's card: "Next: Thu, Nov 19" and "2 of 24 · ends Thu, Feb 4".
    static func well(_ card: PlanCardDTO) -> (next: String, progress: String?) {
        let calendar = PlanRepeatRules.calendar(PlanFormat.calendar(for: card.timezone))
        let next: String = if card.state == .live {
            "Happening now"
        } else {
            card.startsAtDate.map { "Next: \(PlanRepeatRules.dayName($0, calendar))" } ?? "Next"
        }
        guard let repeats = card.repeats else { return (next, nil) }
        let ends = PlanRepeatRules.day(from: repeats.lastOn, calendar).map { "ends \(PlanRepeatRules.dayName($0, calendar))" }
        let place = repeats.total.map { "\(min(repeats.index, $0)) of \($0)" }
        let progress = [place, ends].compactMap { $0 }.joined(separator: " · ")
        return (next, progress.isEmpty ? nil : progress)
    }
}

/// The repeat glyph and "Every Tue and Thu until Feb 4", under a date line.
struct PlanRepeatLine: View {
    let text: String
    /// What VoiceOver reads instead, with the days' full names ("Every Tuesday and Thursday until February 4").
    var spoken: String?
    /// A list row's smaller, quieter line.
    var compact = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: compact ? Spacing.s1 : Spacing.s2) {
            Icon(.arrowsRepeat, size: compact ? 12 : 16, color: Theme.Color.appTextSecondary)
                .alignmentGuide(.firstTextBaseline) { $0[.bottom] - (compact ? 2 : 3) }
            Text(text)
                .planFont(compact ? .footnote : .small)
                .monospacedDigit()
                .foregroundStyle(compact ? Theme.Color.appTextSecondary : Theme.Color.appTextStrong)
                .lineLimit(compact ? 1 : nil)
                .fixedSize(horizontal: false, vertical: !compact)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Repeats: \(spoken ?? text)")
        .accessibilityIdentifier("planRepeatLine")
    }
}

/// Board Details: the Repeats row in the When card, under Ends ("Doesn't repeat", or the pattern's short words).
struct PlanRepeatsRow: View {
    let value: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.s3) {
                Icon(.arrowsRepeat, size: 18, color: Theme.Color.appTextSecondary)
                Text("Repeats").planFont(.body).foregroundStyle(Theme.Color.appText)
                Spacer(minLength: Spacing.s2)
                Text(value)
                    .planFont(.bodyStrong)
                    .foregroundStyle(Theme.Color.appText)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(2)
                Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
            }
            .padding(.vertical, Spacing.s2)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Repeats")
        .accessibilityValue(value)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("planRepeatsRow")
    }
}
