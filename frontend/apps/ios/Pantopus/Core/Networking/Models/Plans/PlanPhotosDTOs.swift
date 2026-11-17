//
//  PlanPhotosDTOs.swift
//  Pantopus
//
//  Plans for the holidays, photos afterwards (08-extras section 5, board 29). The card of a plan that is over carries
//  `photos` for the host and the people who were in, while `plans_photos` is on for the host and a private bucket and
//  the picture check are set up. The pictures come from the grid, as links signed for `expires_in` seconds: they are
//  never saved, and the grid is read again when they run out. Route backend/services/plans/planPhotos.js.
//

import Foundation

/// The card's part: "23 from 5 people", "This was Saturday, Nov 21", "12 people came".
public struct PlanPhotosCardDTO: Decodable, Sendable, Hashable {
    public let count: Int
    public let text: String
    public let banner: String?
    public let cameText: String?
    public let canAdd: Bool
    public let note: String?

    enum CodingKeys: String, CodingKey {
        case count, text, banner, note
        case cameText = "came_text"
        case canAdd = "can_add"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        count = try container.decodeIfPresent(Int.self, forKey: .count) ?? 0
        text = try container.decodeIfPresent(String.self, forKey: .text) ?? ""
        banner = try container.decodeIfPresent(String.self, forKey: .banner)
        cameText = try container.decodeIfPresent(String.self, forKey: .cameText)
        canAdd = try container.decodeIfPresent(Bool.self, forKey: .canAdd) ?? false
        note = try container.decodeIfPresent(String.self, forKey: .note)
    }
}

/// One picture, by its signed links.
public struct PlanPhotoDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let url: String
    public let thumbUrl: String?
    public let width: Int?
    public let height: Int?
    public let byName: String?
    public let mine: Bool
    public let canRemove: Bool

    enum CodingKeys: String, CodingKey {
        case id, url, mine
        case thumbUrl = "thumb_url"
        case width = "w"
        case height = "h"
        case byName = "by_name"
        case canRemove = "can_remove"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        url = try container.decode(String.self, forKey: .url)
        thumbUrl = try container.decodeIfPresent(String.self, forKey: .thumbUrl)
        width = try container.decodeIfPresent(Int.self, forKey: .width)
        height = try container.decodeIfPresent(Int.self, forKey: .height)
        byName = try container.decodeIfPresent(String.self, forKey: .byName)
        mine = try container.decodeIfPresent(Bool.self, forKey: .mine) ?? false
        canRemove = try container.decodeIfPresent(Bool.self, forKey: .canRemove) ?? false
    }
}

/// `GET /api/plans/:id/photos`, and the answer to adding and removing one.
public struct PlanPhotosGridDTO: Decodable, Sendable, Hashable {
    public let photos: [PlanPhotoDTO]
    public let count: Int
    public let text: String
    public let canAdd: Bool
    public let note: String?
    /// How long the links work, in seconds.
    public let expiresIn: Int

    enum CodingKeys: String, CodingKey {
        case photos, count, text, note
        case canAdd = "can_add"
        case expiresIn = "expires_in"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        photos = try container.decodeIfPresent([PlanPhotoDTO].self, forKey: .photos) ?? []
        count = try container.decodeIfPresent(Int.self, forKey: .count) ?? photos.count
        text = try container.decodeIfPresent(String.self, forKey: .text) ?? ""
        canAdd = try container.decodeIfPresent(Bool.self, forKey: .canAdd) ?? false
        note = try container.decodeIfPresent(String.self, forKey: .note)
        expiresIn = try container.decodeIfPresent(Int.self, forKey: .expiresIn) ?? 900
    }
}
