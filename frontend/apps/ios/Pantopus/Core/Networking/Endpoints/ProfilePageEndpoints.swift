//
//  ProfilePageEndpoints.swift
//  Pantopus
//
//  The profile with sources (`~/pantopus-profile-sources/SPEC.md` §3, CONTRACT.md v1): the server composes a
//  person's page for the viewer and the app draws its blocks. Behind the backend's `PROFILE_SOURCES` and the app's
//  `profile_sources` launch key. Routes in `backend/routes/profilePage.js`.
//

import Foundation

public enum ProfilePageEndpoints {
    /// `GET /api/profile-page/id/:id` (an account id) or `GET /api/profile-page/:username` — the page as this viewer
    /// sees it. `previewAs` (`link`, `member`, `connection`) is the owner's Preview as. 404 `PROFILE_SOURCES_OFF` while
    /// the server's switch is off.
    public static func page(identifier: String, previewAs: String? = nil) -> Endpoint {
        Endpoint(
            method: .get,
            path: base(identifier),
            query: previewAs.map { ["as": $0] } ?? [:],
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }

    /// `GET …/month/:month` (`YYYY-MM`) — one month of the rings, opened (board 13).
    public static func month(identifier: String, month: String, previewAs: String? = nil) -> Endpoint {
        Endpoint(
            method: .get,
            path: "\(base(identifier))/month/\(Endpoint.pathSegment(month))",
            query: previewAs.map { ["as": $0] } ?? [:],
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }

    /// `GET …/piece/:pieceId` — one piece, opened.
    public static func piece(identifier: String, pieceId: String, previewAs: String? = nil) -> Endpoint {
        Endpoint(
            method: .get,
            path: "\(base(identifier))/piece/\(Endpoint.pathSegment(pieceId))",
            query: previewAs.map { ["as": $0] } ?? [:],
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }

    /// An account id reads `/id/:id`; anything else is a username.
    private static func base(_ identifier: String) -> String {
        if UserSocialEndpoints.isUUID(identifier) {
            return "/api/profile-page/id/\(Endpoint.pathSegment(identifier))"
        }
        return "/api/profile-page/\(Endpoint.pathSegment(UserSocialEndpoints.normalizeHandle(identifier)))"
    }

    /// `GET /api/profile-page/me/share` — the owner's parts, and what a visitor would see.
    public static var share: Endpoint {
        Endpoint(method: .get, path: "/api/profile-page/me/share", cachePolicy: .reloadIgnoringLocalCacheData)
    }

    /// `PUT /api/profile-page/me/share` — saves the parts of the main link (`anyone`, `members` or `connections`
    /// each) and whether search engines may list the page. Answers like `share`.
    public static func saveShare(parts: [String: String]?, searchEngines: Bool?) -> Endpoint {
        Endpoint(
            method: .put,
            path: "/api/profile-page/me/share",
            body: ProfileShareSaveBody(parts: parts, searchEngines: searchEngines)
        )
    }

    /// `GET /api/profile-page/marks?ids=a,b,c` — the ring on each avatar (board 6): since when each person has
    /// anything on record, and whether anything is seen. People the viewer may not see are left out.
    public static func marks(ids: [String]) -> Endpoint {
        Endpoint(
            method: .get,
            path: "/api/profile-page/marks",
            query: ["ids": ids.joined(separator: ",")],
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }
}

/// The body of `PUT /api/profile-page/me/share`: keys left out keep their setting.
public struct ProfileShareSaveBody: Encodable, Sendable {
    public let parts: [String: String]?
    public let searchEngines: Bool?

    enum CodingKeys: String, CodingKey {
        case parts
        case searchEngines = "search_engines"
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(parts, forKey: .parts)
        try c.encodeIfPresent(searchEngines, forKey: .searchEngines)
    }
}
