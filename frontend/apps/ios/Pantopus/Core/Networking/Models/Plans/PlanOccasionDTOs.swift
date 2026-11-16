//
//  PlanOccasionDTOs.swift
//  Pantopus
//
//  Plans for the holidays, step H3 (contract section 8): occasions. An
//  occasion starts a plan of an existing kind with the usual things filled in
//  (Thanksgiving dinner is a Food & drinks plan). The server sends the ones in
//  season, in the strip's order; behind `plans_occasions` (the route answers
//  404 while it's off). A plan started from one keeps its key; its card says
//  `occasion: { key, text }`, which the plan's tag reads.
//
//  Route: backend/routes/plans.js (`GET /occasions`), services/plans/planOccasions.js.
//

import Foundation

/// The bring list an occasion starts with: names only.
public struct PlanOccasionBringDTO: Decodable, Sendable, Hashable {
    public let guestsCanAdd: Bool
    public let labels: [String]

    enum CodingKeys: String, CodingKey {
        case items
        case guestsCanAdd = "guests_can_add"
    }

    private struct Item: Decodable {
        let label: String
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guestsCanAdd = (try? container.decodeIfPresent(Bool.self, forKey: .guestsCanAdd)) ?? true
        labels = ((try? container.decodeIfPresent(LossyList<Item>.self, forKey: .items))?.items ?? []).map(\.label)
    }
}

/// What an occasion fills in on the host form. Every part is optional; the host can change all of it.
public struct PlanOccasionFillsDTO: Decodable, Sendable, Hashable {
    public let title: String?
    public let audience: PlanAudience?
    public let placeKind: String?
    public let kidsWelcome: Bool
    /// The room it starts with (12, or 20 for a holiday party and New Year's Eve); nil from an older server.
    public let spots: Int?
    public let bring: PlanOccasionBringDTO?
    public let startsAt: String?
    public let endsAt: String?

    enum CodingKeys: String, CodingKey {
        case title, audience, bring, spots
        case placeKind = "place_kind"
        case kidsWelcome = "kids_welcome"
        case startsAt = "starts_at"
        case endsAt = "ends_at"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try? container.decodeIfPresent(String.self, forKey: .title)
        audience = try? container.decodeIfPresent(PlanAudience.self, forKey: .audience)
        placeKind = try? container.decodeIfPresent(String.self, forKey: .placeKind)
        kidsWelcome = (try? container.decodeIfPresent(Bool.self, forKey: .kidsWelcome)) ?? false
        spots = try? container.decodeIfPresent(Int.self, forKey: .spots)
        bring = try? container.decodeIfPresent(PlanOccasionBringDTO.self, forKey: .bring)
        startsAt = try? container.decodeIfPresent(String.self, forKey: .startsAt)
        endsAt = try? container.decodeIfPresent(String.self, forKey: .endsAt)
    }
}

/// One occasion in "Coming up".
public struct PlanOccasionDTO: Decodable, Sendable, Hashable, Identifiable {
    public let key: String
    public let text: String
    public let kind: PlanKind
    public let details: PlanDetailsDTO?
    public let fills: PlanOccasionFillsDTO?

    public var id: String {
        key
    }

    enum CodingKeys: String, CodingKey {
        case key, text, kind, details, fills
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        key = try container.decode(String.self, forKey: .key)
        text = try container.decode(String.self, forKey: .text)
        // A kind this build can't draw drops the occasion (a lossy list leaves it out).
        kind = try container.decode(PlanKind.self, forKey: .kind)
        details = try? container.decodeIfPresent(PlanDetailsDTO.self, forKey: .details)
        fills = try? container.decodeIfPresent(PlanOccasionFillsDTO.self, forKey: .fills)
    }
}

/// `GET /api/plans/occasions`.
public struct PlanOccasionsResponse: Decodable, Sendable {
    public let occasions: [PlanOccasionDTO]

    enum CodingKeys: String, CodingKey {
        case occasions
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        occasions = (try? container.decodeIfPresent(LossyList<PlanOccasionDTO>.self, forKey: .occasions))?.items ?? []
    }
}

/// `occasion` on a card: the occasion a plan was started from, by its key and its name.
public struct PlanCardOccasionDTO: Decodable, Sendable, Hashable {
    public let key: String
    public let text: String
}
