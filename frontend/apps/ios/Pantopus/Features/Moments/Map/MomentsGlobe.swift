//
//  MomentsGlobe.swift
//  Pantopus
//
//  Zoomed out far, the Moments map is a globe you can turn (founder,
//  2026-11-16). Apple's map draws a globe for apps only in its satellite
//  styles: the drawn map stays flat at every zoom, with or without realistic
//  elevation (measured in the simulator, 2026-11-16). So the map keeps its
//  drawn look close in and switches to satellite with place labels once the
//  view is wider than the server shows Moments for, about 300 miles
//  (`MAX_MAP_SPAN_DEGREES`, backend/services/moments/momentStore.js). It
//  switches out a little past that width and back a little before it, so a
//  map resting at the edge doesn't flip, and a short fade covers the moment
//  the new style loads. There are no Moments to draw out there until the
//  Sky's levels, so the bottom card says to zoom in instead of "nothing
//  here". Close in, nothing changes: same style, same pins, same elevation
//  view.
//

import MapKit
import SwiftUI

enum MomentsGlobe {
    /// The server reads no Moments for a view wider than this, in degrees.
    static let widestSpan = 5.0
    /// The globe comes in a little past that and goes a little before it, so the map doesn't flip back and forth at
    /// the edge.
    static let enterSpan = 6.0
    static let leaveSpan = 4.5

    /// Satellite with labels, and realistic elevation: the style that turns into a globe.
    static var style: MapStyle {
        .hybrid(elevation: .realistic, pointsOfInterest: .excludingAll)
    }

    /// The fade over the switch, in seconds: in, held while the new style loads, out.
    static let coverIn = 0.12
    static let coverHold = 0.45
    static let coverOut = 0.35

    static func widest(_ span: MKCoordinateSpan) -> Double {
        max(span.latitudeDelta, span.longitudeDelta)
    }

    /// The area pill zoomed out to a globe: the country under the middle of the map, or "The world" over the sea.
    static func countryName(at point: CLLocation) async -> String {
        let placemark = try? await CLGeocoder().reverseGeocodeLocation(point).first
        return placemark?.country ?? "The world"
    }
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
    /// Wider than the server shows Moments for.
    static func isTooWide(_ span: MKCoordinateSpan) -> Bool {
        MomentsGlobe.widest(span) > MomentsGlobe.widestSpan
    }
}

extension MomentsMapView {
    /// Followed while the camera moves, so the globe comes in as the map zooms out, not after it stops.
    func followGlobe(_ region: MKCoordinateRegion) {
        let widest = MomentsGlobe.widest(region.span)
        let next = wantsGlobe ? widest > MomentsGlobe.leaveSpan : widest > MomentsGlobe.enterSpan
        guard next != wantsGlobe else { return }
        wantsGlobe = next
        switchStyle(toGlobe: next)
    }

    /// The cover fades in, the style changes under it, and it fades out once the new style has had time to load.
    /// Black toward the globe (it hangs in space), the screen's own background back toward the drawn map. A switch
    /// asked for while one is under way takes over from it.
    private func switchStyle(toGlobe: Bool) {
        globeSwitch += 1
        let turn = globeSwitch
        globeCoverIsSpace = toGlobe
        withAnimation(.easeIn(duration: MomentsGlobe.coverIn)) { globeCover = 1 }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(MomentsGlobe.coverIn))
            guard turn == globeSwitch else { return }
            showsGlobe = toGlobe
            try? await Task.sleep(for: .seconds(MomentsGlobe.coverHold))
            guard turn == globeSwitch else { return }
            withAnimation(.easeOut(duration: MomentsGlobe.coverOut)) { globeCover = 0 }
        }
    }

    /// Drawn over the map only while the style changes; it never takes a touch.
    var globeCoverView: some View {
        (globeCoverIsSpace ? Color.black : Theme.Color.appBg)
            .opacity(globeCover)
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
