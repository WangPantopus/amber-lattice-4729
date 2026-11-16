//
//  PlanAnswerCounts.swift
//  Pantopus
//
//  Plans for the holidays, boards 4 and 17: the host's three counts in one
//  row, "9 coming · 6 adults, 3 kids", "2 maybe", "3 haven't answered", counted
//  in people. The adults-and-kids part shows only with kids welcome. On the
//  host's plan page and at the top of "Who's coming".
//

import SwiftUI

struct PlanAnswerCounts: View {
    let answers: PlanAnswerCountsDTO
    let headcount: PlanHeadcountDTO?
    let kidsWelcome: Bool

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let tiles = Group {
            tile(answers.inCount, comingLine, identifier: "planCountsComing")
            tile(answers.maybe, "maybe", identifier: "planCountsMaybe")
            tile(answers.noAnswer, "haven't answered", identifier: "planCountsNoAnswer")
        }
        if typeSize.isAccessibilitySize {
            VStack(spacing: Spacing.s2) { tiles }
        } else {
            HStack(alignment: .top, spacing: Spacing.s2) { tiles }
        }
    }

    /// "coming · 6 adults, 3 kids" with kids welcome; "coming" otherwise.
    private var comingLine: String {
        guard kidsWelcome, let headcount, headcount.total > 0 else { return "coming" }
        return "coming · " + PlanHeadcountCopy.adultsAndKids(headcount)
    }

    private func tile(_ number: Int, _ words: String, identifier: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(number)")
                .planFont(.h3)
                .monospacedDigit()
                .foregroundStyle(Theme.Color.appText)
            Text(words)
                .planFont(.caption)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, Spacing.s3)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.Color.appSurfaceSunken))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(number) \(words)")
        .accessibilityIdentifier(identifier)
    }
}

extension PlanHeadcountCopy {
    /// A row's numbers: "2 adults, 1 kid" with kids welcome; "1 person", "3 people" otherwise.
    static func people(adults: Int, kids: Int, kidsWelcome: Bool) -> String {
        if kidsWelcome { return adultsAndKids(adults: adults, kids: kids) }
        let total = adults + kids
        return total == 1 ? "1 person" : "\(total) people"
    }
}
