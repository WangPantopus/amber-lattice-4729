//
//  PlanCheckDTOs.swift
//  Pantopus
//
//  Plans for the holidays, the business track B5 and B6 (contract 11; 07-screens
//  C1 to C4): the bill at the place, its tip, the business's guest list with
//  money, and a tip after a paid plan. Every line, tip choice, total and
//  sentence is the server's, as text and cents; the app never adds a tip,
//  takes off a deal or works out a total. It sends only what the person typed
//  or chose: a check's amount, a tip in cents, a refund's amount. Sent only
//  with `biz=1` while the plan's business has `plans_pay_here`. Route
//  backend/services/plans/planChecks.js, backend/routes/plans.js.
//

import Foundation

/// The card's `pay_here` (D2): "Pay at Example Taproom", for staff and for guests who are in.
public struct PlanPayHereDTO: Decodable, Sendable, Hashable {
    public let tipsOn: Bool
    public let text: String

    enum CodingKeys: String, CodingKey {
        case text
        case tipsOn = "tips_on"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        tipsOn = (try? container.decodeIfPresent(Bool.self, forKey: .tipsOn)) ?? false
        text = try container.decode(String.self, forKey: .text)
    }
}

/// One line of a check: "Food and drinks" $48.00, the deal −$9.60 (tone `ok`), "Tip, 18%" $8.64, "You pay" $47.04.
public struct PlanCheckLineDTO: Decodable, Sendable, Hashable, Identifiable {
    public let key: String
    public let label: String
    public let cents: Int
    public let text: String
    public let tone: String?

    public var id: String {
        key
    }

    public var isTotal: Bool {
        key == "total"
    }
}

/// A tip choice: "18%", the tip and what the check comes to with it.
public struct PlanTipChoiceDTO: Decodable, Sendable, Hashable {
    public let label: String
    public let tipCents: Int
    public let tipText: String
    public let totalCents: Int?
    public let totalText: String?

    enum CodingKeys: String, CodingKey {
        case label
        case tipCents = "tip_cents"
        case tipText = "tip_text"
        case totalCents = "total_cents"
        case totalText = "total_text"
    }
}

/// What the check comes to with no tip.
public struct PlanNoTipDTO: Decodable, Sendable, Hashable {
    public let totalCents: Int
    public let totalText: String

    enum CodingKeys: String, CodingKey {
        case totalCents = "total_cents"
        case totalText = "total_text"
    }
}

/// A check as C1 and C2 draw it (`GET …/checks/mine`, the quote, pay and confirm answers).
public struct PlanCheckDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    /// `open`, `paid` or `refunded`.
    public let state: String
    /// "Your check, sent by Example Taproom" (or "Your check" for one the guest started).
    public let heading: String
    public let amountCents: Int
    public let amountText: String
    public let lines: [PlanCheckLineDTO]
    public let totalCents: Int
    public let totalText: String
    public let tipsOn: Bool
    public let tipChoices: [PlanTipChoiceDTO]
    public let noTip: PlanNoTipDTO?
    /// "Percent of $48.00, before the deal".
    public let tipBaseText: String?
    /// "The deal came off because you're paying here. The tip goes to …; Pantopus takes none of it."
    public let noteText: String?
    /// Once paid (C2).
    /// "Mon, Nov 16 · 8:52 PM".
    public let paidText: String?
    /// "Dana L.".
    public let payer: String?
    /// "Card", "Apple Pay", "Google Pay".
    public let methodText: String?
    /// "Paid $46.40".
    public let paidTotalText: String?
    public let refundedCents: Int
    /// "Example Taproom refunded $12.00".
    public let refundedText: String?
    public let receipt: PlanReceiptDTO?

    enum CodingKeys: String, CodingKey {
        case id, state, heading, lines, payer, receipt
        case amountCents = "amount_cents"
        case amountText = "amount_text"
        case totalCents = "total_cents"
        case totalText = "total_text"
        case tipsOn = "tips_on"
        case tipChoices = "tip_choices"
        case noTip = "no_tip"
        case tipBaseText = "tip_base_text"
        case noteText = "note_text"
        case paidText = "paid_text"
        case methodText = "method_text"
        case paidTotalText = "paid_total_text"
        case refundedCents = "refunded_cents"
        case refundedText = "refunded_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        state = (try? container.decodeIfPresent(String.self, forKey: .state)) ?? "open"
        heading = (try? container.decodeIfPresent(String.self, forKey: .heading)) ?? "Your check"
        amountCents = try container.decode(Int.self, forKey: .amountCents)
        amountText = try container.decode(String.self, forKey: .amountText)
        lines = (try? container.decodeIfPresent([PlanCheckLineDTO].self, forKey: .lines)) ?? []
        totalCents = try container.decode(Int.self, forKey: .totalCents)
        totalText = try container.decode(String.self, forKey: .totalText)
        tipsOn = (try? container.decodeIfPresent(Bool.self, forKey: .tipsOn)) ?? false
        tipChoices = (try? container.decodeIfPresent([PlanTipChoiceDTO].self, forKey: .tipChoices)) ?? []
        noTip = try? container.decodeIfPresent(PlanNoTipDTO.self, forKey: .noTip)
        tipBaseText = try? container.decodeIfPresent(String.self, forKey: .tipBaseText)
        noteText = try? container.decodeIfPresent(String.self, forKey: .noteText)
        paidText = try? container.decodeIfPresent(String.self, forKey: .paidText)
        payer = try? container.decodeIfPresent(String.self, forKey: .payer)
        methodText = try? container.decodeIfPresent(String.self, forKey: .methodText)
        paidTotalText = try? container.decodeIfPresent(String.self, forKey: .paidTotalText)
        refundedCents = (try? container.decodeIfPresent(Int.self, forKey: .refundedCents)) ?? 0
        refundedText = try? container.decodeIfPresent(String.self, forKey: .refundedText)
        receipt = try? container.decodeIfPresent(PlanReceiptDTO.self, forKey: .receipt)
    }

    public var isOpen: Bool {
        state == "open"
    }
}

/// `GET …/checks/mine`: the guest's open check (or the last one paid), and whether they may start one (K7).
public struct PlanMyCheckResponse: Decodable, Sendable, Hashable {
    public let check: PlanCheckDTO?
    public let canStart: Bool

    enum CodingKeys: String, CodingKey {
        case check
        case canStart = "can_start"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        check = try? container.decodeIfPresent(PlanCheckDTO.self, forKey: .check)
        canStart = (try? container.decodeIfPresent(Bool.self, forKey: .canStart)) ?? false
    }
}

/// A check answer (`POST …/checks/mine`, `/quote`, `/confirm`, staff `POST …/checks`).
public struct PlanCheckResponse: Decodable, Sendable, Hashable {
    public let check: PlanCheckDTO
}

/// `POST …/checks/:id/pay`: the shipped payment sheet's values and the check as it will be paid.
public struct PlanCheckPayResponse: Decodable, Sendable, Hashable {
    public let payment: PlanPaymentDTO
    public let check: PlanCheckDTO
}

/// `POST …/checks/mine` (the guest's total) and staff `POST …/checks` (`request_id`, `no_deal_cents`).
public struct PlanCheckAmountBody: Encodable, Sendable, Hashable {
    public var requestId: String?
    public let amountCents: Int
    public var noDealCents: Int?

    enum CodingKeys: String, CodingKey {
        case requestId = "request_id"
        case amountCents = "amount_cents"
        case noDealCents = "no_deal_cents"
    }

    public init(amountCents: Int, requestId: String? = nil, noDealCents: Int? = nil) {
        self.amountCents = amountCents
        self.requestId = requestId
        self.noDealCents = noDealCents
    }
}

/// `/quote` and `/pay`: the tip the guest chose, in cents (0 for "No tip").
public struct PlanCheckTipBody: Encodable, Sendable, Hashable {
    public let tipCents: Int

    enum CodingKeys: String, CodingKey {
        case tipCents = "tip_cents"
    }

    public init(tipCents: Int) {
        self.tipCents = tipCents
    }
}

/// Staff refund: `{}` for all, or `{ amount_cents }` for a part.
public struct PlanCheckRefundBody: Encodable, Sendable, Hashable {
    public let amountCents: Int?

    enum CodingKeys: String, CodingKey {
        case amountCents = "amount_cents"
    }

    public init(amountCents: Int?) {
        self.amountCents = amountCents
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(amountCents, forKey: .amountCents)
    }
}

/// C3's three totals: "14 guests in", "$126.24 paid so far", "$22.64 tips".
public struct PlanChecksTotalsDTO: Decodable, Sendable, Hashable {
    public let inText: String
    public let paidText: String
    public let tipsText: String

    enum CodingKeys: String, CodingKey {
        case inText = "in_text"
        case paidText = "paid_text"
        case tipsText = "tips_text"
    }
}

/// A guest's last check on C3: "Check sent · $52.00" / "Waiting", or "$38.40 · tip $8.64" / "Paid".
public struct PlanChecksRowCheckDTO: Decodable, Sendable, Hashable {
    public let id: String
    public let text: String?
    public let stateText: String?
    public let refundedCents: Int

    enum CodingKeys: String, CodingKey {
        case id, text
        case stateText = "state_text"
        case refundedCents = "refunded_cents"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        text = try? container.decodeIfPresent(String.self, forKey: .text)
        stateText = try? container.decodeIfPresent(String.self, forKey: .stateText)
        refundedCents = (try? container.decodeIfPresent(Int.self, forKey: .refundedCents)) ?? 0
    }
}

/// A guest who is in, on C3: "Dana L.", who brought them, and their last check.
public struct PlanChecksRowDTO: Decodable, Sendable, Hashable, Identifiable {
    public let requestId: String
    public let name: String
    public let broughtByText: String?
    /// `none`, `sent`, `paid` or `refunded`.
    public let state: String
    public let check: PlanChecksRowCheckDTO?

    public var id: String {
        requestId
    }

    enum CodingKeys: String, CodingKey {
        case name, state, check
        case requestId = "request_id"
        case broughtByText = "brought_by_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        requestId = try container.decode(String.self, forKey: .requestId)
        name = try container.decode(String.self, forKey: .name)
        broughtByText = try? container.decodeIfPresent(String.self, forKey: .broughtByText)
        state = (try? container.decodeIfPresent(String.self, forKey: .state)) ?? "none"
        check = try? container.decodeIfPresent(PlanChecksRowCheckDTO.self, forKey: .check)
    }
}

/// `GET …/checks` (staff, board 14): the three totals, a row a guest, the note and whether the deal is on the bill.
public struct PlanChecksListDTO: Decodable, Sendable, Hashable {
    public let totals: PlanChecksTotalsDTO
    public let rows: [PlanChecksRowDTO]
    public let noteText: String?
    public let dealOnBill: Bool

    enum CodingKeys: String, CodingKey {
        case totals, rows
        case noteText = "note_text"
        case dealOnBill = "deal_on_bill"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        totals = try container.decode(PlanChecksTotalsDTO.self, forKey: .totals)
        rows = (try? container.decodeIfPresent([PlanChecksRowDTO].self, forKey: .rows)) ?? []
        noteText = try? container.decodeIfPresent(String.self, forKey: .noteText)
        dealOnBill = (try? container.decodeIfPresent(Bool.self, forKey: .dealOnBill)) ?? false
    }
}

/// B6: the card's `tip_later`, for a guest who paid, from the plan's end for 7 days, once.
public struct PlanTipLaterDTO: Decodable, Sendable, Hashable {
    public let until: String?
    public let choices: [PlanTipChoiceDTO]
}

/// `POST /api/plans/:id/tip`: `{ amount_cents }`.
public struct PlanTipLaterBody: Encodable, Sendable, Hashable {
    public let amountCents: Int

    enum CodingKeys: String, CodingKey {
        case amountCents = "amount_cents"
    }

    public init(amountCents: Int) {
        self.amountCents = amountCents
    }
}

/// `POST /api/plans/:id/tip`: the shipped sheet's values.
public struct PlanTipLaterPayResponse: Decodable, Sendable, Hashable {
    public let payment: PlanPaymentDTO
}

/// `POST /api/plans/:id/tip/confirm`: `{ state: "paid", text: "You tipped $5.00" }`.
public struct PlanTipConfirmResponse: Decodable, Sendable, Hashable {
    public let state: String
    public let text: String
}
