//
//  PlanExtrasDTOs.swift
//  Pantopus
//
//  Plans for the holidays, the extras on a plan's card (08-extras.md; read with `extras=1`, each only while its
//  own switch is on for the plan's host). Every word that names money or a date is the server's. Route
//  backend/services/plans/planService.js (`buildCard`) and the extras' service files.
//

import Foundation

// MARK: - Chip in (08-extras section 3, board 27)

/// The host and people who are in read it; nobody else gets it. No money moves through Pantopus.
public struct PlanChipInDTO: Decodable, Sendable, Hashable {
    /// "Chip in $12".
    public let text: String
    public let amountCents: Int
    public let note: String?
    /// "Venmo", "PayPal" or "Cash App".
    public let service: String?
    /// The host's own payment link, opened outside the app.
    public let link: String?
    public let paidCount: Int
    public let of: Int
    /// "7 of 12 paid".
    public let paidText: String
    /// "Pay Maya on Venmo".
    public let payText: String?
    /// "This goes straight to Maya. Pantopus doesn't handle this money."
    public let straightText: String?
    /// Nil for the host.
    public let mine: PlanChipInMineDTO?

    enum CodingKeys: String, CodingKey {
        case text, note, service, link, of, mine
        case amountCents = "amount_cents"
        case paidCount = "paid_count"
        case paidText = "paid_text"
        case payText = "pay_text"
        case straightText = "straight_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        text = try container.decode(String.self, forKey: .text)
        amountCents = try container.decodeIfPresent(Int.self, forKey: .amountCents) ?? 0
        note = try container.decodeIfPresent(String.self, forKey: .note)
        service = try container.decodeIfPresent(String.self, forKey: .service)
        link = try container.decodeIfPresent(String.self, forKey: .link)
        paidCount = try container.decodeIfPresent(Int.self, forKey: .paidCount) ?? 0
        of = try container.decodeIfPresent(Int.self, forKey: .of) ?? 0
        paidText = try container.decodeIfPresent(String.self, forKey: .paidText) ?? ""
        payText = try container.decodeIfPresent(String.self, forKey: .payText)
        straightText = try container.decodeIfPresent(String.self, forKey: .straightText)
        mine = try? container.decodeIfPresent(PlanChipInMineDTO.self, forKey: .mine)
    }
}

public struct PlanChipInMineDTO: Decodable, Sendable, Hashable {
    public let paid: Bool
}

/// `{ chip_in }`, the answer to marking.
public struct PlanChipInResponse: Decodable, Sendable, Hashable {
    public let chipIn: PlanChipInDTO?

    enum CodingKeys: String, CodingKey {
        case chipIn = "chip_in"
    }
}

/// On the host's screens, each person who is in: whether they marked it, and the key "Mark paid" sends.
public struct PlanPersonChipInDTO: Codable, Sendable, Hashable {
    public let paid: Bool
    public let who: String
}

/// The host's "Mark paid" for someone who paid another way; nil marks the caller.
public struct PlanChipInMarkBody: Encodable, Sendable {
    public let who: String?
}

/// The host form's value: `{ amount_cents, note, link }`.
public struct PlanChipInBody: Encodable, Sendable, Hashable {
    public let amountCents: Int
    public let note: String
    public let link: String

    enum CodingKeys: String, CodingKey {
        case note, link
        case amountCents = "amount_cents"
    }
}

/// `PATCH /api/plans/:id`: a new chip in (who paid is kept), or `.remove`, sent as `null` (who paid is forgotten).
public enum PlanChipInChange: Encodable, Sendable, Hashable {
    case set(PlanChipInBody)
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

/// The extras a card carries (only with `extras=1` and the plan's host's switch).
public struct PlanCardExtrasPart: Decodable, Sendable, Hashable {
    public let chipIn: PlanChipInDTO?

    static let none = PlanCardExtrasPart(chipIn: nil)

    enum CodingKeys: String, CodingKey {
        case chipIn = "chip_in"
    }

    init(chipIn: PlanChipInDTO?) {
        self.chipIn = chipIn
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        chipIn = try? container.decodeIfPresent(PlanChipInDTO.self, forKey: .chipIn)
    }
}
