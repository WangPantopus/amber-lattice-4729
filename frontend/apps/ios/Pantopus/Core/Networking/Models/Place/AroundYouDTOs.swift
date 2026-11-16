//
//  AroundYouDTOs.swift
//  Pantopus
//
//  Today's second half, "Around you": local headlines for the place Today
//  shows. Each item is an outlet's own headline, the outlet's name and a link
//  to the story at the outlet (`backend/services/aroundYouService.js`), and
//  each is also a post by the Pantopus curator account, sent in the feed's
//  shape so Today draws it with the Pulse card.
//

import Foundation

/// The Around you page. `available` false: Today shows no switch (the
/// feature is off, or the area has nothing to show).
public struct AroundYouDTO: Decodable, Sendable, Hashable {
    public let available: Bool
    /// The content region's name ("Clark County, WA").
    public let area: String?
    public let sections: [AroundYouSectionDTO]

    /// The server sent the items as posts (one from before the posts sends only the rows).
    public var hasPosts: Bool {
        sections.contains { $0.posts != nil }
    }

    /// Every section's posts, in page order.
    public var posts: [FeedPostDTO] {
        sections.flatMap { $0.posts ?? [] }
    }
}

public struct AroundYouSectionDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let items: [AroundYouItemDTO]
    /// The same items as posts, in the feed's shape and order; nil when the
    /// server could not make or read them (the rows show then).
    public let posts: [FeedPostDTO]?

    enum CodingKeys: String, CodingKey {
        case id, title, items, posts
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        items = try c.decode([AroundYouItemDTO].self, forKey: .items)
        // One post the app can't read leaves only that post out.
        posts = c.contains(.posts) ? c.lossyList(FeedPostDTO.self, forKey: .posts) : nil
    }
}

public struct AroundYouItemDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    /// Who published it ("The Columbian").
    public let source: String?
    /// The story at its outlet; nil for a tip that is its own text.
    public let url: String?
    /// When Pantopus first saw it (ISO 8601).
    public let seenAt: String
    /// The item's post; nil from a server before the posts.
    public let postId: String?

    enum CodingKeys: String, CodingKey {
        case id, title, source, url
        case seenAt = "seen_at"
        case postId = "post_id"
    }
}
