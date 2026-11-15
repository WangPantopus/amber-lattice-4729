//
//  PlanAudienceField.swift
//  Pantopus
//
//  Board Details (Plans step 1): "Who can see this" with two radio rows,
//  "Anyone nearby" and "Only people I invite", and the line under them; for
//  a private plan, "Guests can bring a friend" in place of "How people get
//  in". A business's plan never shows either (it is never private).
//

import SwiftUI

struct PlanAudienceField: View {
    @Bindable var model: PlanComposerModel

    var body: some View {
        PlanFormField(label: "Who can see this") {
            PlanFormCard {
                row(
                    .nearby,
                    title: "Anyone nearby",
                    subtitle: "On the map and the list. People ask to join.",
                    identifier: "plansAudienceNearby"
                )
                Divider().overlay(Theme.Color.appBorder)
                row(
                    .invited,
                    title: "Only people I invite",
                    subtitle: "Private. Not on the map, the list or anywhere else.",
                    identifier: "plansAudienceInvited"
                )
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Who can see this")
            PlanScopeLine(
                text: "The people you invite get in right away. A private plan can be anywhere, up to 60 days ahead.",
                icon: .info
            )
        }
    }

    private func row(_ audience: PlanAudience, title: String, subtitle: String, identifier: String) -> some View {
        let isOn = model.privacy.audience == audience
        return Button { choose(audience) } label: {
            HStack(spacing: Spacing.s3) {
                PlanRadio(isOn: isOn)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    Text(subtitle)
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if audience == .invited {
                    Icon(.lock, size: 18, color: Theme.Color.appTextSecondary)
                }
            }
            .padding(.vertical, 10)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier(identifier)
    }

    private func choose(_ audience: PlanAudience) {
        model.privacy.audience = audience
        // Back to a public plan: a start further ahead than 14 days comes back within reach (the form's
        // `onChange(of: start)` keeps the length).
        let latest = Date().addingTimeInterval(TimeInterval(model.daysAhead) * 86400 - 60)
        if model.start > latest { model.start = latest }
    }
}

/// "Guests can bring a friend" (board Details), for a private plan.
struct PlanGuestsCanInviteRow: View {
    @Bindable var model: PlanComposerModel

    var body: some View {
        PlanSwitchRow(
            title: "Guests can bring a friend",
            subtitle: "Each person you invite may invite one more",
            isOn: Binding(get: { model.privacy.guestsCanInvite }, set: { model.privacy.guestsCanInvite = $0 })
        )
        .accessibilityIdentifier("plansGuestsCanInvite")
    }
}

/// The board's radio: a ring, filled in sky when chosen.
struct PlanRadio: View {
    let isOn: Bool

    var body: some View {
        Circle()
            .strokeBorder(isOn ? Theme.Color.primary600 : Theme.Color.appTextSecondary, lineWidth: 2)
            .frame(width: 24, height: 24)
            .overlay {
                if isOn { Circle().fill(Theme.Color.primary600).frame(width: 12, height: 12) }
            }
            .accessibilityHidden(true)
    }
}
