//
//  MomentTogetherDTOs.swift
//  Pantopus
//
//  What "Pulse, reinvented" phase 3 ("together and back outside", CONTRACT 8) adds to a Moment answer, and the answers
//  of its own requests. Every field comes only while `pulse_reinvented` is on for the caller; with it off, or from an
//  older server, each reads as "not there" and nothing of phase 3 is drawn.
//

import Foundation

/// Phase 3's parts of one Moment answer, read without throwing.
public struct MomentTogetherDTO: Sendable, Hashable {
    /// Replies people can see (CONTRACT 8a): nil with the switch off.
    public let replies: MomentRepliesDTO?
    /// Posted under a made-up name (`author.kind` "pen_name", which `MomentAuthorDTO` reads as a person): such a Moment
    /// takes no replies people can see, no pins and no sound.
    public let underPenName: Bool
    /// The Retake this Moment starts or is a frame of (CONTRACT 8e): nil with the switch off.
    let retake: MomentRetakeDTO?
    /// A relic's seal (CONTRACT 8g): nil with the switch off or when not sealed.
    let seal: MomentSealDTO?
    /// The sky piece this Moment joined (CONTRACT 8h): nil with the switch off or when it joined none.
    let convergence: MomentConvergenceDTO?
    /// The pinboard this Moment starts or is a piece of (CONTRACT 8i): nil with the switch off or when none.
    let pinboard: MomentPinboardDTO?

    init(from decoder: any Decoder) {
        let c = try? decoder.container(keyedBy: Keys.self)
        replies = try? c?.decodeIfPresent(MomentRepliesDTO.self, forKey: .replies)
        let author = try? c?.nestedContainer(keyedBy: AuthorKeys.self, forKey: .author)
        underPenName = (try? author?.decodeIfPresent(String.self, forKey: .kind)) == "pen_name"
        retake = try? c?.decodeIfPresent(MomentRetakeDTO.self, forKey: .retake)
        seal = try? c?.decodeIfPresent(MomentSealDTO.self, forKey: .seal)
        convergence = try? c?.decodeIfPresent(MomentConvergenceDTO.self, forKey: .convergence)
        pinboard = try? c?.decodeIfPresent(MomentPinboardDTO.self, forKey: .pinboard)
    }

    private enum Keys: String, CodingKey {
        case replies, author, retake, seal, convergence, pinboard
    }

    private enum AuthorKeys: String, CodingKey {
        case kind
    }
}

/// `replies` on a Moment answer (CONTRACT 8a): whether replies show under it, how many this reader may see (pins
/// included), and whether they may add one.
public struct MomentRepliesDTO: Decodable, Sendable, Hashable {
    public let shown: Bool
    public let count: Int
    public let pins: Int
    public let canReply: Bool

    private enum CodingKeys: String, CodingKey {
        case shown, count, pins
        case canReply = "can_reply"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        shown = try c.decode(Bool.self, forKey: .shown)
        count = (try? c.decodeIfPresent(Int.self, forKey: .count)) ?? 0
        pins = (try? c.decodeIfPresent(Int.self, forKey: .pins)) ?? 0
        canReply = (try? c.decodeIfPresent(Bool.self, forKey: .canReply)) ?? false
    }
}

/// One reply under a Moment, as everyone who sees it reads it.
public struct MomentReplyDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let text: String
    public let at: String
    /// As a Moment's author; nil for an account that is gone.
    public let author: MomentAuthorDTO?
    public let mine: Bool
    public let canRemove: Bool

    private enum CodingKeys: String, CodingKey {
        case id, text, at, author, mine
        case canRemove = "can_remove"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        at = try c.decodeIfPresent(String.self, forKey: .at) ?? ""
        author = try? c.decodeIfPresent(MomentAuthorDTO.self, forKey: .author)
        mine = (try? c.decodeIfPresent(Bool.self, forKey: .mine)) ?? false
        canRemove = (try? c.decodeIfPresent(Bool.self, forKey: .canRemove)) ?? false
    }
}

/// `GET /api/reinvented/moments/:id/replies`: a page, oldest first.
struct MomentRepliesPageDTO: Decodable {
    let replies: [MomentReplyDTO]
    let nextCursor: String?

    private enum CodingKeys: String, CodingKey {
        case replies
        case nextCursor = "next_cursor"
    }
}

/// `POST /api/reinvented/moments/:id/replies`: the reply just added.
struct MomentReplyCreatedDTO: Decodable {
    let reply: MomentReplyDTO
}

struct MomentReplyBody: Encodable {
    let text: String
}

struct MomentRepliesShownBody: Encodable {
    let shown: Bool
}

struct MomentReplyReportBody: Encodable {
    let reason: String
}
