//
//  ReinventedMapDTOs.swift
//  Pantopus
//
//  "Pulse, reinvented" phase 1, the one map (CONTRACT 6b): `GET /api/reinvented/map` for a box and a time. Rings are
//  Moments (today's rings), marks are posts that stay at the point everyone sees (a Heads-up first, drawn red and on
//  top), tickets are plans (today's plan pins), kept are Moments their authors kept as posts that stay. Only for a
//  reader whose switch is on; read without throwing, so one bad item never costs the map.
//

import Foundation

public struct ReinventedMapResponse: Decodable, Sendable {
    public let time: String
    public let rings: [MomentRingDTO]
    public let marks: [ReinventedMarkDTO]
    public let tickets: [PlanPinDTO]
    public let kept: [ReinventedKeptDTO]
    public let guessSpots: [MomentGuessSpotDTO]

    private enum CodingKeys: String, CodingKey {
        case time, rings, marks, tickets, kept
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        time = (try? c.decodeIfPresent(String.self, forKey: .time)) ?? "live"
        rings = (try? c.decodeIfPresent(LossyList<MomentRingDTO>.self, forKey: .rings))?.items ?? []
        marks = (try? c.decodeIfPresent(LossyList<ReinventedMarkDTO>.self, forKey: .marks))?.items ?? []
        tickets = (try? c.decodeIfPresent(LossyList<PlanPinDTO>.self, forKey: .tickets))?.items ?? []
        kept = (try? c.decodeIfPresent(LossyList<ReinventedKeptDTO>.self, forKey: .kept))?.items ?? []
        guessSpots = MomentGuessSpotDTO.list(from: decoder)
    }
}

/// A post that stays, at the point everyone sees.
public struct ReinventedMarkDTO: Decodable, Sendable, Identifiable {
    public let id: String
    public let latitude: Double
    public let longitude: Double
    public let headsUp: Bool
    public let post: FeedPostDTO

    private enum CodingKeys: String, CodingKey {
        case id, latitude, longitude, post
        case headsUp = "heads_up"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        latitude = try c.decode(Double.self, forKey: .latitude)
        longitude = try c.decode(Double.self, forKey: .longitude)
        headsUp = (try? c.decodeIfPresent(Bool.self, forKey: .headsUp)) ?? false
        post = try c.decode(FeedPostDTO.self, forKey: .post)
    }
}

/// A Moment its author kept as a post that stays, drawn as a mark with its picture.
public struct ReinventedKeptDTO: Decodable, Sendable, Identifiable {
    public let id: String
    public let latitude: Double
    public let longitude: Double
    public let moment: MomentDTO
}
