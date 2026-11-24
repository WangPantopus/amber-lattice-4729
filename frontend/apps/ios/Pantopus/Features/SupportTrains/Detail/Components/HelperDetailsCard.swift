//
//  HelperDetailsCard.swift
//  Pantopus
//
//  The train page's "Good to know" card: what helpers should know (allergies, diet, household, drop-off,
//  instructions). The detail screen shows it, and the Start wizard's iPad preview shows it as it is filled in.
//

import SwiftUI

@MainActor
struct HelperDetailsCard: View {
    let lines: [SupportTrainDetailContent.HelperDetailLine]
    var identifier = "supportTrainHelperDetails"

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            ForEach(lines) { line in
                VStack(alignment: .leading, spacing: 2) {
                    Text(line.label)
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                    Text(line.value)
                        .font(.system(size: 13.5))
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                .stroke(Theme.Color.appBorder, lineWidth: 1)
        )
        .accessibilityIdentifier(identifier)
    }
}
