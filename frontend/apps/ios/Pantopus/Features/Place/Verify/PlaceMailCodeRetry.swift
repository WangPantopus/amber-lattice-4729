//
//  PlaceMailCodeRetry.swift
//  Pantopus
//
//  The button under a Place card's load error. A person verified by a fast
//  check (FASTVERIFY) is refused the mail-level cards (Block founders, Rate
//  watch) with "This needs a mailed code. Ask for the postcard in Place.";
//  trying again can't change that, so they get "Mail me a code". Everyone
//  else, and everyone while the switch is off, keeps today's "Try again".
//

import SwiftUI

struct PlaceMailCodeRetry: View {
    let homeId: String
    /// Opens the postcard screen; nil where the page has no way to it.
    let onMailCode: (() -> Void)?
    let retry: () async -> Void

    private var needsMail: Bool {
        onMailCode != nil && HomeVerifyOptionsStore.shared.cached(homeId: homeId)?.canRequestNeededMail == true
    }

    var body: some View {
        Button {
            if needsMail, let onMailCode {
                onMailCode()
            } else {
                Task { await retry() }
            }
        } label: {
            // Drawn as today's "Try again" link, so nothing moves while the switch is off.
            Text(needsMail ? "Mail me a code" : "Try again")
                .font(.system(size: 13, weight: .semibold))
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.Color.primaryInk)
        .accessibilityIdentifier(needsMail ? "place.mailCode" : "place.tryAgain")
    }
}
