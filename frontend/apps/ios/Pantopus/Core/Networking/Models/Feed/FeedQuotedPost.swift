//
//  FeedQuotedPost.swift
//  Pantopus
//
//  `quoted_post` on any post object (feed, map cards, saved, profile,
//  reposts, `GET /api/posts/:id`): the post a "Repost with your words"
//  quotes (PULSEREPOST contract §8). `{ "available": true, "post": {…} }`
//  carries an ordinary feed post for this viewer, one level only;
//  `{ "available": false }` is a post this viewer can no longer read.
//

import Foundation

/// The post a quote post quotes, as this viewer may see it.
public indirect enum FeedQuotedPost: Decodable, Sendable, Hashable {
    /// The original, an ordinary feed row for this viewer (it never quotes another).
    case available(FeedPostDTO)
    /// Deleted, hidden by its author, removed, or not readable by this viewer: a quiet box, not a link.
    case unavailable

    private enum CodingKeys: String, CodingKey {
        case available, post
    }

    /// Tolerant (contract §9): a quote whose original can't be read here shows as unavailable rather than
    /// failing its row; a `quoted_post` of another shape reads as absent (the row's lenient decode).
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if c.lenient(Bool.self, forKey: .available) != false, let post = c.lenient(FeedPostDTO.self, forKey: .post) {
            self = .available(post)
        } else {
            self = .unavailable
        }
    }
}
