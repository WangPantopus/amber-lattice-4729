//
//  MomentsStudioGuess.swift
//  Pantopus
//
//  "Guess the spot" in the Studio ("Pulse, reinvented" phase 0 step 8; CONTRACT 5a), in the Play part of the "Stamps
//  and Play" tray. A photo or video with a place, never at its author's home (the answer would point at it): others
//  see the picture but not where it was taken, drop a pin, and learn how far off they were. Sent as `guess: true`.
//

import SwiftUI

extension MomentsComposerModel {
    /// "Guess the spot" may be made here: a photo or video with a place, away from home. The server checks again
    /// (`400 MOMENT_INVALID`, `422 GUESS_AT_HOME`).
    var offersGuess: Bool {
        // A Pulse post made from it ("+ Ask / Kind") isn't a Guess the spot.
        guard let draft, draft.kind != .text, !noLocationOn, pin != nil, studioPostKind == nil else { return false }
        return place?.atHome != true
    }
}

/// The tray's Play row: "Guess the spot", on or off, with what it does in one line.
struct MomentsStudioGuessRow: View {
    let model: MomentsComposerModel

    var body: some View {
        let on = model.studioGuess
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("Play")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
            Button { model.studioGuess.toggle() } label: {
                HStack(spacing: 6) {
                    Icon(.mapPin, size: 16, strokeWidth: 2.2, color: on ? .white : Theme.Color.primaryTint)
                    Text("Guess the spot")
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(on ? Color.white : Theme.Color.appText)
                }
                .padding(.horizontal, 12)
                .frame(height: 38)
                .background(Capsule().fill(on ? Theme.Color.primarySolid : Theme.Color.appSurfaceRaised))
                .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: on ? 0 : 1))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
            .accessibilityIdentifier("moments.studio.tray.guess")
            Text("Others see the picture, not where it was taken, and drop a pin to guess. They learn how far off they were.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Over the bar while "Guess the spot" is on: what others will see.
struct MomentsStudioGuessNote: View {
    var body: some View {
        HStack(spacing: Spacing.s2) {
            Icon(.mapPin, size: 16, strokeWidth: 2.2, color: .white)
            Text("Guess the spot: others won't see where this was until they guess.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Spacing.s3)
        .padding(.vertical, Spacing.s2)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.black.opacity(0.55)))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("moments.studio.guessNote")
    }
}
