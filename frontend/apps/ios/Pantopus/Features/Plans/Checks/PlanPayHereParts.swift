//
//  PlanPayHereParts.swift
//  Pantopus
//
//  Plans for the holidays, the business track B5 (07-screens D2 and C3) on the
//  plan's own page. For a guest who is in: "Pay at {business}" (the card's
//  `pay_here.text`), opening C1; once their check is paid, a row "Paid
//  {$47.04}" with "Receipt", which opens C2; a new check brings the button
//  back. For the business's staff: the three totals over the Going list,
//  opening C3. Shown only while the card has `pay_here` (the switch is on for
//  the plan's business); without it the page is today's.
//

import SwiftUI

extension EnvironmentValues {
    /// Pushes a Plans screen on the tab's stack from inside the plan page (the check, the guest list).
    @Entry var planOpenRoute: (@MainActor (PlansRoute) -> Void)?
}

extension PlanCardDTO {
    /// B5: "Pay at {business}", for staff and guests who are in, while the plan's business has `plans_pay_here`.
    var payHere: PlanPayHereDTO? {
        businessPart?.payHere
    }

    /// B6: "Leave a tip for {business}?", for a guest who paid, from the plan's end for 7 days, once.
    var tipLater: PlanTipLaterDTO? {
        businessPart?.tipLater
    }
}

/// D2: the guest's way to the check, read from `GET …/checks/mine` when the plan opens.
struct PlanPayHereRow: View {
    let card: PlanCardDTO
    let payHere: PlanPayHereDTO

    @Environment(\.planOpenRoute) private var openRoute
    @State private var mine: PlanMyCheckResponse?

    var body: some View {
        Group {
            if let check = mine?.check, !check.isOpen {
                HStack(spacing: Spacing.s3) {
                    Icon(.checkCircle, size: 16, color: Theme.Color.success)
                    Text(check.paidTotalText ?? check.totalText)
                        .planFont(.smallStrong)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.appText)
                        .accessibilityIdentifier("planCheckPaidRow")
                    Spacer(minLength: Spacing.s2)
                    Button("Receipt") { openRoute?(.check(planId: card.id)) }
                        .planButton(.text, size: .extraSmall)
                        .fixedSize()
                        .accessibilityIdentifier("planCheckReceiptRow")
                }
                .accessibilityElement(children: .contain)
            } else {
                Button { openRoute?(.check(planId: card.id)) } label: {
                    // The business's name wraps at the largest text instead of being cut off.
                    HStack(spacing: Spacing.s2) {
                        Icon(.creditCard, size: 18, color: PlanButtonStyle.Kind.primary.foreground)
                        Text(payHere.text).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, Spacing.s2)
                }
                .planButton(.primary, size: .small)
                .accessibilityIdentifier("planPayAtBusiness")
            }
        }
        .task(id: card) {
            mine = try? await APIClient.shared.request(PlansEndpoints.myCheck(planId: card.id))
        }
    }
}

/// D2 without a deal: the same row in its own card.
struct PlanPayHereCard: View {
    let card: PlanCardDTO
    let payHere: PlanPayHereDTO

    var body: some View {
        PlanCardBox(padding: Spacing.s4) {
            PlanPayHereRow(card: card, payHere: payHere)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planPayHere")
    }
}

/// C3 on the host page: the three totals take the Going list's top; a tap opens the guest list with money.
struct PlanChecksEntryCard: View {
    let card: PlanCardDTO

    @Environment(\.planOpenRoute) private var openRoute
    @State private var totals: PlanChecksTotalsDTO?

    var body: some View {
        Button { openRoute?(.checks(planId: card.id)) } label: {
            PlanCardBox(padding: 14) {
                VStack(alignment: .leading, spacing: Spacing.s2) {
                    HStack {
                        Text.planOverline("Guest list and checks")
                        Spacer()
                        Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
                    }
                    if let totals {
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: Spacing.s4) { lines(totals) }
                            VStack(alignment: .leading, spacing: Spacing.s1) { lines(totals) }
                        }
                    } else {
                        Text("Send checks and see who paid")
                            .planFont(.small)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the guest list with checks")
        .accessibilityIdentifier("planChecksEntry")
        .task(id: card) {
            let list: PlanChecksListDTO? = try? await APIClient.shared.request(PlansEndpoints.checks(planId: card.id))
            totals = list?.totals
        }
    }

    private func lines(_ totals: PlanChecksTotalsDTO) -> some View {
        ForEach([totals.inText, totals.paidText, totals.tipsText], id: \.self) { text in
            let parts = PlanChecksTotalsDTO.split(text)
            (Text(parts.big).fontWeight(.semibold).foregroundStyle(Theme.Color.appText)
                + Text(" \(parts.small)").foregroundStyle(Theme.Color.appTextSecondary))
                .planFont(.small)
                .monospacedDigit()
                .fixedSize()
        }
    }
}

/// The Going list on the host page, with C3's totals on top while guests can pay here.
struct PlanHostGoingWithMoney<Going: View>: View {
    let card: PlanCardDTO
    @ViewBuilder let going: () -> Going

    var body: some View {
        if card.payHere != nil, card.state != .cancelled { PlanChecksEntryCard(card: card) }
        going()
    }
}
