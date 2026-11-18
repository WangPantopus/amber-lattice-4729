//
//  SkyPlaceKind.swift
//  Pantopus
//
//  What a Pulse post's place tag names, as the server reads it
//  (backend/utils/postPlaceTag.js): a town or an area, an address, or anything
//  else, a venue. Under the Sky only a venue where the draft's photo was taken
//  (within 5 km, the server's `mediaCaptureNear`) keeps an exact pin.
//

import Foundation

enum SkyPlaceKind: Equatable {
    case venue, address, area

    private static let areaKinds: Set<String> = [
        "place", "locality", "neighborhood", "district", "region", "postcode", "country",
        "city", "town", "village", "hamlet", "suburb", "county", "state"
    ]
    private static let addressKinds: Set<String> = ["address", "street", "house"]

    /// Nil with no tag.
    static func of(placeId: String?, kind: String?) -> SkyPlaceKind? {
        guard let placeId, !placeId.isEmpty else { return nil }
        for name in [(kind ?? "").lowercased(), String(placeId.split(separator: ".").first ?? "").lowercased()] {
            if addressKinds.contains(name) { return .address }
            if areaKinds.contains(name) { return .area }
        }
        return .venue
    }

    /// How far from a place a photo may have been taken and still count as taken there.
    static let takenThereMeters = 5000.0

    /// The distance in metres between two points (haversine).
    static func meters(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
        let dLat = (lat2 - lat1) * .pi / 180
        let dLng = (lng2 - lng1) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2) + cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * 6_371_000 * asin(min(1, sqrt(a)))
    }
}
