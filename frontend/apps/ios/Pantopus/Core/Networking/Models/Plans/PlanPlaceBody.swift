//
//  PlanPlaceBody.swift
//  Pantopus
//
//  Nearby Plans: where a plan is, as `POST /api/plans` and `PATCH
//  /api/plans/:id` take it (moved out of PlanActionDTOs.swift, which keeps
//  the other bodies).
//

import Foundation

/// Where the plan is. `homeId` only for `home`; GPS never becomes the pin.
/// `placeId` is the place picker's id (`osm:node/123`) for a public place picked
/// from its list; the server keeps it as the plan's venue key (`place_ref`) and
/// ignores it for a place typed by hand (planActions.js, Plans with businesses
/// step 1). Left out when nil. An online plan (Plans step 3) sends only
/// `{ kind: "online", link, timezone }` (the link, and the phone's own IANA
/// time zone): see `online(link:)` in PlanOnlineParts.swift.
public struct PlanPlaceBody: Encodable, Sendable, Hashable {
    public let kind: PlanPlaceKind
    public let name: String?
    public let address: String?
    public let latitude: Double
    public let longitude: Double
    public let homeId: String?
    public let placeId: String?
    public var link: String?
    public var timezone: String?

    enum CodingKeys: String, CodingKey {
        case kind, name, address, latitude, longitude, link, timezone
        case homeId = "home_id"
        case placeId = "place_id"
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(kind, forKey: .kind)
        if kind == .online {
            try container.encodeIfPresent(link, forKey: .link)
            try container.encodeIfPresent(timezone, forKey: .timezone)
            return
        }
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(address, forKey: .address)
        try container.encode(latitude, forKey: .latitude)
        try container.encode(longitude, forKey: .longitude)
        try container.encodeIfPresent(homeId, forKey: .homeId)
        try container.encodeIfPresent(placeId, forKey: .placeId)
    }

    public init(
        kind: PlanPlaceKind,
        name: String?,
        address: String?,
        latitude: Double,
        longitude: Double,
        homeId: String?,
        placeId: String? = nil
    ) {
        self.kind = kind
        self.name = name
        self.address = address
        self.latitude = latitude
        self.longitude = longitude
        self.homeId = homeId
        self.placeId = placeId
    }
}
