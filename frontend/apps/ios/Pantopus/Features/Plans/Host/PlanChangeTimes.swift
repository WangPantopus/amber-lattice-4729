//
//  PlanChangeTimes.swift
//  Pantopus
//
//  Plans for the holidays, find a date on the Change screen (08-extras section 2, "The Change screen while
//  picking"; no board, it reuses board 26's list). While a plan is picking, the times the host offered take the
//  place of "When": each with "Remove" (at least two stay), "Add a time" with "Up to 5", and "Removing a time clears
//  its ticks." Saving sends `date_options` through the change call; a kept time is sent back as the server gave it,
//  so it keeps its ticks. After the pick the Change screen is any plan's.
//

import SwiftUI

/// The offered times as the plan has them and as changed here.
struct PlanTimesEdit: Equatable {
    /// Whether the plan is still picking (the card carries `dates`).
    private(set) var isPicking = false
    private(set) var original: [PlanDateOptionDraft] = []
    var options: [PlanDateOptionDraft] = []
    /// Each kept time's starts and ends as the server sent them.
    private var asRead: [UUID: PlanDateOptionBody] = [:]

    init() {}

    init(card: PlanCardDTO) {
        guard let dates = card.extrasPart.dates else { return }
        isPicking = true
        for option in dates.options {
            guard let startsAt = option.startsAt, let endsAt = option.endsAt,
                  let start = PlanTime.parse(startsAt), let end = PlanTime.parse(endsAt) else { continue }
            let draft = PlanDateOptionDraft(start: start, end: end)
            asRead[draft.id] = PlanDateOptionBody(startsAt: startsAt, endsAt: endsAt)
            original.append(draft)
        }
        original.sort { $0.start < $1.start }
        options = original
    }

    /// Puts the times on `body` when one was added or removed. Answers the sentence to show instead.
    func apply(to body: inout UpdatePlanBody) -> String? {
        guard isPicking, options != original else { return nil }
        guard options.count >= 2 else { return "Offer two to five times." }
        body.dateOptions = options.sorted { $0.start < $1.start }.map {
            asRead[$0.id] ?? PlanDateOptionBody(startsAt: PlanTime.string($0.start), endsAt: PlanTime.string($0.end))
        }
        return nil
    }
}

/// "When" while picking: the offered times and what removing one does.
struct PlanChangeTimesCard: View {
    @Binding var edit: PlanTimesEdit

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text.planOverline("When")
            PlanFormCard {
                PlanOfferedTimesRows(
                    options: $edit.options,
                    daysAhead: 60,
                    fallback: edit.options.last ?? PlanDateOptionDraft(start: Date(), end: Date().addingTimeInterval(7200)),
                    keepsAtLeast: 2
                )
            }
            Text("Removing a time clears its ticks.")
                .planFont(.caption)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("planChangeTimesNote")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planChangeTimes")
    }
}
