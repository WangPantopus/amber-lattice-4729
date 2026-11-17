//
//  PlanCheckSheets.swift
//  Pantopus
//
//  Plans for the holidays, the business track B5 (07-screens C3): the
//  business's two sheets. "Send a check": the guest, "Amount on the bill" and,
//  with a deal on the bill, "Part the deal doesn't cover (alcohol)", 0 at the
//  start. A paid guest: what they paid, and "Refund" all or an amount (a part
//  leaves the tip; the server says so in its words).
//

import SwiftUI

struct PlanSendCheckSheet: View {
    let row: PlanChecksRowDTO
    let dealOnBill: Bool
    /// Sends; answers the server's sentence, or nil when sent.
    let onSend: (String, String) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var amount = ""
    @State private var noDeal = "0"
    @State private var isSending = false
    @State private var problem: String?

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: "Send a check", leading: .close) { dismiss() }
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s4) {
                    Text(row.name)
                        .planFont(.h3)
                        .foregroundStyle(Theme.Color.appText)
                        .accessibilityIdentifier("planSendCheckGuest")
                    PlanFormField(label: "Amount on the bill") {
                        PlanDollarsField(
                            text: $amount,
                            placeholder: "48.00",
                            label: "Amount on the bill",
                            identifier: "planCheckAmountField"
                        )
                    }
                    if dealOnBill {
                        PlanFormField(label: "Part the deal doesn't cover (alcohol)") {
                            PlanDollarsField(
                                text: $noDeal,
                                placeholder: "0",
                                label: "Part the deal doesn't cover (alcohol)",
                                identifier: "planCheckNoDeal"
                            )
                        }
                    }
                    if let problem { PlanDealFieldError(text: problem) }
                }
                .padding(Spacing.s4)
            }
            Button(action: send) { PlanButtonLabel(title: "Send", kind: .primary, isLoading: isSending) }
                .planButton(.primary)
                .disabled(amount.trimmingCharacters(in: .whitespaces).isEmpty || isSending)
                .accessibilityIdentifier("planCheckSend")
                .padding(Spacing.s4)
        }
        .background(Theme.Color.appBg)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planSendCheckSheet")
    }

    private func send() {
        guard !isSending else { return }
        isSending = true
        problem = nil
        Task {
            if let words = await onSend(amount, noDeal) {
                problem = words
            } else {
                dismiss()
            }
            isSending = false
        }
    }
}

struct PlanRefundCheckSheet: View {
    let row: PlanChecksRowDTO
    /// Refunds all (nil) or a typed part; answers the server's sentence, or nil when done.
    let onRefund: (String?) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var part = ""
    @State private var asksPart = false
    @State private var confirmsAll = false
    @State private var isWorking = false
    @State private var problem: String?

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: row.name, leading: .close) { dismiss() }
            VStack(alignment: .leading, spacing: Spacing.s4) {
                if let check = row.check {
                    HStack {
                        Text(check.text ?? "").planFont(.bodyStrong).monospacedDigit().foregroundStyle(Theme.Color.appText)
                        Spacer()
                        Text(check.stateText ?? "").planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("planRefundPaid")
                }
                if asksPart {
                    PlanFormField(label: "Amount to refund") {
                        PlanDollarsField(text: $part, placeholder: "12.00", label: "Amount to refund", identifier: "planCheckRefundAmount")
                    }
                    PlanScopeLine(text: "A part leaves the tip with you. Refund all of it to return the tip too.", icon: .info)
                }
                if let problem { PlanDealFieldError(text: problem) }
                Spacer()
                if asksPart {
                    Button { run(part) } label: { PlanButtonLabel(title: "Refund", kind: .primary, isLoading: isWorking) }
                        .planButton(.primary)
                        .disabled(part.trimmingCharacters(in: .whitespaces).isEmpty || isWorking)
                        .accessibilityIdentifier("planCheckRefundPart")
                } else {
                    Button("Refund all") { confirmsAll = true }
                        .planButton(.secondary)
                        .disabled(isWorking)
                        .accessibilityIdentifier("planCheckRefundAll")
                    Button("Refund a part") { asksPart = true }
                        .planButton(.text, size: .small)
                        .accessibilityIdentifier("planCheckRefund")
                }
            }
            .padding(Spacing.s4)
        }
        .background(Theme.Color.appBg)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .alert("Refund all of it?", isPresented: $confirmsAll) {
            Button("Refund all", role: .destructive) { run(nil) }
            Button("Not now", role: .cancel) {}
        } message: {
            Text("\(PlanCardLines.firstName(row.name)) gets the whole payment back, the tip too.")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planRefundSheet")
    }

    private func run(_ amount: String?) {
        guard !isWorking else { return }
        isWorking = true
        problem = nil
        Task {
            if let words = await onRefund(amount) {
                problem = words
            } else {
                dismiss()
            }
            isWorking = false
        }
    }
}
