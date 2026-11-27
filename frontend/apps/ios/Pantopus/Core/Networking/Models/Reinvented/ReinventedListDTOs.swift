//
//  ReinventedListDTOs.swift
//  Pantopus
//
//  "Pulse, reinvented" phase 1, the one Pulse tab (CONTRACT 6a): `GET /api/reinvented/list` mixes the Moments and posts
//  a reader may see, by reach, chip and cursor, with the distance bands. Only for a reader whose switch is on (else
//  `403 PULSE_REINVENTED_OFF`); an older server answers 404, and the app goes back to today's Pulse.
//

import Foundation

/// One page of the list.
public struct ReinventedListResponse: Decodable, Sendable {
    public let reach: String
    public let miles: Int?
    /// The town's name, to the reader only ("Camas").
    public let placeLabel: String?
    /// The chips this reach and place have something for, `all` first; nil on later pages.
    public let chips: [String]?
    public let bands: [ReinventedBandDTO]
    public let items: [ReinventedListItemDTO]
    public let nextCursor: String?
    /// "Caught up on your circle. Keep exploring?" on the last page.
    public let end: String?
    /// Around me with no place at all: ask for one, as today's Pulse does.
    public let needsPlace: Bool

    private enum CodingKeys: String, CodingKey {
        case reach, miles, place, chips, bands, items, end
        case nextCursor = "next_cursor"
        case needsPlace = "needs_place"
    }

    private enum PlaceKeys: String, CodingKey { case label }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reach = (try? c.decodeIfPresent(String.self, forKey: .reach)) ?? "around"
        miles = try? c.decodeIfPresent(Int.self, forKey: .miles)
        placeLabel = (try? c.nestedContainer(keyedBy: PlaceKeys.self, forKey: .place))
            .flatMap { try? $0.decodeIfPresent(String.self, forKey: .label) }
        chips = try? c.decodeIfPresent([String].self, forKey: .chips)
        bands = (try? c.decodeIfPresent(LossyList<ReinventedBandDTO>.self, forKey: .bands))?.items ?? []
        items = (try? c.decodeIfPresent(LossyList<ReinventedListItemDTO>.self, forKey: .items))?.items ?? []
        nextCursor = try? c.decodeIfPresent(String.self, forKey: .nextCursor)
        end = try? c.decodeIfPresent(String.self, forKey: .end)
        needsPlace = (try? c.decodeIfPresent(Bool.self, forKey: .needsPlace)) ?? false
    }
}

/// A distance band: `{ "band": "town", "label": "Camas" }`.
public struct ReinventedBandDTO: Decodable, Sendable, Hashable {
    public let band: String
    public let label: String
}

/// One item: a Moment that fades, or a post that stays, each as today's screens already decode it.
public struct ReinventedListItemDTO: Decodable, Sendable, Identifiable {
    public enum Content: Sendable {
        case moment(MomentDTO)
        case post(FeedPostDTO)
    }

    public let id: String
    public let band: String?
    public let content: Content

    private enum CodingKeys: String, CodingKey {
        case type, id, band, moment, post
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        band = try? c.decodeIfPresent(String.self, forKey: .band)
        switch try c.decode(String.self, forKey: .type) {
        case "moment": content = try .moment(c.decode(MomentDTO.self, forKey: .moment))
        case "post": content = try .post(c.decode(FeedPostDTO.self, forKey: .post))
        default: throw DecodingError.dataCorruptedError(forKey: .type, in: c, debugDescription: "Unknown item type")
        }
    }
}
