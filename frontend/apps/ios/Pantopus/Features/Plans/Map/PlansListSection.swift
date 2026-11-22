//
//  PlansListSection.swift
//  Pantopus
//
//  One titled group of the Plans list (board F2): "Yours", or a day. Its rows,
//  a host's repeating plan as its card, and a venue's later plans folded under
//  its soonest one. The list pulled up draws every group with it, and "See
//  plans near you" (F5) draws "Yours" with it above the request, so a person
//  who has not allowed location still finds the plans they are in (JOURNEYS
//  section 2, change 4).
//

import SwiftUI

struct PlansListSection: View {
    let title: String
    let cards: [PlanCardDTO]
    /// The person's own plans ("Yours"): their rows say where the person stands.
    let mine: Bool
    let viewModel: PlansMapViewModel
    let actions: PlansMapActions
    /// The venues whose later plans are unfolded (board P3).
    @Binding var openFolds: Set<String>

    /// "Yours" with Plans for the holidays (board 1), "Your plans" before it.
    @MainActor static var yoursTitle: String {
        PlansFlags.shared.guestAnswers ? "Yours" : "Your plans"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text.planOverline(title)
                .padding(.top, Spacing.s4)
                .padding(.bottom, 2)
                .hiddenUnderPlansTabBar()
            ForEach(Array(cards.enumerated()), id: \.element.id) { index, card in
                if mine, PlanSeriesHostCard.shows(card) {
                    // The host's repeating plan (board Regulars, Plans step 2): skip, change or stop it here.
                    PlanSeriesListCard(
                        card: card,
                        onOpen: { actions.openPlan(card, card.id, .view) },
                        onChange: { openChange(card) },
                        onOpenNext: { actions.openPlan(nil, $0, .view) }
                    )
                    .padding(.vertical, Spacing.s2)
                    .itemZoomSource(.plan, id: card.id)
                    .hiddenUnderPlansTabBar()
                } else {
                    PlanRow(
                        model: mine ? .mine(card, requestsCount: card.requestsCount) : .listed(card),
                        showsDivider: index > 0
                    ) {
                        actions.openPlan(card, card.id, .view)
                    }
                    .itemZoomSource(.plan, id: card.id)
                    .hiddenUnderPlansTabBar()
                }
                // A venue's later plans fold under its soonest one (board P3), "Your plans" too: the plan you're
                // in comes from your own plans, which don't carry the fold, so it is read from the list's row.
                if let more = card.moreTimes ?? viewModel.cards.first(where: { $0.id == card.id })?.moreTimes,
                   !more.items.isEmpty {
                    PlanFoldView(
                        planId: card.id,
                        moreTimes: more,
                        window: viewModel.window,
                        isOpen: openFolds.contains(card.id),
                        onToggle: {
                            if openFolds.contains(card.id) { openFolds.remove(card.id) } else { openFolds.insert(card.id) }
                        },
                        onOpen: { item in actions.openPlan(nil, item.id, .view) }
                    )
                    .hiddenUnderPlansTabBar()
                }
            }
        }
    }

    /// The Change screen for a repeating plan's "Change"; the plan itself where there is no such route.
    private func openChange(_ card: PlanCardDTO) {
        if let openChange = actions.openChange { openChange(card.id) } else { actions.openPlan(card, card.id, .view) }
    }
}
