//
//  AroundYouEndpoints.swift
//  Pantopus
//
//  Around you, Today's second half: one read per kind of place Today shows,
//  and the same three reads with `list` (and `before`) for a page of one of
//  its lists (a topic, "Talked about", the earlier stories under All).
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

    /// `GET /api/homes/:id/around?list=&before=` — a page of one of a Home's Around you lists. Route
    /// `backend/routes/placeIntelligence.js:118`.
    public static func homeList(id: String, list: String, before: String?) -> Endpoint {
        Endpoint(method: .get, path: "/api/homes/\(id)/around", query: listQuery(list, before))
    }

    /// `GET /api/saved-places/:id/around?list=&before=` — a page of one of a saved address's lists. Route
    /// `backend/routes/savedPlaces.js:115`.
    public static func savedPlaceList(id: String, list: String, before: String?) -> Endpoint {
        Endpoint(method: .get, path: "/api/saved-places/\(id)/around", query: listQuery(list, before))
    }

    /// `POST /api/saved-places/area/around` with `list` (and `before`) in the body — a page of one of the lists
    /// for the city around a point. Stores nothing. Route `backend/routes/savedPlaces.js:139`.
    public static func areaList(_ body: AreaAroundListBody) -> Endpoint {
        Endpoint(method: .post, path: "/api/saved-places/area/around", body: body)
    }

    private static func listQuery(_ list: String, _ before: String?) -> [String: String] {
        var query = ["list": list]
        if let before, !before.isEmpty { query["before"] = before }
        return query
    }
}
