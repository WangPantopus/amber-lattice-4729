//
//  ProfileCircleDTOs.swift
//  Pantopus
//
//  The work circle (board 9; CONTRACT P2.6, p2.8): who a person works with, in three groups, drawn from the people
//  named on their pieces and their roles; and the pieces two people share. Behind the server's `PROFILE_TIES`.
//

import Foundation

public struct ProfileCirclePersonDTO: Decodable, Sendable, Hashable {
    /// person | business | place
    public let kind: String
    /// Nil on a page opened by a link when they didn't allow their name.
    public let name: String?
    public let userId: String?
    public let username: String?
    public let portraitURL: String?
    /// What they did ("Carpenter", "Apprentice carpenter, 2017 to 2023").
    public let did: String?
    /// signed: a tie both sides confirmed (a solid line); said: a typed name (a dotted line).
    public let ink: String
    public let sharedPieces: Int

    enum CodingKeys: String, CodingKey {
        case kind, name, username, did, ink
        case userId = "user_id"
        case portraitURL = "portrait_url"
        case sharedPieces = "shared_pieces"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = (try? c.decodeIfPresent(String.self, forKey: .kind)) ?? "person"
        name = try? c.decodeIfPresent(String.self, forKey: .name)
        userId = try? c.decodeIfPresent(String.self, forKey: .userId)
        username = try? c.decodeIfPresent(String.self, forKey: .username)
        portraitURL = try? c.decodeIfPresent(String.self, forKey: .portraitURL)
        did = try? c.decodeIfPresent(String.self, forKey: .did)
        ink = (try? c.decodeIfPresent(String.self, forKey: .ink)) ?? "said"
        sharedPieces = (try? c.decodeIfPresent(Int.self, forKey: .sharedPieces)) ?? 0
    }
}

public struct ProfileCircleGroupDTO: Decodable, Sendable, Hashable, Identifiable {
    /// taught_or_led | works_beside | learned_from
    public let key: String
    public let title: String
    public let count: Int
    public let people: [ProfileCirclePersonDTO]

    public var id: String {
        key
    }

    enum CodingKeys: String, CodingKey {
        case key, title, count, people
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        title = (try? c.decode(String.self, forKey: .title)) ?? key
        people = ((try? c.decodeIfPresent([Lossy<ProfileCirclePersonDTO>].self, forKey: .people)) ?? []).compactMap(\.value)
        count = (try? c.decodeIfPresent(Int.self, forKey: .count)) ?? people.count
    }
}

/// The `circle` block on Work (at most six people a group) and the whole circle (`GET …/circle`, everyone).
public struct ProfileCircleDTO: Decodable, Sendable, Hashable {
    /// "4 people on Maria's work" (the block only).
    public let text: String?
    public let groups: [ProfileCircleGroupDTO]
    /// "Hired by 14 households and 2 businesses", Seen.
    public let hiredBy: ProfilePageLineDTO?
    /// The block opens the whole circle when the server sends a link.
    public let opens: Bool

    enum CodingKeys: String, CodingKey {
        case text, groups, link
        case hiredBy = "hired_by"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try? c.decodeIfPresent(String.self, forKey: .text)
        groups = ((try? c.decodeIfPresent([Lossy<ProfileCircleGroupDTO>].self, forKey: .groups)) ?? []).compactMap(\.value)
        hiredBy = try? c.decodeIfPresent(ProfilePageLineDTO.self, forKey: .hiredBy)
        opens = (try? c.decodeIfPresent(ProfilePageLinkDTO.self, forKey: .link)) != nil
    }

    public func group(_ key: String) -> ProfileCircleGroupDTO? {
        groups.first { $0.key == key }
    }
}

/// `GET …/circle/:userId`: the pieces the two share that this viewer may open.
public struct ProfileCirclePiecesDTO: Decodable, Sendable, Hashable {
    public let pieces: [ProfilePieceDTO]

    enum CodingKeys: String, CodingKey {
        case pieces
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pieces = ((try? c.decodeIfPresent([Lossy<ProfilePieceDTO>].self, forKey: .pieces)) ?? []).compactMap(\.value)
    }
}
