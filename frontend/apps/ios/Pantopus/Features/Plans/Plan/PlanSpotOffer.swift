//
//  PlanSpotOffer.swift
//  Pantopus
//
//  Plans for the holidays, one person pays for the group: the claimer's side (08-extras section 7, board 31). A plan
//  opened from a buyer's link (`pantopus:///plans/<id>?spot=` or `/plan-link/<id>?spot=`) reads what the link offers
//  first. While it is open the page shows the server's "Chris got you a spot" and its "I'm in" in place of the paid
//  "Join": claiming is free (`POST …/requests/claim-spot`), and the pay sheet never opens. A stopped or used-up link
//  shows the server's closed words and then the ordinary page; a refusal (already in, blocked) shows its sentence.
//  Only a clear answer leads to the ordinary page: when the server can't be asked, the token is kept, the paid "Join"
//  stays away and "Try again" (or a pull to refresh) reads the offer again; a claim that couldn't reach the server
//  keeps the offer.
//

import SwiftUI

/// The buyer's link and what it offers; no offer while the server couldn't be asked.
struct PlanSpotState: Equatable {
    let token: String
    let offer: PlanSpotOfferDTO?

    static let unreachable = "Couldn't check your spot. Try again."
}

/// A clear answer from the server (a refusal or "not available"), as opposed to not reaching it.
private func isClearAnswer(_ error: any Error) -> Bool {
    guard let error = error as? APIError else { return false }
    switch error {
    case .clientError, .forbidden, .notFound, .unauthorized: return true
    default: return false
    }
}

extension PlanScreenViewModel {
    /// Reads what the link offers. Open: kept for the page; closed: its words as a notice, then the ordinary page.
    /// Unavailable (the business doesn't take it, or the plan isn't shown to this person): the ordinary page.
    func readSpot(token: String) async {
        do {
            let reply: PlanSpotOfferResponse = try await api.request(PlansEndpoints.spotOffer(planId: planId, token: token))
            guard let offer = reply.spot, offer.open else {
                spot = nil
                notice = reply.spot?.closedText
                return
            }
            spot = PlanSpotState(token: token, offer: offer)
        } catch is CancellationError {
        } catch {
            // "Not available" (404) is a clear answer: the ordinary page. Anything else keeps the token, never "Join".
            spot = isClearAnswer(error) ? nil : PlanSpotState(token: token, offer: nil)
        }
    }

    /// A pull to refresh: the plan, and an offer the server couldn't be asked about again.
    func refreshWithSpot() async {
        await load()
        if let spot, spot.offer == nil { await readSpot(token: spot.token) }
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
            guard isClearAnswer(error) else {
                // The server couldn't be reached: the offer stays; reading again shows whether the claim went through.
                actionError = PlanErrors.sentence(for: error)
                await load()
                if mode == .going { spot = nil }
                return
            }
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

/// The footer while the offer couldn't be checked: no paid "Join", the line and "Try again".
struct PlanSpotRetry: View {
    let viewModel: PlanScreenViewModel
    let token: String

    @State private var isReading = false

    var body: some View {
        VStack(spacing: Spacing.s2) {
            Text(PlanSpotState.unreachable)
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("planSpotUnreachable")
            Button {
                guard !isReading else { return }
                Task {
                    isReading = true
                    await viewModel.readSpot(token: token)
                    isReading = false
                }
            } label: {
                PlanButtonLabel(title: "Try again", kind: .secondary, isLoading: isReading)
            }
            .planButton(.secondary)
            .disabled(isReading)
            .accessibilityIdentifier("planSpotRetry")
        }
    }
}
