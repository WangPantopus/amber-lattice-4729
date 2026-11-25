//
//  MomentsPostFullMap.swift
//  Pantopus
//
//  The Post sheet's small map, full screen (founder, 2026-11-24): a tap on
//  the map opens it over the Post screen, with the pin (or the area's circle)
//  where the Moment will show, on a map that pans, zooms and turns, so the
//  spot can be checked before posting. The place as others will read it sits
//  at the bottom, a button there brings the pin back to the middle, and the
//  back button at the top left returns to the Post screen just as it was.
//

import MapKit
import SwiftUI

struct MomentsPostFullMap: View {
    /// The place row's words: the name others will read, and "Exact" or "Area".
    struct Place: Equatable {
        let line: String
        let kind: String
        let atHome: Bool

        @MainActor
        init(model: MomentsComposerModel) {
            line = model.placeLine
            kind = MomentsPostSheet.placeKind(model)
            atHome = model.showsHomeNotice || model.skyAtHome
        }
    }

    let pin: CLLocationCoordinate2D
    let showArea: Bool
    var disc: (center: CLLocationCoordinate2D, radiusM: Double)?
    let me: MomentAuthorDTO?
    let place: Place
    @State private var position: MapCameraPosition
    @Environment(\.dismiss) private var dismiss

    init(
        pin: CLLocationCoordinate2D,
        showArea: Bool,
        disc: (center: CLLocationCoordinate2D, radiusM: Double)?,
        me: MomentAuthorDTO?,
        place: Place
    ) {
        self.pin = pin
        self.showArea = showArea
        self.disc = disc
        self.me = me
        self.place = place
        _position = State(initialValue: .region(Self.home(pin: pin, showArea: showArea, disc: disc)))
    }

    var body: some View {
        // The map runs under the clock and the home indicator; the buttons and the place stay inside the safe area.
        ZStack {
            Map(position: $position) {
                MomentsPostMap.marks(pin: pin, showArea: showArea, disc: disc, me: me)
            }
            .mapStyle(.standard(pointsOfInterest: .all))
            .mapControls {
                MapCompass()
                MapScaleView()
            }
            .ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                backButton
                    .padding(.leading, Spacing.s4)
                    .padding(.top, Spacing.s2)
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: Spacing.s3) {
                    recenterButton
                    placeCard
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.bottom, Spacing.s3)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.post.fullMap")
    }

    /// Where the map opens, and where the recenter button brings it back to.
    private static func home(
        pin: CLLocationCoordinate2D,
        showArea: Bool,
        disc: (center: CLLocationCoordinate2D, radiusM: Double)?
    ) -> MKCoordinateRegion {
        MomentsPostMap.region(around: pin, showArea: showArea, disc: disc, height: 800, wide: true)
    }

    private var backButton: some View {
        Button { dismiss() } label: {
            Icon(.chevronLeft, size: 22, strokeWidth: 2.4, color: Theme.Color.appText)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Theme.Color.appSurface))
                .overlay(Circle().stroke(Theme.Color.appBorder, lineWidth: 1))
                .shadow(color: .black.opacity(0.16), radius: 6, x: 0, y: 3)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Back")
        .accessibilityHint("Returns to your post")
        .accessibilityIdentifier("moments.post.fullMap.back")
    }

    private var recenterButton: some View {
        Button {
            withAnimation(.smooth(duration: 0.4)) {
                position = .region(Self.home(pin: pin, showArea: showArea, disc: disc))
            }
        } label: {
            Icon(.locateFixed, size: 18, strokeWidth: 2.2, color: Theme.Color.appText)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Theme.Color.appSurface))
                .overlay(Circle().stroke(Theme.Color.appBorder, lineWidth: 1))
                .shadow(color: .black.opacity(0.16), radius: 6, x: 0, y: 3)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(showArea ? "Show the area" : "Show the pin")
        .accessibilityIdentifier("moments.post.fullMap.recenter")
    }

    /// The place row's words: where others will read this Moment is.
    private var placeCard: some View {
        HStack(spacing: Spacing.s2) {
            Icon(place.atHome ? .home : .mapPin, size: 18, strokeWidth: 2.2, color: Theme.Color.primaryTint)
            Text(place.line)
                .font(.system(size: 15.5, weight: .semibold))
                .foregroundStyle(Theme.Color.appText)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(place.kind)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.appTextSecondary)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.Color.appSurface))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
        .shadow(color: .black.opacity(0.14), radius: 10, x: 0, y: 4)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("moments.post.fullMap.place")
    }
}
