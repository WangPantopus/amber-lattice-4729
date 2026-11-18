//
//  PlanPayHereFields.swift
//  Pantopus
//
//  Plans for the holidays, the business track B5 (07-screens C3, "On the
//  business's form"): "Guests can pay their bill here" (`pay_here`), off at the
//  start and needing payouts as a price does; turned on, "Take tips"
//  (`tips_on`) under it, starting on for a watch party and a walk or coffee and
//  off for every other kind (the server's start values; it picks them when
//  the business doesn't touch the switch). On the business's form when it
//  posts, and on the Change screen at any time (contract 10.2).
//

import SwiftUI

extension PlanComposerModel {
    /// B5: the business may let guests pay their bill here (host-as `can.pay_here`).
    var offersPayHere: Bool {
        hostAs?.can.payHere == true
    }

    /// "Take tips" as shown: what the business chose, else the server's start for this kind.
    var tipsShownOn: Bool {
        money.tipsOn ?? PlanPayHereStart.tipsOn(kind)
    }
}

/// The kinds whose plans start with tips on once guests can pay here (planChecks.js `TIPS_ON_KINDS`).
enum PlanPayHereStart {
    static func tipsOn(_ kind: PlanKind) -> Bool {
        kind == .watchParty || kind == .walkCoffee
    }
}

/// "Guests can pay their bill here" and "Take tips" on the business's details step.
struct PlanBusinessPayHereField: View {
    @Bindable var model: PlanComposerModel
    @State private var showsPayouts = false

    var body: some View {
        @Bindable var money = model.money
        VStack(alignment: .leading, spacing: Spacing.s2) {
            if model.hostAs?.payoutsReady == true {
                PlanPayHereSwitch(isOn: $money.payHere).accessibilityIdentifier("planPayHere")
                if money.payHere {
                    PlanTakeTipsSwitch(isOn: Binding(get: { model.tipsShownOn }, set: { money.tipsOn = $0 }))
                        .accessibilityIdentifier("planTakeTips")
                    PlanScopeLine(
                        text: "Guests pay their bill in Pantopus at the place. A tip goes to you; Pantopus takes none of it.",
                        icon: .info
                    )
                }
            } else {
                HStack(alignment: .top, spacing: Spacing.s3) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Guests can pay their bill here").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                        Text("Set up payouts to take payments")
                            .planFont(.small)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Button("Set up payouts") { showsPayouts = true }
                        .planButton(.secondary, size: .small)
                        .fixedSize()
                        .accessibilityIdentifier("planPayHereSetUpPayouts")
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("planPayHere")
            }
        }
        .sheet(isPresented: $showsPayouts) {
            if let business = model.hostAs {
                NavigationStack {
                    BusinessPaymentsView(businessId: business.userId)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Done") { showsPayouts = false }.accessibilityIdentifier("planPayoutsDone")
                            }
                        }
                }
                .presentationDragIndicator(.visible)
            }
        }
    }
}

struct PlanPayHereSwitch: View {
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            Text("Guests can pay their bill here").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
        }
        .tint(Theme.Color.successSolid)
        .frame(minHeight: 44)
    }
}

struct PlanTakeTipsSwitch: View {
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            Text("Take tips").planFont(.body).foregroundStyle(Theme.Color.appText)
        }
        .tint(Theme.Color.successSolid)
        .frame(minHeight: 44)
    }
}

/// The Change screen's money rows: the price a spot (B2) and paying the bill here (B5).
struct PlanChangeMoneyRows: View {
    let card: PlanCardDTO
    let business: PlanHostAsBusinessDTO?

    var body: some View {
        PlanChangePriceRow(card: card, business: business)
        PlanChangePayHereRows(card: card, business: business)
    }
}

/// The two pay rows on the Change screen, saved on their own (`PATCH /api/plans/:id` with `pay_here` / `tips_on`).
struct PlanChangePayHereRows: View {
    let card: PlanCardDTO
    let business: PlanHostAsBusinessDTO?

    @State private var payHere: Bool
    @State private var tipsOn: Bool
    @State private var isSaving = false
    @State private var error: String?

    init(card: PlanCardDTO, business: PlanHostAsBusinessDTO?) {
        self.card = card
        self.business = business
        _payHere = State(initialValue: card.payHere != nil)
        _tipsOn = State(initialValue: card.payHere?.tipsOn ?? false)
    }

    var body: some View {
        if business?.can.payHere == true, business?.payoutsReady == true || payHere {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text.planOverline("Paying here")
                PlanFormCard {
                    PlanPayHereSwitch(isOn: Binding(get: { payHere }, set: { save(payHere: $0, tipsOn: nil) }))
                        .accessibilityIdentifier("planChangePayHere")
                    if payHere {
                        Divider().overlay(Theme.Color.appBorder)
                        PlanTakeTipsSwitch(isOn: Binding(get: { tipsOn }, set: { save(payHere: nil, tipsOn: $0) }))
                            .accessibilityIdentifier("planChangeTakeTips")
                    }
                }
                .disabled(isSaving)
                if let error { PlanDealFieldError(text: error) }
            }
        }
    }

    private func save(payHere newPayHere: Bool?, tipsOn newTipsOn: Bool?) {
        guard !isSaving else { return }
        var body = UpdatePlanBody()
        body.payHere = newPayHere
        body.tipsOn = newTipsOn
        isSaving = true
        error = nil
        Task {
            do {
                let updated: PlanDetailDTO = try await APIClient.shared.request(PlansEndpoints.update(id: card.id, body))
                PlansStoreReads.changed(planId: card.id)
                payHere = updated.card.payHere != nil
                tipsOn = updated.card.payHere?.tipsOn ?? false
            } catch {
                self.error = PlanErrors.sentence(for: error)
            }
            isSaving = false
        }
    }
}
