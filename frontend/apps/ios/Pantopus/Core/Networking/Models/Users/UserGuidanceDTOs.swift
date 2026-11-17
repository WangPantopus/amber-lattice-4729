//
//  UserGuidanceDTOs.swift
//  Pantopus
//
//  The guidance cards' server state (GUIDE spec §3): `guidance` on
//  `GET /api/users/profile`, and the answer of `POST /api/users/guidance/shown`.
//

import Foundation

/// `{ "enabled": bool, "new_account": bool, "seen": { "<card id>": { "times", "last_at" } } }`.
public struct GuidanceStateDTO: Codable, Sendable, Hashable {
    /// The server's `GUIDANCE_CARDS` switch: nothing shows while it is off.
    public let enabled: Bool
    /// The account is under 14 days old: cards 1 to 27 may show.
    public let newAccount: Bool
    /// Every card the person has closed, on any device.
    public let seen: [String: GuidanceSeenDTO]

    public init(enabled: Bool, newAccount: Bool, seen: [String: GuidanceSeenDTO]) {
        self.enabled = enabled
        self.newAccount = newAccount
        self.seen = seen
    }

    private enum CodingKeys: String, CodingKey {
        case enabled
        case newAccount = "new_account"
        case seen
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try container.decodeIfPresent(Bool.self, forKey: .enabled) ?? false
        newAccount = try container.decodeIfPresent(Bool.self, forKey: .newAccount) ?? false
        // One odd entry never costs the rest of the map.
        let raw = try container.decodeIfPresent([String: LenientSeen].self, forKey: .seen) ?? [:]
        seen = raw.compactMapValues(\.value)
    }

    private struct LenientSeen: Decodable {
        let value: GuidanceSeenDTO?

        init(from decoder: any Decoder) throws {
            value = try? GuidanceSeenDTO(from: decoder)
        }
    }
}

/// How often a card has closed for this person, and when it last did.
public struct GuidanceSeenDTO: Codable, Sendable, Hashable {
    public var times: Int
    /// ISO 8601, as the server wrote it.
    public var lastAt: String?

    public init(times: Int, lastAt: String?) {
        self.times = times
        self.lastAt = lastAt
    }

    private enum CodingKeys: String, CodingKey {
        case times
        case lastAt = "last_at"
    }
}

/// `{ "guidance": { … } }`: the answer of `POST /api/users/guidance/shown` (and `/reset`).
public struct GuidanceEnvelope: Decodable, Sendable, Hashable {
    public let guidance: GuidanceStateDTO
}

/// `POST /api/users/guidance/shown` body.
struct GuidanceShownBody: Encodable {
    let card: String
}
