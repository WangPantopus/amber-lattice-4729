//
//  HomeFastVerifyEndpoints.swift
//  Pantopus
//
//  Faster home verification (FASTVERIFY). Every route answers 404
//  `FAST_CHECK_OFF` while its switch is off; callers then keep today's screens.
//

import Foundation

public enum HomeFastVerifyEndpoints {
    /// `GET /api/homes/:id/verify-options` — route `backend/routes/homeFastCheck.js:20`
    /// (FASTVERIFY phase 1). The person's level at this Home and the ways they may verify.
    public static func verifyOptions(homeId: String) -> Endpoint {
        Endpoint(
            method: .get,
            path: "/api/homes/\(homeId)/verify-options",
            cachePolicy: .reloadIgnoringLocalAndRemoteCacheData
        )
    }

    /// `POST /api/public/postcard-report` — "This wasn't me" for a scanned card (FASTVERIFY phase 2). Needs no
    /// account; the server answers `{ recorded: true }` whatever it found.
    public static func postcardReport(homeId: String, code: String) -> Endpoint {
        Endpoint(method: .post, path: "/api/public/postcard-report", body: PostcardReportRequest(homeId: homeId, code: code))
    }
}
