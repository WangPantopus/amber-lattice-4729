//
//  AroundYouDTOs.swift
//  Pantopus
//
//  Today's second half, "Around you": local headlines for the place Today
//  shows. Each item is an outlet's own headline, the outlet's name and a link
//  to the story at the outlet (`backend/services/aroundYouService.js`), and
//  each is also a post by the Pantopus curator account, sent in the feed's
//  shape so Today draws it with the Pulse card. Since November 24, 2026 the
//  page also says which lists the place has (`lists`: All, Talked about, a
//  topic), and each list is read a page at a time for as long as there are
//  stories (`AroundYouListPageDTO`, `backend/services/aroundYou/lists.js`).
//

import Foundation

/// The Around you page. `available` false: Today shows no switch (the
/// feature is off, or the area has nothing to show).
public struct AroundYouDTO: Decodable, Sendable, Hashable {
    public let available: Bool
    /// The content region's name ("Clark County, WA").
    public let area: String?
    public let sections: [AroundYouSectionDTO]
    /// The chips to offer over the page, "all" first; a topic is listed only where the place has stories for it.
    /// Empty from a server before the lists (and when the posts could not be made): no chips show then.
    public let lists: [AroundYouListDTO]

    enum CodingKeys: String, CodingKey {
        case available, area, sections, lists
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        available = try c.decode(Bool.self, forKey: .available)
        area = try c.decodeIfPresent(String.self, forKey: .area)
        sections = try c.decode([AroundYouSectionDTO].self, forKey: .sections)
        // A list the app can't read leaves only that chip out.
        lists = c.lossyList(AroundYouListDTO.self, forKey: .lists)
    }

    /// The server sent the items as posts (one from before the posts sends only the rows).
    public var hasPosts: Bool {
        sections.contains { $0.posts != nil }
    }

    /// Every section's posts, in page order.
    public var posts: [FeedPostDTO] {
        sections.flatMap { $0.posts ?? [] }
    }
}

/// One of Around you's lists, offered as a chip: "all", "talked" (what people replied or reacted to) or a topic
/// ("events", "kids", "sports", "government", "business", "safety"). The server names it.
public struct AroundYouListDTO: Decodable, Sendable, Hashable, Identifiable {
    /// The list every page opens on: its sections, then every earlier story.
    public static let all = "all"
    /// What people replied or reacted to.
    public static let talked = "talked"
    /// What is coming, soonest first.
    public static let events = "events"

    public let id: String
    public let title: String
}

/// One page of a list behind the first page: under "all" every earlier story that is not on the first page, under
/// a topic its stories, newest first (Events: what is coming, soonest first). `next` goes back as `before` for the
/// page after; nil at the list's end.
public struct AroundYouListPageDTO: Decodable, Sendable, Hashable {
    public let posts: [FeedPostDTO]
    public let next: String?

    enum CodingKeys: String, CodingKey {
        case posts, next
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // One post the app can't read leaves only that post out.
        posts = c.lossyList(FeedPostDTO.self, forKey: .posts)
        next = c.lenient(String.self, forKey: .next)
    }
}

/// Which list to read and where it continues, in the body of the area's read (its point never goes in a URL).
public struct AreaAroundListBody: Encodable, Sendable, Hashable {
    public let latitude: Decimal
    public let longitude: Decimal
    public let list: String
    public let before: String?

    public init(area: AreaTodayBody, list: String, before: String?) {
        latitude = area.latitude
        longitude = area.longitude
        self.list = list
        self.before = before
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
