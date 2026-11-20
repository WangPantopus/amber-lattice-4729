//
//  MomentsPostStage+Marks.swift
//  Pantopus
//
//  The pills over the picture on the Post screen: Retake, and on a photo
//  Text and Draw (board T1), which open the marks editor. On the phone Text
//  and Draw sit at the top right; on the iPhone Duo they follow Retake in one
//  row, because two poses keep the clock at the top right. While a Post is
//  going Text and Draw are off.
//

import SwiftUI

extension MomentsPostStage {
    /// The phone's top row: Retake at the left, Text and Draw at the right (board T1).
    var phonePills: some View {
        HStack(spacing: Spacing.s2) {
            retakeButton
            Spacer(minLength: Spacing.s2)
            markPills
        }
    }

    /// The iPhone Duo's row: Retake, then Text and Draw.
    var pillRow: some View {
        HStack(spacing: Spacing.s2) {
            retakeButton
            markPills
        }
    }

    @ViewBuilder
    private var markPills: some View {
        if model.offersMarks {
            HStack(spacing: Spacing.s2) {
                markPill(.draw, id: "moments.post.draw") {
                    Icon(.pencil, size: 18, strokeWidth: 2.2, color: .white)
                    Text("Draw")
                }
            }
            .disabled(model.isPosting)
            .opacity(model.isPosting ? 0.5 : 1)
        }
    }

    private func markPill(_ tool: MomentsMarking.Tool, id: String, @ViewBuilder label: () -> some View) -> some View {
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
        .accessibilityIdentifier("moments.post.retake")
    }
}
