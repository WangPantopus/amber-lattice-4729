//
//  MapGlobe.swift
//  Pantopus
//
//  Zoomed out far, a map is a globe you can turn (founder, 2026-11-16: the
//  Moments map, then the Pulse map). Apple's map draws a globe for apps only
//  in its satellite styles: the drawn map stays flat at every zoom, with or
//  without realistic elevation (measured in the simulator, 2026-11-16). So a
//  map keeps its drawn look close in and switches to satellite with place
//  labels once the view is wider than `enterSpan`, about 400 miles across.
//  It switches back once the view is narrower than `leaveSpan`, a little
//  before that, so a map resting at the edge doesn't flip, and a short fade
//  covers the moment the new style loads. Close in, nothing changes: same
//  style, same pins.
//
//  A map keeps one `MapGlobe` in its state, puts `.mapGlobe(_:closeIn:)` on
//  its `Map` in place of `.mapStyle`, and hands the camera's region to
//  `follow(_:)` from its `.onMapCameraChange(frequency: .continuous)`.
//

import MapKit
import SwiftUI

@MainActor
@Observable
final class MapGlobe {
    /// Wider than this, in degrees, the globe comes in; narrower than `leaveSpan` it goes. Apart, so the map doesn't
    /// flip back and forth at the edge.
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

    /// The camera is out where the globe shows; set as it moves.
    private(set) var wantsGlobe = false
    /// The globe's style is on the map: follows `wantsGlobe` under the cover.
    private(set) var showsGlobe = false
    /// How much the cover hides the map: 1 while the style changes, 0 otherwise.
    fileprivate var cover = 0.0
    /// Black toward the globe (it hangs in space), the screen's own background back toward the drawn map.
    fileprivate var coverIsSpace = true
    /// Counts switches, so one asked for while another is under way takes over from it.
    @ObservationIgnored private var turn = 0

    /// Followed while the camera moves, so the globe comes in as the map zooms out, not after it stops.
    func follow(_ region: MKCoordinateRegion) {
        let widest = Self.widest(region.span)
        let next = wantsGlobe ? widest > Self.leaveSpan : widest > Self.enterSpan
        guard next != wantsGlobe else { return }
        wantsGlobe = next
        switchStyle(toGlobe: next)
    }

    /// A camera move of the map's own that starts on the globe and ends close in keeps the globe's style until it
    /// settles: MapKit stops a camera animation when the style changes under it. The satellite imagery close in takes
    /// a moment to load, so the cover comes in as the move lands, `seconds` from now, and the style changes under it
    /// when the map follows the settled camera. Should the map stay on the globe, the cover goes again.
    func coverLanding(in seconds: Double) {
        guard wantsGlobe else { return }
        let thisTurn = turn
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(max(seconds - Self.coverIn, 0)))
            guard thisTurn == turn, wantsGlobe else { return }
            coverIsSpace = false
            withAnimation(.easeIn(duration: Self.coverIn)) { cover = 1 }
            try? await Task.sleep(for: .seconds(Self.coverIn + Self.coverHold + 1))
            guard thisTurn == turn else { return }
            withAnimation(.easeOut(duration: Self.coverOut)) { cover = 0 }
        }
    }

    /// The cover fades in, the style changes under it, and it fades out once the new style has had time to load.
    private func switchStyle(toGlobe: Bool) {
        turn += 1
        let thisTurn = turn
        coverIsSpace = toGlobe
        withAnimation(.easeIn(duration: Self.coverIn)) { cover = 1 }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(Self.coverIn))
            guard thisTurn == turn else { return }
            showsGlobe = toGlobe
            try? await Task.sleep(for: .seconds(Self.coverHold))
            guard thisTurn == turn else { return }
            withAnimation(.easeOut(duration: Self.coverOut)) { cover = 0 }
        }
    }
}

extension View {
    /// On a `Map`, in place of `.mapStyle`: `closeIn` close in, the satellite globe zoomed far out (`MapGlobe`).
    func mapGlobe(_ globe: MapGlobe, closeIn: MapStyle) -> some View {
        mapStyle(globe.showsGlobe ? MapGlobe.style : closeIn)
            .overlay { MapGlobeCover(globe: globe) }
    }
}

/// Drawn over the map only while the style changes; it never takes a touch.
private struct MapGlobeCover: View {
    let globe: MapGlobe

    var body: some View {
        (globe.coverIsSpace ? Color.black : Theme.Color.appBg)
            .opacity(globe.cover)
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
