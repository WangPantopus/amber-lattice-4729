//
//  PlanGroupPayDTOs.swift
//  Pantopus
//
//  Plans for the holidays, one person pays for the group (08-extras section 7, board 31). On a business's paid plan
//  while the business has `plans_group_pay`, with `biz=1&extras=1`: the quote offers "Who are they for?", the buyer
//  pays for every spot in one payment and gets one link, and the card carries the buyer's spots or the claimer's
//  line. Every amount and sentence is the server's. Route backend/services/plans/planGroupPay.js.
//

import Foundation

/// A quote's "Who are they for?": the two choices and the most spots a link may hold.
public struct PlanGroupPayOfferDTO: Decodable, Sendable, Hashable {
    public let title: String
    public let choices: [PlanGroupPayChoiceDTO]
    public let maxSpots: Int

    enum CodingKeys: String, CodingKey {
        case title
        case choices = "for"
        case maxSpots = "max_spots"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Who are they for?"
        choices = try container.decodeIfPresent([PlanGroupPayChoiceDTO].self, forKey: .choices) ?? []
        maxSpots = try container.decodeIfPresent(Int.self, forKey: .maxSpots) ?? 2
    }
}

/// "party" ("People with me") or "link" ("I'll send a link").
public struct PlanGroupPayChoiceDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let label: String
}

/// `POST /api/plans/:id/requests` for "I'll send a link": every spot in one payment, the buyer's own among them.
public struct PlanBuySpotsBody: Encodable, Sendable {
    public let forWhom = "link"
    public let spots: Int
    public let partySize = 1
    public var gps: PlanGPSBody?

    enum CodingKeys: String, CodingKey {
        case spots, gps
        case forWhom = "for"
        case partySize = "party_size"
    }
}

/// The card's `group_pay`: the buyer's spots and link, or the claimer's "Chris got you a spot".
public struct PlanGroupPayCardDTO: Decodable, Sendable, Hashable {
    /// "buyer" or "claimer".
    public let role: String
    /// "Your 11 spots" (the buyer), "Chris got you a spot" (a claimer).
    public let text: String
    public let spots: Int?
    public let taken: Int?
    /// "4 taken".
    public let takenText: String?
    /// The link to send; nil once it has stopped.
    public let url: String?
    public let open: Bool
    public let note: String?
    public let giveBack: PlanGroupPayGiveBackDTO?

    public var isBuyer: Bool {
        role == "buyer"
    }

    enum CodingKeys: String, CodingKey {
        case role, text, spots, taken, url, open, note
        case takenText = "taken_text"
        case giveBack = "give_back"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        role = try container.decodeIfPresent(String.self, forKey: .role) ?? "buyer"
        text = try container.decodeIfPresent(String.self, forKey: .text) ?? ""
        spots = try container.decodeIfPresent(Int.self, forKey: .spots)
        taken = try container.decodeIfPresent(Int.self, forKey: .taken)
        takenText = try container.decodeIfPresent(String.self, forKey: .takenText)
        url = try container.decodeIfPresent(String.self, forKey: .url)
        open = try container.decodeIfPresent(Bool.self, forKey: .open) ?? false
        note = try container.decodeIfPresent(String.self, forKey: .note)
        giveBack = try? container.decodeIfPresent(PlanGroupPayGiveBackDTO.self, forKey: .giveBack)
    }
}

/// "Give back 7 spots" and what it does ("$126.00 goes back to your card and the link stops.").
public struct PlanGroupPayGiveBackDTO: Decodable, Sendable, Hashable {
    public let left: Int
    public let backCents: Int
    public let label: String
    public let text: String

    enum CodingKeys: String, CodingKey {
        case left, label, text
        case backCents = "back_cents"
    }
}

/// `GET /api/plans/:id/spot?token=`: what the buyer's link offers whoever opens it. `open` false with `closedText`
/// ("This link isn't taking anyone now." / "All the spots on this link are taken.").
public struct PlanSpotOfferDTO: Decodable, Sendable, Hashable {
    /// "Chris".
    public let from: String?
    /// "Chris got you a spot".
    public let text: String
    public let left: Int
    public let open: Bool
    /// "I'm in".
    public let button: String
    public let closedText: String?

    enum CodingKeys: String, CodingKey {
        case from, text, left, open, button
        case closedText = "closed_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        from = try container.decodeIfPresent(String.self, forKey: .from)
        text = try container.decodeIfPresent(String.self, forKey: .text) ?? ""
        left = try container.decodeIfPresent(Int.self, forKey: .left) ?? 0
        open = try container.decodeIfPresent(Bool.self, forKey: .open) ?? false
        button = try container.decodeIfPresent(String.self, forKey: .button) ?? "I'm in"
        closedText = try container.decodeIfPresent(String.self, forKey: .closedText)
    }
}

/// `{ spot }`.
public struct PlanSpotOfferResponse: Decodable, Sendable, Hashable {
    public let spot: PlanSpotOfferDTO?
}

/// `POST /api/plans/:id/requests/claim-spot`.
public struct PlanClaimSpotBody: Encodable, Sendable {
    public let token: String
}
