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
                    addingRow(title: title, hasGhost: ghost != nil, photo: model.isPhoto)
                } else if case let .eyesOnAnswer(_, question) = together.context {
                    answeringRow(question)
                } else if model.offersEyesOnAsk {
                    eyesOnAskRow
                } else {
                    if model.offersRetake { retakeRow }
                    if model.offersSeal { sealRow }
                }
            }
            .onAppear { together.claim(model) }
        }
    }

    /// "Adding to “The cedar bench”", and the first picture shown or hidden.
    private func addingRow(title: String, hasGhost: Bool, photo: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Adding to “\(title)”")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.appText)
            Text(photo
                ? "Stand where the first picture was taken. Your frame joins the Retake and stays."
                : "Only a photo joins the Retake. This posts as an ordinary Moment.")
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

    /// "Answering “Is the trail muddy?” with a Live photo".
    private func answeringRow(_ question: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Answering “\(question)” with a Live photo")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.appText)
            Text("Take the photo there, now: your Moment answers their question.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, Spacing.s1)
        .padding(.vertical, Spacing.s2)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("together.studio.answering")
    }

    /// "Eyes on: ask people who are there now", on an Ask.
    private var eyesOnAskRow: some View {
        Toggle(isOn: $together.asksEyesOnChosen) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Eyes on: ask people who are there now")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Color.appText)
                Text(together.asksEyesOnChosen && model.pickedVenue == nil
                    ? "Pick the place you're asking about: choose a place above."
                    : "For six hours, people at this place can answer with a Live photo. Nobody is told who is near it.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(Theme.Color.primarySolid)
        .frame(minHeight: 52)
        .padding(.horizontal, Spacing.s1)
        .accessibilityIdentifier("together.studio.eyesOn")
    }

    /// "Seal it: it opens later": not sealed, on a date, when someone stands here, the next time it rains here.
    private var sealRow: some View {
        let placeOK = model.sealPlaceOK
        let choices = [
            ("none", "Not sealed"),
            ("date", "On a date"),
            ("place", "When someone stands here"),
            ("rain", "The next time it rains here")
        ]
        return VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("Seal it: it opens later")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.Color.appText)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.s2) {
                    ForEach(choices, id: \.0) { key, title in
                        let on = together.sealOpens == key
                        let off = (key == "place" || key == "rain") && !placeOK
                        Button { together.sealOpens = key } label: {
                            Text(title)
                                .font(.system(size: 13.5, weight: .semibold))
                                .foregroundStyle(on ? Color.white : Theme.Color.appText)
                                .padding(.horizontal, 12)
                                .frame(height: 34)
                                .background(Capsule().fill(on ? Theme.Color.primarySolid : Theme.Color.appSurfaceRaised))
                        }
                        .buttonStyle(.plain)
                        .disabled(off)
                        .opacity(off ? 0.45 : 1)
                        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                        .accessibilityIdentifier("together.studio.seal.\(key)")
                    }
                }
            }
            if together.sealOpens == "date" {
                DatePicker(
                    "When it opens",
                    selection: $together.sealAt,
                    in: Date().addingTimeInterval(61 * 60)...Date().addingTimeInterval(5 * 365 * 86400)
                )
                .font(.system(size: 14))
                .accessibilityIdentifier("together.studio.seal.at")
            }
            Text(sealNote(placeOK: placeOK))
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, Spacing.s1)
        .padding(.vertical, Spacing.s2)
    }

    private func sealNote(placeOK: Bool) -> String {
        switch together.sealOpens {
        case "none": "Until it opens, only you see what it holds."
        case "place" where !placeOK, "rain" where !placeOK: "This needs its exact place, on a photo or words."
        default: "Until it opens, only you see what it holds. It stays, so it's there when it opens."
        }
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
