//
//  PlanGiftDTOs.swift
//  Pantopus
//
//  Plans for the holidays, the gift exchange (08-extras section 4, boards 26 and 28). The card's `gift` comes to the
//  host and the people who are in, with `extras=1` while `plans_gift_exchange` is on for the host. Whom the reader
//  drew (`mine.giving_to`) is in the reader's own card only: never log it, never put it in an analytics event, a push
//  or a widget. Route backend/services/plans/planGift.js (`view`).
//

import Foundation

public struct PlanGiftDTO: Decodable, Sendable, Hashable {
    public let budgetCents: Int
    /// "Up to $25".
    public let budgetText: String
    public let drawAt: String?
    /// "Names are drawn Friday at noon", then "Names are drawn".
    public let drawText: String
    /// "open" or "drawn".
    public let state: String
    public let joined: Int
    /// "8 joined".
    public let joinedText: String
    public let canJoin: Bool
    public let mine: PlanGiftMineDTO?

    public var isDrawn: Bool {
        state == "drawn"
    }

    enum CodingKeys: String, CodingKey {
        case state, joined, mine
        case budgetCents = "budget_cents"
        case budgetText = "budget_text"
        case drawAt = "draw_at"
        case drawText = "draw_text"
        case joinedText = "joined_text"
        case canJoin = "can_join"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        budgetCents = try container.decodeIfPresent(Int.self, forKey: .budgetCents) ?? 0
        budgetText = try container.decodeIfPresent(String.self, forKey: .budgetText) ?? ""
        drawAt = try container.decodeIfPresent(String.self, forKey: .drawAt)
        drawText = try container.decodeIfPresent(String.self, forKey: .drawText) ?? ""
        state = try container.decodeIfPresent(String.self, forKey: .state) ?? "open"
        joined = try container.decodeIfPresent(Int.self, forKey: .joined) ?? 0
        joinedText = try container.decodeIfPresent(String.self, forKey: .joinedText) ?? ""
        canJoin = try container.decodeIfPresent(Bool.self, forKey: .canJoin) ?? false
        mine = try? container.decodeIfPresent(PlanGiftMineDTO.self, forKey: .mine)
    }
}

/// The reader's own part: whether they joined, their wish, and after the draw whom they give to.
public struct PlanGiftMineDTO: Decodable, Sendable, Hashable {
    public let joined: Bool
    public let wish: String?
    public let givingTo: PlanGiftReceiverDTO?
    /// "Sam's wish"; nil when the person drawn has none.
    public let wishText: String?
    /// "Only you can see who you drew. Bring it on Saturday."
    public let secretText: String?

    enum CodingKeys: String, CodingKey {
        case wish
        case joined = "in"
        case givingTo = "giving_to"
        case wishText = "wish_text"
        case secretText = "secret_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        joined = try container.decodeIfPresent(Bool.self, forKey: .joined) ?? false
        wish = try container.decodeIfPresent(String.self, forKey: .wish)
        givingTo = try? container.decodeIfPresent(PlanGiftReceiverDTO.self, forKey: .givingTo)
        wishText = try container.decodeIfPresent(String.self, forKey: .wishText)
        secretText = try container.decodeIfPresent(String.self, forKey: .secretText)
    }
}

/// The person the reader drew: "Sam K." and their wish.
public struct PlanGiftReceiverDTO: Decodable, Sendable, Hashable {
    public let name: String
    public let wish: String?
}

/// `{ gift }`, the answer to joining, changing a wish, leaving and drawing.
public struct PlanGiftResponse: Decodable, Sendable, Hashable {
    public let gift: PlanGiftDTO?
}

/// "Join" and "Change": the wish, 0 to 120 characters.
public struct PlanGiftWishBody: Encodable, Sendable {
    public let wish: String
}

/// The host form's value: `{ budget_cents, draw_at }`.
public struct PlanGiftBody: Encodable, Sendable, Hashable {
    public let budgetCents: Int
    public let drawAt: String

    enum CodingKeys: String, CodingKey {
        case budgetCents = "budget_cents"
        case drawAt = "draw_at"
    }
}

/// `PATCH /api/plans/:id`: a new budget or draw time, or `.remove`, sent as `null` (calls it off; the pairs go).
public enum PlanGiftChange: Encodable, Sendable, Hashable {
    case set(PlanGiftBody)
    case remove

    public func encode(to encoder: any Encoder) throws {
        switch self {
        case let .set(value):
            try value.encode(to: encoder)
        case .remove:
            var container = encoder.singleValueContainer()
            try container.encodeNil()
        }
    }
}
