//
//  MomentSkyDTOs.swift
//  Pantopus
//
//  The Sky's approximate places on a Moment (Moments API v4.0,
//  docs/product/moments/api-v4.0.md): what the place preview adds while the
//  server's `sky_places` switch is on for you, and what a Moment adds (it
//  floats over an area, it was shared later, it waits to share). Every field is
//  read without throwing, so a Moment or a preview never fails over them.
//  Beside `MomentsDTOs.swift`, which has no room.
//

import Foundation

/// `POST /api/moments/place-preview`'s Sky fields, there only when it answers `sky: true` (the Post sheet then draws
/// "Around …", "Pin it at a place" and "Share later"). Route backend/routes/moments.js (skyPreview).
public struct MomentSkyPreviewDTO: Sendable, Hashable {
    /// The area the point floats over; nil with no point.
    public let area: MomentSkyAreaDTO?
    /// The public place that names the spot: what "Pin it at a place" starts with. Nil where there is none.
    public let place: MomentPlaceChoiceDTO?
    /// A pin is possible here (false at home).
    public let canPin: Bool
    /// The "Share later" times on offer now ("In 1 hour", "In 3 hours", "Tonight at 8" before 7 pm).
    public let shareLater: [MomentShareLaterDTO]

    private enum CodingKeys: String, CodingKey {
        case sky, area, place
        case canPin = "can_pin"
        case shareLater = "share_later"
    }

    /// Nil unless the server said `sky: true`.
    init?(from decoder: any Decoder) {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self),
              (try? c.decodeIfPresent(Bool.self, forKey: .sky)) == true else { return nil }
        area = try? c.decodeIfPresent(MomentSkyAreaDTO.self, forKey: .area)
        place = (try? c.decodeIfPresent(MomentPlaceChoiceDTO.self, forKey: .place))
            .flatMap { $0.key.isEmpty || $0.label.isEmpty ? nil : $0 }
        canPin = (try? c.decodeIfPresent(Bool.self, forKey: .canPin)) ?? false
        shareLater = ((try? c.decodeIfPresent([MomentShareLaterDTO].self, forKey: .shareLater)) ?? [])
            .filter { !$0.key.isEmpty && !$0.label.isEmpty }
    }
}

/// The area a point floats over: its town, the area's own point and the disc around it.
public struct MomentSkyAreaDTO: Decodable, Sendable, Hashable {
    public let label: String
    public let latitude: Double
    public let longitude: Double
    public let radiusM: Double

    private enum CodingKeys: String, CodingKey {
        case label, latitude, longitude
        case radiusM = "radius_m"
    }
}

/// One "Share later" choice: `1h`, `3h` or `tonight`, its words and when it would share (ISO).
public struct MomentShareLaterDTO: Decodable, Sendable, Hashable {
    public let key: String
    public let label: String
    public let at: String
}

/// A Moment's Sky fields (v4.0): floating over an area, shared later, and for its author when it shares.
public struct MomentSkyStateDTO: Sendable, Hashable {
    /// It floats over an area (its point is the area's).
    public let floating: Bool
    /// The disc around a floating Moment's point.
    public let radiusM: Double?
    /// It was shared later: "Earlier today" (or "Yesterday") in place of "12m ago".
    public let earlier: Bool
    /// For its author only: when it shares (or shared).
    public let shareAt: String?

    private enum CodingKeys: String, CodingKey {
        case floating, area, earlier
        case shareAt = "share_at"
    }

    private enum AreaKeys: String, CodingKey {
        case radiusM = "radius_m"
    }

    init(from decoder: any Decoder) {
        let c = try? decoder.container(keyedBy: CodingKeys.self)
        floating = (try? c?.decodeIfPresent(Bool.self, forKey: .floating)) ?? false
        radiusM = try? c?.nestedContainer(keyedBy: AreaKeys.self, forKey: .area).decodeIfPresent(Double.self, forKey: .radiusM)
        earlier = (try? c?.decodeIfPresent(Bool.self, forKey: .earlier)) ?? false
        shareAt = try? c?.decodeIfPresent(String.self, forKey: .shareAt)
    }
}
