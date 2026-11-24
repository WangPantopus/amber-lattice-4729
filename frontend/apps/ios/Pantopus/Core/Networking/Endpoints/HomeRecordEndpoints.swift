//
//  HomeRecordEndpoints.swift
//  Pantopus
//
//  The home record page (contract v1): one answer drawn as blocks, for a
//  looked-up address or for a Home.
//

import Foundation

public enum HomeRecordEndpoints {
    /// `GET /api/public/home-record?address=` — route `backend/routes/public.js`
    /// (beside `GET /place`). The record of a looked-up address, signed in or
    /// not: the open part and the closed groups, never the owner's values. The
    /// same address parameter, limits and privacy rules as the lookup (no
    /// database writes, no trail of the typed address); the token rides along
    /// when there is one.
    public static func lookup(address: String) -> Endpoint {
        Endpoint(method: .get, path: "/api/public/home-record", query: ["address": address])
    }

    /// `GET /api/homes/:id/record` — the record of a Home, signed in. The
    /// viewer's standing on the Home picks the state: `owner` (everything
    /// opened) or `member` (as the lookup, with the button that fits them).
    public static func home(homeId: String) -> Endpoint {
        Endpoint(method: .get, path: "/api/homes/\(homeId)/record")
    }
}
