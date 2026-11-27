//
//  MomentLoopDTOs.swift
//  Pantopus
//
//  A loop on a video Moment ("Pulse, reinvented"; CONTRACT 7j): the part of the video the new viewers play over and over,
//  muted. Only a reader whose switch is on gets `loop`; everyone else gets today's video Moment, played once.
//

import Foundation

/// `loop` on a Moment answer: the span to repeat, fitted by the server to the stored file.
public struct MomentLoopDTO: Decodable, Sendable, Hashable {
    public let fromMs: Int
    public let toMs: Int
    public let bounce: Bool

    private enum CodingKeys: String, CodingKey {
        case fromMs = "from_ms"
        case toMs = "to_ms"
        case bounce
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        fromMs = max(0, (try? c.decodeIfPresent(Int.self, forKey: .fromMs)) ?? 0)
        toMs = (try? c.decodeIfPresent(Int.self, forKey: .toMs)) ?? fromMs + 6000
        bounce = (try? c.decodeIfPresent(Bool.self, forKey: .bounce)) ?? false
        // Shorter than half a second is no loop (the server sends null then); the viewer plays it as a video.
        guard toMs - fromMs >= 500 else { throw DecodingError.dataCorruptedError(forKey: .toMs, in: c, debugDescription: "too short") }
    }

    /// The span in seconds.
    public var start: Double {
        Double(fromMs) / 1000
    }

    public var end: Double {
        Double(toMs) / 1000
    }
}

/// `loop` on `POST /api/moments` from a phone: the whole file is the loop (made on the phone), `bounce` says it plays
/// back too. Sent only while the switch is on.
public struct MomentLoopBody: Encodable, Sendable, Hashable {
    public let bounce: Bool
}
