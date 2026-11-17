//
//  PlanChangePrice.swift
//  Pantopus
//
//  Plans for the holidays, the business track B2 (contract 10.2): a business's
//  plan's price from its "Change" screen, only while nobody is in (the server
//  also refuses while someone is paying, `409 price_locked`, in its words).
//  Saved on its own (`PATCH /api/plans/:id` with `price_cents`, or `null`).
//

import SwiftUI

struct PlanChangePriceRow: View {
    let card: PlanCardDTO
    let business: PlanHostAsBusinessDTO?

    @State private var priceText: String?
    @State private var editing = false
    @State private var priceOn = false
    @State private var dollars = ""
    @State private var isSaving = false
    @State private var error: String?

    init(card: PlanCardDTO, business: PlanHostAsBusinessDTO?) {
        self.card = card
        self.business = business
        _priceText = State(initialValue: card.price?.text)
    }

    var body: some View {
        if business?.can.price == true, business?.payoutsReady == true, card.goingCount == 0 {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text.planOverline("Price a spot")
                Button(action: open) {
                    PlanFormCard {
                        HStack(spacing: Spacing.s3) {
                            Text(priceText ?? "Free")
                                .planFont(.body)
                                .foregroundStyle(Theme.Color.appText)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
                        }
                        .padding(.vertical, Spacing.s2)
                        .frame(minHeight: 52)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Price a spot: \(priceText ?? "Free")")
                .accessibilityHint("Change the price")
                .accessibilityIdentifier("planChangePrice")
                if let error { PlanDealFieldError(text: error) }
            }
            .sheet(isPresented: $editing) { sheet }
        }
    }

    private var sheet: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: "Price a spot", leading: .close) { editing = false }
            VStack(alignment: .leading, spacing: Spacing.s4) {
                PlanPriceSwitch(isOn: $priceOn)
                    .accessibilityIdentifier("planChangePriceOn")
                if priceOn {
                    PlanDollarsField(text: $dollars, placeholder: "18", label: "Price a spot", identifier: "planChangePriceAmount")
                    PlanScopeLine(text: "Guests pay when they join. Full refund until a day before.", icon: .info)
                }
                if let error { PlanDealFieldError(text: error) }
                Spacer()
                Button(action: save) { PlanButtonLabel(title: "Save", kind: .primary, isLoading: isSaving) }
                    .planButton(.primary)
                    .disabled(isSaving)
                    .accessibilityIdentifier("planChangePriceSave")
            }
            .padding(Spacing.s4)
        }
        .background(Theme.Color.appBg)
        .presentationDetents([.medium, .large])
    }

    private func open() {
        priceOn = card.price != nil || priceText != nil
        let cents = card.price.map { $0.wasCents ?? $0.cents }
        dollars = cents.map { $0 % 100 == 0 ? "\($0 / 100)" : String(format: "%d.%02d", $0 / 100, $0 % 100) } ?? ""
        error = nil
        editing = true
    }

    private func save() {
        guard !isSaving else { return }
        var body = UpdatePlanBody()
        if priceOn {
            guard let cents = PlanDealDraft.cents(dollars) else { return error = "A spot can be $1 to $500." }
            body.priceCents = .set(cents)
        } else {
            body.priceCents = .remove
        }
        isSaving = true
        error = nil
        Task {
            do {
                let updated: PlanDetailDTO = try await APIClient.shared.request(PlansEndpoints.update(id: card.id, body))
                PlansStoreReads.changed(planId: card.id)
                priceText = updated.card.price?.text
                editing = false
            } catch {
                self.error = PlanErrors.sentence(for: error)
            }
            isSaving = false
        }
    }
}
