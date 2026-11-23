//
//  PlanSamePeopleFooter.swift
//  Pantopus
//
//  Board 29's footer on the host's page of a plan that is over: "Plan the next one with the same people" starts the
//  host flow with the plan's choices ("Host again"), and once the new plan is posted its invite sheet opens on this
//  plan's people (board 30), where the host sends them. Shown only when the server offers this plan under "People
//  from a past plan" (`plans_same_people` on, someone was in); nothing is sent without the host's "Invite".
//

import SwiftUI

struct PlanSamePeopleFooter: View {
    let viewModel: PlanScreenViewModel
    let onHost: (PlansHostStart?) -> Void

    @State private var offered = false

    var body: some View {
        Group {
            if offered, let card = viewModel.card {
                Button {
                    onHost(PlansHostStart(kind: card.kind, again: viewModel.plan, samePeopleFrom: card.id))
                } label: {
                    Text("Plan the next one with the same people")
                        .lineLimit(3)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .planButton(.secondary)
                .accessibilityIdentifier("planSamePeople")
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s3)
                .padding(.bottom, Spacing.s2)
                .frame(maxWidth: .infinity)
                .background(Theme.Color.appSurface.ignoresSafeArea(edges: .bottom))
                .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
            } else {
                Color.clear.frame(height: 0)
            }
        }
        .task(id: viewModel.card.map { "\($0.id)\($0.state)" }) { await check() }
    }

    /// The host's own plan that is over, among the past plans the server offers.
    private func check() async {
        guard let card = viewModel.card, card.state == .ended, card.viewer?.isHost == true else {
            offered = false
            return
        }
        let reply: PlanPastPlansResponse? = try? await viewModel.api.request(PlansEndpoints.pastPlans())
        offered = reply?.plans.contains { $0.postId == card.id } ?? false
    }
}
