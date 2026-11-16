//
//  MomentLimitsDTO.swift
//  Pantopus
//
//  `GET /api/moments/limits` (contract v3.11): how long one Moment's video may
//  run, how many Moments a longer video is posted as, and the largest video
//  file an upload may be. And `series`, which a part of such a video carries.
//

import Foundation

/// What a Moment's video may be. The values until the server has answered are the ones every server takes.
public struct MomentVideoLimitsDTO: Codable, Sendable, Hashable {
    /// The longest one Moment's video runs, in seconds.
    public var maxSeconds: Double
    /// How many Moments a longer video is posted as, at most.
    public var maxParts: Int
    /// The largest video file an upload may be, in bytes.
    public var maxBytes: Int

    public init(maxSeconds: Double = 30, maxParts: Int = 1, maxBytes: Int = 50 * 1024 * 1024) {
        self.maxSeconds = maxSeconds
        self.maxParts = maxParts
        self.maxBytes = maxBytes
    }

    private enum CodingKeys: String, CodingKey {
        case maxSeconds = "max_seconds"
        case maxParts = "max_parts"
        case maxBytes = "max_bytes"
    }
}

public struct MomentLimitsDTO: Decodable, Sendable, Hashable {
    public let video: MomentVideoLimitsDTO
}

/// Which part of a longer video a Moment is (`POST /api/moments` `series`, and `Moment.series`).
public struct MomentSeriesDTO: Codable, Sendable, Hashable {
    /// The same on every part.
    public let id: String
    /// 1 for the first part.
    public let index: Int
    public let count: Int

    public init(id: String, index: Int, count: Int) {
        self.id = id
        self.index = index
        self.count = count
    }
}
