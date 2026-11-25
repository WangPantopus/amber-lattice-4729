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
            cachePolicy: .reloadIgnoringLocalCacheData,
            // Never wait on a slow page (SPEC 4.13): past this, the profile draws today's screen instead.
            timeout: 6
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

    /// `PUT /api/profile-page/me/share` with `links_enabled` alone: links for one purpose on or off for this person.
    public static func setLinksEnabled(_ on: Bool) -> Endpoint {
        Endpoint(method: .put, path: "/api/profile-page/me/share", body: ProfileLinksEnabledBody(linksEnabled: on))
    }

    /// `POST /api/profile-page/me/links` — a link for one purpose (409 `PROFILE_LINKS_LIMIT` past ten live ones).
    public static func createLink(_ body: ProfileShareLinkBody) -> Endpoint {
        Endpoint(method: .post, path: "/api/profile-page/me/links", body: body)
    }

    /// `PATCH /api/profile-page/me/links/:id` — its name, parts, end date or switch.
    public static func updateLink(id: String, _ body: ProfileShareLinkBody) -> Endpoint {
        Endpoint(method: .patch, path: "/api/profile-page/me/links/\(Endpoint.pathSegment(id))", body: body)
    }

    /// `DELETE /api/profile-page/me/links/:id`.
    public static func deleteLink(id: String) -> Endpoint {
        Endpoint(method: .delete, path: "/api/profile-page/me/links/\(Endpoint.pathSegment(id))")
    }

    // MARK: - The owner's pieces (CONTRACT P2.3, P2.4; route backend/routes/profilePage.js)

    /// `GET /api/profile-page/me/pieces` — every piece of the owner's (drafts and hidden ones too), the jobs and
    /// plans not yet made into a piece, and "<n> of your <m> pieces".
    public static func myPieces() -> Endpoint {
        Endpoint(method: .get, path: "/api/profile-page/me/pieces", cachePolicy: .reloadIgnoringLocalCacheData)
    }

    /// `POST /api/profile-page/me/pieces` — makes a piece; 201 with the piece as the owner sees it.
    public static func createPiece(_ body: ProfilePieceBody) -> Endpoint {
        Endpoint(method: .post, path: "/api/profile-page/me/pieces", body: body)
    }

    /// `POST /api/profile-page/me/pieces/preview` — "How this piece will show", worked out by the server; nothing saved.
    public static func previewPiece(_ body: ProfilePieceBody) -> Endpoint {
        Endpoint(method: .post, path: "/api/profile-page/me/pieces/preview", body: body, reportsServerErrors: false)
    }

    /// `PATCH /api/profile-page/me/pieces/:id` — the fields sent replace theirs (attachments and links as whole lists).
    public static func updatePiece(id: String, _ body: ProfilePieceBody) -> Endpoint {
        Endpoint(method: .patch, path: "/api/profile-page/me/pieces/\(Endpoint.pathSegment(id))", body: body)
    }

    /// `DELETE /api/profile-page/me/pieces/:id` — removes the piece and the files only it held.
    public static func deletePiece(id: String) -> Endpoint {
        Endpoint(method: .delete, path: "/api/profile-page/me/pieces/\(Endpoint.pathSegment(id))")
    }

    /// `POST /api/profile-page/me/pieces/:id/links/:linkId/proof` — the short line to put on the page.
    public static func linkProof(pieceId: String, linkId: String) -> Endpoint {
        Endpoint(
            method: .post,
            path: "/api/profile-page/me/pieces/\(Endpoint.pathSegment(pieceId))/links/\(Endpoint.pathSegment(linkId))/proof"
        )
    }

    /// `POST /api/profile-page/me/pieces/:id/links/:linkId/check` — reads the page; the card, Seen, when the line is there.
    public static func linkCheck(pieceId: String, linkId: String) -> Endpoint {
        Endpoint(
            method: .post,
            path: "/api/profile-page/me/pieces/\(Endpoint.pathSegment(pieceId))/links/\(Endpoint.pathSegment(linkId))/check"
        )
    }

    // MARK: - Credits, asks and ties (CONTRACT P2.5, p2.7; 404 PROFILE_TIES_OFF while the server's switch is off)

    /// `POST /api/profile-page/me/pieces/:id/credits` — names a person (who is asked to sign) or a typed name.
    public static func addCredit(pieceId: String, _ body: ProfileCreditBody) -> Endpoint {
        Endpoint(method: .post, path: "/api/profile-page/me/pieces/\(Endpoint.pathSegment(pieceId))/credits", body: body)
    }

    /// `DELETE /api/profile-page/me/pieces/:id/credits/:creditId` — the owner takes a credit off.
    public static func removeCredit(pieceId: String, creditId: String) -> Endpoint {
        Endpoint(
            method: .delete,
            path: "/api/profile-page/me/pieces/\(Endpoint.pathSegment(pieceId))/credits/\(Endpoint.pathSegment(creditId))"
        )
    }

    /// `GET /api/profile-page/me/asks` — "Asked of you".
    public static func asks() -> Endpoint {
        Endpoint(method: .get, path: "/api/profile-page/me/asks", cachePolicy: .reloadIgnoringLocalCacheData)
    }

    /// `POST /api/profile-page/me/asks/:id/sign` — with the signer's two choices.
    public static func signAsk(id: String, _ choices: ProfileTieChoicesBody) -> Endpoint {
        Endpoint(method: .post, path: "/api/profile-page/me/asks/\(Endpoint.pathSegment(id))/sign", body: choices)
    }

    /// `POST /api/profile-page/me/asks/:id/decline` — "Not me".
    public static func declineAsk(id: String) -> Endpoint {
        Endpoint(method: .post, path: "/api/profile-page/me/asks/\(Endpoint.pathSegment(id))/decline")
    }

    /// `PATCH /api/profile-page/me/ties/:id` — the signer changes their two choices.
    public static func updateTie(id: String, _ choices: ProfileTieChoicesBody) -> Endpoint {
        Endpoint(method: .patch, path: "/api/profile-page/me/ties/\(Endpoint.pathSegment(id))", body: choices)
    }

    /// `DELETE /api/profile-page/me/ties/:id` — the signer takes their name off.
    public static func removeTie(id: String) -> Endpoint {
        Endpoint(method: .delete, path: "/api/profile-page/me/ties/\(Endpoint.pathSegment(id))")
    }

    /// `PUT /api/profile-page/me/share` with `ties_enabled` — "Let people name me on their work".
    public static func setTiesEnabled(_ on: Bool) -> Endpoint {
        Endpoint(method: .put, path: "/api/profile-page/me/share", body: ProfileTiesEnabledBody(tiesEnabled: on))
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

/// `{ "links_enabled": true | false }`.
public struct ProfileLinksEnabledBody: Encodable, Sendable {
    public let linksEnabled: Bool

    enum CodingKeys: String, CodingKey {
        case linksEnabled = "links_enabled"
    }
}

/// The parts this app draws, named on every `/api/profile-page/…` request (`APIClient` sets it; CONTRACT "The parts
/// header"). For anything waiting for the person in a part not named here (an ask to a business they own, a line in
/// "Lines for you", a card left), the server sends a `notice` row that opens it on pantopus.com.
public enum ProfilePageParts {
    public static let header = "X-Pantopus-Profile-Parts"
    public static let drawn = "pieces, credits, shelf"

    /// The header for a profile-page request, none for any other.
    public static func headers(for path: String) -> [String: String] {
        path.hasPrefix("/api/profile-page/") ? [header: drawn] : [:]
    }
}
