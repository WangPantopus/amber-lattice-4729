//
//  MomentsGlobe.swift
//  Pantopus
//
//  Zoomed out far, the Moments map is a globe you can turn (founder,
//  2026-11-16). The globe itself, its style, the fade and when it comes in,
//  is shared with the Pulse map (`MapGlobe`, Features/Shared/Map). It comes
//  in a little past the widest view the server shows Moments for, about 300
//  miles (`MAX_MAP_SPAN_DEGREES`, backend/services/moments/momentStore.js).
//  There are no Moments to draw out there until the Sky's levels, so the
//  bottom card says to zoom in instead of "nothing here", and the area pill
//  names the country. Close in, nothing changes: same style, same pins, same
//  elevation view.
//

import MapKit
import SwiftUI

enum MomentsGlobe {
    /// The server reads no Moments for a view wider than this, in degrees. The globe comes in a little past it
    /// (`MapGlobe.enterSpan`).
    static let widestSpan = 5.0
}

/// Zoomed out past where Moments show: not "nothing here", since the server only reads a view about 300 miles across
/// or less.
struct MomentsZoomInCard: View {
    let onBack: @MainActor () -> Void

    var body: some View {
        MomentsMapCard(
            icon: .globe,
            title: "Zoom in to see Moments",
            line: "Moments show when the map is about 300 miles across or less.",
            button: "Back to near you",
            buttonIcon: nil,
            buttonId: "moments.zoomIn.back",
            action: onBack
        )
        .accessibilityIdentifier("moments.zoomIn")
    }
}

extension MomentsMapViewModel {
    /// The area pill close in. "Downtown Vancouver": the neighborhood and the town, or the town alone.
    static func areaName(at point: CLLocation) async -> String? {
        guard let placemark = try? await CLGeocoder().reverseGeocodeLocation(point).first else { return nil }
        let town = placemark.locality ?? placemark.subAdministrativeArea
        // A long neighborhood name from the geocoder reads badly in the pill: the town alone then.
        guard let neighborhood = placemark.subLocality, neighborhood.count <= 20 else { return town }
        if let town, !neighborhood.contains(town) { return "\(neighborhood) \(town)" }
        return neighborhood
    }

    /// The area pill zoomed out to a globe: the country under the middle of the map, or "The world" over the sea.
    static func countryName(at point: CLLocation) async -> String {
        let placemark = try? await CLGeocoder().reverseGeocodeLocation(point).first
        return placemark?.country ?? "The world"
    }

    /// Wider than the server shows Moments for.
    static func isTooWide(_ span: MKCoordinateSpan) -> Bool {
        MapGlobe.widest(span) > MomentsGlobe.widestSpan
    }
}
