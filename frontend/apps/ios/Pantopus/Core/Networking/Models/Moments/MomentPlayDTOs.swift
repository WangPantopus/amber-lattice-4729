//
//  MomentPlayDTOs.swift
//  Pantopus
//
//  Playable items on a Moment or a Studio post ("Pulse, reinvented" phase 2; CONTRACT 7b and 7g): a poll, a slider or
//  the spectrum dial, the board, the question box, guess and reveal, a countdown, a lifted quote, fog, a swatch and
//  before and after. Each sits on the picture as a stamp does (`x`, `y`, `scale`, `rotation`). The author sends them in
//  `POST /api/moments` as `play`; every Moment answer to a reader whose switch is on carries them back with what that
//  reader may see (`mine`, `results`, `open`). With the switch off the server sends no `play` key, and today's screens
//  show the plain picture and words.
//

import Foundation

/// One playable item, as the author placed it and as a reader reads it.
public struct MomentPlayItem: Codable, Sendable, Hashable, Identifiable {
    public enum Kind: String, Codable, Sendable {
        case poll, slider, board, question, guess, countdown, quote, fog, swatch
        case beforeAfter = "before_after"
        /// A kind this app doesn't know yet (a newer server): never drawn.
        case unknown
    }

    public struct Axis: Codable, Sendable, Hashable {
        public var left: String?
        public var right: String?
        public var bottom: String?
        public var top: String?
    }

    public struct Range: Codable, Sendable, Hashable {
        public var min: Double
        public var max: Double
        public var unit: String?
    }

    public struct Box: Codable, Sendable, Hashable {
        public var x: Double
        public var y: Double
        public var w: Double
        public var h: Double
    }

    /// The reader's own answer, in the shape the kind's `PUT` takes; a guess adds whether it was right or how far off.
    public struct Mine: Codable, Sendable, Hashable {
        public var choice: Int?
        public var value: Double?
        public var x: Double?
        public var y: Double?
        public var note: String?
        public var text: String?
        public var right: Bool?
        public var offBy: Double?

        enum CodingKeys: String, CodingKey {
            case choice, value, x, y, note, text, right
            case offBy = "off_by"
        }
    }

    /// Someone on a board or along the dial: `person` only for the reader and their connections.
    public struct Face: Decodable, Sendable, Hashable {
        public let x: Double
        public let y: Double?
        public let note: String?
        public let mine: Bool
        public let person: MomentPlayPerson?
    }

    /// What this reader may see of everyone's answers (CONTRACT 7b, by kind).
    public struct Results: Decodable, Sendable, Hashable {
        public let counts: [Int]?
        public let total: Int?
        public let average: Double?
        public let count: Int?
        public let faces: [Face]?
    }

    public var id: String
    public var kind: Kind
    public var x: Double
    public var y: Double
    public var scale: Double
    public var rotation: Double
    public var question: String?
    public var options: [String]?
    public var left: String?
    public var right: String?
    /// A slider's look: `slider` or `dial`.
    public var look: String?
    public var emoji: String?
    public var xAxis: Axis?
    public var yAxis: Axis?
    public var prompt: String?
    public var range: Range?
    /// A guess's right answer: there only for its author and after the reader's try.
    public var answer: Double?
    public var title: String?
    public var endsAt: String?
    public var text: String?
    public var source: String?
    public var colors: [String]?
    public var box: Box?
    public var before: String?
    public var after: String?
    /// Read only: whether answers are taken now (never for the author), the reader's answer, and the results.
    public var open = false
    public var mine: Mine?
    public var results: Results?

    public init(id: String, kind: Kind, x: Double = 0.5, y: Double = 0.5, scale: Double = 1, rotation: Double = 0) {
        self.id = id
        self.kind = kind
        self.x = x
        self.y = y
        self.scale = scale
        self.rotation = rotation
    }

    enum CodingKeys: String, CodingKey {
        case id, kind, x, y, scale, rotation, question, options, left, right, look, emoji, prompt, range, answer, title
        case text, source, colors, box, before, after, open, mine, results
        case xAxis = "x_axis"
        case yAxis = "y_axis"
        case endsAt = "ends_at"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = (try? c.decode(String.self, forKey: .kind)).flatMap(Kind.init(rawValue:)) ?? .unknown
        x = (try? c.decodeIfPresent(Double.self, forKey: .x)) ?? 0.5
        y = (try? c.decodeIfPresent(Double.self, forKey: .y)) ?? 0.5
        scale = (try? c.decodeIfPresent(Double.self, forKey: .scale)) ?? 1
        rotation = (try? c.decodeIfPresent(Double.self, forKey: .rotation)) ?? 0
        question = try? c.decodeIfPresent(String.self, forKey: .question)
        options = try? c.decodeIfPresent([String].self, forKey: .options)
        left = try? c.decodeIfPresent(String.self, forKey: .left)
        right = try? c.decodeIfPresent(String.self, forKey: .right)
        look = try? c.decodeIfPresent(String.self, forKey: .look)
        emoji = try? c.decodeIfPresent(String.self, forKey: .emoji)
        xAxis = try? c.decodeIfPresent(Axis.self, forKey: .xAxis)
        yAxis = try? c.decodeIfPresent(Axis.self, forKey: .yAxis)
        prompt = try? c.decodeIfPresent(String.self, forKey: .prompt)
        range = try? c.decodeIfPresent(Range.self, forKey: .range)
        answer = try? c.decodeIfPresent(Double.self, forKey: .answer)
        title = try? c.decodeIfPresent(String.self, forKey: .title)
        endsAt = try? c.decodeIfPresent(String.self, forKey: .endsAt)
        text = try? c.decodeIfPresent(String.self, forKey: .text)
        source = try? c.decodeIfPresent(String.self, forKey: .source)
        colors = try? c.decodeIfPresent([String].self, forKey: .colors)
        box = try? c.decodeIfPresent(Box.self, forKey: .box)
        before = try? c.decodeIfPresent(String.self, forKey: .before)
        after = try? c.decodeIfPresent(String.self, forKey: .after)
        open = (try? c.decodeIfPresent(Bool.self, forKey: .open)) ?? false
        mine = try? c.decodeIfPresent(Mine.self, forKey: .mine)
        results = try? c.decodeIfPresent(Results.self, forKey: .results)
    }

    /// What the author sends: the placement and the kind's own words; never what a reader reads back.
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(kind.rawValue, forKey: .kind)
        try c.encode(x, forKey: .x)
        try c.encode(y, forKey: .y)
        try c.encode(scale, forKey: .scale)
        try c.encode(rotation, forKey: .rotation)
        try c.encodeIfPresent(question, forKey: .question)
        try c.encodeIfPresent(options, forKey: .options)
        try c.encodeIfPresent(left, forKey: .left)
        try c.encodeIfPresent(right, forKey: .right)
        try c.encodeIfPresent(look, forKey: .look)
        try c.encodeIfPresent(emoji, forKey: .emoji)
        try c.encodeIfPresent(xAxis, forKey: .xAxis)
        try c.encodeIfPresent(yAxis, forKey: .yAxis)
        try c.encodeIfPresent(prompt, forKey: .prompt)
        try c.encodeIfPresent(range, forKey: .range)
        try c.encodeIfPresent(answer, forKey: .answer)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encodeIfPresent(endsAt, forKey: .endsAt)
        try c.encodeIfPresent(text, forKey: .text)
        try c.encodeIfPresent(source, forKey: .source)
        try c.encodeIfPresent(colors, forKey: .colors)
        try c.encodeIfPresent(box, forKey: .box)
        try c.encodeIfPresent(before, forKey: .before)
        try c.encodeIfPresent(after, forKey: .after)
    }
}

/// A person on a board, along the dial, or in the author's list of answers.
public struct MomentPlayPerson: Decodable, Sendable, Hashable {
    public let id: String
    public let name: String?
    public let firstName: String?
    public let avatarURL: String?
    public let initials: String?

    enum CodingKeys: String, CodingKey {
        case id, name, initials
        case firstName = "first_name"
        case avatarURL = "avatar_url"
    }
}

/// A list read leniently: an item this app can't read is left out, never the whole Moment.
struct MomentLenientList<Item: Decodable>: Decodable {
    let items: [Item]

    init(from decoder: any Decoder) throws {
        var c = try decoder.unkeyedContainer()
        var read: [Item] = []
        while !c.isAtEnd {
            if let item = try? c.decode(Item.self) {
                read.append(item)
            } else if (try? c.decode(MomentStampSkip.self)) == nil {
                // Not even an object to step past: what was read so far stands.
                break
            }
        }
        items = read
    }
}

/// What "Pulse, reinvented" phase 2 lays over a Moment's picture, read from the Moment's own answer (only a reader whose
/// switch is on gets these keys; everyone else gets none of them).
public struct MomentLayersDTO: Sendable, Hashable {
    /// The playable items (CONTRACT 7b, 7g), `[]` when none.
    public let play: [MomentPlayItem]
    /// The people mentioned in the caption (CONTRACT 7h), in the order sent, as this reader may see them; `[]` when none.
    public let mentions: [MomentAuthorDTO]

    private enum CodingKeys: String, CodingKey {
        case play, mentions
    }

    init(from decoder: any Decoder) {
        let c = try? decoder.container(keyedBy: CodingKeys.self)
        play = (try? c?.decodeIfPresent(MomentLenientList<MomentPlayItem>.self, forKey: .play))?.items.filter { $0.kind != .unknown } ?? []
        mentions = (try? c?.decodeIfPresent(MomentLenientList<MomentAuthorDTO>.self, forKey: .mentions))?.items ?? []
    }

    /// The before and after on a photo, if it has one (one at most).
    public var beforeAfter: MomentPlayItem? {
        play.first { $0.kind == .beforeAfter }
    }
}
