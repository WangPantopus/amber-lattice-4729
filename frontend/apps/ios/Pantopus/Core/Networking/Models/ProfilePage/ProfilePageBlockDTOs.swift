//
//  ProfilePageBlockDTOs.swift
//  Pantopus
//
//  The blocks of the profile with sources (CONTRACT.md v1 §3.2). A kind the app doesn't know is skipped.
//

import Foundation

// MARK: - Blocks

public struct ProfilePageBlockDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String?
    public let content: Content

    public enum Content: Sendable, Hashable {
        case lines([ProfilePageLineDTO], more: ProfilePageMoreDTO?)
        case says(ProfilePageLineDTO)
        case knownFor([ProfileKnownForLineDTO], more: ProfilePageMoreDTO?)
        case inCommon(ProfileInCommon)
        case doors([ProfileDoorDTO], leaveCard: ProfileLeaveCardDTO?, signInNote: String?)
        case shelf([ProfileShelfObjectDTO])
        case prompts([ProfilePromptLineDTO])
        case pinnedPosts(userId: String)
        case rows([ProfilePageRowDTO])
        case canDo(subtitle: String?, skills: [ProfileSkillLineDTO])
        case pieces(ProfilePiecesDTO)
        case workRings(ProfileWorkRingsDTO)
        case owns([ProfileOwnsLineDTO])
        case recordChart(ProfileRecordChartDTO)
        case moreCloser(text: String, connects: Bool)
    }

    enum CodingKeys: String, CodingKey {
        case kind, id, title, lines, more, line, doors, objects, prompts, rows, subtitle, skills, style, pieces
        case filters, text, action, note
        case leaveCard = "leave_card"
        case signInNote = "sign_in_note"
        case userId = "user_id"
    }

    // One case a kind, as the contract lists them.
    // swiftlint:disable:next cyclomatic_complexity
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        id = (try? c.decode(String.self, forKey: .id)) ?? kind
        title = try? c.decodeIfPresent(String.self, forKey: .title)
        func list<T: Decodable & Sendable>(_ key: CodingKeys) -> [T] {
            ((try? c.decodeIfPresent([Lossy<T>].self, forKey: key)) ?? []).compactMap(\.value)
        }
        let more = try? c.decodeIfPresent(ProfilePageMoreDTO.self, forKey: .more)
        switch kind {
        case "lines":
            content = .lines(list(.lines), more: more)
        case "says":
            content = try .says(c.decode(ProfilePageLineDTO.self, forKey: .line))
        case "known_for":
            content = .knownFor(list(.lines), more: more)
        case "in_common":
            content = try .inCommon(ProfileInCommon(from: decoder))
        case "doors":
            content = .doors(
                list(.doors),
                leaveCard: try? c.decodeIfPresent(ProfileLeaveCardDTO.self, forKey: .leaveCard),
                signInNote: try? c.decodeIfPresent(String.self, forKey: .signInNote)
            )
        case "shelf":
            content = .shelf(Array(list(.objects).prefix(5)))
        case "prompts":
            content = .prompts(list(.prompts))
        case "pinned_posts":
            content = try .pinnedPosts(userId: c.decode(String.self, forKey: .userId))
        case "rows":
            content = .rows(list(.rows))
        case "can_do":
            content = .canDo(subtitle: try? c.decodeIfPresent(String.self, forKey: .subtitle), skills: list(.skills))
        case "pieces":
            content = .pieces(ProfilePiecesDTO(
                style: (try? c.decode(String.self, forKey: .style)) ?? "list",
                subtitle: try? c.decodeIfPresent(String.self, forKey: .subtitle),
                pieces: list(.pieces),
                filters: (try? c.decodeIfPresent([String].self, forKey: .filters)) ?? [],
                more: more
            ))
        case "work_rings":
            content = try .workRings(ProfileWorkRingsDTO(from: decoder))
        case "owns":
            content = .owns(list(.lines))
        case "record_chart":
            content = try .recordChart(ProfileRecordChartDTO(from: decoder))
        case "more_closer":
            struct Action: Decodable { let kind: String }
            let action = try? c.decodeIfPresent(Action.self, forKey: .action)
            content = try .moreCloser(text: c.decode(String.self, forKey: .text), connects: action?.kind == "connect")
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown block \(kind)")
        }
    }
}

/// `pieces`: pinned (at most three) or a list.
public struct ProfilePiecesDTO: Sendable, Hashable {
    /// pinned | list
    public let style: String
    public let subtitle: String?
    public let pieces: [ProfilePieceDTO]
    /// The kinds the list can be narrowed to ("did", "built").
    public let filters: [String]
    public let more: ProfilePageMoreDTO?
}

/// A Known-for line: a line with `who` and `when` (§3.4), read as a plain line.
public typealias ProfileKnownForLineDTO = ProfilePageLineDTO

public struct ProfileDoorDTO: Decodable, Sendable, Hashable {
    public let key: String
    public let text: String
    public let note: String?
    public let link: ProfilePageLinkDTO?

    enum CodingKeys: String, CodingKey {
        case key, text, note, link
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = (try? c.decode(String.self, forKey: .key)) ?? ""
        text = try c.decode(String.self, forKey: .text)
        note = try? c.decodeIfPresent(String.self, forKey: .note)
        link = try? c.decodeIfPresent(ProfilePageLinkDTO.self, forKey: .link)
    }
}

public struct ProfileLeaveCardDTO: Decodable, Sendable, Hashable {
    public let text: String
    public let note: String?
}

public struct ProfileShelfObjectDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let pictureURL: String?
    public let caption: String

    enum CodingKeys: String, CodingKey {
        case id, caption
        case pictureURL = "picture_url"
    }
}

public struct ProfilePromptLineDTO: Decodable, Sendable, Hashable {
    public let key: String
    public let answer: String
    public let line: ProfilePageLineDTO

    enum CodingKeys: String, CodingKey {
        case key, answer
    }

    public init(from decoder: any Decoder) throws {
        line = try ProfilePageLineDTO(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        answer = (try? c.decode(String.self, forKey: .answer)) ?? line.text
    }
}

public struct ProfilePageRowDTO: Decodable, Sendable, Hashable {
    public let key: String
    public let title: String
    public let detail: String?
    public let link: ProfilePageLinkDTO?

    enum CodingKeys: String, CodingKey {
        case key, title, detail, link
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = (try? c.decode(String.self, forKey: .key)) ?? ""
        title = try c.decode(String.self, forKey: .title)
        detail = try? c.decodeIfPresent(String.self, forKey: .detail)
        link = try? c.decodeIfPresent(ProfilePageLinkDTO.self, forKey: .link)
    }
}

public struct ProfileSkillLineDTO: Decodable, Sendable, Hashable {
    public struct Inks: Decodable, Sendable, Hashable {
        public let seen: Int
        public let signed: Int
        public let said: Int

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: ProfileInkCountKeys.self)
            seen = (try? c.decode(Int.self, forKey: .seen)) ?? 0
            signed = (try? c.decode(Int.self, forKey: .signed)) ?? 0
            said = (try? c.decode(Int.self, forKey: .said)) ?? 0
        }
    }

    public let name: String
    public let pieces: Int
    public let inks: Inks?
    public let line: ProfilePageLineDTO

    enum CodingKeys: String, CodingKey {
        case name, pieces, inks
    }

    public init(from decoder: any Decoder) throws {
        line = try ProfilePageLineDTO(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = (try? c.decode(String.self, forKey: .name)) ?? line.text
        pieces = (try? c.decode(Int.self, forKey: .pieces)) ?? 0
        inks = try? c.decodeIfPresent(Inks.self, forKey: .inks)
    }
}

enum ProfileInkCountKeys: String, CodingKey {
    case seen, signed, said
}

public struct ProfilePieceDTO: Decodable, Sendable, Hashable, Identifiable {
    public struct Media: Decodable, Sendable, Hashable {
        public let photos: Int
        public let videos: Int
        public let documents: Int
        public let links: Int

        enum CodingKeys: String, CodingKey {
            case photos, videos, documents, links
        }

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            photos = (try? c.decode(Int.self, forKey: .photos)) ?? 0
            videos = (try? c.decode(Int.self, forKey: .videos)) ?? 0
            documents = (try? c.decode(Int.self, forKey: .documents)) ?? 0
            links = (try? c.decode(Int.self, forKey: .links)) ?? 0
        }
    }

    public let id: String
    public let title: String
    /// did | built | owns | nil
    public let kind: String?
    public let when: String?
    public let coverURL: URL?
    public let media: Media?
    public let line: ProfilePageLineDTO

    enum CodingKeys: String, CodingKey {
        case id, title, kind, when, media
        case coverURL = "cover_url"
    }

    public init(from decoder: any Decoder) throws {
        line = try ProfilePageLineDTO(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = (try? c.decode(String.self, forKey: .title)) ?? line.text
        kind = try? c.decodeIfPresent(String.self, forKey: .kind)
        when = try? c.decodeIfPresent(String.self, forKey: .when)
        coverURL = (try? c.decodeIfPresent(String.self, forKey: .coverURL)).flatMap { $0.flatMap(URL.init(string:)) }
        media = try? c.decodeIfPresent(Media.self, forKey: .media)
    }
}

public struct ProfileWorkRingsDTO: Decodable, Sendable, Hashable {
    public struct Dot: Decodable, Sendable, Hashable {
        public let pieceId: String
        public let month: String

        enum CodingKeys: String, CodingKey {
            case pieceId = "piece_id"
            case month
        }
    }

    public struct Year: Decodable, Sendable, Hashable {
        public let year: Int
        public let pieces: Int
    }

    public let from: Int?
    public let now: String?
    public let months: [String]
    public let dots: [Dot]
    public let years: [Year]

    enum CodingKeys: String, CodingKey {
        case from, now, months, dots, years
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        from = try? c.decodeIfPresent(Int.self, forKey: .from)
        now = try? c.decodeIfPresent(String.self, forKey: .now)
        months = (try? c.decodeIfPresent([String].self, forKey: .months)) ?? []
        dots = ((try? c.decodeIfPresent([Lossy<Dot>].self, forKey: .dots)) ?? []).compactMap(\.value)
        years = ((try? c.decodeIfPresent([Lossy<Year>].self, forKey: .years)) ?? []).compactMap(\.value)
    }
}

public struct ProfileOwnsLineDTO: Decodable, Sendable, Hashable {
    public struct Badge: Decodable, Sendable, Hashable {
        public let initials: String?
        public let pictureURL: String?

        enum CodingKeys: String, CodingKey {
            case initials
            case pictureURL = "picture_url"
        }
    }

    public let line: ProfilePageLineDTO
    public let badge: Badge?

    enum CodingKeys: String, CodingKey {
        case badge
    }

    public init(from decoder: any Decoder) throws {
        line = try ProfilePageLineDTO(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        badge = try? c.decodeIfPresent(Badge.self, forKey: .badge)
    }
}

public struct ProfileRecordChartDTO: Decodable, Sendable, Hashable {
    public struct Lane: Decodable, Sendable, Hashable {
        public let lane: String
        public let months: [String]
    }

    public let subtitle: String?
    public let from: Int?
    public let now: String?
    public let lanes: [Lane]
    public let note: String?
    public let asOf: String?

    enum CodingKeys: String, CodingKey {
        case subtitle, from, now, lanes, note
        case asOf = "as_of"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        subtitle = try? c.decodeIfPresent(String.self, forKey: .subtitle)
        from = try? c.decodeIfPresent(Int.self, forKey: .from)
        now = try? c.decodeIfPresent(String.self, forKey: .now)
        lanes = ((try? c.decodeIfPresent([Lossy<Lane>].self, forKey: .lanes)) ?? []).compactMap(\.value)
        note = try? c.decodeIfPresent(String.self, forKey: .note)
        asOf = try? c.decodeIfPresent(String.self, forKey: .asOf)
    }
}
