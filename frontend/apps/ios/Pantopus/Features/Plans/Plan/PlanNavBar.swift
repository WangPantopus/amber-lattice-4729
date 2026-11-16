//
//  PlanNavBar.swift
//  Pantopus
//
//  The plain top bar of the Plans screens that aren't over a map: back or
//  close, the title, and a step label or one round button. Moved out of
//  PlanScreen.swift; "Who's coming" (Plans for the holidays) adds the button.
//

import SwiftUI

/// Board-style top bar: a 44 pt round button, a centered title, a trailing slot.
struct PlanNavBar: View {
    enum Leading { case back, close, none }

    /// A round button at the end of the bar ("Who's coming"'s plus).
    struct TrailingButton {
        let icon: PantopusIcon
        let label: String
        let action: () -> Void
    }

    let title: String
    var leading: Leading = .back
    var trailing: String?
    var onLeading: () -> Void = {}
    var trailingButton: TrailingButton?

    var body: some View {
        HStack(spacing: Spacing.s2) {
            switch leading {
            case .back:
                navButton(.chevronLeft, label: "Back")
            case .close:
                navButton(.x, label: "Close")
            case .none:
                Color.clear.frame(width: 44, height: 44)
            }
            Text(title)
                .planFont(.h4)
                .foregroundStyle(Theme.Color.appText)
                .frame(maxWidth: .infinity)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            if let trailingButton {
                Button(action: trailingButton.action) {
                    Icon(trailingButton.icon, size: 20, color: Theme.Color.appText)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(trailingButton.label)
            } else {
                Text(trailing ?? "")
                    .planFont(.label)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .frame(minWidth: 44, alignment: .trailing)
            }
        }
        .padding(.horizontal, Spacing.s3)
        .padding(.vertical, Spacing.s1)
        .frame(minHeight: 52)
    }

    private func navButton(_ icon: PantopusIcon, label: String) -> some View {
        Button(action: onLeading) {
            Icon(icon, size: 20, color: Theme.Color.appText)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Theme.Color.appSurfaceSunken))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityIdentifier("planNav.\(label.lowercased())")
    }
}

/// The post report reasons (`reportPostSchema`, backend/routes/posts.js:339).
enum PlanReportReason {
    static let all: [(token: String, label: String)] = [
        ("safety", "Something unsafe"),
        ("harassment", "Harassment"),
        ("inappropriate", "Inappropriate"),
        ("spam", "Spam or a scam"),
        ("misinformation", "Not a real plan"),
        ("other", "Something else")
    ]
}
