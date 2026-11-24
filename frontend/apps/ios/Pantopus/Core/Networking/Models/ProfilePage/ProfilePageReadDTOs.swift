//
//  ProfilePageReadDTOs.swift
//  Pantopus
//
//  A month, a piece and the share settings of the profile with sources (CONTRACT.md v1 §5, §6).
//

import Foundation

// MARK: - Month and piece reads (§5)

public struct ProfileMonthDTO: Decodable, Sendable, Hashable {
    public let month: String
    public let title: String
    public let subtitle: String?
    public let lines: [ProfilePageLineDTO]

    enum CodingKeys: String, CodingKey {
        case month, title, subtitle, lines
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        month = try c.decode(String.self, forKey: .month)
        title = (try? c.decode(String.self, forKey: .title)) ?? month
        subtitle = try? c.decodeIfPresent(String.self, forKey: .subtitle)
        lines = ((try? c.decodeIfPresent([Lossy<ProfilePageLineDTO>].self, forKey: .lines)) ?? []).compactMap(\.value)
    }
}

public struct ProfilePieceReadDTO: Decodable, Sendable, Hashable {
    public struct MediaItem: Decodable, Sendable, Hashable {
        public let kind: String
        public let url: String
        public let thumbnailURL: String?

        enum CodingKeys: String, CodingKey {
            case kind, url
            case thumbnailURL = "thumbnail_url"
        }
    }

    public struct WebLink: Decodable, Sendable, Hashable {
        public let url: String
        public let title: String?
        public let site: String?
    }

    public struct Piece: Decodable, Sendable, Hashable {
        public let summary: ProfilePieceDTO
        public let description: ProfilePageLineDTO?
        public let media: [MediaItem]
        public let links: [WebLink]
        public let skills: [String]

        enum CodingKeys: String, CodingKey {
            case description, media, links, skills
        }

        public init(from decoder: any Decoder) throws {
            summary = try ProfilePieceDTO(from: decoder)
            let c = try decoder.container(keyedBy: CodingKeys.self)
            description = try? c.decodeIfPresent(ProfilePageLineDTO.self, forKey: .description)
            media = ((try? c.decodeIfPresent([Lossy<MediaItem>].self, forKey: .media)) ?? []).compactMap(\.value)
            links = ((try? c.decodeIfPresent([Lossy<WebLink>].self, forKey: .links)) ?? []).compactMap(\.value)
            skills = (try? c.decodeIfPresent([String].self, forKey: .skills)) ?? []
        }
    }

    public let piece: Piece
}

// MARK: - Share (§6)

public struct ProfileShareDTO: Decodable, Sendable, Hashable {
    public struct Part: Decodable, Sendable, Hashable {
        public let key: String
        /// anyone | members | connections
        public let setting: String
        public let hasContent: Bool

        enum CodingKeys: String, CodingKey {
            case key, setting
            case hasContent = "has_content"
        }

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            key = try c.decode(String.self, forKey: .key)
            setting = (try? c.decode(String.self, forKey: .setting)) ?? "members"
            hasContent = (try? c.decode(Bool.self, forKey: .hasContent)) ?? true
        }
    }

    public let username: String
    public let usernameIsMadeUp: Bool
    public let url: URL?
    public let saved: Bool
    public let parts: [Part]
    public let searchEngines: Bool
    /// anyone | connections | none
    public let cityLimit: String?
    public let visitor: ProfilePageDTO?

    enum CodingKeys: String, CodingKey {
        case username, url, saved, parts, visitor
        case usernameIsMadeUp = "username_is_made_up"
        case searchEngines = "search_engines"
        case cityLimit = "city_limit"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        username = (try? c.decode(String.self, forKey: .username)) ?? ""
        usernameIsMadeUp = (try? c.decode(Bool.self, forKey: .usernameIsMadeUp)) ?? false
        url = (try? c.decodeIfPresent(String.self, forKey: .url)).flatMap { $0.flatMap(URL.init(string:)) }
        saved = (try? c.decode(Bool.self, forKey: .saved)) ?? false
        parts = ((try? c.decodeIfPresent([Lossy<Part>].self, forKey: .parts)) ?? []).compactMap(\.value)
        searchEngines = (try? c.decode(Bool.self, forKey: .searchEngines)) ?? false
        cityLimit = try? c.decodeIfPresent(String.self, forKey: .cityLimit)
        visitor = try? c.decodeIfPresent(ProfilePageDTO.self, forKey: .visitor)
    }
}
