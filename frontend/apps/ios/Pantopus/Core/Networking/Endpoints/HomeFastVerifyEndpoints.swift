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
}
