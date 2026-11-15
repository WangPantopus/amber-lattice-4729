//
//  PlanTypePickerMore.swift
//  Pantopus
//
//  Plans step 4 on the type picker (board Type): with `plans_kinds` on, nine
//  kinds, the newer four tagged "New", the playdate after them, and
//  "Something else" as a full-width row under the grid.
//

import SwiftUI

extension PlanKind {
    /// Board Type's order with the newer kinds ("Something else" last, as its own row).
    static let typeOrderWithNewer: [PlanKind] = [
        .watchParty, .pickupGame, .walkCoffee, .studyGroup, .foodDrinks, .gameNight, .outdoors, .playdate, .somethingElse
    ]

    /// The type picker's kinds: today's five, or board Type's nine with `plans_kinds` on.
    static func typeOrder(withNewer: Bool) -> [PlanKind] {
        withNewer ? typeOrderWithNewer : displayOrder
    }
}

/// "New" beside a newer kind's name (board Type).
struct PlanNewTag: View {
    var body: some View {
        Text("New")
            .planFont(.caption)
            .fontWeight(.medium)
            .foregroundStyle(Theme.Color.primary700)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .frame(minHeight: 24)
            .background(Capsule().fill(Theme.Color.primary100))
            .fixedSize()
    }
}

/// Board Type's last row: "Something else", the whole width, with a chevron.
struct PlanSomethingElseRow: View {
    let onPick: () -> Void

    var body: some View {
        Button(action: onPick) {
            HStack(spacing: Spacing.s3) {
                PlanTile(kind: .somethingElse, size: 44, glyph: 24)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(PlanKind.somethingElse.title).planFont(.h4).foregroundStyle(Theme.Color.appText)
                        PlanNewTag()
                    }
                    Text(PlanKindsMore.blurb(.somethingElse))
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous).fill(Theme.Color.appSurface))
            .overlay(RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("planType.\(PlanKind.somethingElse.rawValue)")
    }
}
