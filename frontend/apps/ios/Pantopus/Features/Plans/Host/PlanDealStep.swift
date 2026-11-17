//
//  PlanDealStep.swift
//  Pantopus
//
//  Plans for the holidays, the business track (07-screens D3, board 09): the
//  business's host flow gains "A deal for this plan" after the details, when
//  the business may carry a deal (host-as `can.deals`). The step count reads
//  "of 4" only then. The posted plan carries `deal`; "No deal" sends none.
//

import SwiftUI

struct PlanDealStepScreen: View {
    @Bindable var model: PlanComposerModel
    let step: String
    let onBack: () -> Void
    let onPreview: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: "A deal for this plan", leading: .back, trailing: step, onLeading: onBack)
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s6) {
                    planLine
                    PlanDealForm(draft: model.deal, spots: model.spots, start: model.start, offer: model.dealOffer)
                    PlanDealGuestsRead(draft: model.deal)
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s2)
                .padding(.bottom, Spacing.s6)
            }
            .scrollDismissesKeyboard(.interactively)
            footer
        }
        .background(Theme.Color.appBg)
        .task(id: previewKey) {
            // The sentence follows the choices a moment after the last change.
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled, let business = model.hostAs else { return }
            await model.deal.refreshPreview(
                businessUserId: business.userId,
                spots: model.spots,
                start: model.start,
                priceCents: model.dealPriceCents,
                payHere: model.dealOnBill
            )
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planDealStep")
    }

    /// D3 item 2: the plan in one line: title, business, time.
    private var planLine: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(model.title.isEmpty ? (model.businessLabelText ?? model.kind.title) : model.title)
                .planFont(.bodyStrong)
                .foregroundStyle(Theme.Color.appText)
            Text([model.hostAs?.name, PlanFormat.when(start: model.start, end: model.end)].compactMap { $0 }.joined(separator: " · "))
                .planFont(.small)
                .monospacedDigit()
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var footer: some View {
        VStack(spacing: Spacing.s2) {
            Button(action: onPreview) { PlanButtonLabel(title: "Preview", kind: .primary) }
                .planButton(.primary)
                .disabled(blocked)
                .accessibilityIdentifier("planDealNext")
            Text("Afterwards you see who joined, who paid and what the deal cost you")
                .planFont(.caption)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s3)
        .background(Theme.Color.appSurface)
        .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
    }

    /// The server refused what is chosen (its words are under the field).
    private var blocked: Bool {
        model.deal.scope != .none && model.deal.preview?.ok == false
    }

    private var previewKey: String {
        let deal = model.deal.input(start: model.start)
        let encoded = (try? JSONEncoder().encode(deal)).flatMap { String(data: $0, encoding: .utf8) } ?? "none"
        return "\(encoded)|\(model.spots)|\(model.start.timeIntervalSince1970)|\(model.dealPriceCents ?? 0)|\(model.dealOnBill)"
    }
}

extension PlanComposerModel {
    /// D3: the business may carry a deal on this plan (host-as `can.deals`): the flow has four steps.
    var offersDeal: Bool {
        hostAs?.can.deals == true
    }

    /// The step count: "of 4" only with deals on and a business chosen.
    var stepCount: Int {
        offersDeal ? 4 : 3
    }

    /// What the deal may be on: money off only where money moves through Pantopus on this plan.
    var dealOffer: PlanDealOffer {
        PlanDealOffer.on(priced: dealPriceCents != nil, payHere: dealOnBill)
    }

    /// The price a spot (B2), for money off the spot; nil while the plan is free.
    var dealPriceCents: Int? {
        offersPrice && money.priceOn ? PlanDealDraft.cents(money.priceDollars) : nil
    }

    /// Guests pay their bill here (B5), for a deal on the bill.
    var dealOnBill: Bool {
        false
    }
}
