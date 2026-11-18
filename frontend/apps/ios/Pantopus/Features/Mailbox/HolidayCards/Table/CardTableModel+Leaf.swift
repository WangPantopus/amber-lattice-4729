//
//  CardTableModel+Leaf.swift
//  Pantopus
//
//  A long note runs onto a second leaf (launch key `card_table`, plan Part 9).
//  Note side up, the first leaf lies on the card's back with "over" at its
//  foot and the main button reads Read on; it lifts from its foot, hinged at
//  its top edge, and the card's own back has the rest. Turned back to its
//  picture, the card has its first leaf in place again.
//

import Foundation

extension CardTableModel {
    /// The note's two leaves, when it has them; nil for a note on one side, a letter, a sealed card, or one being
    /// sealed (its back can't be turned there, so the note stays on one side as Part 1 fits it).
    var noteLeaves: CardTableNoteLayout.Leaves? {
        guard !content.isLetter, !content.sealed, sending == nil else { return nil }
        if let known = leavesFor, known.note == content.note { return known.leaves }
        let leaves = CardTableNoteLayout.leaves(content.note)
        leavesFor = (content.note, leaves)
        return leaves
    }

    /// The first leaf is on the back and Read on hasn't been pressed.
    var firstLeafUp: Bool {
        noteLeaves != nil && !leafLifted
    }

    /// The first leaf is drawn: until it has lifted all the way.
    var drawsFirstLeaf: Bool {
        noteLeaves != nil && leafLift < 1
    }

    /// The note side faces up with its first leaf on it (on the open Duo, the note's page): Read on, not Turn it back.
    var readsOn: Bool {
        step == .out && sending == nil && firstLeafUp && (cardBackIsUp || fold.isSpread)
    }

    /// What VoiceOver says for the main button, when it says more than its words.
    var primarySpoken: String? {
        readsOn ? "Read on, the note continues on a second leaf" : nil
    }

    /// The main button's job once the card is out, and a tap's on the card: Read on while the first leaf is up,
    /// otherwise turn the card.
    func turnOrReadOn() {
        if readsOn { liftLeaf() } else { turnCard() }
    }

    /// Read on: the first leaf lifts and is gone. The card's turn makes no sound on the iPhone, only the light tap, and
    /// so does the leaf.
    func liftLeaf() {
        guard readsOn else { return }
        leafLifted = true
        haptics.tap(.light)
        wake()
    }

    /// The first leaf in place again: the Duo opened or closed shows the note from its start.
    func putLeafBack() {
        guard leafLifted || leafLift > 0 else { return }
        leafLifted = false
        leafLift = 0
    }

    /// Moves the leaf along, 0.45 s (0.2 s fading with Reduce Motion); true while it moves. Once the picture side
    /// faces up again (the open Duo closed comes back to it too), the first leaf is back in place.
    func advanceLeaf(elapsed: Double) -> Bool {
        if !fold.isSpread, cos(springs.card.x * .pi / 180) > 0 {
            putLeafBack()
            return false
        }
        guard leafLifted, leafLift < 1 else { return false }
        leafLift = min(1, leafLift + elapsed / (reduceMotion ? 0.2 : 0.45))
        return leafLift < 1
    }

    /// How far the leaf has turned up, 0 to 1, easing in as CSS's `ease-in` does (0.42, 0, 1, 1).
    nonisolated static func leafEase(_ time: Double) -> Double {
        let time = min(1, max(0, time))
        // x(s) = 3(1-s)²s·0.42 + 3(1-s)s² + s³ is rising: find s for this time, then y(s) = 3(1-s)s² + s³.
        var low = 0.0
        var high = 1.0
        for _ in 0..<24 {
            let mid = (low + high) / 2
            let x = 3 * (1 - mid) * (1 - mid) * mid * 0.42 + 3 * (1 - mid) * mid * mid + mid * mid * mid
            if x < time { low = mid } else { high = mid }
        }
        let along = (low + high) / 2
        return 3 * (1 - along) * along * along + along * along * along
    }
}
