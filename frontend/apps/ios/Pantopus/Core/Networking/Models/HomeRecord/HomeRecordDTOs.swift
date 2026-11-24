//
//  HomeRecordDTOs.swift
//  Pantopus
//
//  The home record page, contract v1: the server draws the page as a list of
//  blocks and the app draws each block it knows. A block kind the app does not
//  know, or a block that does not read, is kept as `.unknown` and skipped, so a
//  later piece reaches the store's app with a server release. Every string is
//  the server's final words; the app never builds a sentence from them.
//

// swiftlint:disable file_length

import Foundation

/// `GET /api/public/home-record` and `GET /api/homes/:id/record`.
public struct HomeRecord: Decodable, Sendable, Hashable {
    public let version: Int
    public let state: HomeRecordState
    public let header: HomeRecordHeader
    /// A buyer's actions (save, share, claim), drawn as a row under the header.
    /// An id this app does not know is dropped.
    public let actions: [HomeRecordAction]
    public let blocks: [HomeRecordBlock]
    public let footer: String?

    private enum CodingKeys: String, CodingKey {
        case version = "v"
        case state, header, actions, blocks, footer
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
        state = try container.decodeIfPresent(HomeRecordState.self, forKey: .state) ?? .lookup
        header = try container.decode(HomeRecordHeader.self, forKey: .header)
        let actions = (try? container.decodeIfPresent([LossyAction].self, forKey: .actions)) ?? []
        self.actions = actions.compactMap(\.action)
        blocks = try container.decodeIfPresent([HomeRecordBlock].self, forKey: .blocks) ?? []
        footer = try container.decodeIfPresent(String.self, forKey: .footer)
    }

    /// The blocks the app draws, in the server's order.
    public var drawnBlocks: [HomeRecordBlock] {
        blocks.filter { !$0.isUnknown }
    }
}

/// One action of a buyer's row, or nothing when it does not read.
private struct LossyAction: Decodable {
    let action: HomeRecordAction?

    init(from decoder: Decoder) throws {
        action = try? HomeRecordAction(from: decoder)
    }
}

/// Who is looking: anyone signed out (`lookup`), a signed-in person who is not
/// of this Home (`buyer`, the public half opened), a person of the Home who is
/// not its confirmed owner (`member`), or the confirmed owner (`owner`).
public enum HomeRecordState: String, Sendable, Hashable {
    case lookup, buyer, member, owner
}

/// `save` this home, `share` this record, `claim` it ("Buying this home?").
public struct HomeRecordAction: Decodable, Sendable, Hashable {
    public enum Kind: String, Decodable, Sendable, Hashable {
        case save, share, claim
    }

    public let kind: Kind
    public let label: String
    public let url: String

    private enum CodingKeys: String, CodingKey {
        case kind = "id"
        case label, url
    }
}

extension HomeRecordState: Decodable {
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        // A state this app does not know draws as the closed page.
        self = HomeRecordState(rawValue: raw) ?? .lookup
    }
}

public enum HomeRecordTone: String, Sendable, Hashable {
    case success, warning, neutral
}

extension HomeRecordTone: Decodable {
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = HomeRecordTone(rawValue: raw) ?? .neutral
    }
}

/// `low`, `mid` or `high`, for a meter or a service-life bar.
public enum HomeRecordLevelTone: String, Sendable, Hashable {
    case low, mid, high
}

extension HomeRecordLevelTone: Decodable {
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = HomeRecordLevelTone(rawValue: raw) ?? .low
    }
}

public struct HomeRecordChip: Decodable, Sendable, Hashable {
    public let tone: HomeRecordTone
    public let text: String

    private enum CodingKeys: String, CodingKey { case tone, text }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        tone = try container.decodeIfPresent(HomeRecordTone.self, forKey: .tone) ?? .neutral
        text = try container.decode(String.self, forKey: .text)
    }
}

/// A button or a link: an https page, or an app link starting with `/`.
public struct HomeRecordLink: Decodable, Sendable, Hashable {
    public let label: String
    public let url: String
}

public struct HomeRecordHeader: Decodable, Sendable, Hashable {
    public let chip: HomeRecordChip?
    public let title: String
    public let subtitle: String?
}

// MARK: - Blocks

public enum HomeRecordBlock: Decodable, Sendable, Hashable, Identifiable {
    case picture(id: String, HomeRecordPicture)
    case facts(id: String, HomeRecordFacts)
    case meters(id: String, HomeRecordMeters)
    case intro(id: String, HomeRecordIntro)
    case closedGroup(id: String, HomeRecordClosedGroup)
    case promise(id: String, HomeRecordPromise)
    case note(id: String, HomeRecordNote)
    case sectionLabel(id: String, text: String)
    case value(id: String, HomeRecordValue)
    case photoYears(id: String, HomeRecordPhotoYears)
    case timeline(id: String, HomeRecordTimeline)
    case notice(id: String, HomeRecordNotice)
    case rows(id: String, HomeRecordRows)
    case tiles(id: String, HomeRecordTiles)
    case bars(id: String, HomeRecordBars)
    case card(id: String, HomeRecordCard)
    /// A kind this app does not draw, or one that did not read. Skipped.
    case unknown(id: String, kind: String)

    private enum CodingKeys: String, CodingKey { case kind, id, text }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = (try? container.decode(String.self, forKey: .kind)) ?? ""
        let id = (try? container.decode(String.self, forKey: .id)) ?? kind
        // One block that doesn't read never costs the person the rest of the page.
        self = (try? Self.decode(kind: kind, id: id, from: decoder, container: container)) ?? .unknown(id: id, kind: kind)
    }

    // swiftlint:disable:next cyclomatic_complexity
    private static func decode(
        kind: String,
        id: String,
        from decoder: Decoder,
        container: KeyedDecodingContainer<CodingKeys>
    ) throws -> HomeRecordBlock {
        switch kind {
        case "picture": try .picture(id: id, HomeRecordPicture(from: decoder))
        case "facts": try .facts(id: id, HomeRecordFacts(from: decoder))
        case "meters": try .meters(id: id, HomeRecordMeters(from: decoder))
        case "intro": try .intro(id: id, HomeRecordIntro(from: decoder))
        case "closed_group": try .closedGroup(id: id, HomeRecordClosedGroup(from: decoder))
        case "promise": try .promise(id: id, HomeRecordPromise(from: decoder))
        case "note": try .note(id: id, HomeRecordNote(from: decoder))
        case "section_label": try .sectionLabel(id: id, text: container.decode(String.self, forKey: .text))
        case "value": try .value(id: id, HomeRecordValue(from: decoder))
        case "photo_years": try .photoYears(id: id, HomeRecordPhotoYears(from: decoder))
        case "timeline": try .timeline(id: id, HomeRecordTimeline(from: decoder))
        case "notice": try .notice(id: id, HomeRecordNotice(from: decoder))
        case "rows": try .rows(id: id, HomeRecordRows(from: decoder))
        case "tiles": try .tiles(id: id, HomeRecordTiles(from: decoder))
        case "bars": try .bars(id: id, HomeRecordBars(from: decoder))
        case "card": try .card(id: id, HomeRecordCard(from: decoder))
        default: .unknown(id: id, kind: kind)
        }
    }

    public var id: String {
        switch self {
        case let .picture(id, _), let .facts(id, _), let .meters(id, _), let .intro(id, _),
             let .closedGroup(id, _), let .promise(id, _), let .note(id, _), let .sectionLabel(id, _),
             let .value(id, _), let .photoYears(id, _), let .timeline(id, _), let .notice(id, _),
             let .rows(id, _), let .tiles(id, _), let .bars(id, _), let .card(id, _), let .unknown(id, _):
            id
        }
    }

    public var isUnknown: Bool {
        if case .unknown = self { return true }
        return false
    }
}

/// A point on an image, as fractions of its width and height.
public struct HomeRecordPoint: Decodable, Sendable, Hashable {
    public let x: Double
    public let y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }

    public init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        x = try container.decode(Double.self)
        y = try container.decode(Double.self)
    }
}

public struct HomeRecordPicture: Decodable, Sendable, Hashable {
    public struct Above: Decodable, Sendable, Hashable {
        public struct Chip: Decodable, Sendable, Hashable {
            /// `bl` (bottom left) or `br` (bottom right).
            public let at: String
            public let text: String
        }

        public let imageURL: String
        public let outline: [HomeRecordPoint]?
        public let chips: [Chip]

        private enum CodingKeys: String, CodingKey {
            case imageURL = "image_url"
            case outline, chips
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            imageURL = try container.decode(String.self, forKey: .imageURL)
            outline = try? container.decodeIfPresent([HomeRecordPoint].self, forKey: .outline)
            chips = (try? container.decodeIfPresent([Chip].self, forKey: .chips)) ?? []
        }
    }

    public struct Street: Decodable, Sendable, Hashable {
        public let lat: Double
        public let lng: Double
    }

    public let above: Above?
    public let street: Street?
    public let caption: String?

    private enum CodingKeys: String, CodingKey { case above, street, caption }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        above = try? container.decodeIfPresent(Above.self, forKey: .above)
        street = try? container.decodeIfPresent(Street.self, forKey: .street)
        caption = try container.decodeIfPresent(String.self, forKey: .caption)
    }
}

public struct HomeRecordFacts: Decodable, Sendable, Hashable {
    public struct Tile: Decodable, Sendable, Hashable {
        public let label: String
        public let value: String
        public let unit: String?
    }

    public let tiles: [Tile]
    public let line: String?
    public let source: String?

    private enum CodingKeys: String, CodingKey { case tiles, line, source }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        tiles = try container.decodeIfPresent([Tile].self, forKey: .tiles) ?? []
        line = try container.decodeIfPresent(String.self, forKey: .line)
        source = try container.decodeIfPresent(String.self, forKey: .source)
    }
}

public struct HomeRecordMeters: Decodable, Sendable, Hashable {
    public struct Row: Decodable, Sendable, Hashable {
        public let label: String
        /// 1 to 5.
        public let level: Int
        public let tone: HomeRecordLevelTone
        public let word: String
    }

    public struct Group: Decodable, Sendable, Hashable {
        public let title: String?
        public let rows: [Row]
    }

    public let title: String?
    public let groups: [Group]
    public let note: String?
}

public struct HomeRecordIntro: Decodable, Sendable, Hashable {
    public let title: String
    public let body: String?
}

public struct HomeRecordClosedGroup: Decodable, Sendable, Hashable {
    public struct Item: Decodable, Sendable, Hashable {
        public let icon: String?
        public let title: String
        public let line: String?
    }

    public let title: String
    public let chip: String?
    public let items: [Item]
}

public struct HomeRecordPromise: Decodable, Sendable, Hashable {
    public struct Step: Decodable, Sendable, Hashable {
        public let title: String
        public let line: String?
    }

    public struct Alt: Decodable, Sendable, Hashable {
        public let lead: String?
        public let label: String
        public let url: String
    }

    public let title: String
    public let body: String?
    public let steps: [Step]
    public let button: HomeRecordLink?
    public let alt: Alt?

    private enum CodingKeys: String, CodingKey { case title, body, steps, button, alt }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try container.decode(String.self, forKey: .title)
        body = try container.decodeIfPresent(String.self, forKey: .body)
        steps = try container.decodeIfPresent([Step].self, forKey: .steps) ?? []
        button = try container.decodeIfPresent(HomeRecordLink.self, forKey: .button)
        alt = try container.decodeIfPresent(Alt.self, forKey: .alt)
    }
}

public struct HomeRecordNote: Decodable, Sendable, Hashable {
    public let icon: String?
    public let text: String
}

public struct HomeRecordValue: Decodable, Sendable, Hashable {
    public struct Bar: Decodable, Sendable, Hashable {
        public let year: String
        public let amount: Double
    }

    public struct Estimate: Decodable, Sendable, Hashable {
        public let label: String
        public let text: String
        /// 0 to 1 along the track.
        public let low: Double
        public let high: Double
        public let mark: Double?
        public let note: String?
    }

    public let label: String
    public let value: String
    public let chip: HomeRecordChip?
    public let bars: [Bar]
    public let source: String?
    public let estimate: Estimate?

    private enum CodingKeys: String, CodingKey { case label, value, chip, bars, source, estimate }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        label = try container.decode(String.self, forKey: .label)
        value = try container.decode(String.self, forKey: .value)
        chip = try container.decodeIfPresent(HomeRecordChip.self, forKey: .chip)
        bars = (try? container.decodeIfPresent([Bar].self, forKey: .bars)) ?? []
        source = try container.decodeIfPresent(String.self, forKey: .source)
        estimate = try? container.decodeIfPresent(Estimate.self, forKey: .estimate)
    }
}

public struct HomeRecordPhotoYears: Decodable, Sendable, Hashable {
    public struct Photo: Decodable, Sendable, Hashable {
        public let year: String
        public let label: String?
        public let imageURL: String
        public let outline: [HomeRecordPoint]?

        private enum CodingKeys: String, CodingKey {
            case year, label, outline
            case imageURL = "image_url"
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            year = try container.decode(String.self, forKey: .year)
            label = try container.decodeIfPresent(String.self, forKey: .label)
            imageURL = try container.decode(String.self, forKey: .imageURL)
            outline = try? container.decodeIfPresent([HomeRecordPoint].self, forKey: .outline)
        }
    }

    public let title: String
    public let count: String?
    /// Newest last.
    public let photos: [Photo]
    public let note: String?
}

public struct HomeRecordTimeline: Decodable, Sendable, Hashable {
    public struct Item: Decodable, Sendable, Hashable {
        public let title: String
        public let right: String?
        public let strong: Bool
        public let line: String?
        public let mono: String?

        private enum CodingKeys: String, CodingKey { case title, right, strong, line, mono }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            title = try container.decode(String.self, forKey: .title)
            right = try container.decodeIfPresent(String.self, forKey: .right)
            strong = try container.decodeIfPresent(Bool.self, forKey: .strong) ?? false
            line = try container.decodeIfPresent(String.self, forKey: .line)
            mono = try container.decodeIfPresent(String.self, forKey: .mono)
        }
    }

    public let title: String?
    public let items: [Item]
    public let note: String?
}

public struct HomeRecordNotice: Decodable, Sendable, Hashable {
    public let eyebrow: String?
    public let title: String
    public let line: String?
}

public struct HomeRecordRows: Decodable, Sendable, Hashable {
    public struct Row: Decodable, Sendable, Hashable {
        public let label: String
        public let value: String?
        public let mono: Bool
        public let chip: HomeRecordChip?

        private enum CodingKeys: String, CodingKey { case label, value, mono, chip }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            label = try container.decode(String.self, forKey: .label)
            value = try container.decodeIfPresent(String.self, forKey: .value)
            mono = try container.decodeIfPresent(Bool.self, forKey: .mono) ?? false
            chip = try container.decodeIfPresent(HomeRecordChip.self, forKey: .chip)
        }
    }

    public let title: String?
    public let lead: String?
    public let rows: [Row]
    public let note: String?
    public let action: HomeRecordLink?
}

public struct HomeRecordTiles: Decodable, Sendable, Hashable {
    public struct Tile: Decodable, Sendable, Hashable {
        public let label: String
        public let value: String
        public let line: String?
    }

    public struct Row: Decodable, Sendable, Hashable {
        public let label: String
        public let value: String
    }

    public let title: String?
    public let tiles: [Tile]
    public let rows: [Row]
    public let note: String?

    private enum CodingKeys: String, CodingKey { case title, tiles, rows, note }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        tiles = try container.decodeIfPresent([Tile].self, forKey: .tiles) ?? []
        rows = try container.decodeIfPresent([Row].self, forKey: .rows) ?? []
        note = try container.decodeIfPresent(String.self, forKey: .note)
    }
}

public struct HomeRecordBars: Decodable, Sendable, Hashable {
    public struct Item: Decodable, Sendable, Hashable {
        public let title: String
        public let right: String?
        public let tone: HomeRecordLevelTone
        /// 0 to 1.
        public let fill: Double
        public let line: String?
    }

    public let title: String?
    public let items: [Item]
    public let note: String?
}

/// The money card shape Place already draws (`serializeMoneyCard`).
public struct HomeRecordCard: Decodable, Sendable, Hashable {
    public struct Row: Decodable, Sendable, Hashable {
        public let label: String
        public let value: String
    }

    public let title: String
    public let chip: HomeRecordChip?
    public let lead: String?
    public let rows: [Row]
    public let notes: [String]
    public let source: String?
    public let action: HomeRecordLink?

    private enum CodingKeys: String, CodingKey { case title, chip, lead, rows, notes, source, action }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try container.decode(String.self, forKey: .title)
        chip = try container.decodeIfPresent(HomeRecordChip.self, forKey: .chip)
        lead = try container.decodeIfPresent(String.self, forKey: .lead)
        rows = try container.decodeIfPresent([Row].self, forKey: .rows) ?? []
        notes = try container.decodeIfPresent([String].self, forKey: .notes) ?? []
        source = try container.decodeIfPresent(String.self, forKey: .source)
        action = try container.decodeIfPresent(HomeRecordLink.self, forKey: .action)
    }
}
