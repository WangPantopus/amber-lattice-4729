//
//  MomentsPostStage+Marks.swift
//  Pantopus
//
//  The pills over the picture on the Post screen: Retake, and on a photo
//  Text, Draw and Resize (board T1), which open the marks editor in that tool. On the phone
//  they sit at the top right; on the iPhone Duo they follow Retake in one
//  row, because two poses keep the clock at the top right. Where the row is
//  too narrow for all four, Resize goes on a row of its own under it. While a
//  Post is going they are off.
//

import SwiftUI

extension MomentsPostStage {
    /// The phone's top row: Retake at the left, Text, Draw and Resize at the right (board T1); Resize under Draw where
    /// the four don't fit across (every phone narrower than 429 points).
    var phonePills: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Spacing.s2) {
                retakeButton
                Spacer(minLength: Spacing.s2)
                markPills(withResize: true)
            }
            VStack(alignment: .trailing, spacing: Spacing.s2) {
                HStack(spacing: Spacing.s2) {
                    retakeButton
                    Spacer(minLength: Spacing.s2)
                    markPills(withResize: false)
                }
                resizePill
            }
        }
    }

    /// The iPhone Duo's row: Retake, then Text, Draw and Resize; Resize under Retake where they don't fit across.
    var pillRow: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Spacing.s2) {
                retakeButton
                markPills(withResize: true)
            }
            VStack(alignment: .leading, spacing: Spacing.s2) {
                HStack(spacing: Spacing.s2) {
                    retakeButton
                    markPills(withResize: false)
                }
                resizePill
            }
        }
    }

    /// Resize (step R1, a photo): a pill like Text and Draw, off while a Post is going.
    @ViewBuilder
    private var resizePill: some View {
        if model.offersResize {
            markPill(.resize, name: "Resize", id: "moments.post.resize") {
                Icon(.maximize, size: 17, strokeWidth: 2.2, color: .white)
                Text("Resize")
            }
            .disabled(model.isPosting)
            .opacity(model.isPosting ? 0.5 : 1)
        }
    }

    @ViewBuilder
    private func markPills(withResize: Bool) -> some View {
        if model.offersMarks {
            HStack(spacing: Spacing.s2) {
                markPill(.text, name: "Text", id: "moments.post.text") {
                    // "Aa" is lettering, not an icon (board T1).
                    Text("Aa").font(.system(size: 16, weight: .bold)).kerning(-0.5)
                    Text("Text")
                }
                markPill(.draw, name: "Draw", id: "moments.post.draw") {
                    Icon(.pencil, size: 18, strokeWidth: 2.2, color: .white)
                    Text("Draw")
                }
            }
            .disabled(model.isPosting)
            .opacity(model.isPosting ? 0.5 : 1)
            if withResize { resizePill }
        }
    }

    private func markPill(_ tool: MomentsMarking.Tool, name: String, id: String, @ViewBuilder label: () -> some View) -> some View {
        Button { model.openMarks(tool) } label: {
            HStack(spacing: 6) { label() }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.leading, Spacing.s3)
                .padding(.trailing, 14)
                .frame(height: 40)
                .background(Capsule().fill(Color.black.opacity(0.42)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(name)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier(id)
    }

    var retakeButton: some View {
        let isText = model.draft == .text
        return Button { model.askRetake() } label: {
            HStack(spacing: Spacing.s1) {
                Icon(.chevronLeft, size: 20, strokeWidth: 2.2, color: .white)
                Text(isText ? "Edit" : "Retake").font(.system(size: 15, weight: .semibold))
            }
            .foregroundStyle(.white)
            .padding(.leading, Spacing.s2)
            .padding(.trailing, 14)
            .frame(height: 40)
            .background(Capsule().fill(Color.black.opacity(isText ? 0.25 : 0.42)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        // Off from the request that makes the Moment until that Post ends; before that it cancels the Post.
        .disabled(model.isSending)
        .opacity(model.isSending ? 0.5 : 1)
        .accessibilityIdentifier("moments.post.retake")
    }
}
