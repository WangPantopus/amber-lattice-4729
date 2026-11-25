//
//  ProfileTieDTOs.swift
//  Pantopus
//
//  Credits, asks and ties (CONTRACT P2.5, p2.7; behind the server's `PROFILE_TIES`): who was on a piece, the asks
//  waiting on a person ("Asked of you"), and a signer's own choices on a tie.
//

import Foundation

/// A person (or a typed name) credited on a piece.
public struct ProfileCreditDTO: Decodable, Sendable, Hashable, Identifiable {
    public struct Party: Decodable, Sendable, Hashable {
        /// Nil on a page opened by a link when they didn't allow their name: `did` says what they did instead.
        public let name: String?
        public let userId: String?
        public let username: String?
        public let portraitURL: String?
        /// A name typed by the owner, not a person on Pantopus (Said).
        public let typed: Bool
        public let did: String?

        enum CodingKeys: String, CodingKey {
            case name, username, typed, did
            case userId = "user_id"
            case portraitURL = "portrait_url"
        }

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            name = try? c.decodeIfPresent(String.self, forKey: .name)
            userId = try? c.decodeIfPresent(String.self, forKey: .userId)
            username = try? c.decodeIfPresent(String.self, forKey: .username)
            portraitURL = try? c.decodeIfPresent(String.self, forKey: .portraitURL)
            typed = (try? c.decodeIfPresent(Bool.self, forKey: .typed)) ?? false
            did = try? c.decodeIfPresent(String.self, forKey: .did)
        }
    }

    /// The signer's own choices on their tie (p2.7): shown beside "Take my name off".
    public struct Mine: Decodable, Sendable, Hashable {
        public let showOnMyWork: Bool
        public let showNameOnLinks: Bool

        enum CodingKeys: String, CodingKey {
            case showOnMyWork = "show_on_my_work"
            case showNameOnLinks = "show_name_on_links"
        }
    }

    public let id: String
    public let party: Party
    public let role: String?
    /// with | led | learned_from | for
    public let relation: String?
    public let ink: String
    public let how: String?
    /// The owner's view: signed | asked | did_not_confirm (nobody else ever sees a refusal).
    public let status: String?
    public let mine: Mine?

    enum CodingKeys: String, CodingKey {
        case id, party, role, relation, ink, how, status, mine
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        party = try c.decode(Party.self, forKey: .party)
        role = try? c.decodeIfPresent(String.self, forKey: .role)
        relation = try? c.decodeIfPresent(String.self, forKey: .relation)
        ink = (try? c.decodeIfPresent(String.self, forKey: .ink)) ?? "said"
        how = try? c.decodeIfPresent(String.self, forKey: .how)
        status = try? c.decodeIfPresent(String.self, forKey: .status)
        mine = try? c.decodeIfPresent(Mine.self, forKey: .mine)
    }
}

/// Someone the owner may want to name on a piece: the other party of the job or plan it started from.
public struct ProfileSuggestedCreditDTO: Decodable, Sendable, Hashable, Identifiable {
    public let userId: String
    public let name: String
    public let username: String?
    public let portraitURL: String?
    public let relation: String?
    public let role: String?
    /// "who hired you"
    public let why: String?

    public var id: String {
        userId
    }

    enum CodingKeys: String, CodingKey {
        case name, username, relation, role, why
        case userId = "user_id"
        case portraitURL = "portrait_url"
    }
}

// MARK: - Asked of you

public struct ProfileAsksDTO: Decodable, Sendable, Hashable {
    public let asks: [ProfileAskDTO]

    enum CodingKeys: String, CodingKey {
        case asks
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        asks = ((try? c.decodeIfPresent([Lossy<ProfileAskDTO>].self, forKey: .asks)) ?? []).compactMap(\.value)
    }
}

/// Someone named this person on a piece (or a role at their business) and asks them to sign.
public struct ProfileAskDTO: Decodable, Sendable, Hashable, Identifiable {
    public struct From: Decodable, Sendable, Hashable {
        public let name: String
        public let userId: String?
        public let username: String?
        public let portraitURL: String?

        enum CodingKeys: String, CodingKey {
            case name, username
            case userId = "user_id"
            case portraitURL = "portrait_url"
        }
    }

    public struct Piece: Decodable, Sendable, Hashable {
        public let id: String
        public let title: String
        public let kind: String?
        public let when: String?
        public let coverURL: String?

        enum CodingKeys: String, CodingKey {
            case id, title, kind, when
            case coverURL = "cover_url"
        }
    }

    public struct Business: Decodable, Sendable, Hashable {
        public let name: String?
        public let username: String?
    }

    public let id: String
    /// credit | role
    public let kind: String
    public let from: From
    public let piece: Piece?
    public let role: String?
    public let relation: String?
    /// A role ask: the business it was at, and when.
    public let business: Business?
    public let when: String?

    enum CodingKeys: String, CodingKey {
        case id, kind, from, piece, role, relation, business, when
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = (try? c.decode(String.self, forKey: .kind)) ?? "credit"
        from = try c.decode(From.self, forKey: .from)
        piece = try? c.decodeIfPresent(Piece.self, forKey: .piece)
        role = try? c.decodeIfPresent(String.self, forKey: .role)
        relation = try? c.decodeIfPresent(String.self, forKey: .relation)
        business = try? c.decodeIfPresent(Business.self, forKey: .business)
        when = try? c.decodeIfPresent(String.self, forKey: .when)
    }
}

// MARK: - Bodies

/// `POST /me/pieces/:id/credits`: a person on Pantopus (`user_id`) or a typed name, what they did, and how.
public struct ProfileCreditBody: Encodable, Sendable {
    public let userId: String?
    public let name: String?
    public let role: String?
    public let relation: String

    enum CodingKeys: String, CodingKey {
        case name, role, relation
        case userId = "user_id"
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(userId, forKey: .userId)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(role, forKey: .role)
        try c.encode(relation, forKey: .relation)
    }
}

/// Signing an ask, and a signer changing their two choices later.
public struct ProfileTieChoicesBody: Encodable, Sendable {
    public let showOnMyWork: Bool?
    public let showNameOnLinks: Bool?

    enum CodingKeys: String, CodingKey {
        case showOnMyWork = "show_on_my_work"
        case showNameOnLinks = "show_name_on_links"
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(showOnMyWork, forKey: .showOnMyWork)
        try c.encodeIfPresent(showNameOnLinks, forKey: .showNameOnLinks)
    }
}

/// `{ "ties_enabled": true | false }`: "Let people name me on their work".
public struct ProfileTiesEnabledBody: Encodable, Sendable {
    public let tiesEnabled: Bool

    enum CodingKeys: String, CodingKey {
        case tiesEnabled = "ties_enabled"
    }
}
