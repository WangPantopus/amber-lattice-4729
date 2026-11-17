//
//  PlanPaidDTOs.swift
//  Pantopus
//
//  Plans for the holidays, the business track B2 and B4 (contract 10.2 and
//  10.4; 07-screens P1): a price to join a business's plan, the quote the
//  sheet shows, the payment the shipped payment sheet takes, and what the
//  guest paid. Every amount and line is the server's, as text and cents; the
//  app never multiplies a price, never computes a refund and never sends an
//  amount (only `party_size` and `kids_count`). Sent only with `biz=1` while
//  the plan's business has `plans_paid`. Route backend/services/plans/planPaid.js,
//  backend/routes/plans.js.
//

import Foundation

/// A card's `price`: "$18", "$18 a person", and what joining costs under the join button.
public struct PlanPriceDTO: Decodable, Sendable, Hashable {
    public let cents: Int
    public let text: String
    /// "$18 a person" ("$18 a family" on a kids' plan).
    public let line: String?
    /// "$18 a person. Full refund until Friday at 10:00 AM."
    public let joinText: String?
    public let refundText: String?
    /// Money off the spot (B4): the price struck through.
    public let wasCents: Int?
    public let wasText: String?

    enum CodingKeys: String, CodingKey {
        case cents, text, line
        case joinText = "join_text"
        case refundText = "refund_text"
        case wasCents = "was_cents"
        case wasText = "was_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        cents = try container.decode(Int.self, forKey: .cents)
        text = try container.decode(String.self, forKey: .text)
        line = try? container.decodeIfPresent(String.self, forKey: .line)
        joinText = try? container.decodeIfPresent(String.self, forKey: .joinText)
        refundText = try? container.decodeIfPresent(String.self, forKey: .refundText)
        wasCents = try? container.decodeIfPresent(Int.self, forKey: .wasCents)
        wasText = try? container.decodeIfPresent(String.self, forKey: .wasText)
    }
}

/// A receipt the app already opens: a piece in the guest's Mail, under Receipts.
public struct PlanReceiptDTO: Decodable, Sendable, Hashable {
    public let link: String?
}

/// A card's `paid`, for a guest who is in and paid: "Paid $18.00", and what leaving now gives back.
public struct PlanPaidDTO: Decodable, Sendable, Hashable {
    public let cents: Int
    public let text: String
    public let refundedCents: Int
    public let leaveBackCents: Int
    /// "You'll get $18.00 back." / "There is no refund now." — worked out by the server.
    public let leaveText: String?
    public let receipt: PlanReceiptDTO?

    enum CodingKeys: String, CodingKey {
        case cents, text, receipt
        case refundedCents = "refunded_cents"
        case leaveBackCents = "leave_back_cents"
        case leaveText = "leave_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        cents = try container.decode(Int.self, forKey: .cents)
        text = try container.decode(String.self, forKey: .text)
        refundedCents = (try? container.decodeIfPresent(Int.self, forKey: .refundedCents)) ?? 0
        leaveBackCents = (try? container.decodeIfPresent(Int.self, forKey: .leaveBackCents)) ?? 0
        leaveText = try? container.decodeIfPresent(String.self, forKey: .leaveText)
        receipt = try? container.decodeIfPresent(PlanReceiptDTO.self, forKey: .receipt)
    }
}

/// A paid guest on the staff's Going list: "$18.00", and who brought them ("Pantopus" / "Yours").
public struct PlanPersonPaidDTO: Codable, Sendable, Hashable {
    public let cents: Int
    public let text: String
    public let refundedCents: Int?
    public let broughtBy: String?

    enum CodingKeys: String, CodingKey {
        case cents, text
        case refundedCents = "refunded_cents"
        case broughtBy = "brought_by"
    }

    /// "Pantopus" for a guest Pantopus brought, "Yours" for the business's own.
    public var broughtByText: String? {
        switch broughtBy {
        case "pantopus": "Pantopus"
        case "own": "Yours"
        default: nil
        }
    }
}

/// `POST /api/plans/:id/requests/quote` body: the party only; the server answers every amount.
public struct PlanQuoteBody: Encodable, Sendable, Hashable {
    public let partySize: Int
    public let kidsCount: Int?

    enum CodingKeys: String, CodingKey {
        case partySize = "party_size"
        case kidsCount = "kids_count"
    }

    public init(partySize: Int, kidsCount: Int? = nil) {
        self.partySize = partySize
        self.kidsCount = kidsCount
    }
}

/// The quote's group price card (B4): open, or unlocked; nil when short or none.
public struct PlanQuoteGroupDTO: Decodable, Sendable, Hashable {
    public let state: String
    public let inCount: Int
    public let size: Int
    public let text: String

    enum CodingKeys: String, CodingKey {
        case state, size, text
        case inCount = "in"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        state = (try? container.decodeIfPresent(String.self, forKey: .state)) ?? "open"
        inCount = (try? container.decodeIfPresent(Int.self, forKey: .inCount)) ?? 0
        size = (try? container.decodeIfPresent(Int.self, forKey: .size)) ?? 0
        text = try container.decode(String.self, forKey: .text)
    }
}

/// What the P1 sheet shows, with no side effect: the spots, each, the total, the group price and the refund line.
public struct PlanQuoteDTO: Decodable, Sendable, Hashable {
    public let spots: Int
    /// "2 spots".
    public let spotsText: String
    /// "$18 each" ("$18" for one spot).
    public let eachText: String
    public let totalCents: Int
    /// "$36.00".
    public let totalText: String
    public let group: PlanQuoteGroupDTO?
    public let refundText: String?

    enum CodingKeys: String, CodingKey {
        case spots, group
        case spotsText = "spots_text"
        case eachText = "each_text"
        case totalCents = "total_cents"
        case totalText = "total_text"
        case refundText = "refund_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        spots = (try? container.decodeIfPresent(Int.self, forKey: .spots)) ?? 1
        spotsText = try container.decode(String.self, forKey: .spotsText)
        eachText = try container.decode(String.self, forKey: .eachText)
        totalCents = try container.decode(Int.self, forKey: .totalCents)
        totalText = try container.decode(String.self, forKey: .totalText)
        group = try? container.decodeIfPresent(PlanQuoteGroupDTO.self, forKey: .group)
        refundText = try? container.decodeIfPresent(String.self, forKey: .refundText)
    }
}

/// A change to a business's price on `PATCH /api/plans/:id`: a new price in cents, or `null` for free.
public enum PlanPriceChange: Encodable, Sendable, Hashable {
    case set(Int)
    case remove

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .set(cents): try container.encode(cents)
        case .remove: try container.encodeNil()
        }
    }
}

/// The shipped payment sheet's values (joining a paid plan, a check, a tip): never an amount the app chose.
public struct PlanPaymentDTO: Decodable, Sendable, Hashable {
    public let paymentId: String?
    public let amountCents: Int?
    public let amountText: String?
    public let clientSecret: String
    public let customerId: String?
    public let ephemeralKey: String?
    public let publishableKey: String?

    enum CodingKeys: String, CodingKey {
        case paymentId = "payment_id"
        case amountCents = "amount_cents"
        case amountText = "amount_text"
        case clientSecret = "client_secret"
        case customerId = "customer_id"
        case ephemeralKey = "ephemeral_key"
        case publishableKey = "publishable_key"
    }
}
