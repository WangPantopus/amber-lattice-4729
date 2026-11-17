//
//  PlanSpotOffer.swift
//  Pantopus
//
//  Plans for the holidays, one person pays for the group: the claimer's side (08-extras section 7, board 31). A plan
//  opened from a buyer's link (`pantopus:///plans/<id>?spot=` or `/plan-link/<id>?spot=`) reads what the link offers
//  first. While it is open the page shows the server's "Chris got you a spot" and its "I'm in" in place of the paid
//  "Join": claiming is free (`POST …/requests/claim-spot`), and the pay sheet never opens. A stopped or used-up link
//  shows the server's closed words and then the ordinary page; a refusal (already in, blocked) shows its sentence.
//

import SwiftUI

/// The buyer's link and what it offers.
struct PlanSpotState: Equatable {
    let token: String
    let offer: PlanSpotOfferDTO
}

extension PlanScreenViewModel {
    /// Reads what the link offers. Open: kept for the page; closed: its words as a notice, then the ordinary page.
    /// Unavailable (the business doesn't take it, or the plan isn't shown to this person): the ordinary page.
    func readSpot(token: String) async {
        guard let reply: PlanSpotOfferResponse = try? await api.request(PlansEndpoints.spotOffer(planId: planId, token: token)),
              let offer = reply.spot else { return }
        if offer.open {
            spot = PlanSpotState(token: token, offer: offer)
        } else {
            spot = nil
            notice = offer.closedText
        }
    }

    /// "I'm in": in, free. A refusal shows the server's sentence and the ordinary page.
    func claimSpot() async {
        guard let token = spot?.token else { return }
        do {
            let detail: PlanDetailDTO = try await api.request(PlansEndpoints.claimSpot(planId: planId, token: token))
            spot = nil
            plan = detail
            PlansStoreReads.changed(planId: planId)
            await load()
        } catch is CancellationError {
        } catch {
            spot = nil
            actionError = PlanErrors.sentence(for: error)
            await load()
        }
    }
}

/// The page's card while the offer is open: "Chris got you a spot".
struct PlanSpotOfferCard: View {
    let offer: PlanSpotOfferDTO

    var body: some View {
        PlanCardBox(padding: 14) {
            HStack(alignment: .firstTextBaseline, spacing: Spacing.s3) {
                Icon(.gift, size: 18, color: Theme.Color.appTextStrong).accessibilityHidden(true)
                Text(offer.text)
                    .planFont(.bodyStrong)
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("planSpotOffer")
    }
}

/// The footer's "I'm in" while the offer is open, in place of the paid "Join".
struct PlanSpotClaimButton: View {
    let viewModel: PlanScreenViewModel
    let offer: PlanSpotOfferDTO

    @State private var isClaiming = false

    var body: some View {
        Button {
            guard !isClaiming else { return }
            Task {
                isClaiming = true
                await viewModel.claimSpot()
                isClaiming = false
            }
        } label: {
            PlanButtonLabel(title: offer.button, kind: .primary, isLoading: isClaiming)
        }
        .planButton(.primary)
        .disabled(isClaiming)
        .accessibilityIdentifier("planSpotClaim")
    }
}
