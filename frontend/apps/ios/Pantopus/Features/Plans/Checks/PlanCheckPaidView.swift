//
//  PlanCheckPaidView.swift
//  Pantopus
//
//  Plans for the holidays, the business track B5 (07-screens C2, picture 13):
//  a check once paid. The check mark, "Paid {$47.04}", the business, who paid
//  and when, "Show this to your server", the lines as paid with "Paid with
//  {method}", the receipt line, Done and "Something's wrong with this
//  payment" (the shipped conversation with the business). The server's words.
//

import SwiftUI

struct PlanCheckPaidView: View {
    enum Action {
        case done
        case receipt(String)
        case problem
    }

    let check: PlanCheckDTO
    let businessName: String
    let onAction: (Action) -> Void

    /// "Paid $47.04", large (board 13), growing with the text size.
    @ScaledMetric(relativeTo: .largeTitle) private var amountSize: CGFloat = 40

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.s4) {
                top
                PlanCheckLinesCard(lines: check.lines, deal: nil, totalLabel: check.methodText.map { "Paid with \($0)" })
                if let refunded = check.refundedText {
                    PlanScopeLine(text: refunded, icon: .info).accessibilityIdentifier("planCheckRefunded")
                }
                receiptLine
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s2)
            .padding(.bottom, Spacing.s6)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: Spacing.s1) {
                Button("Done") { onAction(.done) }
                    .planButton(.secondary)
                    .accessibilityIdentifier("planCheckDone")
                Button("Something's wrong with this payment") { onAction(.problem) }
                    .planButton(.text, size: .small)
                    .accessibilityIdentifier("planCheckProblem")
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.vertical, Spacing.s3)
            .background(Theme.Color.appSurface)
            .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planCheckPaid")
    }

    /// C2 items 1 and 2.
    private var top: some View {
        VStack(spacing: Spacing.s2) {
            Circle()
                .fill(check.state == "refunded" ? Theme.Color.appTextMuted : Theme.Color.successSolid)
                .frame(width: 88, height: 88)
                .overlay(Icon(.check, size: 40, strokeWidth: 3, color: Theme.Color.appTextInverse))
                .accessibilityHidden(true)
            Text(check.paidTotalText ?? check.totalText)
                .font(.system(size: amountSize, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Theme.Color.appText)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .accessibilityIdentifier("planCheckPaidTotal")
            Text(businessName)
                .planFont(.bodyStrong)
                .foregroundStyle(Theme.Color.appText)
                .multilineTextAlignment(.center)
            if let line = whoWhen {
                Text(line)
                    .planFont(.small)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("planCheckPaidWho")
            }
            if check.state == "paid" {
                HStack(spacing: 6) {
                    Icon(.clock, size: 13, color: Theme.Color.appTextSecondary)
                    Text("Show this to your server").planFont(.footnote).foregroundStyle(Theme.Color.appTextStrong)
                }
                .padding(.horizontal, 12)
                .frame(minHeight: 28)
                .background(Capsule().fill(Theme.Color.appSurfaceSunken))
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Spacing.s2)
        .accessibilityElement(children: .combine)
    }

    /// "Dana L. · Fri, Nov 20 · 8:52 PM".
    private var whoWhen: String? {
        let parts = [check.payer, check.paidText].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// C2 item 4: the receipt in Mail; a tap opens it when the server filed one.
    @ViewBuilder private var receiptLine: some View {
        let words = "The receipt is in Mail, under Receipts. \(businessName) sees the payment on its guest list now."
        if let link = check.receipt?.link, !link.isEmpty {
            Button { onAction(.receipt(link)) } label: { receiptRow(words) }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the receipt")
                .accessibilityIdentifier("planCheckReceipt")
        } else {
            receiptRow(words)
        }
    }

    private func receiptRow(_ words: String) -> some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.Color.appSurfaceSunken)
                .frame(width: 36, height: 36)
                .overlay(Icon(.mail, size: 18, color: Theme.Color.appText))
            Text(words)
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}
