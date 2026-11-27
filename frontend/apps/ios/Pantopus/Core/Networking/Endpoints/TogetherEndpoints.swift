//
//  TogetherEndpoints.swift
//  Pantopus
//
//  The requests of "Pulse, reinvented" phase 3 ("together and back outside", CONTRACT 8), sent only while
//  `pulse_reinvented` is on for the person. Today's screens never send them; a person whose switch is off gets
//  `403 PULSE_REINVENTED_OFF`, and the app reads the switch again.
//

import Foundation

enum TogetherEndpoints {
    private static func path(_ momentId: String) -> String {
        "/api/reinvented/moments/\(momentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? momentId)"
    }

    private static func encoded(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
    }

    // MARK: - Replies people can see (CONTRACT 8a)

    /// `GET /api/reinvented/moments/:id/replies?cursor=`: the replies this reader may see, oldest first, 30 a page.
    /// Route `backend/routes/reinvented.js:449`.
    static func replies(momentId: String, cursor: String?) -> Endpoint {
        Endpoint(
            method: .get,
            path: "\(path(momentId))/replies",
            query: cursor.map { ["cursor": $0] } ?? [:],
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }

    /// `POST /api/reinvented/moments/:id/replies` `{ text }` (1 to 500 characters). Route
    /// `backend/routes/reinvented.js:459`.
    static func addReply(momentId: String, text: String) -> Endpoint {
        Endpoint(method: .post, path: "\(path(momentId))/replies", body: MomentReplyBody(text: text))
    }

    /// `DELETE /api/reinvented/moments/:id/replies/:reply`: its writer, or the Moment's author. Route
    /// `backend/routes/reinvented.js:468`.
    static func removeReply(momentId: String, replyId: String) -> Endpoint {
        Endpoint(method: .delete, path: "\(path(momentId))/replies/\(encoded(replyId))")
    }

    /// `POST /api/reinvented/moments/:id/replies/:reply/report` `{ reason }`: Pulse's reply report. Route
    /// `backend/routes/reinvented.js:478`.
    static func reportReply(momentId: String, replyId: String, reason: String) -> Endpoint {
        Endpoint(method: .post, path: "\(path(momentId))/replies/\(encoded(replyId))/report", body: MomentReplyReportBody(reason: reason))
    }

    /// `POST /api/reinvented/moments/:id/replies-shown` `{ shown }`: the author shows the replies to everyone who sees
    /// the Moment, or hides them (they stay stored). Answers `{ moment }`. Route `backend/routes/reinvented.js:488`.
    static func repliesShown(momentId: String, shown: Bool) -> Endpoint {
        Endpoint(method: .post, path: "\(path(momentId))/replies-shown", body: MomentRepliesShownBody(shown: shown))
    }
}
