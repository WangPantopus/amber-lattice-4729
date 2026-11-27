//
//  ReinventedStripDTOs.swift
//  Pantopus
//
//  "Pulse, reinvented" phase 1, Alive right now (CONTRACT 6c): `GET /api/reinvented/strip`, the strip of tall previews
//  over the list: Moments live from here with their weather, plans on now or within the hour, and rings for people the
//  reader knows. Only for a reader whose switch is on; read without throwing.
//

import Foundation

public struct ReinventedStripResponse: Decodable, Sendable {
    public let liveHere: [ReinventedLiveHereDTO]
    public let plansSoon: [PlanPinDTO]
    public let people: [MomentRingDTO]

    private enum CodingKeys: String, CodingKey {
        case people
        case liveHere = "live_here"
        case plansSoon = "plans_soon"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        liveHere = (try? c.decodeIfPresent(LossyList<ReinventedLiveHereDTO>.self, forKey: .liveHere))?.items ?? []
        plansSoon = (try? c.decodeIfPresent(LossyList<PlanPinDTO>.self, forKey: .plansSoon))?.items ?? []
        people = (try? c.decodeIfPresent(LossyList<MomentRingDTO>.self, forKey: .people))?.items ?? []
    }

    public var isEmpty: Bool {
        liveHere.isEmpty && plansSoon.isEmpty && people.isEmpty
    }
}

/// A Moment live from here, with its band.
public struct ReinventedLiveHereDTO: Decodable, Sendable, Identifiable {
    public let band: String?
    public let moment: MomentDTO

    public var id: String {
        moment.id
    }
}
