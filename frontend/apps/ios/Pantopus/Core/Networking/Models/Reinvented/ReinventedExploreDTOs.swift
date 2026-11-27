//
//  ReinventedExploreDTOs.swift
//  Pantopus
//
//  "Pulse, reinvented" phase 1, Explore (CONTRACT 6f): `GET /api/reinvented/explore`. "Today, elsewhere" (`picked`,
//  the first page only): up to ten, by how many different people marked each in the last day. Then every other one,
//  newest first with variety (`items`), 20 a page, pausing at "Keep exploring?". Each answers "Why am I seeing this?"
//  in one line (`why`). Only Moments and Studio posts their authors chose for Explore, never from the reader's town.
//

import Foundation

public struct ReinventedExploreResponse: Decodable, Sendable {
    public let picked: [ReinventedExploreItemDTO]
    public let items: [ReinventedExploreItemDTO]
    public let nextCursor: String?
    public let pause: String?

    private enum CodingKeys: String, CodingKey {
        case picked, items, pause
        case nextCursor = "next_cursor"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        picked = (try? c.decodeIfPresent(LossyList<ReinventedExploreItemDTO>.self, forKey: .picked))?.items ?? []
        items = (try? c.decodeIfPresent(LossyList<ReinventedExploreItemDTO>.self, forKey: .items))?.items ?? []
        nextCursor = try? c.decodeIfPresent(String.self, forKey: .nextCursor)
        pause = try? c.decodeIfPresent(String.self, forKey: .pause)
    }
}

/// One Explore item: a list item (6a's shape) and why it is here.
public struct ReinventedExploreItemDTO: Decodable, Sendable, Identifiable {
    public let item: ReinventedListItemDTO
    public let why: String?

    public var id: String {
        item.id
    }

    private enum CodingKeys: String, CodingKey { case why }

    public init(from decoder: any Decoder) throws {
        item = try ReinventedListItemDTO(from: decoder)
        why = try? decoder.container(keyedBy: CodingKeys.self).decodeIfPresent(String.self, forKey: .why)
    }
}
