//
//  ProfileShareLinkDTOs.swift
//  Pantopus
//
//  Links for one purpose (CONTRACT.md v1.3): a link with its own parts, an end
//  date and a switch, that counts how often it was opened and the last day,
//  never by whom. Behind the backend's `PROFILE_LINKS`; when it's off the
//  share read carries no `links` and the app draws no section.
//

import Foundation

public struct ProfileShareLinkDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    /// The link with its key. Shown only to the owner; never in logs, chat or screenshots.
    public let url: URL?
    public let parts: [String: Bool]
    /// "2026-12-31": works through that Pacific day; nil, no end.
    public let endsOn: String?
    public let switchedOff: Bool
    public let live: Bool
    public let opens: Int
    public let lastOpenedOn: String?

    enum CodingKeys: String, CodingKey {
        case id, name, url, parts, live, opens
        case endsOn = "ends_on"
        case switchedOff = "switched_off"
        case lastOpenedOn = "last_opened_on"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
        url = (try? c.decodeIfPresent(String.self, forKey: .url)).flatMap { $0.flatMap(URL.init(string:)) }
        parts = (try? c.decodeIfPresent([String: Bool].self, forKey: .parts)) ?? [:]
        endsOn = try? c.decodeIfPresent(String.self, forKey: .endsOn)
        switchedOff = (try? c.decode(Bool.self, forKey: .switchedOff)) ?? false
        live = (try? c.decode(Bool.self, forKey: .live)) ?? false
        opens = (try? c.decode(Int.self, forKey: .opens)) ?? 0
        lastOpenedOn = try? c.decodeIfPresent(String.self, forKey: .lastOpenedOn)
    }
}

/// The body of `POST /me/links` and `PATCH /me/links/:id`: keys left out are left as they are.
public struct ProfileShareLinkBody: Encodable, Sendable {
    public var name: String?
    public var parts: [String: Bool]?
    /// `.some(nil)` clears the end date.
    public var endsOn: String??
    public var switchedOff: Bool?

    enum CodingKeys: String, CodingKey {
        case name, parts
        case endsOn = "ends_on"
        case switchedOff = "switched_off"
    }

    public init(name: String? = nil, parts: [String: Bool]? = nil, endsOn: String?? = nil, switchedOff: Bool? = nil) {
        self.name = name
        self.parts = parts
        self.endsOn = endsOn
        self.switchedOff = switchedOff
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(parts, forKey: .parts)
        if let endsOn {
            if let day = endsOn { try c.encode(day, forKey: .endsOn) } else { try c.encodeNil(forKey: .endsOn) }
        }
        try c.encodeIfPresent(switchedOff, forKey: .switchedOff)
    }
}
