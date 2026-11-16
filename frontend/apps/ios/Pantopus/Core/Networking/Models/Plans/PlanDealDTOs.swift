//
//  PlanDealDTOs.swift
//  Pantopus
//
//  Plans for the holidays, the business track B1 (contract 9; 07-screens D1
//  to D4): one deal on a business's plan, from the fixed kinds. Every word of
//  a deal is the server's: the app shows `text`, `tag`, `short` and the lines
//  as sent and never composes "20% off". The card carries `deal` only with
//  `biz=1` while the plan's business has `plans_deals`; without it the plan is
//  today's. Route backend/services/plans/planDeals.js (`cardView`,
//  `preview`, `markUsed`), backend/routes/plans.js.
//

import Foundation

/// A deal's state: for everyone (`on`), a group deal still `open`, `unlocked` or fallen `short`.
public enum PlanDealState: String, Decodable, Sendable, Hashable {
    case on
    case open
    case unlocked
    case short
    case unknown

    public init(from decoder: any Decoder) throws {
        self = try PlanDealState(rawValue: decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// "Your deal": `waiting` before a group deal settles, `ready`, `used`, or `none` after it fell short with nothing.
public enum PlanDealMineState: String, Codable, Sendable, Hashable {
    case waiting
    case ready
    case used
    case none
    case unknown

    public init(from decoder: any Decoder) throws {
        self = try PlanDealMineState(rawValue: decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }
}

/// A group deal's count: `size` people by `by`; `in` now, `left` to go, and the time left in words.
public struct PlanDealGroupDTO: Decodable, Sendable, Hashable {
    public let size: Int
    public let inCount: Int
    public let left: Int
    public let by: String?
    /// "2 days left", "3 hours left", "Closes at 5:00 PM"; nil once settled.
    public let leftText: String?

    enum CodingKeys: String, CodingKey {
        case size, left, by
        case inCount = "in"
        case leftText = "left_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        size = (try? container.decodeIfPresent(Int.self, forKey: .size)) ?? 0
        inCount = (try? container.decodeIfPresent(Int.self, forKey: .inCount)) ?? 0
        left = (try? container.decodeIfPresent(Int.self, forKey: .left)) ?? 0
        by = try? container.decodeIfPresent(String.self, forKey: .by)
        leftText = try? container.decodeIfPresent(String.self, forKey: .leftText)
    }
}

/// The guest's own deal, for a guest who is in.
public struct PlanDealMineDTO: Decodable, Sendable, Hashable {
    public let state: PlanDealMineState
    /// What they get now (the smaller deal after one fell short).
    public let short: String?
    /// "Show this to your server." / "It comes off by itself when you pay your bill here in Pantopus. …".
    public let text: String?
    /// Something free: the guest's first name, so staff can match the person (no code, no QR).
    public let name: String?
    public let usedAt: String?
    /// Money off a group price (B4): what comes back to the guest's card, and when it went back.
    public let backCents: Int?
    public let backAt: String?

    enum CodingKeys: String, CodingKey {
        case state, short, text, name
        case usedAt = "used_at"
        case backCents = "back_cents"
        case backAt = "back_at"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        state = (try? container.decodeIfPresent(PlanDealMineState.self, forKey: .state)) ?? .unknown
        short = try? container.decodeIfPresent(String.self, forKey: .short)
        text = try? container.decodeIfPresent(String.self, forKey: .text)
        name = try? container.decodeIfPresent(String.self, forKey: .name)
        usedAt = try? container.decodeIfPresent(String.self, forKey: .usedAt)
        backCents = try? container.decodeIfPresent(Int.self, forKey: .backCents)
        backAt = try? container.decodeIfPresent(String.self, forKey: .backAt)
    }

    public var usedAtDate: Date? {
        PlanTime.parse(usedAt)
    }
}

/// A deal as posted and changed (contract 9.1): also what the card's `form` carries back for staff.
public struct PlanDealInput: Codable, Sendable, Hashable {
    /// `everyone` or `group`.
    public var scope: String
    /// `free_item`; with money (B4, B5) `percent` or `amount`.
    public var kind: String
    /// Something free: 1 to 40 characters ("appetizer for the table"); "A free" is the server's.
    public var item: String?
    /// The percent (5 to 50) or cents, for the money kinds.
    public var value: Int?
    /// For the money kinds: `spot`, `food`, `no_alcohol`.
    public var appliesTo: String?
    public var groupSize: Int?
    public var groupBy: String?
    /// The smaller deal when a group deal falls short (`kind`, `item` / `value`), or nil.
    public var ifShort: PlanDealSmaller?

    enum CodingKeys: String, CodingKey {
        case scope, kind, item, value
        case appliesTo = "applies_to"
        case groupSize = "group_size"
        case groupBy = "group_by"
        case ifShort = "if_short"
    }

    public init(
        scope: String,
        kind: String,
        item: String? = nil,
        value: Int? = nil,
        appliesTo: String? = nil,
        groupSize: Int? = nil,
        groupBy: String? = nil,
        ifShort: PlanDealSmaller? = nil
    ) {
        self.scope = scope
        self.kind = kind
        self.item = item
        self.value = value
        self.appliesTo = appliesTo
        self.groupSize = groupSize
        self.groupBy = groupBy
        self.ifShort = ifShort
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        scope = (try? container.decodeIfPresent(String.self, forKey: .scope)) ?? "everyone"
        kind = (try? container.decodeIfPresent(String.self, forKey: .kind)) ?? "free_item"
        item = try? container.decodeIfPresent(String.self, forKey: .item)
        value = try? container.decodeIfPresent(Int.self, forKey: .value)
        appliesTo = try? container.decodeIfPresent(String.self, forKey: .appliesTo)
        groupSize = try? container.decodeIfPresent(Int.self, forKey: .groupSize)
        groupBy = try? container.decodeIfPresent(String.self, forKey: .groupBy)
        // Always an object or null (never a word).
        ifShort = try? container.decodeIfPresent(PlanDealSmaller.self, forKey: .ifShort)
    }

    /// `if_short` goes as `null` when there is no smaller deal, so a change can take one away.
    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(scope, forKey: .scope)
        try container.encode(kind, forKey: .kind)
        try container.encodeIfPresent(item, forKey: .item)
        try container.encodeIfPresent(value, forKey: .value)
        try container.encodeIfPresent(appliesTo, forKey: .appliesTo)
        if scope == "group" {
            try container.encodeIfPresent(groupSize, forKey: .groupSize)
            try container.encodeIfPresent(groupBy, forKey: .groupBy)
            try container.encode(ifShort, forKey: .ifShort)
        }
    }
}

/// The smaller deal a group deal gives when it falls short: the same shape, for everyone.
public struct PlanDealSmaller: Codable, Sendable, Hashable {
    public var kind: String
    public var item: String?
    public var value: Int?
    public var appliesTo: String?

    enum CodingKeys: String, CodingKey {
        case kind, item, value
        case appliesTo = "applies_to"
    }

    public init(kind: String, item: String? = nil, value: Int? = nil, appliesTo: String? = nil) {
        self.kind = kind
        self.item = item
        self.value = value
        self.appliesTo = appliesTo
    }
}

/// A card's `deal`: the words, the count and, for a guest who is in, their own deal.
public struct PlanDealDTO: Decodable, Sendable, Hashable {
    public let scope: String
    public let kind: String
    /// The sentence in large type: "A free appetizer for the table".
    public let text: String
    /// The one tag a list row shows: "Deal", "20% off".
    public let tag: String?
    /// The deal in a few words, for "Your deal".
    public let short: String?
    public let state: PlanDealState
    /// "if 12 people are in by Friday at 5:00 PM".
    public let conditionText: String?
    public let group: PlanDealGroupDTO?
    /// Under the count while open: "If it doesn't get to 12, the night still happens, without the deal."
    public let ifShortText: String?
    /// Once settled: "Unlocked: 14 are in" / "It didn't get to 12. The night still happens."
    public let stateText: String?
    /// Under the join button: "Free to join. Show your deal there."
    public let joinText: String?
    public let mine: PlanDealMineDTO?
    /// Money off a spot (B4): one spot with the deal.
    public let priceCents: Int?
    /// Staff: what the form fills in for "Change", and whether it still may (nobody in yet).
    public let form: PlanDealInput?
    public let canChange: Bool?

    enum CodingKeys: String, CodingKey {
        case scope, kind, text, tag, short, state, group, mine, form
        case conditionText = "condition_text"
        case ifShortText = "if_short_text"
        case stateText = "state_text"
        case joinText = "join_text"
        case priceCents = "price_cents"
        case canChange = "can_change"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        scope = (try? container.decodeIfPresent(String.self, forKey: .scope)) ?? "everyone"
        kind = (try? container.decodeIfPresent(String.self, forKey: .kind)) ?? "free_item"
        text = try container.decode(String.self, forKey: .text)
        tag = try? container.decodeIfPresent(String.self, forKey: .tag)
        short = try? container.decodeIfPresent(String.self, forKey: .short)
        state = (try? container.decodeIfPresent(PlanDealState.self, forKey: .state)) ?? .unknown
        conditionText = try? container.decodeIfPresent(String.self, forKey: .conditionText)
        group = try? container.decodeIfPresent(PlanDealGroupDTO.self, forKey: .group)
        ifShortText = try? container.decodeIfPresent(String.self, forKey: .ifShortText)
        stateText = try? container.decodeIfPresent(String.self, forKey: .stateText)
        joinText = try? container.decodeIfPresent(String.self, forKey: .joinText)
        mine = try? container.decodeIfPresent(PlanDealMineDTO.self, forKey: .mine)
        priceCents = try? container.decodeIfPresent(Int.self, forKey: .priceCents)
        form = try? container.decodeIfPresent(PlanDealInput.self, forKey: .form)
        canChange = try? container.decodeIfPresent(Bool.self, forKey: .canChange)
    }

    public var isGroup: Bool {
        scope == "group"
    }

    public var isFreeItem: Bool {
        kind == "free_item"
    }

    /// A group deal still counting toward its number.
    public var isOpenGroup: Bool {
        isGroup && state == .open
    }
}

/// A guest's deal in the staff's Going list (`people`): whether their free thing is ready or used.
public struct PlanPersonDealDTO: Codable, Sendable, Hashable {
    public let state: PlanDealMineState
    public let usedAt: String?

    enum CodingKeys: String, CodingKey {
        case state
        case usedAt = "used_at"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        state = (try? container.decodeIfPresent(PlanDealMineState.self, forKey: .state)) ?? .unknown
        usedAt = try? container.decodeIfPresent(String.self, forKey: .usedAt)
    }

    public var usedAtDate: Date? {
        PlanTime.parse(usedAt)
    }
}

/// A change to a plan's deal on `PATCH /api/plans/:id`: a new deal, or `null` to take it off.
public enum PlanDealChange: Encodable, Sendable, Hashable {
    case set(PlanDealInput)
    case remove

    public func encode(to encoder: any Encoder) throws {
        switch self {
        case let .set(deal):
            try deal.encode(to: encoder)
        case .remove:
            var container = encoder.singleValueContainer()
            try container.encodeNil()
        }
    }
}

/// `POST /api/plans/deal-preview?biz=1`: the sentence guests will read, how it's claimed, and field errors.
public struct PlanDealPreviewBody: Encodable, Sendable, Hashable {
    public let businessUserId: String
    public let deal: PlanDealInput
    public let spots: Int
    public let startsAt: String
    public var priceCents: Int?
    public var payHere: Bool?

    enum CodingKeys: String, CodingKey {
        case deal, spots
        case businessUserId = "business_user_id"
        case startsAt = "starts_at"
        case priceCents = "price_cents"
        case payHere = "pay_here"
    }
}

public struct PlanDealPreviewResponse: Decodable, Sendable, Hashable {
    public let ok: Bool
    public let text: String?
    public let conditionText: String?
    public let ifShortText: String?
    public let claimText: String?
    /// Money off the spot (B4): one spot with the deal.
    public let priceCents: Int?
    /// The server's words under each field it refuses ("item", "group_size", "value", …).
    public let errors: [String: String]

    enum CodingKeys: String, CodingKey {
        case ok, text, errors
        case conditionText = "condition_text"
        case ifShortText = "if_short_text"
        case claimText = "claim_text"
        case priceCents = "price_cents"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ok = (try? container.decodeIfPresent(Bool.self, forKey: .ok)) ?? false
        text = try? container.decodeIfPresent(String.self, forKey: .text)
        conditionText = try? container.decodeIfPresent(String.self, forKey: .conditionText)
        ifShortText = try? container.decodeIfPresent(String.self, forKey: .ifShortText)
        claimText = try? container.decodeIfPresent(String.self, forKey: .claimText)
        priceCents = try? container.decodeIfPresent(Int.self, forKey: .priceCents)
        errors = (try? container.decodeIfPresent([String: String].self, forKey: .errors)) ?? [:]
    }
}

/// `POST /api/plans/:id/requests/:requestId/deal-used`.
public struct PlanDealUsedResponse: Decodable, Sendable, Hashable {
    public let requestId: String?
    public let deal: PlanPersonDealDTO?

    enum CodingKeys: String, CodingKey {
        case deal
        case requestId = "request_id"
    }
}

/// What a business may add to a plan (host-as, contract 9.2): which rows the form draws, and whether it can charge now.
public struct PlanBusinessCanDTO: Decodable, Sendable, Hashable {
    public let deals: Bool
    public let price: Bool
    public let payHere: Bool

    static let none = PlanBusinessCanDTO(deals: false, price: false, payHere: false)

    enum CodingKeys: String, CodingKey {
        case deals, price
        case payHere = "pay_here"
    }

    init(deals: Bool, price: Bool, payHere: Bool) {
        self.deals = deals
        self.price = price
        self.payHere = payHere
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        deals = (try? container.decodeIfPresent(Bool.self, forKey: .deals)) ?? false
        price = (try? container.decodeIfPresent(Bool.self, forKey: .price)) ?? false
        payHere = (try? container.decodeIfPresent(Bool.self, forKey: .payHere)) ?? false
    }
}
