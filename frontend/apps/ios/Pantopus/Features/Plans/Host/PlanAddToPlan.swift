//
//  PlanAddToPlan.swift
//  Pantopus
//
//  Plans for the holidays, board 3 (Details): the host form's "Add to this
//  plan" card for a private plan. Each extra is a row of its own with a small
//  tile, a name, a line under it and a switch, all off unless the plan needs
//  them; only what is switched on shows on the plan. H1 adds "Kids welcome".
//  "Let guests pick the date", "Chip in" and "Gift exchange" on the board are
//  later steps and are not built.
//

import SwiftUI

struct PlanAddToPlanCard: View {
    @Bindable var model: PlanComposerModel

    var body: some View {
        PlanFormField(label: "Add to this plan") {
            PlanFormCard {
                PlanExtraSwitchRow(
                    icon: .users,
                    title: "Kids welcome",
                    subtitle: "Guests say how many adults and kids",
                    isOn: Binding(get: { model.privacy.kidsWelcome }, set: { model.privacy.kidsWelcome = $0 })
                )
                .accessibilityIdentifier("planKidsWelcome")
            }
            PlanScopeLine(text: "Only what you switch on shows on the plan. Everything else stays out of the way.", icon: .info)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planAddToPlan")
    }
}

/// One row of "Add to this plan": a 36 pt tile on the quiet surface, a name, a line under it, a switch.
struct PlanExtraSwitchRow: View {
    let icon: PantopusIcon
    let title: String
    let subtitle: String
    @Binding var isOn: Bool
    /// The tile's colors; the quiet surface unless the extra has its own (the bring list takes the kind's).
    var tint: Color = Theme.Color.appSurfaceSunken
    var ink: Color = Theme.Color.appTextStrong

    var body: some View {
        Toggle(isOn: $isOn) {
            HStack(spacing: Spacing.s3) {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(tint)
                    .frame(width: 36, height: 36)
                    .overlay(Icon(icon, size: 18, color: ink))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    Text(subtitle)
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(Theme.Color.successSolid)
        .padding(.vertical, Spacing.s2)
        .frame(minHeight: 56)
    }
}
