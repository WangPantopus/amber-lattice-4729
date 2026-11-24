//
//  ProfilePageDTOs.swift
//  Pantopus
//
//  The profile with sources, frozen contract v1 (`~/pantopus-profile-sources/CONTRACT.md`): the server composes a
//  person's page for this viewer; the app draws its blocks in the order sent. Decoding is forgiving by rule (§0): a
//  block, link or action kind the app doesn't know is skipped, and a known block that doesn't read is skipped too,
//  never an error for the page.
//

import Foundation

// MARK: - The page

public struct ProfilePageDTO: Decodable, Sendable, Hashable {
    public let version: Int
    /// owner | household | connection | member | link
    public let view: String
    public let listed: Bool
    public let header: ProfilePageHeaderDTO
    public let summary: ProfilePageSummaryDTO?
    public let tabs: [ProfilePageTabDTO]
    public let actions: [ProfilePageActionDTO]
    public let footer: ProfilePageFooterDTO?
    /// Set on an owner's `?as=` read.
    public let previewAs: String?

    enum CodingKeys: String, CodingKey {
        case version = "v"
        case view, listed, header, summary, tabs, actions, footer
        case previewAs = "preview_as"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = (try? c.decode(Int.self, forKey: .version)) ?? 1
        view = (try? c.decode(String.self, forKey: .view)) ?? "member"
        listed = (try? c.decode(Bool.self, forKey: .listed)) ?? false
        header = try c.decode(ProfilePageHeaderDTO.self, forKey: .header)
        summary = try? c.decodeIfPresent(ProfilePageSummaryDTO.self, forKey: .summary)
        tabs = ((try? c.decodeIfPresent([Lossy<ProfilePageTabDTO>].self, forKey: .tabs)) ?? []).compactMap(\.value)
        actions = ((try? c.decodeIfPresent([Lossy<ProfilePageActionDTO>].self, forKey: .actions)) ?? []).compactMap(\.value)
        footer = try? c.decodeIfPresent(ProfilePageFooterDTO.self, forKey: .footer)
        previewAs = try? c.decodeIfPresent(String.self, forKey: .previewAs)
    }
}

/// Reads an element of a list, or nil when it doesn't read: the rest of the list stays.
struct Lossy<Value: Decodable & Sendable>: Decodable {
    let value: Value?

    init(from decoder: any Decoder) throws {
        value = try? Value(from: decoder)
    }
}

public struct ProfilePageHeaderDTO: Decodable, Sendable, Hashable {
    public let userId: String
    public let username: String?
    public let name: String
    /// Owner view only: the account's own name, for the gray "stays private" line.
    public let accountName: String?
    public let firstName: String
    public let headline: String?
    public let portraitURL: URL?
    public let seenAs: String?
    public let place: ProfilePagePlaceDTO?
    public let rings: ProfilePageRingsDTO

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case username, name
        case accountName = "account_name"
        case firstName = "first_name"
        case headline
        case portraitURL = "portrait_url"
        case seenAs = "seen_as"
        case place, rings
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        username = try? c.decodeIfPresent(String.self, forKey: .username)
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
        accountName = try? c.decodeIfPresent(String.self, forKey: .accountName)
        firstName = (try? c.decode(String.self, forKey: .firstName)) ?? ""
        headline = try? c.decodeIfPresent(String.self, forKey: .headline)
        portraitURL = (try? c.decodeIfPresent(String.self, forKey: .portraitURL)).flatMap { $0.flatMap(URL.init(string:)) }
        seenAs = try? c.decodeIfPresent(String.self, forKey: .seenAs)
        place = try? c.decodeIfPresent(ProfilePagePlaceDTO.self, forKey: .place)
        rings = (try? c.decode(ProfilePageRingsDTO.self, forKey: .rings)) ?? ProfilePageRingsDTO.empty
    }
}

public struct ProfilePagePlaceDTO: Decodable, Sendable, Hashable {
    public let label: String
    public let timeZone: String?
    public let time: String?
    public let sky: String?

    enum CodingKeys: String, CodingKey {
        case label
        case timeZone = "tz"
        case time, sky
    }
}

public struct ProfilePageRingsDTO: Decodable, Sendable, Hashable {
    public let from: Int?
    public let now: String?
    public let home: [String]
    public let work: [String]
    public let others: [String]

    static let empty = ProfilePageRingsDTO(from: nil, now: nil, home: [], work: [], others: [])

    init(from: Int?, now: String?, home: [String], work: [String], others: [String]) {
        self.from = from
        self.now = now
        self.home = home
        self.work = work
        self.others = others
    }

    enum CodingKeys: String, CodingKey {
        case from, now, home, work, others
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        from = try? c.decodeIfPresent(Int.self, forKey: .from)
        now = try? c.decodeIfPresent(String.self, forKey: .now)
        home = (try? c.decodeIfPresent([String].self, forKey: .home)) ?? []
        work = (try? c.decodeIfPresent([String].self, forKey: .work)) ?? []
        others = (try? c.decodeIfPresent([String].self, forKey: .others)) ?? []
    }
}

public struct ProfilePageSummaryDTO: Decodable, Sendable, Hashable {
    public let years: Int
    public let seenMonths: Int
    public let signedMonths: Int
    public let saidMonths: Int

    enum CodingKeys: String, CodingKey {
        case years
        case seenMonths = "seen_months"
        case signedMonths = "signed_months"
        case saidMonths = "said_months"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        years = (try? c.decode(Int.self, forKey: .years)) ?? 0
        seenMonths = (try? c.decode(Int.self, forKey: .seenMonths)) ?? 0
        signedMonths = (try? c.decode(Int.self, forKey: .signedMonths)) ?? 0
        saidMonths = (try? c.decode(Int.self, forKey: .saidMonths)) ?? 0
    }
}

public struct ProfilePageTabDTO: Decodable, Sendable, Hashable {
    /// person | work | record; an unknown key is skipped by the screen.
    public let key: String
    public let title: String
    public let blocks: [ProfilePageBlockDTO]

    enum CodingKeys: String, CodingKey {
        case key, title, blocks
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        blocks = ((try? c.decodeIfPresent([Lossy<ProfilePageBlockDTO>].self, forKey: .blocks)) ?? []).compactMap(\.value)
    }
}

public struct ProfilePageFooterDTO: Decodable, Sendable, Hashable {
    public let text: String
    public let asOf: String?

    enum CodingKeys: String, CodingKey {
        case text
        case asOf = "as_of"
    }
}

// MARK: - Actions

public enum ProfilePageActionDTO: Decodable, Sendable, Hashable {
    case edit
    case previewAs(views: [String])
    case share(url: URL?)
    /// none | requested | incoming
    case connect(state: String)
    case message
    case call(phone: String)
    case email(email: String)
    case leaveCard(note: String?)

    enum CodingKeys: String, CodingKey {
        case kind, views, url, state, phone, email, note
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "edit": self = .edit
        case "preview_as": self = .previewAs(views: (try? c.decode([String].self, forKey: .views)) ?? [])
        case "share": self = .share(url: (try? c.decodeIfPresent(String.self, forKey: .url)).flatMap { $0.flatMap(URL.init(string:)) })
        case "connect": self = .connect(state: (try? c.decode(String.self, forKey: .state)) ?? "none")
        case "message": self = .message
        case "call": self = try .call(phone: c.decode(String.self, forKey: .phone))
        case "email": self = try .email(email: c.decode(String.self, forKey: .email))
        case "leave_card": self = .leaveCard(note: try? c.decodeIfPresent(String.self, forKey: .note))
        default: throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown action")
        }
    }
}

// MARK: - Lines and links

public struct ProfilePageLineDTO: Decodable, Sendable, Hashable {
    public let ink: String
    public let text: String
    public let how: String
    public let lane: String?
    public let link: ProfilePageLinkDTO?
    /// Who wrote it (Known for, a review); on a link by what they did only.
    public let who: ProfilePageWhoDTO?
    public let when: String?

    enum CodingKeys: String, CodingKey {
        case ink, text, how, lane, link, who, when
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ink = (try? c.decode(String.self, forKey: .ink)) ?? "said"
        text = try c.decode(String.self, forKey: .text)
        how = (try? c.decode(String.self, forKey: .how)) ?? ""
        lane = try? c.decodeIfPresent(String.self, forKey: .lane)
        link = try? c.decodeIfPresent(ProfilePageLinkDTO.self, forKey: .link)
        who = try? c.decodeIfPresent(ProfilePageWhoDTO.self, forKey: .who)
        when = try? c.decodeIfPresent(String.self, forKey: .when)
    }
}

/// The other person on a line (§3.4): by name and portrait only where they allow it, otherwise by what they did.
public struct ProfilePageWhoDTO: Decodable, Sendable, Hashable {
    public let name: String?
    public let portraitURL: String?
    public let did: String?
    public let userId: String?
    public let username: String?

    enum CodingKeys: String, CodingKey {
        case name, did, username
        case portraitURL = "portrait_url"
        case userId = "user_id"
    }
}

/// What a tap opens (§3.3). An unknown kind reads as nil: the line is drawn without a tap.
public enum ProfilePageLinkDTO: Decodable, Sendable, Hashable {
    case tab(String)
    case record
    case month(String)
    case piece(id: String)
    case business(username: String)
    case profile(userId: String?, username: String?)
    case plan(id: String)
    case supportTrain(id: String)
    case gig(id: String)
    case posts(userId: String)
    case moments(userId: String)
    case url(URL, site: String?)

    enum CodingKeys: String, CodingKey {
        case kind, tab, month, id, username, url, site
        case userId = "user_id"
    }

    // One case a kind, as the contract lists them.
    // swiftlint:disable:next cyclomatic_complexity
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "tab": self = try .tab(c.decode(String.self, forKey: .tab))
        case "record": self = .record
        case "month": self = try .month(c.decode(String.self, forKey: .month))
        case "piece": self = try .piece(id: c.decode(String.self, forKey: .id))
        case "business": self = try .business(username: c.decode(String.self, forKey: .username))
        case "profile":
            self = .profile(
                userId: try? c.decodeIfPresent(String.self, forKey: .userId),
                username: try? c.decodeIfPresent(String.self, forKey: .username)
            )
        case "plan": self = try .plan(id: c.decode(String.self, forKey: .id))
        case "support_train": self = try .supportTrain(id: c.decode(String.self, forKey: .id))
        case "gig": self = try .gig(id: c.decode(String.self, forKey: .id))
        case "posts": self = try .posts(userId: c.decode(String.self, forKey: .userId))
        case "moments": self = try .moments(userId: c.decode(String.self, forKey: .userId))
        case "url":
            guard let url = try URL(string: c.decode(String.self, forKey: .url)), url.scheme == "https" || url.scheme == "http" else {
                throw DecodingError.dataCorruptedError(forKey: .url, in: c, debugDescription: "Not a web link")
            }
            self = .url(url, site: try? c.decodeIfPresent(String.self, forKey: .site))
        default: throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown link")
        }
    }
}

public struct ProfilePageMoreDTO: Decodable, Sendable, Hashable {
    public let text: String
    public let link: ProfilePageLinkDTO?

    enum CodingKeys: String, CodingKey {
        case text, link
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decode(String.self, forKey: .text)
        link = try? c.decodeIfPresent(ProfilePageLinkDTO.self, forKey: .link)
    }
}
