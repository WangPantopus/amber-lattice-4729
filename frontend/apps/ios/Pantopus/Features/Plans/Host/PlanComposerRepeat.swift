//
//  PlanComposerRepeat.swift
//  Pantopus
//
//  Plans step 2, repeating plans: the host's draft of how a plan repeats
//  (boards Repeats and Monthly), for a new plan and on the host's Change
//  screen. The plan's own date has to be one of the days, so its weekday (or
//  "the 3rd Saturday") is chosen from the start, can't be taken off, and
//  moves with the start. The server checks everything again
//  (planSeries.js `checkedRepeat`); the rules here only keep a refusal rare.
//

import Foundation
import Observation

@Observable
@MainActor
final class PlanRepeatDraft {
    enum Choice: Hashable, CaseIterable {
        case none, weekly, biweekly, monthly
    }

    enum Ends: Hashable {
        case onDate, afterCount
    }

    var choice: Choice = .none
    private(set) var weekdays: Set<Int> = []
    /// Every month: 1 to 4 days in the month's order; one of them is always the start's own.
    private(set) var monthDays: [PlanMonthDay] = []
    var ends: Ends = .onDate
    /// The last local day it may fall on (12 weeks after the start until the host picks one).
    var until: Date {
        didSet { untilChosen = true }
    }

    /// "After a number of times", counted from this plan's date.
    var count = 6
    /// The plan's start, and the calendar of its time zone.
    private(set) var start: Date
    private(set) var calendar: Calendar
    /// Which date of its series the plan is (1 for a new plan): the server counts `count` from the first date.
    private(set) var index = 1
    /// What the plan repeated as when the Change screen opened (nil: it didn't).
    private(set) var original: PlanRepeatBody?
    @ObservationIgnored private var untilChosen = false

    init(start: Date = Date(), calendar: Calendar = .current) {
        let days = PlanRepeatRules.calendar(calendar)
        self.start = start
        self.calendar = days
        until = PlanRepeatRules.add(days: PlanRepeatRules.defaultWeeks * 7, to: days.startOfDay(for: start), days)
        untilChosen = false
    }

    /// The Change screen's draft: the plan's pattern, or "Doesn't repeat". Nil where repeating isn't offered:
    /// a business's plan, or the switch off for a plan that doesn't repeat yet (one that does keeps its row).
    static func forChange(card: PlanCardDTO, start: Date) -> PlanRepeatDraft? {
        guard !card.isBusiness, card.isRepeating || PlansFlags.shared.repeating else { return nil }
        let draft = PlanRepeatDraft(start: start, calendar: PlanFormat.calendar(for: card.timezone))
        if let repeats = card.repeats { draft.load(repeats) }
        return draft
    }

    var isOn: Bool {
        choice != .none
    }

    /// The start's own weekday, which every week or every two weeks always includes.
    var lockedWeekday: Int {
        PlanRepeatRules.weekday(start, calendar)
    }

    var startDay: Date {
        calendar.startOfDay(for: start)
    }

    /// "On a date": from the plan's own date to a year after it.
    var untilRange: ClosedRange<Date> {
        startDay...PlanRepeatRules.add(days: PlanRepeatRules.maxDays, to: startDay, calendar)
    }

    /// "After a number of times": 2 to 100 in all (the dates before this one included), and no more than the
    /// chosen days give within the year a series may run (this date and the days after it).
    var countRange: ClosedRange<Int> {
        let least = index > 1 ? 1 : 2
        var most = PlanRepeatRules.countRange.upperBound - (index - 1)
        if let days = chosenDays {
            most = min(most, PlanRepeatRules.days(after: start, pattern: days, anchor: start, limit: most, calendar).count + 1)
        }
        return least...max(most, least)
    }

    /// A count the days chosen can't reach comes down to what they can.
    private func fitCount() {
        let range = countRange
        let fitted = min(max(count, range.lowerBound), range.upperBound)
        if fitted != count { count = fitted }
    }

    // MARK: - Choosing

    func choose(_ newChoice: Choice) {
        choice = newChoice
        if !weekdays.contains(lockedWeekday) { weekdays.insert(lockedWeekday) }
        if monthDays.isEmpty { monthDays = [PlanRepeatRules.monthDay(for: start, byDate: false, calendar)] }
        fitCount()
    }

    func toggle(weekday: Int) {
        guard weekday != lockedWeekday, (1...7).contains(weekday) else { return }
        if weekdays.contains(weekday) { weekdays.remove(weekday) } else { weekdays.insert(weekday) }
        fitCount()
    }

    var canAddMonthDay: Bool {
        monthDays.count < PlanRepeatRules.monthDayLimit
    }

    func add(_ rule: PlanMonthDay) {
        guard canAddMonthDay, !monthDays.contains(rule) else { return }
        monthDays = Self.ordered(monthDays + [rule])
        fitCount()
    }

    /// A day can go while another one still falls on the plan's own date.
    func canRemove(_ rule: PlanMonthDay) -> Bool {
        monthDays.contains { $0 != rule && PlanRepeatRules.matches($0, day: start, calendar) }
    }

    func remove(_ rule: PlanMonthDay) {
        guard canRemove(rule) else { return }
        monthDays.removeAll { $0 == rule }
        fitCount()
    }

    /// The month's order ("the 1st and 3rd Saturday", "the 1st Monday and 15th"): the server keeps the order it
    /// is sent, and so do its words.
    static func ordered(_ rules: [PlanMonthDay]) -> [PlanMonthDay] {
        var seen = Set<PlanMonthDay>()
        let unique = rules.filter { seen.insert($0).inserted }
        return unique.sorted { place(of: $0) < place(of: $1) }
    }

    private static func place(of rule: PlanMonthDay) -> (Int, Int) {
        switch rule {
        case let .weekday(week, weekday): (week == -1 ? 29 : (week - 1) * 7 + 1, weekday)
        case let .date(day): (day, 0)
        }
    }

    /// The start moved: its weekday (or its day of the month) moves with it, and an end date it passed with it.
    func follow(start newStart: Date) {
        let oldStart = start
        let oldWeekday = lockedWeekday
        // Only what changes is written: every write redraws whatever reads the draft.
        if newStart != start { start = newStart }
        if lockedWeekday != oldWeekday {
            weekdays.remove(oldWeekday)
            weekdays.insert(lockedWeekday)
        } else if !weekdays.contains(lockedWeekday) {
            weekdays.insert(lockedWeekday)
        }
        // None of a month's days falls on the new start: the one that fell on the old start becomes the one that does.
        if !monthDays.isEmpty, !monthDays.contains(where: { PlanRepeatRules.matches($0, day: newStart, calendar) }) {
            let old = monthDays.firstIndex { PlanRepeatRules.matches($0, day: oldStart, calendar) } ?? 0
            var byDate = false
            if case .date = monthDays[old] { byDate = true }
            monthDays[old] = PlanRepeatRules.monthDay(for: newStart, byDate: byDate, calendar)
            monthDays = Self.ordered(monthDays)
        }
        let range = untilRange
        let defaultUntil = PlanRepeatRules.add(days: PlanRepeatRules.defaultWeeks * 7, to: startDay, calendar)
        if !untilChosen, until != defaultUntil {
            until = defaultUntil
            untilChosen = false
        } else if until < range.lowerBound || until > range.upperBound {
            until = min(max(until, range.lowerBound), range.upperBound)
        }
        fitCount()
    }

    // MARK: - What it says and sends

    var pattern: PlanRepeatPattern? {
        guard var pattern = chosenDays else { return nil }
        if ends == .onDate { pattern.until = until } else { pattern.count = count }
        return pattern
    }

    /// How often and on which days, with no end yet.
    private var chosenDays: PlanRepeatPattern? {
        let freq: PlanRepeatFreq
        switch choice {
        case .none: return nil
        case .weekly: freq = .weekly
        case .biweekly: freq = .biweekly
        case .monthly: freq = .monthly
        }
        var pattern = PlanRepeatPattern(freq: freq)
        if freq == .monthly { pattern.monthDays = monthDays } else { pattern.weekdays = weekdays.sorted() }
        return pattern
    }

    /// `repeat` for `POST /api/plans` and `PATCH`: `count` is how many in all, the dates before this one included.
    var body: PlanRepeatBody? {
        guard let pattern else { return nil }
        return PlanRepeatBody(
            freq: pattern.freq,
            weekdays: pattern.freq == .monthly ? nil : pattern.weekdays,
            monthDays: pattern.freq == .monthly ? pattern.monthDays : nil,
            until: pattern.until.map { PlanRepeatRules.iso($0, calendar) },
            count: pattern.count.map { $0 + index - 1 }
        )
    }

    /// The Change screen's `repeat`: nil when it is as it was, `.stop` when it no longer repeats.
    var change: PlanRepeatChange? {
        guard body != original else { return nil }
        return body.map { .set($0) } ?? .stop
    }

    /// The Repeats row: "Every Tue and Thu", "Doesn't repeat".
    var rowValue: String {
        pattern.map { PlanRepeatRules.text($0, short: true) } ?? "Doesn't repeat"
    }

    /// From this plan's date: its last date and how many in all.
    var span: (last: Date, total: Int)? {
        pattern.map { PlanRepeatRules.span($0, first: start, calendar) }
    }

    /// "Every Tue and Thu until Feb 4" (boards Preview and Invited).
    var line: String? {
        guard let pattern, let span else { return nil }
        return PlanRepeatCopy.line(short: PlanRepeatRules.text(pattern, short: true), lastOn: span.last, calendar: calendar)
    }

    /// What VoiceOver reads for the line: "Every Tuesday and Thursday until February 4".
    var spokenLine: String? {
        guard let pattern, let span else { return nil }
        return PlanRepeatCopy.spoken(text: PlanRepeatRules.text(pattern), lastOn: span.last, calendar: calendar)
    }

    /// The summary's bold line: "Every Tuesday and Thursday, 6:30–7:30 AM".
    func summaryTitle(end: Date) -> String? {
        pattern.map { "\(PlanRepeatRules.text($0)), \(PlanFormat.range(start, end, calendar: calendar))" }
    }

    /// "First on Tue, Nov 17. Last on Thu, Feb 4. 24 walks."
    func summaryLine(noun: PlanRepeatCopy.Noun) -> String? {
        guard let span else { return nil }
        let first = PlanRepeatRules.dayName(start, calendar)
        let last = PlanRepeatRules.dayName(span.last, calendar)
        return "First on \(first). Last on \(last). \(span.total) \(span.total == 1 ? noun.one : noun.many)."
    }

    // MARK: - Reading a plan's pattern

    private func load(_ repeats: PlanRepeatDTO) {
        index = repeats.index
        switch repeats.freq {
        case .weekly: choice = .weekly
        case .biweekly: choice = .biweekly
        case .monthly: choice = .monthly
        }
        weekdays = Set(repeats.weekdays)
        monthDays = Self.ordered(Array(repeats.monthDays.prefix(PlanRepeatRules.monthDayLimit)))
        if let total = repeats.count {
            ends = .afterCount
            count = total - (index - 1)
        } else if let day = PlanRepeatRules.day(from: repeats.until ?? repeats.lastOn, calendar) {
            ends = .onDate
            until = day
        }
        // The plan's own day is one of them, as a new plan's is.
        choose(choice)
        if choice == .monthly, !monthDays.contains(where: { PlanRepeatRules.matches($0, day: start, calendar) }) {
            monthDays = Self.ordered(Array(monthDays.prefix(PlanRepeatRules.monthDayLimit - 1))
                + [PlanRepeatRules.monthDay(for: start, byDate: false, calendar)])
        }
        follow(start: start)
        // What it is now, so saving sends `repeat` only when the host changed it.
        original = body
    }
}

extension PlanComposerModel {
    /// The host may set a new plan to repeat (the switch is on, and it's their own plan, never a business's).
    var offersRepeat: Bool {
        PlansFlags.shared.repeating && !isBusiness
    }

    /// The preview's repeat line ("Every Tue and Thu until Feb 4"), or nil when it doesn't repeat.
    var repeatLine: String? {
        offersRepeat ? repeating.line : nil
    }

    /// What VoiceOver reads for it, with the days' full names.
    var repeatSpoken: String? {
        offersRepeat ? repeating.spokenLine : nil
    }

    /// `repeat` on `POST /api/plans`, from the plan's start.
    func applyRepeat(to body: inout CreatePlanBody) {
        guard offersRepeat else { return }
        repeating.follow(start: effectiveStart)
        body.repeatPattern = repeating.body
    }
}
