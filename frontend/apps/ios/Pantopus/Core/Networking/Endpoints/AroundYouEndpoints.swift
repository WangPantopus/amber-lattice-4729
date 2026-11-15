//
//  AroundYouEndpoints.swift
//  Pantopus
//
//  Around you, Today's second half: one read per kind of place Today shows.
//

import Foundation

public enum AroundYouEndpoints {
    /// `GET /api/homes/:id/around` — Around you for a Home (anyone who can
    /// read its Today, a claimant included). Route
    /// `backend/routes/placeIntelligence.js:118`.
    public static func home(id: String) -> Endpoint {
        Endpoint(method: .get, path: "/api/homes/\(id)/around")
    }

    /// `GET /api/saved-places/:id/around` — Around you for a saved address.
    /// Route `backend/routes/savedPlaces.js:115`.
    public static func savedPlace(id: String) -> Endpoint {
        Endpoint(method: .get, path: "/api/saved-places/\(id)/around")
    }

    /// `POST /api/saved-places/area/around` — Around you for the city around
    /// a point rounded to two decimal places (in the body, never the URL).
    /// Stores nothing. Route `backend/routes/savedPlaces.js:139`.
    public static func area(_ body: AreaTodayBody) -> Endpoint {
        Endpoint(method: .post, path: "/api/saved-places/area/around", body: body)
    }
}
