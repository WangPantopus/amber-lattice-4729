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
    /// A photo, video or document on a piece (P2.2 `attachments`; v1's `media` read the same way).
    public struct Attachment: Decodable, Sendable, Hashable {
        public let id: String?
        /// photo | video | document
        public let kind: String
        public let url: String
        public let thumbnailURL: String?
        public let title: String?
        public let detail: String?

        enum CodingKeys: String, CodingKey {
            case id, kind, url, title, detail
            case thumbnailURL = "thumbnail_url"
        }
    }

    /// A link on a piece, as a card of words (P2.4): never a picture from the page.
    public struct LinkCard: Decodable, Sendable, Hashable {
        public let id: String?
        public let url: String
        public let site: String?
        /// site | video | code | app | article | paper
        public let kind: String?
        public let title: String?
        public let description: String?
        public let ink: String
        public let how: String?

        enum CodingKeys: String, CodingKey {
            case id, url, site, kind, title, description, ink, how
        }

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try? c.decodeIfPresent(String.self, forKey: .id)
            url = try c.decode(String.self, forKey: .url)
            site = try? c.decodeIfPresent(String.self, forKey: .site)
            kind = try? c.decodeIfPresent(String.self, forKey: .kind)
            title = try? c.decodeIfPresent(String.self, forKey: .title)
            description = try? c.decodeIfPresent(String.self, forKey: .description)
            ink = (try? c.decodeIfPresent(String.self, forKey: .ink)) ?? "said"
            how = try? c.decodeIfPresent(String.self, forKey: .how)
        }
    }

    public struct Piece: Decodable, Sendable, Hashable {
        public let summary: ProfilePieceDTO
        /// The person's own words, Said.
        public let description: ProfilePageLineDTO?
        /// Each source its own line (board 8's "How we know"); empty from a phase 1 server.
        public let howWeKnow: [ProfilePageLineDTO]
        /// The skills it shows, at most five.
        public let showsCan: [String]
        public let attachments: [Attachment]
        public let links: [LinkCard]
        /// Reviews from the job it started from ("What Dan wrote"), each with its `who` and `when`.
        public let written: [ProfilePageLineDTO]
        public let keptOnce: String?
        /// The owner's view only: how the piece will show, as the server words it.
        public let howItWillShow: [String]

        enum CodingKeys: String, CodingKey {
            case description, media, links, skills, attachments, written
            case howWeKnow = "how_we_know"
            case showsCan = "shows_can"
            case keptOnce = "kept_once"
            case howItWillShow = "how_it_will_show"
        }

        public init(from decoder: any Decoder) throws {
            summary = try ProfilePieceDTO(from: decoder)
            let c = try decoder.container(keyedBy: CodingKeys.self)
            func list<T: Decodable & Sendable>(_ key: CodingKeys) -> [T] {
                ((try? c.decodeIfPresent([Lossy<T>].self, forKey: key)) ?? []).compactMap(\.value)
            }
            description = try? c.decodeIfPresent(ProfilePageLineDTO.self, forKey: .description)
            howWeKnow = list(.howWeKnow)
            let shows: [String] = (try? c.decodeIfPresent([String].self, forKey: .showsCan)) ?? []
            showsCan = shows.isEmpty ? ((try? c.decodeIfPresent([String].self, forKey: .skills)) ?? []) : shows
            let attached: [Attachment] = list(.attachments)
            // A phase 1 server sends `media` (kind, url, thumbnail) in place of `attachments`.
            attachments = attached.isEmpty ? list(.media) : attached
            links = list(.links)
            written = list(.written)
            keptOnce = try? c.decodeIfPresent(String.self, forKey: .keptOnce)
            howItWillShow = (try? c.decodeIfPresent([String].self, forKey: .howItWillShow)) ?? []
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
    /// Links for one purpose (v1.3): nil while the server's `PROFILE_LINKS` is off (no section is drawn).
    public let linksEnabled: Bool?
    public let links: [ProfileShareLinkDTO]
    /// False only on a server where a private profile's links don't open (v1.4); always true from v1.6.
    public let linksOpen: Bool
    /// A plain note for the owner when their profile isn't open to visitors (v1.6); nil when it is.
    public let linksNote: String?

    enum CodingKeys: String, CodingKey {
        case username, url, saved, parts, visitor
        case usernameIsMadeUp = "username_is_made_up"
        case searchEngines = "search_engines"
        case cityLimit = "city_limit"
        case linksEnabled = "links_enabled"
        case links
        case linksOpen = "links_open"
        case linksNote = "links_note"
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
        linksEnabled = try? c.decodeIfPresent(Bool.self, forKey: .linksEnabled)
        links = ((try? c.decodeIfPresent([Lossy<ProfileShareLinkDTO>].self, forKey: .links)) ?? []).compactMap(\.value)
        linksOpen = (try? c.decodeIfPresent(Bool.self, forKey: .linksOpen)) ?? true
        linksNote = try? c.decodeIfPresent(String.self, forKey: .linksNote)
    }
}
