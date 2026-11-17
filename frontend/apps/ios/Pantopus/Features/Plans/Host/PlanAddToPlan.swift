//
//  PlanAddToPlan.swift
//  Pantopus
//
//  Plans for the holidays, board 3 (Details): the host form's "Add to this
//  plan" card for a private plan. Each extra is a row of its own with a small
//  tile, a name, a line under it and a switch, all off unless the plan needs
//  them; only what is switched on shows on the plan. H1 adds "Kids welcome",
//  H2 "Bring list". The extras (board 26) each add a card of their own under
//  it: "Let guests pick the date" (PlanFindDateForm.swift) and "Chip in"
//  (PlanChipInForm.swift), each behind its own switch.
//

import SwiftUI

struct PlanAddToPlanCard: View {
    @Bindable var model: PlanComposerModel
    /// Opens the bring list (board 19).
    var onBringList: () -> Void = {}

    var body: some View {
        PlanFormField(label: "Add to this plan") {
            if model.offersBringList || model.offersGuestAnswers { shippedRows }
            // Board 26: each extra its own card, with its line under it.
            if model.offersFindDate { PlanFindDateFormCard(model: model) }
            if model.offersChipIn { PlanChipInFormCard(draft: Bindable(model.privacy).chipIn) }
            PlanScopeLine(text: "Only what you switch on shows on the plan. Everything else stays out of the way.", icon: .info)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planAddToPlan")
    }

    /// "Bring list" and "Kids welcome" (H1, H2), in one card.
    private var shippedRows: some View {
        PlanFormCard {
            if model.offersBringList {
                PlanExtraSwitchRow(
                    icon: .list,
                    title: "Bring list",
                    subtitle: bringSubtitle,
                    isOn: Binding(get: { model.privacy.bring != nil }, set: { on in
                        model.privacy.bring = on ? PlanBringEditor() : nil
                        if on { onBringList() }
                    }),
                    tint: model.kind.tint,
                    ink: model.kind.color,
                    onTapRow: model.privacy.bring == nil ? nil : onBringList
                )
                .accessibilityIdentifier("planBringListRow")
            }
            if model.offersBringList, model.offersGuestAnswers { Divider().overlay(Theme.Color.appBorder) }
            if model.offersGuestAnswers {
                PlanExtraSwitchRow(
                    icon: .users,
                    title: "Kids welcome",
                    subtitle: "Guests say how many adults and kids",
                    isOn: Binding(get: { model.privacy.kidsWelcome }, set: { model.privacy.kidsWelcome = $0 })
                )
                .accessibilityIdentifier("planKidsWelcome")
            }
        }
    }

    /// "6 things · guests pick what they'll bring", or "Guests pick what they'll bring" while empty.
    private var bringSubtitle: String {
        let count = model.privacy.bring?.items.count ?? 0
        guard count > 0 else { return "Guests pick what they'll bring" }
        return "\(count == 1 ? "1 thing" : "\(count) things") · guests pick what they'll bring"
    }
}

/// One row of "Add to this plan": a 36 pt tile on the quiet surface, a name, a line under it, a switch. With
/// `onTapRow`, the tile and words open what the switch turned on (the bring list); the switch still switches.
struct PlanExtraSwitchRow: View {
    let icon: PantopusIcon
    let title: String
    let subtitle: String
    @Binding var isOn: Bool
    /// The tile's colors; the quiet surface unless the extra has its own (the bring list takes the kind's).
    var tint: Color = Theme.Color.appSurfaceSunken
    var ink: Color = Theme.Color.appTextStrong
    var onTapRow: (() -> Void)?

    var body: some View {
        Group {
            if let onTapRow {
                HStack(spacing: Spacing.s3) {
                    Button(action: onTapRow) { words.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()) }
                        .buttonStyle(.plain)
                        .accessibilityLabel(title)
                        .accessibilityValue(subtitle)
                        .accessibilityHint("Opens it")
                    Toggle(title, isOn: $isOn)
                        .labelsHidden()
                        .tint(Theme.Color.successSolid)
                        .accessibilityLabel(title)
                }
            } else {
                Toggle(isOn: $isOn) { words }
                    .tint(Theme.Color.successSolid)
            }
        }
        .padding(.vertical, Spacing.s2)
        .frame(minHeight: 56)
    }

    private var words: some View {
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
}
