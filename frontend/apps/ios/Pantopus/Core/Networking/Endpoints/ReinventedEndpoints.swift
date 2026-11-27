//
//  ReinventedEndpoints.swift
//  Pantopus
//
//  "Pulse, reinvented" phase 1 (CONTRACT 6): the routes only the new Pulse tab reads, under `/api/reinvented/`, and
//  only while `pulse_reinvented` is on for the person. Today's screens never send them.
//

import Foundation

public enum ReinventedEndpoints {
    /// `GET /api/reinvented/list` (CONTRACT 6a): the Moments and posts by reach, chip and cursor, with the bands.
    /// Route `backend/routes/reinvented.js:50` (list).
    static func list(
        reach: String,
        miles: Int?,
        chip: String,
        at point: (latitude: Double, longitude: Double)?,
        cursor: String?
    ) -> Endpoint {
        var query = ["reach": reach, "chip": chip, "limit": "20"]
        if let miles { query["miles"] = String(miles) }
        if let point {
            query["latitude"] = String(format: "%.5f", point.latitude)
            query["longitude"] = String(format: "%.5f", point.longitude)
        }
        if let cursor { query["cursor"] = cursor }
        return Endpoint(method: .get, path: "/api/reinvented/list", query: query, cachePolicy: .reloadIgnoringLocalCacheData)
    }
}
