//
//  TogetherStudioRows.swift
//  Pantopus
//
//  Phase 3's rows in the Studio's drawer (CONTRACT 8), and the Retake's ghost on the Studio's picture. Hung on the
//  Studio by one line each (the hook rule): they draw nothing unless the switch is on and the row applies. Words as the
//  web's Studio.
//

import SwiftUI

struct TogetherStudioRows: View {
    let model: MomentsComposerModel
    @State private var together = TogetherStudio.shared
    @State private var flags = PulseReinventedFlags.shared

    var body: some View {
        if flags.isOn {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                if case let .retakeFrame(_, title, ghost) = together.context {
                    addingRow(title: title, hasGhost: ghost != nil)
                } else if model.offersRetake {
                    retakeRow
                }
            }
            .onAppear { together.claim(model) }
        }
    }

    /// "Adding to “The cedar bench”", and the first picture shown or hidden.
    private func addingRow(title: String, hasGhost: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Adding to “\(title)”")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.appText)
            Text("Stand where the first picture was taken. Your frame joins the Retake and stays.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if hasGhost {
                Toggle(isOn: $together.ghostOn) {
                    Text("Show the first picture")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.Color.appText)
                }
                .tint(Theme.Color.primarySolid)
                .accessibilityIdentifier("together.studio.ghost")
            }
        }
        .padding(.horizontal, Spacing.s1)
        .padding(.vertical, Spacing.s2)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("together.studio.adding")
    }

    /// "Start a Retake", and its name.
    private var retakeRow: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Toggle(isOn: $together.startsRetake) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Start a Retake")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.Color.appText)
                    Text("A Retake shows this exact spot and stays, so others can stand here.")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .tint(Theme.Color.primarySolid)
            .frame(minHeight: 52)
            .accessibilityIdentifier("together.studio.retake")
            if together.startsRetake {
                TextField("Its name, like The cedar bench", text: $together.retakeTitle)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: together.retakeTitle) { _, new in
                        if new.count > 60 { together.retakeTitle = String(new.prefix(60)) }
                    }
                    .accessibilityLabel("The Retake's name")
                    .accessibilityIdentifier("together.studio.retakeTitle")
            }
        }
        .padding(.horizontal, Spacing.s1)
    }
}

/// On the Studio's stage, under everything else: claims the Studio for phase 3's choices (the drawer may never be
/// opened), and while adding a frame to a Retake shows its first picture over the Studio's own, to line up with (as the
/// web's Studio). Always drawn while the switch is on, so it appears with the Studio.
struct TogetherStudioGhost: View {
    let model: MomentsComposerModel
    @State private var together = TogetherStudio.shared
    @State private var flags = PulseReinventedFlags.shared

    var body: some View {
        if flags.isOn {
            ZStack {
                Color.clear
                if together.ghostOn, case let .retakeFrame(_, _, ghost?) = together.context {
                    AsyncImage(url: ghost) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color.clear
                    }
                    .opacity(0.4)
                    .clipped()
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear { together.claim(model) }
            // The Studio closed, posted, or gave way to today's Post sheet: its choices go with it.
            .onDisappear { together.release(model) }
        }
    }
}
