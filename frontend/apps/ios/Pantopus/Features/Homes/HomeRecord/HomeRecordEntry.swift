//
//  HomeRecordEntry.swift
//  Pantopus
//
//  The ways into the record page (a row on the lookup result and on the Home
//  profile) and where the page's own app links lead.
//

import SwiftUI

/// The obvious way in: one card-shaped button. It only navigates; the screen it
/// sits on makes no extra request for it.
struct HomeRecordEntryButton: View {
    let title: String
    let line: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.s3) {
                PlaceIconTile(icon: .fileText, tone: .sky, size: 36)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.primaryInk)
                    Text(line)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                PlaceChevron()
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, Spacing.s3)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            .background(Theme.Color.appSurface, in: RoundedRectangle(cornerRadius: Radii.xl, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radii.xl, style: .continuous)
                    .strokeBorder(Theme.Color.primary200, lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.04), radius: 3, x: 0, y: 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

/// Where an app link on the record page leads. The page's links are the
/// server's (`promise.button`, `promise.alt`, an action): the claim and
/// verification steps for a Home, the record itself, and the two id-less steps
/// of a looked-up address, which has no Home to claim until it is added.
enum HomeRecordLinkTarget: Equatable {
    case record(homeId: String)
    case claimOwnership(homeId: String)
    case verifyResidency(homeId: String)
    case waitingRoom(homeId: String)
    /// `/homes/claim-owner` and `/homes/verify-address` on a lookup.
    case addLookedUpHome
    /// Anything else the app's link router opens.
    case other(path: String)

    static func resolve(_ path: String) -> HomeRecordLinkTarget {
        let bare = path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? path
        var segments = bare.split(separator: "/").map(String.init)
        if segments.first == "app" { segments.removeFirst() }
        guard segments.first == "homes", segments.count >= 2 else { return .other(path: path) }
        if segments.count == 2, segments[1] == "claim-owner" || segments[1] == "verify-address" {
            return .addLookedUpHome
        }
        let homeId = segments[1]
        // The web's claim page: on the record page it starts the claim (a push with the
        // same link opens a claim already sent, which the record sends as `waiting-room`).
        if segments.count == 4, segments[2] == "claim-owner", segments[3] == "evidence" {
            return .claimOwnership(homeId: homeId)
        }
        guard segments.count == 3 else { return .other(path: path) }
        switch segments[2] {
        case "record": return .record(homeId: homeId)
        case "claim-owner": return .claimOwnership(homeId: homeId)
        case "verify-residency": return .verifyResidency(homeId: homeId)
        case "waiting-room": return .waitingRoom(homeId: homeId)
        default: return .other(path: path)
        }
    }
}

/// The address a record page over the lookup was opened for.
struct HomeRecordLookup: Identifiable {
    let address: String
    var id: String {
        address
    }
}

extension View {
    /// "This home's record" over a lookup result: the signed-out lookup has no
    /// navigation stack. A link on the page closes it first; `onLink` gets the
    /// link and the address once it has closed.
    func homeRecordCover(_ lookup: Binding<HomeRecordLookup?>, onLink: @escaping (String, String) -> Void) -> some View {
        modifier(HomeRecordCover(lookup: lookup, onLink: onLink))
    }
}

private struct HomeRecordCover: ViewModifier {
    @Binding var lookup: HomeRecordLookup?
    let onLink: (String, String) -> Void
    @State private var afterClose: (() -> Void)?

    func body(content: Content) -> some View {
        content.fullScreenCover(
            item: $lookup,
            onDismiss: {
                let next = afterClose
                afterClose = nil
                next?()
            },
            content: { shown in
                HomeRecordView(
                    source: .lookup(address: shown.address),
                    onBack: { lookup = nil },
                    onOpenAppLink: { link in
                        afterClose = { onLink(link, shown.address) }
                        lookup = nil
                    }
                )
                .readableColumn()
            }
        )
    }
}
