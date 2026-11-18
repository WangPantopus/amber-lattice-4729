//
//  PulseSkyPlaceLine.swift
//  Pantopus
//
//  The Pulse composer's place line under the Sky (phase A, contract section
//  10.2, board 9), in place of "Posting to …": "Around Camas, WA" with a
//  small "Pin it at a place" button that opens the place picker, or "At Esther
//  Short Park" when a venue is tagged and a photo taken there pins the post.
//

import SwiftUI

struct PulseSkyPlaceLine: View {
    let area: String
    let pinnedAt: String?
    let onPin: () -> Void
    /// "Change" beside the line, when the flow offers it ("Repost with your words").
    var onChangeTarget: (() -> Void)?

    var body: some View {
        HStack(spacing: Spacing.s2) {
            if pinnedAt == nil {
                SkyFloatingIcon(size: 18, color: Theme.Color.primaryTint)
            } else {
                Icon(.mapPin, size: 16, strokeWidth: 2, color: Theme.Color.primaryTint)
            }
            Text(pinnedAt.map(SkyWords.at) ?? SkyWords.floatingOver(area))
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(Theme.Color.appText)
                .lineLimit(1)
                .accessibilityIdentifier("composePulseSkyLine")
            Spacer(minLength: Spacing.s2)
            if pinnedAt == nil {
                Button(action: onPin) {
                    Text(SkyWords.pinAtPlace)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.primaryInk)
                        .padding(.horizontal, Spacing.s3)
                        .frame(minHeight: 32)
                        .overlay(Capsule().stroke(Theme.Color.primary200, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("composePulseSkyPin")
            }
            if let onChangeTarget {
                Button("Change", action: onChangeTarget)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.primaryInk)
                    .frame(minHeight: 32)
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("composePulseChangeTarget")
            }
        }
        .padding(.horizontal, Spacing.s4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("composePulsePostingBanner")
    }
}
