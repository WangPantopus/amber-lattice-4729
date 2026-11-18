//
//  GuidanceTipsView.swift
//  Pantopus
//
//  "Tips for each screen" (GUIDE spec §4; founder decision 2 on the
//  drawings: inside Help & Support, so the side menu stays as it is). A plain
//  list of the tab cards that are on for this account, each by its title; a
//  tap shows that centre card again, which doesn't count as seen.
//

import SwiftUI

struct GuidanceTipsView: View {
    let onBack: () -> Void

    var body: some View {
        ContentDetailShell(
            title: "Tips for each screen",
            onBack: onBack,
            header: { EmptyView() },
            body: { list }
        )
        .background(Theme.Color.appBg)
    }

    private var list: some View {
        VStack(spacing: Spacing.s2) {
            ForEach(GuidanceCenter.shared.tipCards, id: \.self) { id in
                if let card = GuidanceCatalog.centre(id) {
                    GuidanceTipRow(title: card.title) { GuidanceCenter.shared.replay(id) }
                        .accessibilityIdentifier("guidance.tips.\(id.rawValue)")
                }
            }
        }
        .padding(.horizontal, Spacing.s4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("guidance.tips")
    }
}

/// One row of Help: a title and a chevron on the FAQ's card.
struct GuidanceTipRow: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.s3) {
                Text(title)
                    .scaledFont(15, weight: .semibold)
                    .foregroundStyle(Theme.Color.appText)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Icon(.chevronRight, size: 16, strokeWidth: 2.25, color: Theme.Color.appTextMuted)
            }
            .padding(Spacing.s4)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(Theme.Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

extension GuidanceCenter {
    /// The tab cards that are on for this account (1, 3, 4, 5, 6, 7; 2 once Place has shown an address).
    var tipCards: [GuidanceCardID] {
        var ids: [GuidanceCardID] = [.welcome]
        if record.has(.placeHasAddress) || record.hasSeen(.placeSaved) { ids.append(.placeSaved) }
        ids.append(.tabToday)
        if LaunchFeatures.mailbox { ids.append(.tabMail) }
        ids.append(.tabPulse)
        if MomentsFlags.shared.moments { ids.append(.tabMoments) }
        if PlansFlags.shared.plans { ids.append(.tabPlans) }
        return ids
    }
}
