//
//  PlanHostAnswers.swift
//  Pantopus
//
//  Plans for the holidays, board 4: on the host's page of a plan that takes
//  answers, the three counts and, under them, the people line with each
//  person's numbers ("Dana + 2 kids, Sam, Priya + 1 and 2 more"). Tapping
//  either opens "Who's coming" (board 17), which holds every row and Remove.
//

import SwiftUI

struct PlanHostAnswers: View {
    let card: PlanCardDTO
    let answers: PlanAnswerCountsDTO
    let people: [PlanPersonDTO]
    let onOpenGuests: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Button(action: onOpenGuests) {
                PlanAnswerCounts(answers: answers, headcount: card.headcount, kidsWelcome: card.kidsWelcome)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint("Opens who's coming")
            .accessibilityIdentifier("planHostCounts")
            let guests = people.filter { !$0.isHost }
            if !guests.isEmpty {
                Button(action: onOpenGuests) {
                    HStack(spacing: Spacing.s2) {
                        PlanPeopleLine(people: guests, myPartySize: 1, kidsWelcome: card.kidsWelcome)
                        Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityHint("Opens who's coming")
                .accessibilityIdentifier("planHostPeopleLine")
            }
        }
    }
}
