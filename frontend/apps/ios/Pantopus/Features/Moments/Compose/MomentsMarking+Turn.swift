//
//  MomentsMarking+Turn.swift
//  Pantopus
//
//  Turning a label (step R3, founder 2026-11-21): in Text a two-finger twist
//  turns the picked label about its middle while the pinch resizes it, and it
//  sticks to quarter turns within 3 degrees with a light tick. The upright box
//  around the turned label stays inside the part every phone shows, held as
//  after any move; a twist it can't fit there, even moved and at the smallest
//  letters, isn't applied, and the label keeps the last angle that fit.
//  VoiceOver turns it 15 degrees at a time.
//

import UIKit

extension MomentsMarking {
    /// Two fingers twisting on the picture in Text: the picked label turns by `degrees` since they came down. Not the
    /// label being typed in, which is shown upright.
    func twist(_ degrees: CGFloat) {
        guard typing == nil, let id = picked, let label = label(id) else { return }
        if turnedFrom == nil { turnedFrom = label.turn }
        guard let from = turnedFrom else { return }
        turn(id, to: MomentPlacement.normalized(from + degrees))
    }

    func endTwist() {
        turnedFrom = nil
    }

    /// VoiceOver's Turn left and Turn right.
    func turnLabel(_ id: UUID, by degrees: CGFloat) {
        guard let label = label(id) else { return }
        pick(id)
        turn(id, to: MomentPlacement.normalized(label.turn + degrees))
    }

    /// The label at `turn` (stuck to a quarter turn within 3 degrees), held in the part every phone shows; left as it
    /// is when it can't fit there turned so.
    private func turn(_ id: UUID, to turn: CGFloat) {
        guard var next = label(id) else { return }
        let stuck = MomentPlacement.quarter(near: turn) ?? turn
        guard next.turn != stuck else { return }
        let wasCaught = MomentPlacement.quarter(near: next.turn) != nil
        next.turn = stuck
        let held = clamped(next)
        guard fits(held) else { return }
        // A light tick when it catches a quarter turn.
        if !wasCaught, MomentPlacement.quarter(near: turn) != nil {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
        update(id) { $0 = held }
    }

    /// The upright box around `label`, laid out and turned, fits inside the part every phone shows.
    func fits(_ label: MomentMarks.Label) -> Bool {
        let safe = MomentMarks.safeBox(aspect: aspect)
        let unit = MomentMarksDrawing.unit
        let box = MomentMarksDrawing.turned(MomentMarksDrawing.lay(label, aspect: aspect).box.size, by: label.turn)
        return box.width <= safe.width * unit + 0.5 && box.height <= safe.height * unit / max(aspect, 0.01) + 0.5
    }
}
