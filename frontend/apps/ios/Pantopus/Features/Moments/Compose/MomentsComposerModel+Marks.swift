//
//  MomentsComposerModel+Marks.swift
//  Pantopus
//
//  Text and Draw on the photo on the Post screen (boards T1–T3): the marks
//  the picture carries, the editor while it's open and what's being changed
//  in it, all held by the composer's model so a fold on the iPhone Duo keeps
//  them. Done flattens the marks into the photo that goes up
//  (`use(marked:_:)`); the X drops what changed in that visit. A new picture
//  starts clean (the draft's `didSet`), so several picked together never
//  carry one's marks to the next.
//

import SwiftUI
import UIKit

@Observable
@MainActor
final class MomentsMarking {
    enum Tool: Equatable {
        case draw, text
    }

    /// The photo at 2048 px or less, made when the editor first opens: what Done draws the marks onto.
    private(set) var base: UIImage?
    /// The marks on the Post screen's picture: what Done kept.
    private(set) var marks = MomentMarks()
    /// The editor is showing.
    private(set) var isOpen = false
    /// While the editor is open: the marks as they are being changed.
    private(set) var editing = MomentMarks()
    var tool = Tool.draw
    /// Draw's ink and line width (board T3 starts yellow, medium).
    var ink = MomentMarks.Ink.yellow
    var width = MomentMarks.Width.medium
    /// The editor's X asks first when something changed in this visit.
    var asksCancel = false
    /// Retake asks first when the picture has marks.
    var asksRetake = false
    /// A finger is drawing a line.
    @ObservationIgnored private var drawing = false
    @ObservationIgnored private var making: Task<Void, Never>?

    /// Something changed in this visit to the editor.
    var changed: Bool {
        isOpen && editing != marks
    }

    /// A new picture, Retake, or the composer starting again: no marks, the editor closed.
    func clear() {
        making?.cancel()
        making = nil
        base = nil
        marks = MomentMarks()
        editing = MomentMarks()
        isOpen = false
        asksCancel = false
        asksRetake = false
        drawing = false
    }

    /// Opens the editor on `image` with the marks it has, still editable. The 2048 px copy is made the first time.
    func open(_ tool: Tool, on image: UIImage) {
        self.tool = tool
        editing = marks
        drawing = false
        isOpen = true
        guard base == nil, making == nil else { return }
        making = Task { [weak self] in
            let made = await MomentMarksDrawing.base(image)
            guard !Task.isCancelled else { return }
            self?.base = made
        }
    }

    /// Done: the picture carries `marks` now, drawn on `base`.
    func keep(_ marks: MomentMarks, base: UIImage) {
        self.marks = marks
        self.base = base
        editing = marks
        isOpen = false
    }

    /// The X (after asking, when something changed): what changed in this visit goes.
    func cancel() {
        editing = marks
        asksCancel = false
        isOpen = false
    }

    // MARK: - Draw

    /// A finger at `point` (picture coordinates) on a picture shown `pictureWidth` points wide: a new line when the
    /// finger has just come down, else the line goes on.
    func draw(at point: CGPoint, pictureWidth: CGFloat) {
        guard isOpen, pictureWidth > 0 else { return }
        if !drawing {
            guard editing.strokes.count < MomentMarks.maxStrokes else { return }
            drawing = true
            editing.strokes.append(MomentMarks.Stroke(points: [point], ink: ink, width: width.points / pictureWidth))
            return
        }
        guard let last = editing.strokes.indices.last, let previous = editing.strokes[last].points.last else { return }
        // Under half a point apart on the screen adds nothing to the line.
        guard hypot(point.x - previous.x, point.y - previous.y) * pictureWidth >= 0.5 else { return }
        editing.strokes[last].points.append(point)
    }

    func endLine() {
        drawing = false
    }

    /// Undo: the last line goes.
    func undo() {
        guard !editing.strokes.isEmpty else { return }
        drawing = false
        editing.strokes.removeLast()
    }
}

extension MomentsComposerModel {
    /// Text and Draw are offered on a photo. They are off while a Post is going (it would swap the file being sent).
    var offersMarks: Bool {
        if case .photo = draft { return true }
        return false
    }

    /// The Post screen's Text or Draw pill.
    func openMarks(_ tool: MomentsMarking.Tool) {
        guard !isPosting, case let .photo(image) = draft else { return }
        marking.open(tool, on: image)
    }

    /// The editor's Done: nothing changed closes it; else the photo goes up with the marks drawn in.
    func applyMarks() {
        guard marking.changed, case let .photo(image) = draft else { return marking.cancel() }
        use(marked: marking.base ?? image, marking.editing)
    }

    /// The editor's X: asks first when something changed.
    func cancelMarks() {
        if marking.changed {
            marking.asksCancel = true
        } else {
            marking.cancel()
        }
    }

    /// Retake on a photo with marks asks first ("Discard this Moment?").
    func askRetake() {
        if marking.marks.isEmpty {
            retake()
        } else {
            marking.asksRetake = true
        }
    }
}
