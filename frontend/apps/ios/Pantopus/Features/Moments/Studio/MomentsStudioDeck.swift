//
//  MomentsStudioDeck.swift
//  Pantopus
//
//  A step deck in the Studio ("Pulse, reinvented" phase 2; CONTRACT 7g): two to four photos or videos of one recipe or
//  repair, picked together in the library, posted one by one as today's several are, each with its own caption and its
//  own voice tip. The drawer of the first offers "Post these 3 as steps", off by default; on, every step says which it
//  is, and the Studio says once that readers can save the steps' words. Under a made-up name, as a Pulse post, as a
//  before and after, or for a video posted in parts, nothing of it is sent. Each step is an ordinary Moment to anyone
//  whose switch is off.
//

import Observation
import SwiftUI

/// The deck being made: its id (the same on every step) and how many steps.
struct MomentsStudioDeck: Equatable {
    let id = UUID().uuidString.lowercased()
    let count: Int
    /// The first step went out carrying the deck: the ones after it may follow it (the server refuses a later step
    /// whose first was never posted).
    var started = false
}

/// The deck of the composer open now, held beside it (one composer at a time): nil for any other.
@Observable
@MainActor
final class MomentsStudioDeckHolder {
    static let shared = MomentsStudioDeckHolder()

    @ObservationIgnored private weak var owner: MomentsComposerModel?
    private var held: MomentsStudioDeck?

    func deck(of model: MomentsComposerModel) -> MomentsStudioDeck? {
        // Read first, so whoever asks is told when it changes (even before this composer first set it).
        let current = held
        return owner === model ? current : nil
    }

    func set(_ deck: MomentsStudioDeck?, of model: MomentsComposerModel) {
        owner = model
        held = deck
    }
}

extension MomentsComposerModel {
    /// The step deck for the ones picked together; nil sends nothing. Only the Studio sets it.
    var studioDeck: MomentsStudioDeck? {
        get { MomentsStudioDeckHolder.shared.deck(of: self) }
        set { MomentsStudioDeckHolder.shared.set(newValue, of: self) }
    }

    /// Where the photo or video in the Studio is among several picked together (1 for the first); nil for one alone.
    var pickedStep: Int? {
        pickedTogether > 1 ? pickedTogether - waiting.count : nil
    }

    /// The deck may go with this Moment: a photo or video under the person's own name, as a Moment, not a before and
    /// after.
    private var deckFits: Bool {
        guard let draft, draft.kind != .text else { return false }
        return !postsUnderMadeUpName && studioPostKind == nil && studioPair == nil
    }

    /// "Post these N as steps" may be chosen: the first of two to four picked together.
    var offersDeck: Bool {
        (2...4).contains(pickedTogether) && pickedStep == 1 && deckFits
    }

    /// The drawer shows the deck's row: to start one, or on a step of the one being made.
    var showsDeckRow: Bool {
        offersDeck || (studioDeck != nil && deckFits && (pickedStep ?? 0) > 1)
    }

    /// What this Moment sends as its step, and that the deck has started (`+Posting`); nil sends nothing.
    func takeDeckStep() -> MomentDeckBody? {
        guard let deck = studioDeck, deck.count == pickedTogether, let step = pickedStep, deckFits else { return nil }
        guard step == 1 || deck.started else { return nil }
        if step == 1 { studioDeck?.started = true }
        return MomentDeckBody(id: deck.id, index: step, count: deck.count)
    }
}

/// The drawer's row: "Post these 3 as steps" on the first, "Step 2 of 3" on the ones after it.
struct MomentsStudioDeckRow: View {
    let model: MomentsComposerModel
    /// The switch as shown; the deck itself is held beside the composer (`MomentsStudioDeckHolder`).
    @State private var on = false

    private var first: Bool {
        model.pickedStep == 1
    }

    var body: some View {
        Toggle(isOn: $on) {
            VStack(alignment: .leading, spacing: 1) {
                Text(first ? "Post these \(model.pickedTogether) as steps" : "Step \(model.pickedStep ?? 1) of \(model.pickedTogether)")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Color.appText)
                Text(line)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(Theme.Color.primarySolid)
        .padding(.horizontal, Spacing.s1)
        .frame(minHeight: 52)
        .onAppear { on = model.studioDeck != nil }
        .onChange(of: on) { _, wanted in
            // Started only on the first; on a later step it can only be switched off (the rest go as their own).
            if wanted, !first, model.studioDeck == nil { return on = false }
            model.studioDeck = wanted ? model.studioDeck ?? MomentsStudioDeck(count: model.pickedTogether) : nil
        }
        .accessibilityIdentifier("moments.studio.deck")
    }

    private var line: String {
        if !on {
            return "One recipe or repair, step by step. Each gets its own words and voice tip."
        }
        return first ? "Readers can save your steps' words." : "Off, this one and the rest go as their own Moments."
    }
}
