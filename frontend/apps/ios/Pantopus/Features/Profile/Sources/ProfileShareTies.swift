//
//  ProfileShareTies.swift
//  Pantopus
//
//  "Let people name me on their work" in Share your profile (CONTRACT P2.5): off, nobody can ask you, and pieces you
//  signed stop showing you. Drawn only while the server's ties are on.
//

import SwiftUI

struct ProfileShareTiesRow: View {
    let model: ProfileShareModel
    let share: ProfileShareDTO

    var body: some View {
        if let tiesEnabled = share.tiesEnabled {
            ProfileBlockCard(padded: false) {
                Toggle(isOn: Binding(
                    get: { tiesEnabled },
                    set: { on in Task { await model.setTiesEnabled(on) } }
                )) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Let people name me on their work")
                            .scaledFont(14, weight: .semibold)
                            .foregroundStyle(Theme.Color.appText)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Off: nobody can ask you, and pieces you signed stop showing you.")
                            .scaledFont(12)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .tint(Theme.Color.primarySolid)
                .disabled(model.saving.contains("ties_enabled"))
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
                .accessibilityIdentifier("profileShareTiesEnabled")
            }
        }
    }
}
