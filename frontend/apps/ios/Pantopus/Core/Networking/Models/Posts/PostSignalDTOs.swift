//
//  PostSignalDTOs.swift
//  Pantopus
//
//  The five signals on Pulse posts ("Pulse, reinvented", CONTRACT section 4). The server adds `userSignal` and
//  `signals` to a post only for a reader whose `pulse_reinvented` switch is on, so a post that carries them draws the
//  signals and every other post draws today's emoji: knowing which costs no request. `POST /api/posts/:id/like` with
//  `{ "signal": … }` sets one (it replaces the reader's emoji) or takes it back with null; a reader whose switch is off
//  is answered `403 PULSE_REINVENTED_OFF`.
//

import Foundation

/// One signal's count under a post: `{ "signal": "learned", "count": 14 }`.
public struct PostSignalCountDTO: Decodable, Sendable, Hashable {
    public let signal: String
    public let count: Int

    private enum CodingKeys: String, CodingKey {
        case signal, count
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        signal = try c.decode(String.self, forKey: .signal)
        count = c.lenient(Int.self, forKey: .count) ?? 0
    }
}

/// `{ "signal": "learned" }`, or `{ "signal": null }` to take it back. Null is sent, never left out.
struct PostSignalRequest: Encodable {
    let signal: String?

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(signal, forKey: .signal)
    }

    private enum CodingKeys: String, CodingKey { case signal }
}

/// The answer: today's reaction answer (the nearest emoji and the emoji counts) plus the reader's signal and each
/// signal's count after the change.
struct PostSignalResponse: Decodable {
    let signal: String?
    let signals: [PostSignalCountDTO]?

    private enum CodingKeys: String, CodingKey {
        case signal, signals
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        signal = c.lenient(String.self, forKey: .signal)
        signals = c.lenient(LossyList<PostSignalCountDTO>.self, forKey: .signals)?.items
    }
}
