//
//  PenNameSettingsCard.swift
//  Pantopus
//
//  Settings → Privacy, under "How others see you": the person's made-up name and its drawn picture. A tap opens the
//  made-up name screen to change it (`replace: true`; the server's sentence when it is too soon), or to choose one
//  the first time. Hidden when the account has none and may not have one. Test tags are mirrored on Android.
//

import SwiftUI

struct PenNameSettingsCard: View {
    @State private var showsSetup = false
    private var store: PenNameStore {
        .shared
    }

    var body: some View {
        Group {
            if let me = store.me, me.penName != nil || me.allowed {
                Button { showsSetup = true } label: { row(me) }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityHint(me.penName == nil ? "Chooses a made-up name" : "Changes your made-up name")
                    .accessibilityIdentifier("penNameSettings")
            }
        }
        .task { await store.load(force: true) }
        .sheet(isPresented: $showsSetup) {
            PenNameSetupView(replacing: store.penName != nil)
        }
    }

    private func row(_ me: PenNameMeResponse) -> some View {
        HStack(spacing: Spacing.s3) {
            PenNameAvatar(name: me.penName?.name ?? "?", url: me.penName?.avatar, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text("Made-up name")
                    .pantopusTextStyle(.body)
                    .fontWeight(.semibold)
                    .foregroundStyle(Theme.Color.appText)
                Text(me.penName
                    .map { "\($0.name) · Only you can see this is you" } ??
                    "Post without your name. Pantopus gives you one, or type your own.")
                    .pantopusTextStyle(.caption)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("penNameSettingsName")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurface)
        .overlay(
            RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                .stroke(Theme.Color.appBorder, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
        .contentShape(Rectangle())
    }
}
