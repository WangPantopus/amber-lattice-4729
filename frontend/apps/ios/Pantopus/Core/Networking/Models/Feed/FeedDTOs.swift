//
//  FeedDTOs.swift
//  Pantopus
//
//  DTOs for `GET /api/posts/feed` — route `backend/routes/posts.js:1449`.
//  Drives the Pulse tab and (later) the Gigs feed surface.
//

import Foundation

/// One row in `/api/posts/feed`. The backend serializer projects every
/// `Post` column the feed needs; this DTO keeps the fields the Pulse UI
/// actually reads.
public struct FeedPostDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    /// Null for cold-start seeded neighborhood facts (`is_seeded`).
    public let userId: String?
    public let title: String?
    public let content: String
    public let postType: String?
    public let visibility: String?
    public let audience: String?
    public let readScope: String?
    public let allowExternalShare: Bool?
    public let moderationState: String?

    public var canShareExternally: Bool {
        guard !isSeeded, allowExternalShare != false,
              moderationState == nil || moderationState == "live" else { return false }
        if let readScope { return readScope == "public" }
        return visibility == "public" || audience == "public"
    }

    public let createdAt: String
    public let likeCount: Int
    public let commentCount: Int
    public let shareCount: Int
    public let userHasLiked: Bool
    /// Each emoji's count, most used first (`PostReactions`); empty before anyone reacted and from older servers.
    public let reactions: [PostReactionCount]
    /// The viewer's own emoji; nil before they react and from older servers.
    public let userReaction: PostReactionEmoji?
    public let userHasSaved: Bool
    public let userHasReposted: Bool
    /// Who reposted the post: the viewer ("You") and their connections; on Connections, Nearby, profile and
    /// Reposts rows (PULSEREPOST contract §1). Nil when nobody the viewer knows reposted it, and from older servers.
    public let repostedBy: FeedRepostedBy?
    /// When this row's person reposted it (ISO 8601): profile rows and the Reposts list (contract §3, §4).
    public let repostedAt: String?
    /// The post this one quotes ("Repost with your words", contract §8); nil for an ordinary post.
    public let quotedPost: FeedQuotedPost?
    /// Lifecycle state — `open` / `solved` (`feedService.js:234`).
    public let state: String?
    /// Server-derived authorship: `user`, `curator` or `system`.
    public let origin: String?
    /// One of the twelve Pulse topics, or null (`feedService.js:246`).
    public let topic: String?
    /// How the post ended (Pulse S7, contract §1): `answered`, `closed`,
    /// `closed_unanswered`, `claimed`, `expired`, `happened`, `reunited`;
    /// nil while open, and from servers before S7.
    public let resolution: String?
    /// When the post ends (ISO 8601), when it names a time.
    public let expiresAt: String?
    /// `choose` or `first`; it means something only on an offer.
    public let claimMode: String?
    /// The asker already used "Keep open 7 more days" (`post_metadata.kept_open_at`).
    public let keptOpenAt: String?
    /// A plan's own post (Plans marks it `post_metadata.plan`): its event
    /// times are real moments, not the composer's wall clock labelled UTC.
    public let isPlanPost: Bool
    /// Where the post's story was published (`post_metadata.source_url`): an
    /// Around you headline's outlet, or an Official or curator notice's source.
    public let source: PostSource?
    /// Set on a story Today's Around you posted for an outlet (`post_metadata.around_you`, the server's alone):
    /// its topics. Nil on every other post.
    public let aroundYou: PostAroundYou?
    /// Who replied and the latest reply, for a card that shows the conversation before it is opened. Only Around
    /// you sends it, and only on a post with replies (`backend/services/aroundYou/lists.js`).
    public let conversation: PostConversation?
    /// True for cold-start neighborhood facts injected by the feed handler
    /// (`backend/routes/posts.js:84`). Those rows are dismissable, not
    /// reportable.
    public let isSeeded: Bool
    /// The poster's homes are all far from where they posted (`feedService.js:234`); the card says Visitor.
    public let isVisitorPost: Bool
    /// `photo` when the author's own photo or video placed the post (`feedService.js:244`).
    public let locationBasis: String?
    /// When that photo or video was taken (ISO 8601), when its metadata said.
    public let photoTakenAt: String?
    /// Set when the post was authored as a business (`feedService.js:115`).
    public let businessAuthorId: String?
    public let locationName: String?
    public let eventDate: String?
    /// When an Event ends, when the poster named an end time.
    public let eventEndDate: String?
    public let eventVenue: String?
    public let lostFoundType: String?
    public let mediaURLs: [String]
    public let mediaThumbnails: [String]
    public let mediaTypes: [String]
    /// Parallel array to `media_urls` — companion video clip URL when
    /// `media_types[i] == "live_photo"`, empty string otherwise.
    public let mediaLiveURLs: [String]
    public let creator: PostCreatorDTO?
    /// Your own post only: whether it's pinned to your profile (PRF SRV-3).
    /// Nil on other people's posts, in previews, and when the server couldn't tell.
    public let profilePinned: Bool?
    /// False for a post that never shows on its author's profile (a plan's post).
    public let showOnProfile: Bool?

    private enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case title, content
        case postType = "post_type"
        case visibility, audience
        case readScope = "read_scope"
        case allowExternalShare = "allow_external_share"
        case moderationState = "moderation_state"
        case createdAt = "created_at"
        case likeCount = "like_count"
        case commentCount = "comment_count"
        case shareCount = "share_count"
        case userHasLiked
        case reactions, userReaction
        case userHasSaved
        case userHasReposted
        case repostedBy = "reposted_by"
        case repostedAt = "reposted_at"
        case quotedPost = "quoted_post"
        case state, origin, topic, resolution
        case expiresAt = "expires_at"
        case claimMode = "claim_mode"
        case postMetadata = "post_metadata"
        case conversation
        case isSeeded = "is_seeded"
        case isVisitorPost = "is_visitor_post"
        case locationBasis = "location_basis"
        case photoTakenAt = "photo_taken_at"
        case businessAuthorId = "business_author_id"
        case locationName = "location_name"
        case eventDate = "event_date"
        case eventEndDate = "event_end_date"
        case eventVenue = "event_venue"
        case lostFoundType = "lost_found_type"
        case mediaURLs = "media_urls"
        case mediaThumbnails = "media_thumbnails"
        case mediaTypes = "media_types"
        case mediaLiveURLs = "media_live_urls"
        case creator
        case profilePinned = "profile_pinned"
        case showOnProfile = "show_on_profile"
    }

    /// Tolerant (Pulse S2): only `id` and `created_at` are required; any
    /// other field that is missing, null or of another shape reads as absent.
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        userId = c.lenient(String.self, forKey: .userId)
        title = c.lenient(String.self, forKey: .title)
        content = c.lenient(String.self, forKey: .content) ?? ""
        postType = c.lenient(String.self, forKey: .postType)
        visibility = c.lenient(String.self, forKey: .visibility)
        audience = c.lenient(String.self, forKey: .audience)
        readScope = c.lenient(String.self, forKey: .readScope)
        allowExternalShare = c.lenient(Bool.self, forKey: .allowExternalShare)
        moderationState = c.lenient(String.self, forKey: .moderationState)
        createdAt = try c.decode(String.self, forKey: .createdAt)
        likeCount = c.lenient(Int.self, forKey: .likeCount) ?? 0
        commentCount = c.lenient(Int.self, forKey: .commentCount) ?? 0
        shareCount = c.lenient(Int.self, forKey: .shareCount) ?? 0
        userHasLiked = c.lenient(Bool.self, forKey: .userHasLiked) ?? false
        reactions = c.lossyList(PostReactionCount.self, forKey: .reactions)
        userReaction = c.lenient(PostReactionEmoji.self, forKey: .userReaction)
        userHasSaved = c.lenient(Bool.self, forKey: .userHasSaved) ?? false
        userHasReposted = c.lenient(Bool.self, forKey: .userHasReposted) ?? false
        repostedBy = c.lenient(FeedRepostedBy.self, forKey: .repostedBy)
        repostedAt = c.lenient(String.self, forKey: .repostedAt)
        quotedPost = c.lenient(FeedQuotedPost.self, forKey: .quotedPost)
        state = c.lenient(String.self, forKey: .state)
        origin = c.lenient(String.self, forKey: .origin)
        topic = c.lenient(String.self, forKey: .topic)
        resolution = c.lenient(String.self, forKey: .resolution)
        expiresAt = c.lenient(String.self, forKey: .expiresAt)
        claimMode = c.lenient(String.self, forKey: .claimMode)
        let metadata = c.lenient(PostLifecycleMetadata.self, forKey: .postMetadata)
        keptOpenAt = metadata?.keptOpenAt
        isPlanPost = metadata?.plan == true
        source = PostSource(url: metadata?.sourceUrl, name: metadata?.sourceName)
        aroundYou = metadata?.aroundYou
        // A preview the app can't read leaves the card without one, never without its post.
        conversation = c.lenient(PostConversation.self, forKey: .conversation)
        isSeeded = c.lenient(Bool.self, forKey: .isSeeded) ?? false
        isVisitorPost = c.lenient(Bool.self, forKey: .isVisitorPost) ?? false
        locationBasis = c.lenient(String.self, forKey: .locationBasis)
        photoTakenAt = c.lenient(String.self, forKey: .photoTakenAt)
        businessAuthorId = c.lenient(String.self, forKey: .businessAuthorId)
        locationName = c.lenient(String.self, forKey: .locationName)
        eventDate = c.lenient(String.self, forKey: .eventDate)
        eventEndDate = c.lenient(String.self, forKey: .eventEndDate)
        eventVenue = c.lenient(String.self, forKey: .eventVenue)
        lostFoundType = c.lenient(String.self, forKey: .lostFoundType)
        // The four media lists are read side by side, so one is kept whole or not at all.
        mediaURLs = c.lenient([String].self, forKey: .mediaURLs) ?? []
        mediaThumbnails = c.lenient([String].self, forKey: .mediaThumbnails) ?? []
        mediaTypes = c.lenient([String].self, forKey: .mediaTypes) ?? []
        mediaLiveURLs = c.lenient([String].self, forKey: .mediaLiveURLs) ?? []
        creator = c.lenient(PostCreatorDTO.self, forKey: .creator)
        profilePinned = c.lenient(Bool.self, forKey: .profilePinned)
        showOnProfile = c.lenient(Bool.self, forKey: .showOnProfile)
    }
}

/// Who reposted a post: the viewer and their connections (`feedService.js` repostedByLines, PULSEREPOST
/// contract §1).
public struct FeedRepostedBy: Decodable, Sendable, Hashable {
    /// The latest reposters' names, at most two; "You" first when the viewer reposted it.
    public let names: [String]
    /// How many reposted it, the viewer included.
    public let count: Int
    /// The viewer reposted it (`names[0]` is "You"); false from older servers.
    public let viewer: Bool

    private enum CodingKeys: String, CodingKey {
        case names, count, viewer
    }

    public init(names: [String], count: Int, viewer: Bool) {
        self.names = names
        self.count = count
        self.viewer = viewer
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        names = c.lenient([String].self, forKey: .names) ?? []
        count = c.lenient(Int.self, forKey: .count) ?? 0
        viewer = c.lenient(Bool.self, forKey: .viewer) ?? false
    }

    /// The line after the viewer's own repost or undo on this device, before the next read (contract §1): "You"
    /// joins at the front, or leaves; nil when nobody is left. `server` is the line as read, `serverReposted`
    /// whether the read had the viewer's repost, `reposted` whether it stands now.
    static func live(_ server: FeedRepostedBy?, serverReposted: Bool, reposted: Bool) -> FeedRepostedBy? {
        guard reposted != serverReposted else { return server }
        let hasYou = server?.viewer == true
        if reposted, !hasYou {
            let names = Array((["You"] + (server?.names ?? [])).prefix(2))
            return FeedRepostedBy(names: names, count: (server?.count ?? 0) + 1, viewer: true)
        }
        if !reposted, hasYou, let server {
            let names = Array(server.names.dropFirst())
            let count = max(0, server.count - 1)
            guard count > 0, !names.isEmpty else { return nil }
            return FeedRepostedBy(names: names, count: count, viewer: false)
        }
        return server
    }
}

/// The marks a post row carries in `post_metadata`: the lifecycle mark
/// (Pulse S7), the mark Plans puts on a plan's own post, and where its story
/// was published (only the server sets `source_url` and `source_name`).
struct PostLifecycleMetadata: Decodable {
    let keptOpenAt: String?
    let plan: Bool?
    let sourceUrl: String?
    let sourceName: String?
    let aroundYou: PostAroundYou?

    private enum CodingKeys: String, CodingKey {
        case keptOpenAt = "kept_open_at"
        case plan
        case sourceUrl = "source_url"
        case sourceName = "source_name"
        case aroundYou = "around_you"
    }

    init(from decoder: any Decoder) throws {
        let c = try? decoder.container(keyedBy: CodingKeys.self)
        keptOpenAt = c?.lenient(String.self, forKey: .keptOpenAt)
        plan = c?.lenient(Bool.self, forKey: .plan)
        sourceUrl = c?.lenient(String.self, forKey: .sourceUrl)
        sourceName = c?.lenient(String.self, forKey: .sourceName)
        aroundYou = c?.lenient(PostAroundYou.self, forKey: .aroundYou)
    }
}

/// The mark on a story Today's Around you posted for an outlet (`post_metadata.around_you`): the topics the
/// server sorted it into ("sports", "kids", …), in the chips' order; empty when it has none.
public struct PostAroundYou: Decodable, Sendable, Hashable {
    public let topics: [String]

    private enum CodingKeys: String, CodingKey {
        case topics
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        topics = c.lenient([String].self, forKey: .topics) ?? []
    }
}

/// A post's reply preview: the latest repliers (newest first, at most three) and the latest reply, cut short.
public struct PostConversation: Decodable, Sendable, Hashable {
    public struct Person: Decodable, Sendable, Hashable, Identifiable {
        public let id: String
        public let name: String
        public let avatarURL: String?

        private enum CodingKeys: String, CodingKey {
            case id, name
            case avatarURL = "avatar_url"
        }

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            name = c.lenient(String.self, forKey: .name) ?? "Someone"
            avatarURL = c.lenient(String.self, forKey: .avatarURL)
        }
    }

    public struct Reply: Decodable, Sendable, Hashable {
        public let name: String
        public let text: String
    }

    public let people: [Person]
    public let latest: Reply

    private enum CodingKeys: String, CodingKey {
        case people, latest
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        people = c.lossyList(Person.self, forKey: .people)
        latest = try c.decode(Reply.self, forKey: .latest)
    }
}

/// Where a post's story was published: an Around you headline's outlet
/// ("Read at The Columbian"), or an Official or curator notice's source.
/// A web link only; anything else reads as no source.
public struct PostSource: Sendable, Hashable {
    public let url: URL
    /// The outlet's name, when the post names it.
    public let name: String?

    public init?(url raw: String?, name: String?) {
        guard let raw, let url = URL(string: raw), ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
              url.host != nil else { return nil }
        self.url = url
        let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.name = trimmed?.isEmpty == false ? trimmed : nil
    }

    /// "Read at The Columbian", or "Source: clark.wa.gov" without a name.
    public var label: String {
        if let name { return "Read at \(name)" }
        let host = url.host.map { $0.hasPrefix("www.") ? String($0.dropFirst(4)) : $0 } ?? url.absoluteString
        return "Source: \(host)"
    }
}

/// Paging envelope returned by `GET /api/posts/feed`.
public struct FeedPagination: Decodable, Sendable, Hashable {
    /// Opaque cursor id for the next page. The backend v1.1 feed returns an
    /// object `{ createdAt, id, rankBucket? }`; older stubs used a string.
    public let nextCursor: String?
    /// Companion timestamp for keyset pagination — both `cursorCreatedAt`
    /// and `cursorId` must ride on the next request.
    public let nextCursorCreatedAt: String?
    /// The Sports lane's third cursor field: the next request sends it back
    /// as `cursorRankBucket`, as web does (`useFeedData.ts`). Nil elsewhere.
    public let nextCursorRankBucket: Int?
    public let hasMore: Bool?

    private enum CodingKeys: String, CodingKey {
        case nextCursor
        case hasMore
    }

    private struct CursorObject: Decodable {
        let createdAt: String
        let id: String
        let rankBucket: Int?

        private enum CodingKeys: String, CodingKey {
            case createdAt, id, rankBucket
        }

        init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            createdAt = try c.decode(String.self, forKey: .createdAt)
            id = try c.decode(String.self, forKey: .id)
            rankBucket = c.lenient(Int.self, forKey: .rankBucket)
        }
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        hasMore = try container.decodeIfPresent(Bool.self, forKey: .hasMore)
        if let cursorString = try? container.decode(String.self, forKey: .nextCursor) {
            nextCursor = cursorString
            nextCursorCreatedAt = nil
            nextCursorRankBucket = nil
        } else if let cursorObject = try? container.decode(CursorObject.self, forKey: .nextCursor) {
            nextCursor = cursorObject.id
            nextCursorCreatedAt = cursorObject.createdAt
            nextCursorRankBucket = cursorObject.rankBucket
        } else {
            nextCursor = nil
            nextCursorCreatedAt = nil
            nextCursorRankBucket = nil
        }
    }
}

/// `GET /api/posts/feed` response envelope.
public struct FeedResponse: Decodable, Sendable, Hashable {
    public let posts: [FeedPostDTO]
    public let pagination: FeedPagination?
    /// Place feed only: no area was given and the person has no home or saved place to fall back on.
    public var requiresViewingLocation: Bool?
    /// Place feed only: no area was given, so the server looked around the person's own place.
    public var fallbackArea: FeedFallbackArea?

    private enum CodingKeys: String, CodingKey {
        case posts, pagination, requiresViewingLocation, fallbackArea
    }

    /// A row this build can't read is left out; the rest of the feed shows (Pulse S2).
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        posts = c.lossyList(FeedPostDTO.self, forKey: .posts)
        pagination = c.lenient(FeedPagination.self, forKey: .pagination)
        requiresViewingLocation = c.lenient(Bool.self, forKey: .requiresViewingLocation)
        fallbackArea = c.lenient(FeedFallbackArea.self, forKey: .fallbackArea)
    }
}

/// Where the place feed looked when no area was given, such as "Near Camas, WA".
public struct FeedFallbackArea: Decodable, Sendable, Hashable {
    public let label: String
    public let source: String?
}

public extension FeedPostDTO {
    /// "Photo taken here" for a post its author's own photo or video placed
    /// (it stands in for "Visitor"), with the day it was taken once that's
    /// more than a week ago. Nil for every other post.
    func photoProvenanceLabel(now: Date = Date()) -> String? {
        guard locationBasis == "photo" else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let raw = photoTakenAt,
              let taken = parser.date(from: raw) ?? ISO8601DateFormatter().date(from: raw),
              now.timeIntervalSince(taken) > 7 * 86400
        else { return "Photo taken here" }
        let formatter = DateFormatter()
        formatter.locale = .current
        let sameYear = Calendar.current.isDate(taken, equalTo: now, toGranularity: .year)
        formatter.setLocalizedDateFormatFromTemplate(sameYear ? "MMMd" : "MMMyyyy")
        return "Photo taken here \(sameYear ? "on" : "in") \(formatter.string(from: taken))"
    }
}
