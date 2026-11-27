//
//  MomentsStudioBeforeAfter.swift
//  Pantopus
//
//  Before and after in the Studio ("Pulse, reinvented" phase 0 step 5; CONTRACT 7g; the lead's answer of 2026-11-27
//  05:19). Two photos picked together in the library: the one in the Studio is the before, the next one the after. The
//  after is cut to the before's size and shape and both are drawn side by side into ONE picture (left before, right
//  after), which is what posts, with a `before_after` play item: no second upload. Today's screens, the apps in the
//  stores and anyone whose switch is off see that side-by-side picture as it is; the Studio and the new viewer show one
//  half over the other with a curtain (`MomentBeforeAfterView`). Words and drawings already on the before are drawn into
//  it; after that the picture takes stamps only, placed on one half's frame. "Take apart" puts both photos back.
//

import Photos
import SwiftUI
import UIKit

/// A before and after in the Studio: the picture it made, and what "Take apart" puts back.
struct MomentsStudioPair {
    /// The side-by-side picture it made: while the Studio's photo is still that one, the pair holds.
    let made: UIImage
    /// The before as it was (its photo and its marks), the after's library item, and how many were picked together.
    let before: UIImage
    let beforeMarks: MomentMarks
    let after: PHAsset
    let pickedTogether: Int
    /// The two words over the halves; empty is "Before" and "After".
    var beforeLabel = ""
    var afterLabel = ""
}

extension MomentPlayItem {
    /// The before and after item: its place on the picture means nothing, so it sits in the middle.
    static func beforeAfter(before: String, after: String) -> MomentPlayItem {
        var item = MomentPlayItem(id: "before-after", kind: .beforeAfter)
        let before = before.trimmingCharacters(in: .whitespacesAndNewlines)
        let after = after.trimmingCharacters(in: .whitespacesAndNewlines)
        item.before = before.isEmpty ? nil : String(before.prefix(24))
        item.after = after.isEmpty ? nil : String(after.prefix(24))
        return item
    }
}

extension MomentsComposerModel {
    /// The before and after on the photo now in the Studio, while the photo is the one it made.
    var studioPair: MomentsStudioPair? {
        guard let pair = marking.studio?.pair, case let .photo(image) = draft, image === pair.made else { return nil }
        return pair
    }

    /// Before and after may be made: a photo, on no canvas and with no cutouts, with a photo picked together after it.
    var offersBeforeAfter: Bool {
        guard offersLooks, studioPair == nil, marking.placement == nil, marking.studio?.cutouts.isEmpty ?? true else { return false }
        return waiting.first?.mediaType == .image
    }

    /// The Studio's playable items as they go out (CONTRACT 7b, 7g); nil when there are none.
    var studioPlay: [MomentPlayItem]? {
        var items: [MomentPlayItem] = []
        if let pair = studioPair { items.append(.beforeAfter(before: pair.beforeLabel, after: pair.afterLabel)) }
        return items.isEmpty ? nil : items
    }

    /// This photo before and the next one picked together after, side by side in one picture. The after leaves the
    /// queue: the pair is one Moment.
    func makeBeforeAfter() async {
        guard offersBeforeAfter, case let .photo(photo) = draft, let next = waiting.first else { return }
        guard let afterPhoto = await MomentsLibraryLoader.image(for: next) else {
            error = "Couldn't open the after photo. Try another one."
            return
        }
        // A Retake or a Post meanwhile: nothing changes.
        guard case let .photo(still) = draft, still === photo, waiting.first == next, !isPosting else { return }
        let marks = marking.marks
        let made = await Task.detached(priority: .userInitiated) {
            MomentsBeforeAfterDrawing.sideBySide(marks.isEmpty ? photo : MomentMarksDrawing.flatten(photo, marks), afterPhoto)
        }.value
        guard case let .photo(again) = draft, again === photo else { return }
        let picked = pickedTogether
        waiting.removeFirst()
        // "2 of 3" counts Moments: the pair is one of them.
        pickedTogether = waiting.isEmpty ? 0 : pickedTogether - 1
        if marking.studio == nil { marking.studio = MomentsStudioTools() }
        marking.studio?.look = .original
        marking.studio?.lookOriginal = nil
        marking.studio?.lookResult = nil
        marking.studio?.pair = MomentsStudioPair(made: made, before: photo, beforeMarks: marks, after: next, pickedTogether: picked)
        use(marked: made, MomentMarks(), placement: nil)
    }

    /// Both photos back as they were: the before here with its words and drawings, the after next in line.
    func takeApartBeforeAfter() {
        guard let pair = studioPair, !isPosting else { return }
        marking.studio?.pair = nil
        waiting.insert(pair.after, at: 0)
        pickedTogether = pair.pickedTogether
        use(marked: pair.before, pair.beforeMarks, placement: nil)
    }

    /// The words over one half, as the tray edits them.
    func pairLabel(after: Bool) -> Binding<String> {
        Binding(
            get: { (after ? self.studioPair?.afterLabel : self.studioPair?.beforeLabel) ?? "" },
            set: { typed in
                guard self.studioPair != nil else { return }
                let kept = String(typed.prefix(24))
                if after { self.marking.studio?.pair?.afterLabel = kept } else { self.marking.studio?.pair?.beforeLabel = kept }
            }
        )
    }
}

/// The tray's "Before and after": offered while the next photo picked together waits; once made, its two words and
/// "Take apart".
struct MomentsStudioBeforeAfterRow: View {
    let model: MomentsComposerModel
    let onDone: () -> Void
    @State private var making = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("Before and after")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
            if model.studioPair != nil {
                made
            } else {
                offer
            }
        }
    }

    private var offer: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Button {
                making = true
                Task {
                    await model.makeBeforeAfter()
                    making = false
                    onDone()
                }
            } label: {
                chip(making ? "Putting them side by side…" : "This photo before, the next one after", icon: .layers)
            }
            .buttonStyle(.plain)
            .disabled(making)
            .accessibilityIdentifier("moments.studio.beforeAfter")
            Text("Both go out side by side as one picture, the same size and shape. Others drag a curtain between them.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var made: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack(spacing: Spacing.s2) {
                label("Before", text: model.pairLabel(after: false), id: "moments.studio.beforeAfter.before")
                label("After", text: model.pairLabel(after: true), id: "moments.studio.beforeAfter.after")
            }
            Button { model.takeApartBeforeAfter() } label: {
                chip("Take apart", icon: .x)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("moments.studio.beforeAfter.apart")
        }
    }

    private func label(_ placeholder: String, text: Binding<String>, id: String) -> some View {
        TextField("", text: text, prompt: Text(placeholder).foregroundColor(Theme.Color.appTextSecondary))
            .font(.system(size: 14.5, weight: .semibold))
            .foregroundStyle(Theme.Color.appText)
            .submitLabel(.done)
            .padding(.horizontal, 12)
            .frame(height: 38)
            .typesInFieldOnTap()
            .background(Capsule().fill(Theme.Color.appSurfaceRaised))
            .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: 1))
            .accessibilityLabel("\(placeholder) label")
            .accessibilityIdentifier(id)
    }

    private func chip(_ words: String, icon: PantopusIcon) -> some View {
        HStack(spacing: 6) {
            Icon(icon, size: 16, strokeWidth: 2.2, color: Theme.Color.primaryTint)
            Text(words)
                .font(.system(size: 14.5, weight: .semibold))
                .foregroundStyle(Theme.Color.appText)
        }
        .padding(.horizontal, 12)
        .frame(height: 38)
        .background(Capsule().fill(Theme.Color.appSurfaceRaised))
        .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: 1))
        .contentShape(Capsule())
    }
}
