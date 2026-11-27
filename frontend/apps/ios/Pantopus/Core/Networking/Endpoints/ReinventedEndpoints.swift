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

    /// `GET /api/reinvented/map` (CONTRACT 6b): rings, marks, tickets and kept Moments for a box and a time (`live`,
    /// `today`, `week`, `all`, `tonight`, `weekend`). Route `backend/routes/reinvented.js:71` (map).
    static func map(south: Double, west: Double, north: Double, east: Double, time: String) -> Endpoint {
        Endpoint(
            method: .get,
            path: "/api/reinvented/map",
            query: [
                "south": String(format: "%.5f", south),
                "west": String(format: "%.5f", west),
                "north": String(format: "%.5f", north),
                "east": String(format: "%.5f", east),
                "time": time
            ],
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }

    /// `GET /api/reinvented/strip` (CONTRACT 6c): Alive right now. Route `backend/routes/reinvented.js:91` (strip).
    static func strip(at point: (latitude: Double, longitude: Double)?) -> Endpoint {
        var query: [String: String] = [:]
        if let point {
            query["latitude"] = String(format: "%.5f", point.latitude)
            query["longitude"] = String(format: "%.5f", point.longitude)
        }
        return Endpoint(method: .get, path: "/api/reinvented/strip", query: query, cachePolicy: .reloadIgnoringLocalCacheData)
    }
}
