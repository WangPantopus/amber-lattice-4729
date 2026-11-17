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

// MARK: - Find a date (08-extras section 2, boards 24, 25)

/// One offered time. `text` is the server's ("Sat, Nov 21 · 6:00 PM"); the host also gets `who`, `most`,
/// `pickText` and `pickNote`.
public struct PlanDateOptionDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let startsAt: String?
    public let endsAt: String?
    public let text: String
    public let can: Int
    /// "4 can make it".
    public let canText: String
    /// The reader ticked it.
    public let mine: Bool
    /// The host's: first names of who ticked it, whether it's the favorite, "Pick Sunday, Nov 22 · 4:00 PM" and
    /// what picking does, in numbers.
    public let who: [String]
    public let most: Bool
    public let pickText: String?
    public let pickNote: String?

    enum CodingKeys: String, CodingKey {
        case id, text, can, mine, who, most
        case startsAt = "starts_at"
        case endsAt = "ends_at"
        case canText = "can_text"
        case pickText = "pick_text"
        case pickNote = "pick_note"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        startsAt = try container.decodeIfPresent(String.self, forKey: .startsAt)
        endsAt = try container.decodeIfPresent(String.self, forKey: .endsAt)
        text = try container.decode(String.self, forKey: .text)
        can = try container.decodeIfPresent(Int.self, forKey: .can) ?? 0
        canText = try container.decodeIfPresent(String.self, forKey: .canText) ?? ""
        mine = try container.decodeIfPresent(Bool.self, forKey: .mine) ?? false
        who = (try? container.decodeIfPresent([String].self, forKey: .who)) ?? []
        most = try container.decodeIfPresent(Bool.self, forKey: .most) ?? false
        pickText = try container.decodeIfPresent(String.self, forKey: .pickText)
        pickNote = try container.decodeIfPresent(String.self, forKey: .pickNote)
    }
}

/// The reader's own answer: whether they saved their times, and their numbers.
public struct PlanDatesMineDTO: Decodable, Sendable, Hashable {
    public let answered: Bool
    public let partySize: Int?
    public let kidsCount: Int?

    enum CodingKeys: String, CodingKey {
        case answered
        case partySize = "party_size"
        case kidsCount = "kids_count"
    }
}

/// The card's `dates` while the host is picking; gone once a time is picked.
public struct PlanDatesDTO: Decodable, Sendable, Hashable {
    public let options: [PlanDateOptionDTO]
    public let answered: Int
    public let invited: Int
    /// "9 have answered" (a guest), "9 of 14 have answered" (the host).
    public let answeredText: String
    /// Nil for the host.
    public let mine: PlanDatesMineDTO?

    enum CodingKeys: String, CodingKey {
        case options, answered, invited, mine
        case answeredText = "answered_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        options = try container.decodeIfPresent([PlanDateOptionDTO].self, forKey: .options) ?? []
        answered = try container.decodeIfPresent(Int.self, forKey: .answered) ?? 0
        invited = try container.decodeIfPresent(Int.self, forKey: .invited) ?? 0
        answeredText = try container.decodeIfPresent(String.self, forKey: .answeredText) ?? ""
        mine = try? container.decodeIfPresent(PlanDatesMineDTO.self, forKey: .mine)
    }
}

/// `PUT /api/plans/:id/dates/mine`: the times that work (`[]` is "none of these") and the numbers.
public struct PlanDatesTickBody: Encodable, Sendable {
    public let options: [String]
    public let partySize: Int
    public let kidsCount: Int?

    enum CodingKeys: String, CodingKey {
        case options
        case partySize = "party_size"
        case kidsCount = "kids_count"
    }
}

/// `POST /api/plans/:id/dates/pick`.
public struct PlanDatePickBody: Encodable, Sendable {
    public let optionId: String

    enum CodingKeys: String, CodingKey {
        case optionId = "option_id"
    }
}

/// The host form's offered times: 2 to 5, each `{ starts_at, ends_at }`.
public struct PlanDateOptionBody: Encodable, Sendable, Hashable {
    public let startsAt: String
    public let endsAt: String

    enum CodingKeys: String, CodingKey {
        case startsAt = "starts_at"
        case endsAt = "ends_at"
    }
}

// MARK: - The card

/// The extras a card carries (only with `extras=1` and the plan's host's switch).
public struct PlanCardExtrasPart: Decodable, Sendable, Hashable {
    public let chipIn: PlanChipInDTO?
    /// Find a date: the times while the host is picking.
    public let dates: PlanDatesDTO?
    /// "Picking a date" while it is, where a list shows the time.
    public let timeText: String?
    /// The gift exchange; `mine.giving_to` only in the reader's own card.
    public let gift: PlanGiftDTO?
    /// Photos afterwards, on a plan that is over: the count and the banner's words; the pictures come from the grid.
    public let photos: PlanPhotosCardDTO?
    /// One person pays for the group: the buyer's spots or the claimer's line.
    public let groupPay: PlanGroupPayCardDTO?

    static let none = PlanCardExtrasPart(chipIn: nil, dates: nil, timeText: nil, gift: nil, photos: nil, groupPay: nil)

    enum CodingKeys: String, CodingKey {
        case dates, gift, photos
        case groupPay = "group_pay"
        case chipIn = "chip_in"
        case timeText = "time_text"
    }

    init(
        chipIn: PlanChipInDTO?,
        dates: PlanDatesDTO?,
        timeText: String?,
        gift: PlanGiftDTO?,
        photos: PlanPhotosCardDTO?,
        groupPay: PlanGroupPayCardDTO?
    ) {
        self.chipIn = chipIn
        self.dates = dates
        self.timeText = timeText
        self.gift = gift
        self.photos = photos
        self.groupPay = groupPay
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        chipIn = try? container.decodeIfPresent(PlanChipInDTO.self, forKey: .chipIn)
        dates = try? container.decodeIfPresent(PlanDatesDTO.self, forKey: .dates)
        timeText = try? container.decodeIfPresent(String.self, forKey: .timeText)
        gift = try? container.decodeIfPresent(PlanGiftDTO.self, forKey: .gift)
        photos = try? container.decodeIfPresent(PlanPhotosCardDTO.self, forKey: .photos)
        groupPay = try? container.decodeIfPresent(PlanGroupPayCardDTO.self, forKey: .groupPay)
    }
}

extension PlanCardDTO {
    /// "Picking a date" (the server's words) while the host is picking; nil on any other plan.
    var pickingText: String? {
        guard extrasPart.dates != nil else { return nil }
        return extrasPart.timeText ?? "Picking a date"
    }
}
