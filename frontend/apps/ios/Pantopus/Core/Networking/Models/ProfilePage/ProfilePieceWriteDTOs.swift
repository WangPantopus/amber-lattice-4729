//
//  ProfilePieceWriteDTOs.swift
//  Pantopus
//
//  The owner's pieces (CONTRACT P2.3, P2.4): their list with the jobs and plans offered, the body a piece is made
//  or changed with, "How this piece will show" and proving a linked page is theirs.
//

import Foundation

// MARK: - GET /me/pieces

public struct ProfileMyPiecesDTO: Decodable, Sendable, Hashable {
    public struct Counts: Decodable, Sendable, Hashable {
        public let shownOnLink: Int
        public let total: Int

        enum CodingKeys: String, CodingKey {
            case total
            case shownOnLink = "shown_on_link"
        }
    }

    public let pieces: [ProfileOwnedPieceDTO]
    public let offered: [ProfilePieceOfferDTO]
    public let counts: Counts?

    enum CodingKeys: String, CodingKey {
        case pieces, offered, counts
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pieces = ((try? c.decodeIfPresent([Lossy<ProfileOwnedPieceDTO>].self, forKey: .pieces)) ?? []).compactMap(\.value)
        offered = ((try? c.decodeIfPresent([Lossy<ProfilePieceOfferDTO>].self, forKey: .offered)) ?? []).compactMap(\.value)
        counts = try? c.decodeIfPresent(Counts.self, forKey: .counts)
    }
}

/// A piece as its owner sees it, with "How this piece will show" (the answer to a make or a change too).
public struct ProfileOwnedPieceDTO: Decodable, Sendable, Hashable, Identifiable {
    public let summary: ProfilePieceDTO
    public let howItWillShow: [String]

    public var id: String {
        summary.id
    }

    enum CodingKeys: String, CodingKey {
        case howItWillShow = "how_it_will_show"
    }

    public init(from decoder: any Decoder) throws {
        summary = try ProfilePieceDTO(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        howItWillShow = (try? c.decodeIfPresent([String].self, forKey: .howItWillShow)) ?? []
    }
}

/// A paid job the person did, completed and paid, or a plan they hosted that took place, not yet a piece (board 10's
/// top). `title` is the poster's words for a job: the owner's banner only, never the piece's title.
public struct ProfilePieceOfferDTO: Decodable, Sendable, Hashable, Identifiable {
    /// gig | plan
    public let kind: String
    public let id: String
    public let title: String
    public let when: String?
    /// The other party, shown to the owner only and never on the piece.
    public let with: String?
    public let text: String

    enum CodingKeys: String, CodingKey {
        case kind, id, title, when, with, text
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decode(String.self, forKey: .kind)
        id = try c.decode(String.self, forKey: .id)
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        when = try? c.decodeIfPresent(String.self, forKey: .when)
        with = try? c.decodeIfPresent(String.self, forKey: .with)
        text = (try? c.decode(String.self, forKey: .text)) ?? ""
    }
}

// MARK: - The body of a make, a change or a preview

/// A piece's fields, only those set: a change sends just what changed, and `null` clears a field.
public struct ProfilePieceBody: Encodable, Sendable, Hashable {
    public private(set) var fields: [String: ProfileJSONValue] = [:]

    public init() {}

    public mutating func set(_ key: String, _ value: ProfileJSONValue) {
        fields[key] = value
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(fields)
    }
}

/// A JSON value for a piece's body.
public enum ProfileJSONValue: Encodable, Sendable, Hashable {
    case string(String)
    case bool(Bool)
    case null
    case strings([String])
    case objects([[String: String]])
    case object([String: String])

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case let .string(value): try c.encode(value)
        case let .bool(value): try c.encode(value)
        case .null: try c.encodeNil()
        case let .strings(value): try c.encode(value)
        case let .objects(value): try c.encode(value)
        case let .object(value): try c.encode(value)
        }
    }

    /// A text, or `null` when it is empty.
    public static func text(_ value: String) -> ProfileJSONValue {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? .null : .string(trimmed)
    }
}

// MARK: - Preview and proof

public struct ProfilePiecePreviewDTO: Decodable, Sendable, Hashable {
    public let howItWillShow: [String]

    enum CodingKeys: String, CodingKey {
        case howItWillShow = "how_it_will_show"
    }
}

/// The short line a person puts on their page to prove it is theirs (board 11).
public struct ProfileLinkProofDTO: Decodable, Sendable, Hashable {
    /// "pantopus-proof: 7KQ2-X9TM"
    public let line: String
    /// The same as a meta tag, for a person's own site.
    public let meta: String?
    /// Where to put it, in the server's words.
    public let how: String?
}
