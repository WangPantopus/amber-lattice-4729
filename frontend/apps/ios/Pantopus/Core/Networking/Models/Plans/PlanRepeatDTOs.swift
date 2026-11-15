//
//  PlanRepeatDTOs.swift
//  Pantopus
//
//  Plans step 2, repeating plans (founder approval 2026-11-14; the apps'
//  contract is CONTRACT-step2.md in the PLANSMORE stream folder): a plan that
//  repeats every week on chosen days, every two weeks, or every month, until a
//  date or for a number of times. Each date is its own plan; the next one is
//  posted when the one before it ends, or at once when its host skips it.
//  Setting one up is behind `plans_repeat`. Every key here is new: an older
//  server sends none of them, and its plans read as plans that don't repeat.
//
//  Route: backend/routes/plans.js; the pattern, its words and its dates are
//  backend/services/plans/planSeries.js (`checkedRepeat`, `view`).
//

import Foundation

/// How often a plan repeats.
public enum PlanRepeatFreq: String, Codable, Sendable, Hashable, CaseIterable {
    case weekly
    case biweekly
    case monthly
}

/// One day of the month a monthly plan falls on: a weekday of a week of the month ("the 3rd Saturday"; week
/// -1 is the last) or a date ("the 21st"). Weekdays are Monday 1 … Sunday 7.
public enum PlanMonthDay: Codable, Sendable, Hashable {
    case weekday(week: Int, weekday: Int)
    case date(Int)

    enum CodingKeys: String, CodingKey {
        case week, weekday, day
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let day = try container.decodeIfPresent(Int.self, forKey: .day) {
            self = .date(day)
        } else {
            self = try .weekday(
                week: container.decode(Int.self, forKey: .week),
                weekday: container.decode(Int.self, forKey: .weekday)
            )
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .weekday(week, weekday):
            try container.encode(week, forKey: .week)
            try container.encode(weekday, forKey: .weekday)
        case let .date(day):
            try container.encode(day, forKey: .day)
        }
    }
}

/// A card's `repeat`: the pattern, its words ("Every Tuesday and Thursday", "Every Tue and Thu"), which date of
/// the series this plan is and of how many, and the series' last date ("2027-02-04"). Everyone who can read the
/// card gets it. Missing or malformed, the plan reads as one that doesn't repeat; a malformed part reads as
/// missing, never failing the card.
public struct PlanRepeatDTO: Decodable, Sendable, Hashable {
    public let freq: PlanRepeatFreq
    public let weekdays: [Int]
    public let monthDays: [PlanMonthDay]
    /// The last day it may fall on ("2027-02-04"), in the plan's time zone; nil when it ends after a count.
    public let until: String?
    /// How many dates in all; nil when it ends on a date.
    public let count: Int?
    public let text: String?
    public let short: String?
    /// Which date of the series this plan is (1 for the first).
    public let index: Int
    public let total: Int?
    public let lastOn: String?

    enum CodingKeys: String, CodingKey {
        case freq, weekdays, until, count, text, short, index, total
        case monthDays = "month_days"
        case lastOn = "last_on"
    }

    /// The card's own key.
    enum CardKeys: String, CodingKey {
        case repetition = "repeat"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        freq = try container.decode(PlanRepeatFreq.self, forKey: .freq)
        weekdays = ((try? container.decodeIfPresent([Int].self, forKey: .weekdays)) ?? []).filter { (1...7).contains($0) }
        monthDays = (try? container.decodeIfPresent(LossyList<PlanMonthDay>.self, forKey: .monthDays))?.items ?? []
        until = container.lenient(String.self, forKey: .until)
        count = container.lenient(Int.self, forKey: .count)
        text = container.lenient(String.self, forKey: .text)
        short = container.lenient(String.self, forKey: .short)
        index = max(1, container.lenient(Int.self, forKey: .index) ?? 1)
        total = container.lenient(Int.self, forKey: .total)
        lastOn = container.lenient(String.self, forKey: .lastOn)
    }

    /// `repeat` read from a card's own keys: nil when it is missing, null or malformed.
    static func read(from decoder: any Decoder) -> PlanRepeatDTO? {
        guard let container = try? decoder.container(keyedBy: CardKeys.self) else { return nil }
        return try? container.decodeIfPresent(PlanRepeatDTO.self, forKey: .repetition)
    }
}

/// How a plan repeats, as `POST /api/plans` and `PATCH /api/plans/:id` take it: `weekdays` for every week or
/// every two weeks, `month_days` (1 to 4) for every month, and `until` or `count` (neither: 12 weeks).
public struct PlanRepeatBody: Encodable, Sendable, Hashable {
    public let freq: PlanRepeatFreq
    public let weekdays: [Int]?
    public let monthDays: [PlanMonthDay]?
    /// "YYYY-MM-DD", the last day it may fall on, in the plan's time zone.
    public let until: String?
    /// 2 to 100 dates in all.
    public let count: Int?

    enum CodingKeys: String, CodingKey {
        case freq, weekdays, until, count
        case monthDays = "month_days"
    }

    public init(freq: PlanRepeatFreq, weekdays: [Int]?, monthDays: [PlanMonthDay]?, until: String?, count: Int?) {
        self.freq = freq
        self.weekdays = weekdays
        self.monthDays = monthDays
        self.until = until
        self.count = count
    }
}

/// `repeat` on `PATCH /api/plans/:id`: a new pattern from this date on, or an explicit JSON `null` to stop (this
/// date stays, none follows). Left out of the body (nil), the pattern doesn't change.
public enum PlanRepeatChange: Encodable, Sendable, Hashable {
    case set(PlanRepeatBody)
    case stop

    public func encode(to encoder: any Encoder) throws {
        switch self {
        case let .set(body):
            try body.encode(to: encoder)
        case .stop:
            var container = encoder.singleValueContainer()
            try container.encodeNil()
        }
    }
}

/// `POST /api/plans/:id/cancel` with `repeat: "keep"` ("Skip Thursday"): the date that took this one's place,
/// or nil when the series is over (or the server couldn't post it).
public struct PlanCancelResponse: Decodable, Sendable {
    public let nextPlanId: String?

    enum CodingKeys: String, CodingKey {
        case nextPlanId = "next_plan_id"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        nextPlanId = container.lenient(String.self, forKey: .nextPlanId).flatMap { $0.isEmpty ? nil : $0 }
    }
}

public extension PlanCardDTO {
    /// The plan is one date of a repeating plan that is still set to repeat.
    var isRepeating: Bool {
        repeats != nil
    }
}
