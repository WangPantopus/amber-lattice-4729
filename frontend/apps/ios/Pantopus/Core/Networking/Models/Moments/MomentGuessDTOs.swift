//
//  MomentGuessDTOs.swift
//  Pantopus
//
//  Guess the spot ("Pulse, reinvented", CONTRACT section 5): a photo or video Moment its author marks "Guess the spot".
//  Others see the picture but not where it was taken, drop a pin, and learn how far off they were. Distance only: no
//  points, no ranks. Everything here comes only to a reader whose `pulse_reinvented` switch is on; read without
//  throwing, so a Moment or the map never fails over it, and an older server sends none of it.
//

import Foundation

/// A guess-the-spot Moment as its reader sees it (CONTRACT 5b): how many people guessed, and the reader's own guess.
/// Nil on an ordinary Moment (`"guess": null`) and from a server before it.
public struct MomentGuessStateDTO: Sendable, Hashable {
    public let count: Int
    /// The reader's guess; nil until they guessed, and on one's own.
    public let mine: MomentGuessResultDTO?

    private enum OuterKeys: String, CodingKey { case guess }
    private enum CodingKeys: String, CodingKey { case count, mine }

    init?(from decoder: any Decoder) {
        guard let outer = try? decoder.container(keyedBy: OuterKeys.self),
              let c = try? outer.nestedContainer(keyedBy: CodingKeys.self, forKey: .guess) else { return nil }
        count = (try? c.decodeIfPresent(Int.self, forKey: .count)) ?? 0
        mine = try? c.decodeIfPresent(MomentGuessResultDTO.self, forKey: .mine)
    }
}

/// How far off a guess was: `{ "distance_m": 1930, "label": "1.2 mi off" }`.
public struct MomentGuessResultDTO: Decodable, Sendable, Hashable {
    public let distanceM: Double
    public let label: String

    private enum CodingKeys: String, CodingKey {
        case label
        case distanceM = "distance_m"
    }
}

/// `POST /api/moments/:id/guess`: `{ "latitude": 45.61, "longitude": -122.40 }`.
struct MomentGuessBody: Encodable {
    let latitude: Double
    let longitude: Double
}

/// The answer to a guess: how far off, and the Moment now in full (its place, its stamps).
struct MomentGuessResponse: Decodable {
    let guess: MomentGuessResultDTO
    let moment: MomentDTO
}

/// One live guess-the-spot Moment the reader may see in the map's box (CONTRACT 5d), with no point: the list is the
/// same anywhere inside a 0.1° cell, so zooming in says nothing more. Shown as a list, never as marks on the map.
public struct MomentGuessSpotDTO: Decodable, Sendable, Hashable, Identifiable {
    public let momentId: String
    public let author: MomentAuthorDTO?
    public let kind: MomentKind
    public let thumbURL: String?
    public let createdAt: String
    public let expiresAt: String
    public let guessed: Bool
    /// Today's spot for its town.
    public let daily: Bool

    public var id: String {
        momentId
    }

    public var thumb: URL? {
        thumbURL.flatMap(URL.init(string:))
    }

    private enum CodingKeys: String, CodingKey {
        case author, kind, guessed, daily
        case momentId = "moment_id"
        case thumbURL = "thumb_url"
        case createdAt = "created_at"
        case expiresAt = "expires_at"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        momentId = try c.decode(String.self, forKey: .momentId)
        author = try? c.decodeIfPresent(MomentAuthorDTO.self, forKey: .author)
        kind = (try? c.decodeIfPresent(MomentKind.self, forKey: .kind)) ?? .photo
        thumbURL = try? c.decodeIfPresent(String.self, forKey: .thumbURL)
        createdAt = (try? c.decodeIfPresent(String.self, forKey: .createdAt)) ?? ""
        expiresAt = (try? c.decodeIfPresent(String.self, forKey: .expiresAt)) ?? ""
        guessed = (try? c.decodeIfPresent(Bool.self, forKey: .guessed)) ?? false
        daily = (try? c.decodeIfPresent(Bool.self, forKey: .daily)) ?? false
    }

    /// The map's `guess_spots`, one by one: one the app can't read is left out, never the map.
    static func list(from decoder: any Decoder) -> [MomentGuessSpotDTO] {
        enum Keys: String, CodingKey { case guessSpots = "guess_spots" }
        guard let c = try? decoder.container(keyedBy: Keys.self),
              let list = try? c.decodeIfPresent(LossyList<MomentGuessSpotDTO>.self, forKey: .guessSpots) else { return [] }
        return list.items
    }
}

/// `GET /api/moments/daily-spot`: one spot per town per day, the same for everyone (CONTRACT 5d).
public struct MomentDailySpotResponse: Decodable, Sendable {
    public let dailySpot: MomentDailySpotDTO?

    private enum CodingKeys: String, CodingKey {
        case dailySpot = "daily_spot"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        dailySpot = try? c.decodeIfPresent(MomentDailySpotDTO.self, forKey: .dailySpot)
    }
}

public struct MomentDailySpotDTO: Decodable, Sendable, Hashable {
    public let momentId: String
    public let town: String?
    public let day: String?
    public let guessed: Bool

    private enum CodingKeys: String, CodingKey {
        case town, day, guessed
        case momentId = "moment_id"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        momentId = try c.decode(String.self, forKey: .momentId)
        town = try? c.decodeIfPresent(String.self, forKey: .town)
        day = try? c.decodeIfPresent(String.self, forKey: .day)
        guessed = (try? c.decodeIfPresent(Bool.self, forKey: .guessed)) ?? false
    }
}
