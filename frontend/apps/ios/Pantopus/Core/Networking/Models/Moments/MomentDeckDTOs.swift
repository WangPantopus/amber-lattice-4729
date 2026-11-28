//
//  MomentDeckDTOs.swift
//  Pantopus
//
//  A step deck ("Pulse, reinvented" phase 2; CONTRACT 7g): two to four photo or video Moments of one recipe or repair,
//  posted one by one as several picked together are, each with its own caption and its own voice tip. Only a reader
//  whose switch is on gets `deck` on a Moment; everyone else gets ordinary photo and video Moments.
//

import Foundation

/// What the Studio sends with each step: the deck's id (the same on every step), which step this is, and how many.
public struct MomentDeckBody: Encodable, Sendable, Hashable {
    public let id: String
    public let index: Int
    public let count: Int
}

/// A step's deck, as the Moment's answer carries it: the steps posted so far that this reader may see, in order.
public struct MomentDeckDTO: Decodable, Sendable, Hashable {
    public let id: String
    public let index: Int
    public let count: Int
    /// The steps' Moment ids, in step order (only those this reader may see).
    public let steps: [String]

    private enum CodingKeys: String, CodingKey {
        case id, index, count, steps
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        index = try c.decode(Int.self, forKey: .index)
        count = try c.decode(Int.self, forKey: .count)
        steps = (try? c.decodeIfPresent([String].self, forKey: .steps)) ?? []
    }
}

/// One deck saved in the reader's field guide ("Save the steps"): only words, each step's caption and its voice tip's.
struct SavedDeckDTO: Decodable, Identifiable, Hashable {
    struct Step: Decodable, Hashable {
        let index: Int
        let caption: String?
        let words: String?
    }

    let deckId: String?
    let firstMomentId: String
    let savedAt: String?
    let steps: [Step]
    /// The reader may open the deck now (or its author kept it).
    let open: Bool

    var id: String {
        firstMomentId
    }

    private enum CodingKeys: String, CodingKey {
        case steps, open
        case deckId = "deck_id"
        case firstMomentId = "first_moment_id"
        case savedAt = "saved_at"
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        deckId = try? c.decodeIfPresent(String.self, forKey: .deckId)
        firstMomentId = try c.decode(String.self, forKey: .firstMomentId)
        savedAt = try? c.decodeIfPresent(String.self, forKey: .savedAt)
        steps = ((try? c.decodeIfPresent(MomentLenientList<Step>.self, forKey: .steps))?.items ?? []).sorted { $0.index < $1.index }
        open = (try? c.decodeIfPresent(Bool.self, forKey: .open)) ?? false
    }
}
