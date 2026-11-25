//
//  MomentsPostMap.swift
//  Pantopus
//
//  The Post sheet's small map (boards P3 and P4): your ring on the pin, or
//  the area's circle (the Sky's disc at home). A tap opens it full screen
//  (`MomentsPostFullMap.swift`, founder 2026-11-24); the full-screen map
//  draws the same marks.
//

import MapKit
import SwiftUI

/// The small map at the top of the sheet: your ring on the pin, or the area's circle. With `fullMap` a tap opens it full
/// screen (`MomentsPostFullMap`, founder 2026-11-24), and a corner sign says so.
struct MomentsPostMap: View {
    let pin: CLLocationCoordinate2D?
    let showArea: Bool
    /// The Sky: a floating Moment's area (its own point and radius), drawn in place of the circle around the pin.
    var disc: (center: CLLocationCoordinate2D, radiusM: Double)?
    let me: MomentAuthorDTO?
    /// What shows while there's no pin.
    let placeholder: String
    var height: CGFloat = 150
    /// The place as others will read it, under the full-screen map; nil keeps the map from opening.
    var fullMap: MomentsPostFullMap.Place?
    @State private var showsFullMap = false

    var body: some View {
        if let pin, let fullMap {
            Button { showsFullMap = true } label: {
                framed
                    .overlay(alignment: .topTrailing) { expandSign.padding(Spacing.s2) }
                    .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(showArea ? "Map with the area around your pin" : "Map with your pin")
            .accessibilityHint("Opens the map full screen")
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("moments.post.map")
            .fullScreenCover(isPresented: $showsFullMap) {
                MomentsPostFullMap(pin: pin, showArea: showArea, disc: disc, me: me, place: fullMap)
            }
        } else {
            framed
                .allowsHitTesting(false)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(showArea ? "Map with the area around your pin" : "Map with your pin")
                .accessibilityIdentifier("moments.post.map")
        }
    }

    private var framed: some View {
        Group {
            if let pin {
                let region = Self.region(around: pin, showArea: showArea, disc: disc, height: height)
                Map(initialPosition: .region(region), interactionModes: []) {
                    Self.marks(pin: pin, showArea: showArea, disc: disc, me: me)
                }
                .mapStyle(.standard(pointsOfInterest: .excludingAll))
                .id("\(pin.latitude),\(pin.longitude),\(showArea),\(disc?.radiusM ?? 0)")
                // The map stays still: a tap opens it full screen, a drag scrolls the sheet.
                .allowsHitTesting(false)
            } else {
                Theme.Color.appSurfaceSunken
                    .overlay(Text(placeholder).font(.system(size: 14)).foregroundStyle(Theme.Color.appTextSecondary))
            }
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
    }

    /// The corner sign that the map opens bigger.
    private var expandSign: some View {
        Icon(.maximize, size: 14, strokeWidth: 2.2, color: Theme.Color.appText)
            .frame(width: 28, height: 28)
            .background(Circle().fill(Theme.Color.appSurface.opacity(0.94)))
            .overlay(Circle().stroke(Theme.Color.appBorder, lineWidth: 1))
            .shadow(color: .black.opacity(0.12), radius: 3, x: 0, y: 2)
            .accessibilityHidden(true)
    }

    /// Your ring on the pin, or the area's circle: the small map's and the full-screen map's.
    @MapContentBuilder
    static func marks(
        pin: CLLocationCoordinate2D,
        showArea: Bool,
        disc: (center: CLLocationCoordinate2D, radiusM: Double)?,
        me: MomentAuthorDTO?
    ) -> some MapContent {
        if showArea {
            MapCircle(center: disc?.center ?? pin, radius: disc?.radiusM ?? 800)
                .foregroundStyle(Theme.Color.primary500.opacity(0.18))
                .stroke(Theme.Color.primary500.opacity(0.6), lineWidth: 1.5)
        } else {
            Annotation("", coordinate: pin, anchor: UnitPoint(x: 0.5, y: 55.0 / 56.0)) {
                MomentsPostSelfPin(me: me)
            }
            .annotationTitles(.hidden)
        }
    }

    /// Where the map looks. `wide` is the full-screen map's: an exact pin shows a few streets around it.
    static func region(
        around pin: CLLocationCoordinate2D,
        showArea: Bool,
        disc: (center: CLLocationCoordinate2D, radiusM: Double)?,
        height: CGFloat,
        wide: Bool = false
    ) -> MKCoordinateRegion {
        // The Sky's disc fills about three quarters of the map's height.
        if let disc {
            let span = max(0.004, disc.radiusM * 2 / 0.72 / 111_000)
            return MKCoordinateRegion(center: disc.center, span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span))
        }
        let span = showArea ? 0.03 : wide ? 0.008 : 0.004
        // The pin's head stands above its point: a little south keeps it in the middle (as far as on the 150-pt map on
        // a taller one, the table's 407, board T5).
        let south = showArea ? 0 : span * 0.12 * min(1, 150 / height)
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: pin.latitude + south, longitude: pin.longitude),
            span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
        )
    }
}

/// Your face in the sky-to-green ring, on a pin like the map's.
struct MomentsPostSelfPin: View {
    let me: MomentAuthorDTO?

    var body: some View {
        ZStack(alignment: .top) {
            Circle().fill(Color.white).frame(width: 47, height: 47).offset(y: 0.5)
            Circle()
                .inset(by: 2.5)
                .stroke(MomentsPalette.ringGradient, lineWidth: 3)
                .frame(width: 48, height: 48)
            MomentSelfFace(author: me, size: 36)
                .offset(y: 6)
        }
        .frame(width: 48, height: 56, alignment: .top)
        .overlay(alignment: .bottom) {
            Path { path in
                path.move(to: CGPoint(x: 18, y: 0))
                path.addLine(to: CGPoint(x: 24, y: 11))
                path.addLine(to: CGPoint(x: 30, y: 0))
                path.closeSubpath()
            }
            .fill(Color.white)
            .frame(width: 48, height: 12)
        }
        .compositingGroup()
        .shadow(color: .black.opacity(0.3), radius: 1.5, x: 0, y: 2)
    }
}
