//
//  PlanTipLaterCard.swift
//  Pantopus
//
//  Plans for the holidays, the business track B6 (07-screens C4): on the page
//  of a paid plan that is over, for a guest who paid, for 7 days and once, a
//  quiet card "Leave a tip for {business}?" with the server's three choices
//  (percents of what they paid), "Another amount" and the pay button. Paying
//  asks the server for the payment (`POST …/tip`), opens the shipped payment
//  sheet, then confirms (`…/tip/confirm`), whose words show: "You tipped $5.00".
//

import SwiftUI

struct PlanTipLaterCard: View {
    let card: PlanCardDTO
    let tipLater: PlanTipLaterDTO

    @State private var chosen: Int?
    @State private var otherCents: Int?
    @State private var asksOther = false
    @State private var typed = ""
    @State private var isPaying = false
    @State private var problem: String?
    @State private var done: String?

    var body: some View {
        PlanCardBox(padding: Spacing.s4) {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                if let done {
                    HStack(spacing: Spacing.s2) {
                        Icon(.checkCircle, size: 18, color: Theme.Color.success)
                        Text(done).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("planTipLaterDone")
                } else {
                    Text("Leave a tip for \(card.business?.name ?? "the business")?")
                        .planFont(.bodyStrong)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    choices
                    if let problem { PlanDealFieldError(text: problem) }
                    Button(action: pay) {
                        PlanButtonLabel(title: payTitle, kind: .primary, isLoading: isPaying)
                    }
                    .planButton(.primary, size: .small)
                    .disabled(amountCents == nil || isPaying)
                    .accessibilityIdentifier("planTipLaterPay")
                }
            }
        }
        .alert("Another amount", isPresented: $asksOther) {
            TextField("Tip in dollars", text: $typed)
                .keyboardType(.decimalPad)
                .accessibilityIdentifier("planTipLaterOtherField")
            Button("Choose") {
                if let cents = PlanDealDraft.cents(typed) {
                    otherCents = cents
                    chosen = nil
                    problem = nil
                } else {
                    problem = "Type a tip in dollars."
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planTipLater")
    }

    private var choices: some View {
        VStack(spacing: Spacing.s2) {
            HStack(spacing: Spacing.s2) {
                ForEach(Array(tipLater.choices.enumerated()), id: \.offset) { index, choice in
                    chip(selected: chosen == index, title: choice.label, subtitle: choice.tipText, identifier: "planTipLater.\(index)") {
                        chosen = index
                        otherCents = nil
                        problem = nil
                    }
                }
            }
            chip(selected: otherCents != nil, title: "Another amount", subtitle: nil, identifier: "planTipLater.other") {
                typed = ""
                asksOther = true
            }
        }
    }

    private func chip(selected: Bool, title: String, subtitle: String?, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(title).planFont(.bodyStrong)
                if let subtitle { Text(subtitle).planFont(.footnote).monospacedDigit() }
            }
            .foregroundStyle(selected ? Theme.Color.primaryInk : Theme.Color.appText)
            .frame(maxWidth: .infinity, minHeight: subtitle == nil ? 44 : 54)
            .background(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                .fill(selected ? Theme.Color.primary50 : Theme.Color.appSurface))
            .overlay(
                RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                    .stroke(selected ? Theme.Color.primary600 : Theme.Color.appBorder, lineWidth: selected ? 1.5 : 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier(identifier)
    }

    /// The tip asked for: a choice's own `tip_cents`, or the typed amount (the server checks it).
    private var amountCents: Int? {
        if let chosen, tipLater.choices.indices.contains(chosen) { return tipLater.choices[chosen].tipCents }
        return otherCents
    }

    /// "Tip $5.00" with a choice's server text; "Tip" for another amount until the server answers.
    private var payTitle: String {
        if let chosen, tipLater.choices.indices.contains(chosen) { return "Tip \(tipLater.choices[chosen].tipText)" }
        return "Tip"
    }

    private func pay() {
        guard let cents = amountCents, !isPaying else { return }
        isPaying = true
        problem = nil
        Task {
            await run(cents: cents)
            isPaying = false
        }
    }

    private func run(cents: Int, presenter: PaymentSheetPresenting = StripePaymentSheetPresenter()) async {
        let reply: PlanTipLaterPayResponse
        do {
            reply = try await APIClient.shared.request(PlansEndpoints.tipLater(planId: card.id, PlanTipLaterBody(amountCents: cents)))
        } catch {
            problem = PlanErrors.sentence(for: error)
            return
        }
        let result = await presenter.presentPayment(
            clientSecret: reply.payment.clientSecret,
            customer: reply.payment.customerId ?? "",
            ephemeralKey: reply.payment.ephemeralKey ?? "",
            isSetupIntent: false,
            publishableKey: reply.payment.publishableKey
        )
        switch result {
        case .canceled:
            return
        case let .failed(message):
            problem = message
        case .completed:
            for attempt in 0..<3 {
                do {
                    let answer: PlanTipConfirmResponse = try await APIClient.shared.request(PlansEndpoints.confirmTipLater(planId: card.id))
                    // The card keeps "You tipped $5.00" until the page is read again; the server sends no card after.
                    done = answer.text
                    return
                } catch let APIError.clientError(_, body) where PlanErrors.code(in: body) == "payment_not_complete" && attempt < 2 {
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                } catch {
                    problem = PlanErrors.sentence(for: error)
                    return
                }
            }
            problem = "This payment hasn't gone through yet."
        }
    }
}
