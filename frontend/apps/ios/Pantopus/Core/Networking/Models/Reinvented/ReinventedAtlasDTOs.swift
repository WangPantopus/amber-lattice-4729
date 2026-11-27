//
//  ReinventedAtlasDTOs.swift
//  Pantopus
//
//  My Atlas ("Pulse, reinvented" phase 1, CONTRACT 6e): the person's own kept Moments, live and ended, private to them.
//

import Foundation

/// `GET /api/reinvented/atlas`: a page by date (`next_cursor` nil at the end), or every kept Moment in a box.
public struct ReinventedAtlasPage: Decodable, Sendable {
    public let moments: [MomentDTO]
    public let nextCursor: String?

    private enum CodingKeys: String, CodingKey {
        case moments
        case nextCursor = "next_cursor"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        moments = (try? c.decodeIfPresent(LossyList<MomentDTO>.self, forKey: .moments))?.items ?? []
        nextCursor = try? c.decodeIfPresent(String.self, forKey: .nextCursor)
    }
}
