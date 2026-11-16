//
//  FeedActionsEndpoints.swift
//  Pantopus
//
//  Feed-row moderation + feed-preference routes from
//  `backend/routes/posts.js`. Kept apart from `PostsEndpoints` because the
//  Pulse card overflow menu and the Pulse preferences sheet own this whole
//  cluster (hide / mute / not-helpful / solve / seeded-dismiss / prefs).
//

import Foundation

/// Endpoints backing the Pulse post-card overflow menu and the Pulse
/// preferences sheet.
public enum FeedActionsEndpoints {
    /// `POST /api/posts/hide/:id` — hides a single post from the signed-in
    /// viewer's feed. Route `backend/routes/posts.js:2094`.
    public static func hidePost(id: String) -> Endpoint {
        Endpoint(method: .post, path: "/api/posts/hide/\(id)")
    }

    /// `DELETE /api/posts/hide/:id` — undoes a hide (Hide's and "Not helpful
    /// here"'s Undo); idempotent, answers `{ message: "Post unhidden" }`. An
    /// older server answers 404, which reads as a failure (PULSEREPOST
    /// contract §6). Route `backend/routes/posts.js` beside `POST /hide/:id`
    /// (line 2480 on dev).
    public static func unhidePost(id: String) -> Endpoint {
        Endpoint(method: .delete, path: "/api/posts/hide/\(id)")
    }

    /// `POST /api/posts/mute` — mutes a user or a business across every
    /// feed surface. Route `backend/routes/posts.js:2117`.
    public static func mute(entityType: FeedMuteEntityType, entityId: String) -> Endpoint {
        Endpoint(
            method: .post,
            path: "/api/posts/mute",
            body: FeedMuteRequest(entityType: entityType.rawValue, entityId: entityId)
        )
    }

    /// `GET /api/posts/mute` — the people and businesses the viewer muted,
    /// listed in Settings → Blocked users so a mute can be undone, and the
    /// Pulse topics muted, listed in Pulse preferences.
    /// Route `backend/routes/posts.js:2161`.
    public static func mutedEntities() -> Endpoint {
        Endpoint(method: .get, path: "/api/posts/mute")
    }

    /// `DELETE /api/posts/mute` — undoes a mute from Settings → Blocked users.
    /// Route `backend/routes/posts.js:2220`.
    public static func unmute(entityType: FeedMuteEntityType, entityId: String) -> Endpoint {
        Endpoint(
            method: .delete,
            path: "/api/posts/mute",
            body: FeedMuteRequest(entityType: entityType.rawValue, entityId: entityId)
        )
    }

    /// `POST /api/posts/mute/topic` `{ postType, surface? }` — mutes a kind
    /// of post, optionally on one surface (`place` / `connections` /
    /// `personas`). Route `backend/routes/posts.js:2414`.
    public static func muteTopic(postType: String, surface: String?) -> Endpoint {
        Endpoint(
            method: .post,
            path: "/api/posts/mute/topic",
            body: FeedMuteTopicRequest(postType: postType, surface: surface)
        )
    }

    /// `POST /api/posts/mute/topic` `{ topic, areaId? }` — mutes a Pulse
    /// topic in one area, or everywhere without `areaId` (contract §2.9).
    /// Route `backend/routes/posts.js:2414`.
    public static func mutePulseTopic(_ topic: String, areaId: String?) -> Endpoint {
        Endpoint(
            method: .post,
            path: "/api/posts/mute/topic",
            body: FeedMuteTopicRequest(topic: topic, areaId: areaId)
        )
    }

    /// `DELETE /api/posts/mute` `{ entityType: "topic", entityId, areaId? }`
    /// — undoes one topic mute from Pulse preferences. Route
    /// `backend/routes/posts.js:2220`.
    public static func unmutePulseTopic(_ topic: String, areaId: String?) -> Endpoint {
        Endpoint(
            method: .delete,
            path: "/api/posts/mute",
            body: FeedUnmuteTopicRequest(topic: topic, areaId: areaId)
        )
    }

    /// `POST /api/posts/:id/not-helpful` — community "this isn't useful
    /// here" signal; newer servers also hide the post for the viewer
    /// (`hidden: true`, PULSEREPOST contract §7). `surface` is normalised
    /// server-side to `nearby` / `connections`. Route
    /// `backend/routes/posts.js:4267`.
    public static func notHelpful(id: String, surface: String) -> Endpoint {
        Endpoint(
            method: .post,
            path: "/api/posts/\(id)/not-helpful",
            body: FeedNotHelpfulRequest(surface: surface)
        )
    }

    /// `PATCH /api/posts/:id/solve` — author-only; marks an Ask post
    /// solved. Route `backend/routes/posts.js:3245`.
    public static func solve(id: String) -> Endpoint {
        Endpoint(method: .patch, path: "/api/posts/\(id)/solve")
    }

    /// `POST /api/posts/seeded/:factId/dismiss` — drops a cold-start
    /// neighborhood fact from this viewer's feed forever. Route
    /// `backend/routes/posts.js:3309`.
    public static func dismissSeededFact(factId: String) -> Endpoint {
        Endpoint(method: .post, path: "/api/posts/seeded/\(factId)/dismiss")
    }

    /// `GET /api/posts/feed-preferences` — hide-deals / hide-alerts /
    /// politics toggles. Route `backend/routes/posts.js:2257`.
    public static func feedPreferences() -> Endpoint {
        Endpoint(method: .get, path: "/api/posts/feed-preferences")
    }

    /// `PUT /api/posts/feed-preferences` — partial update; only the keys
    /// present in the body are written. Route
    /// `backend/routes/posts.js:2286`.
    public static func updateFeedPreferences(
        _ body: FeedPreferencesUpdateRequest,
        dispatchGuard: (@MainActor @Sendable () throws -> Void)? = nil
    ) -> Endpoint {
        Endpoint(method: .put, path: "/api/posts/feed-preferences", body: body, dispatchGuard: dispatchGuard)
    }
}
