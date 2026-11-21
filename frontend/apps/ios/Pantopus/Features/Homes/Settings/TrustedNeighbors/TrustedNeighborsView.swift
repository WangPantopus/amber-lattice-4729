//
//  TrustedNeighborsView.swift
//  Pantopus
//
//  A14.1 — Trusted neighbors list placeholder until approve/list API lands.
//  Mirrors Android `TrustedNeighborsScreen`.
//

// swiftlint:disable line_length

import SwiftUI

public struct TrustedNeighborsView: View {
    private let onBack: @MainActor () -> Void

    public init(onBack: @escaping @MainActor () -> Void) {
        self.onBack = onBack
    }

    public var body: some View {
        ContentDetailShell(
            title: "Trusted people",
            onBack: onBack,
            header: { EmptyView() },
            body: {
                EmptyState(
                    icon: .users,
                    headline: "No trusted people yet",
                    subcopy: "Trusted people can receive packages and help with access when you're away. People you approve will appear here."
                )
            },
            cta: { EmptyView() }
        )
        .background(Theme.Color.appBg)
        .accessibilityIdentifier("trustedNeighbors")
    }
}
