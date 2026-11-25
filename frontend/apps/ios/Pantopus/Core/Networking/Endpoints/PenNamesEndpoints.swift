//
//  PenNamesEndpoints.swift
//  Pantopus
//
//  Made-up names (in code, pen names): `backend/routes/penNames.js`, mounted at `/api/pen-names`. The build contract is
//  `docs/product/made-up-names/README.md`. Every refusal is `{ error, code }`; the app shows `error` as it is.
//

import Foundation

public enum PenNamesEndpoints {
    /// `GET /api/pen-names/me` — the person's made-up name (or none), whether they may use one and why not, the
    /// kinds of post it may carry, the promise, and names Pantopus could give. Route `backend/routes/penNames.js:65`.
    public static let me = Endpoint(method: .get, path: "/api/pen-names/me", cachePolicy: .reloadIgnoringLocalCacheData)

    /// `GET /api/pen-names/suggestions` — four more names Pantopus could give (Shuffle).
    /// Route `backend/routes/penNames.js:92`.
    public static let suggestions = Endpoint(
        method: .get,
        path: "/api/pen-names/suggestions",
        cachePolicy: .reloadIgnoringLocalCacheData
    )

    /// `POST /api/pen-names` — take the typed name; an empty name lets Pantopus give one. `replace` gives up the
    /// name in use (once every 30 days after writing under it). Route `backend/routes/penNames.js:105`.
    public static func take(name: String, replace: Bool) -> Endpoint {
        Endpoint(method: .post, path: "/api/pen-names", body: PenNameTakeRequest(name: name, replace: replace))
    }

    /// `GET /api/pen-names/check?latitude=&longitude=` — whether a post made here may carry a made-up name, and the
    /// warning shown above the Post button when few verified homes are near. Route `backend/routes/penNames.js:117`.
    public static func check(latitude: Double, longitude: Double) -> Endpoint {
        Endpoint(
            method: .get,
            path: "/api/pen-names/check",
            query: ["latitude": String(latitude), "longitude": String(longitude)],
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }

    /// `GET /api/pen-names/me/posts?before=&limit=` — the person's own made-up-name posts, newest first. Only they
    /// can read it. Route `backend/routes/penNames.js:143`.
    public static func myPosts(before: String? = nil, limit: Int = 50) -> Endpoint {
        var query = ["limit": String(limit)]
        if let before { query["before"] = before }
        return Endpoint(
            method: .get,
            path: "/api/pen-names/me/posts",
            query: query,
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }

    /// `GET /api/pen-names/:id` — the small card: the name, the picture, the note, and whether it is the viewer's,
    /// muted or blocked. Route `backend/routes/penNames.js:177`.
    public static func card(id: String) -> Endpoint {
        Endpoint(
            method: .get,
            path: "/api/pen-names/\(Endpoint.pathSegment(id))",
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }

    /// `POST` / `DELETE /api/pen-names/:id/mute` — hide (or show again) everything that account writes under any
    /// made-up name. Route `backend/routes/penNames.js:218`.
    public static func mute(id: String, on: Bool) -> Endpoint {
        Endpoint(method: on ? .post : .delete, path: "/api/pen-names/\(Endpoint.pathSegment(id))/mute")
    }

    /// `POST` / `DELETE /api/pen-names/:id/block` — the same as mute, and that account can't reply to the viewer
    /// under any name. Route `backend/routes/penNames.js:220`.
    public static func block(id: String, on: Bool) -> Endpoint {
        Endpoint(method: on ? .post : .delete, path: "/api/pen-names/\(Endpoint.pathSegment(id))/block")
    }
}

/// `POST /api/pen-names` body.
public struct PenNameTakeRequest: Encodable, Sendable {
    public let name: String
    public let replace: Bool
}
