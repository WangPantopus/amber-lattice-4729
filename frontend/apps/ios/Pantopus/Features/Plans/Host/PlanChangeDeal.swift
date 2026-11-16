//
//  PlanChangeDeal.swift
//  Pantopus
//
//  Plans for the holidays, the business track (07-screens D3): a business's
//  plan's deal from its "Change" screen. While nobody is in, the deal opens
//  in the same form as the host flow's step and saves on its own
//  (`PATCH /api/plans/:id` with `deal`). Once anyone is in, it can only be
//  removed, after "Remove the deal? Everyone who is in is told." The server
//  refuses anything else with its own words.
//

import SwiftUI

struct PlanChangeDealRow: View {
    let card: PlanCardDTO
    /// The business as this person may post for it: whether it may carry a deal.
    let business: PlanHostAsBusinessDTO?

    @State private var deal: PlanDealDTO?
    @State private var editing: PlanDealDraft?
    @State private var asksRemove = false
    @State private var isSaving = false
    @State private var error: String?

    init(card: PlanCardDTO, business: PlanHostAsBusinessDTO?) {
        self.card = card
        self.business = business
        _deal = State(initialValue: card.deal)
    }

    var body: some View {
        if business?.can.deals == true, deal != nil || card.goingCount == 0 {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text.planOverline("Deal")
                if deal?.canChange != false {
                    Button { editing = deal?.form.map { PlanDealDraft(form: $0, timezone: card.timezone) } ?? PlanDealDraft() } label: {
                        PlanFormCard { line(chevron: true) }
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Change the deal")
                    .accessibilityIdentifier("planChangeDeal")
                } else {
                    PlanFormCard { line(chevron: false) }
                    Button("Remove the deal") { asksRemove = true }
                        .planButton(.textDanger, size: .small)
                        .disabled(isSaving)
                        .accessibilityIdentifier("planChangeDealRemove")
                }
                if let error { PlanDealFieldError(text: error) }
            }
            .sheet(item: $editing) { draft in
                PlanChangeDealSheet(card: card, business: business, draft: draft, isSaving: isSaving) { save(draft) } onCancel: {
                    editing = nil
                }
            }
            .alert("Remove the deal?", isPresented: $asksRemove) {
                Button("Remove", role: .destructive) { send(.remove) }
                Button("Not now", role: .cancel) {}
            } message: {
                Text("Everyone who is in is told.")
            }
        }
    }

    private func line(chevron: Bool) -> some View {
        HStack(spacing: Spacing.s3) {
            Text(deal?.text ?? "No deal")
                .planFont(.body)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if chevron { Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted) }
        }
        .padding(.vertical, Spacing.s2)
        .frame(minHeight: 52)
        .accessibilityElement(children: .combine)
    }

    private func save(_ draft: PlanDealDraft) {
        let start = card.startsAtDate ?? Date()
        if let input = draft.input(start: start) { send(.set(input)) } else if deal != nil { send(.remove) } else { editing = nil }
    }

    private func send(_ change: PlanDealChange) {
        guard !isSaving else { return }
        isSaving = true
        error = nil
        var body = UpdatePlanBody()
        body.deal = change
        Task {
            do {
                let updated: PlanDetailDTO = try await APIClient.shared.request(PlansEndpoints.update(id: card.id, body))
                PlansStoreReads.changed(planId: card.id)
                deal = updated.card.deal
                editing = nil
            } catch {
                self.error = PlanErrors.sentence(for: error)
            }
            isSaving = false
        }
    }
}

extension PlanDealDraft: Identifiable {
    nonisolated var id: ObjectIdentifier {
        ObjectIdentifier(self)
    }
}

/// The deal form over the Change screen, with "Guests will read" and Save.
private struct PlanChangeDealSheet: View {
    let card: PlanCardDTO
    let business: PlanHostAsBusinessDTO?
    @Bindable var draft: PlanDealDraft
    let isSaving: Bool
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: "A deal for this plan", leading: .close, onLeading: onCancel)
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s6) {
                    PlanDealForm(draft: draft, spots: card.spots, start: start, offer: card.dealOffer)
                    PlanDealGuestsRead(draft: draft)
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s2)
                .padding(.bottom, Spacing.s6)
            }
            .scrollDismissesKeyboard(.interactively)
            VStack(spacing: Spacing.s2) {
                Button(action: onSave) { PlanButtonLabel(title: "Save", kind: .primary, isLoading: isSaving) }
                    .planButton(.primary)
                    .disabled(isSaving || (draft.scope != .none && draft.preview?.ok == false))
                    .accessibilityIdentifier("planChangeDealSave")
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.vertical, Spacing.s3)
            .background(Theme.Color.appSurface)
            .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
        }
        .background(Theme.Color.appBg)
        .task(id: previewKey) {
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled, let business else { return }
            await draft.refreshPreview(
                businessUserId: business.userId,
                spots: card.spots,
                start: start,
                priceCents: card.dealPriceCents,
                payHere: card.dealOnBill
            )
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planChangeDealSheet")
    }

    private var start: Date {
        card.startsAtDate ?? Date()
    }

    private var previewKey: String {
        let deal = draft.input(start: start)
        return (try? JSONEncoder().encode(deal)).flatMap { String(data: $0, encoding: .utf8) } ?? "none"
    }
}

extension PlanCardDTO {
    /// What a deal may be on for this plan (money off arrives with a price, B4, and the bill, B5).
    var dealOffer: PlanDealOffer {
        PlanDealOffer.on(priced: dealPriceCents != nil, payHere: dealOnBill)
    }

    /// The price a spot (B2), for money off the spot (the full price, before any deal); nil while the plan is free.
    var dealPriceCents: Int? {
        price.map { $0.wasCents ?? $0.cents }
    }

    /// Guests pay their bill here (B5), for a deal on the bill.
    var dealOnBill: Bool {
        false
    }
}
