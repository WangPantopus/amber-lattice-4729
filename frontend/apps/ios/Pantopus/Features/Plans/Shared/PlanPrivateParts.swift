//
//  PlanPrivateParts.swift
//  Pantopus
//
//  Plans step 1, private plans: the parts a private plan adds wherever a
//  plan shows. The "Private" chip beside the kind (cards, the plan page,
//  the preview), the small lock on a row's kind tile and on a pin, the
//  invited banner (board Invited), the empty state's "Plan with people you
//  know" (board Main), and the words they share. Everything here shows only
//  for a plan the server says is private, or with `plans_private` on.
//

import SwiftUI

/// "Private" with the lock, beside the kind tag (boards Preview and Invited).
struct PlanPrivateChip: View {
    var body: some View {
        HStack(spacing: 6) {
            Icon(.lock, size: 14, color: Theme.Color.appTextStrong)
            Text("Private")
                .planFont(.label)
                .foregroundStyle(Theme.Color.appTextStrong)
                .lineLimit(1)
        }
        .padding(.leading, 10)
        .padding(.trailing, Spacing.s3)
        .frame(minHeight: 30)
        .background(Capsule().fill(Theme.Color.appSurfaceSunken))
        .overlay(Capsule().strokeBorder(Theme.Color.appBorderStrong, lineWidth: 1))
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Private plan")
        .accessibilityIdentifier("planPrivateChip")
    }
}

/// The small lock on a private plan's kind tile and pin: the "Private" chip's colors in a ringed square.
struct PlanPrivateBadge: View {
    var size: CGFloat = 16

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
        shape
            .fill(Theme.Color.appSurfaceSunken)
            .overlay(shape.strokeBorder(Theme.Color.appBorderStrong, lineWidth: 1))
            .frame(width: size, height: size)
            .overlay(Icon(.lock, size: size * 0.6, strokeWidth: 2.4, color: Theme.Color.appTextStrong))
            .padding(2)
            .background(RoundedRectangle(cornerRadius: size * 0.28 + 2, style: .continuous).fill(Theme.Color.appSurface))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("private")
            .accessibilityIdentifier("planPrivateBadge")
    }
}

/// Board Invited: "Priya invited you" / "Only the people Priya invites can see this plan.", over a private
/// plan the viewer hasn't answered yet.
struct PlanInvitedBanner: View {
    let card: PlanCardDTO

    var body: some View {
        let host = PlanCardLines.hostName(card)
        HStack(spacing: Spacing.s3) {
            PlanAvatar(name: card.host.displayName, url: card.host.avatarUrl)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(host) invited you").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                Text("Only the people \(host) invites can see this plan.")
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, Spacing.s3)
        .background(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).fill(Theme.Color.infoBg))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("planInvitedBanner")
    }
}

/// Board Main: "Plan with people you know" under the watch-party nudge, opening the host flow on
/// "Only people I invite".
struct PlanPrivateStartRow: View {
    let action: @MainActor () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.s3) {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Theme.Color.appSurface)
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.Color.appBorderStrong, lineWidth: 1))
                    .frame(width: 40, height: 40)
                    .overlay(Icon(.lock, size: 20, color: Theme.Color.appTextStrong))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Plan with people you know")
                        .planFont(.bodyStrong)
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.leading)
                    Text("Private: only the people you invite see it")
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.Color.appSurfaceSunken))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("plansPrivateStart")
    }
}

/// The words private plans share (the same on Android).
enum PlanPrivateCopy {
    /// Board Preview, under the buttons.
    static let previewScope = "Not on the map, the list or Today. A link works for one person; passed on, "
        + "it says only \u{201C}This plan is private.\u{201D}"
    /// At the host's home, in the preview and under "My place".
    static let homeScope = "People you invite see your address once they say they're in."
    /// H6's last line: where the host can host (a private plan: anywhere).
    static func pickerFoot(isPrivate: Bool) -> String {
        isPrivate
            ? "A private plan can be anywhere. Can't find the place here? Pick it on the map."
            : "You can host within 3 miles of where you live or where you are now."
    }

    /// Under "My place": who sees the host's address.
    static func homeLine(isPrivate: Bool) -> String {
        isPrivate ? homeScope : "Only people you accept see your address. Everyone else sees the area."
    }

    /// The host's page with nobody in yet: a private plan's people say they're in, nobody asks.
    static func nobodyYet(isPrivate: Bool) -> String {
        isPrivate ? "Nobody yet. We'll tell you when someone says they're in." : "Nobody yet. We'll tell you when someone asks."
    }

    static let mapPickHint = "Tap a park, café or other place the map shows. A private plan can be anywhere."

    /// "Heritage Park, Camas · about 2 mi" (board Invited), for the person invited to a private plan at a public place.
    static func whereLine(_ card: PlanCardDTO, place: PlanPlaceDTO) -> String {
        let name = place.name ?? card.area.label
        let city = card.area.city.flatMap { city in name.localizedCaseInsensitiveContains(city) ? nil : city }
        return [[name, city].compactMap { $0 }.joined(separator: ", "), PlanFormat.distance(card.distanceBand)]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
}
