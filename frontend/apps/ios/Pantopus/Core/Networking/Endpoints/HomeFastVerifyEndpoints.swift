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

    /// `POST /api/homes/:id/fast-check/phone/start` (FASTVERIFY phase 3): texts a code to the number. Answers
    /// `{ sent, resend_after_s }`; `PHONE_INVALID` 400, `PHONE_IN_USE` 409, `FAST_CHECK_LIMIT` 429,
    /// `PHONE_CHECK_UNAVAILABLE` 503.
    public static func phoneStart(homeId: String, request: PhoneCheckStartRequest) -> Endpoint {
        Endpoint(method: .post, path: "/api/homes/\(homeId)/fast-check/phone/start", body: request)
    }

    /// `POST /api/homes/:id/fast-check/phone/verify` (FASTVERIFY phase 3): the texted code, then the records
    /// question. Answers `{ result: verified|no_match|wrong_code, level, tries_left }`.
    public static func phoneVerify(homeId: String, request: PhoneCheckVerifyRequest) -> Endpoint {
        Endpoint(method: .post, path: "/api/homes/\(homeId)/fast-check/phone/verify", body: request)
    }

    /// `POST /api/public/postcard-report` — "This wasn't me" for a scanned card (FASTVERIFY phase 2). Needs no
    /// account; the server answers `{ recorded: true }` whatever it found.
    public static func postcardReport(homeId: String, code: String) -> Endpoint {
        Endpoint(method: .post, path: "/api/public/postcard-report", body: PostcardReportRequest(homeId: homeId, code: code))
    }
}
