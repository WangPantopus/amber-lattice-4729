//
//  PlanBusinessMoneyFields.swift
//  Pantopus
//
//  Plans for the holidays, the business track (07-screens P1, "On the
//  business's form"): what a business adds to its plan that involves money.
//  "Price a spot" (B2): off at the start; on, an amount from $1 to $500. A
//  business that may not charge yet sees the row with "Set up payouts to
//  charge for spots" and its shipped payout setup. The server decides again
//  (`409 payout_account_needed`, `422`), in its own words.
//

import SwiftUI

/// A business's money choices on its plan: the deal (B1, B4), the price a spot (B2) and paying the bill here (B5).
@Observable
@MainActor
final class PlanMoneyDraft {
    let deal = PlanDealDraft()
    /// "Price a spot", and the dollars typed (whole dollars or with cents).
    var priceOn = false
    var priceDollars = ""

    init() {}
}

extension PlanComposerModel {
    /// The business's deal (board 09).
    var deal: PlanDealDraft {
        money.deal
    }

    /// B2: the business may put a price on this plan (host-as `can.price`); a business's plan is never online.
    var offersPrice: Bool {
        hostAs?.can.price == true
    }

    /// The preview's chip echoes the price the business typed ("$18"); the posted plan shows the server's words.
    var previewPrice: String? {
        let typed = money.priceDollars.trimmingCharacters(in: .whitespaces)
        return offersPrice && money.priceOn && !typed.isEmpty ? "$\(typed)" : nil
    }
}

/// "Price a spot" on the business's details step.
struct PlanBusinessPriceField: View {
    @Bindable var model: PlanComposerModel
    @State private var showsPayouts = false

    var body: some View {
        @Bindable var money = model.money
        VStack(alignment: .leading, spacing: Spacing.s2) {
            if model.hostAs?.payoutsReady == true {
                PlanPriceSwitch(isOn: $money.priceOn)
                    .accessibilityIdentifier("planPriceSpot")
                if money.priceOn {
                    PlanDollarsField(
                        text: $money.priceDollars,
                        placeholder: "18",
                        label: "Price a spot",
                        identifier: "planPriceAmount"
                    )
                    PlanScopeLine(text: "Guests pay when they join. Full refund until a day before.", icon: .info)
                }
            } else {
                HStack(alignment: .top, spacing: Spacing.s3) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Price a spot").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                        Text("Set up payouts to charge for spots")
                            .planFont(.small)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Button("Set up payouts") { showsPayouts = true }
                        .planButton(.secondary, size: .small)
                        .fixedSize()
                        .accessibilityIdentifier("planPriceSetUpPayouts")
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("planPriceSpot")
            }
        }
        .sheet(isPresented: $showsPayouts) {
            if let business = model.hostAs {
                NavigationStack { BusinessPaymentsView(businessId: business.userId) }
            }
        }
    }
}

/// "$" and an amount (a price, money off, a check): the typed dollars only; the server checks the amount.
struct PlanDollarsField: View {
    @Binding var text: String
    let placeholder: String
    let label: String
    let identifier: String

    var body: some View {
        HStack(spacing: Spacing.s2) {
            Text("$").planFont(.body).foregroundStyle(Theme.Color.appTextSecondary).allowsHitTesting(false)
            TextField(placeholder, text: $text)
                .keyboardType(.decimalPad)
                .planFont(.body)
                .accessibilityLabel(label)
                .accessibilityIdentifier(identifier)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 50)
        .typesInFieldOnTap()
        .background(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).fill(Theme.Color.appSurface))
        .overlay(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
    }
}

/// "Price a spot" and its switch, off at the start (P1).
struct PlanPriceSwitch: View {
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            Text("Price a spot").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
        }
        .tint(Theme.Color.successSolid)
        .frame(minHeight: 44)
    }
}
