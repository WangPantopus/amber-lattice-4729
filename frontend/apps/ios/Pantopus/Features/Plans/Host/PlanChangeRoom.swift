//
//  PlanChangeRoom.swift
//  Pantopus
//
//  Plans for the holidays (06-screens A3, "The Change screen"): the Change
//  screen of a private plan gains the host form's "Room for" (from the seats
//  already taken up to 100) and "Kids welcome". They save with the shipped
//  change call (`spots`, `kids_welcome`); a refusal shows the server's own
//  sentence.
//

import SwiftUI

/// The two rows, drawn as the host form's: "Room for" with its stepper, then "Kids welcome" in "Add to this plan".
struct PlanChangeRoomRows: View {
    @Binding var spots: Int
    @Binding var kidsWelcome: Bool
    /// Seats already taken: the room is never offered below them.
    let seatsTaken: Int

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s6) {
            HStack {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Room for").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    Text("Adults and kids, besides your household")
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                PlanStepper(value: $spots, range: Self.range(seatsTaken: seatsTaken, spots: spots), label: "Room for", holdStep: 5)
                    .accessibilityIdentifier("planChangeRoomFor")
            }
            PlanFormField(label: "Add to this plan") {
                PlanFormCard {
                    PlanExtraSwitchRow(
                        icon: .users,
                        title: "Kids welcome",
                        subtitle: "Guests say how many adults and kids",
                        isOn: $kidsWelcome
                    )
                    .accessibilityIdentifier("planChangeKidsWelcome")
                }
            }
        }
    }

    /// From the seats taken (at least 1) up to 100; a plan already over its room keeps its own number.
    static func range(seatsTaken: Int, spots: Int) -> ClosedRange<Int> {
        let lower = max(1, min(seatsTaken, spots))
        return lower...max(lower, PlanChangeRoomRows.most)
    }

    /// The most a private plan with guest answers has room for.
    static let most = 100
}

extension PlanCardDTO {
    /// The Change screen offers "Room for" and "Kids welcome": the host's own private plan with H1's answers
    /// (not a business's, a playdate or a pickup game), as the host form does.
    @MainActor var changesRoom: Bool {
        PlansFlags.shared.guestAnswers && isPrivate && takesGuestAnswers && kind != .pickupGame
    }
}
