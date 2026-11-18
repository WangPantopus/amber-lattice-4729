//
//  MomentsMapScheduled.swift
//  Pantopus
//
//  The Sky's "Share later" (phase A, contract section 10.1): your own Moments
//  waiting for their time show in your row on the Moments map as your face
//  with "Shares at 6:40 pm", and can be deleted from there. They come only in
//  your own map read (`scheduled`, while the Sky is on for you); nobody else
//  receives them before their time, and they are never a pin. The row keeps
//  them under every time filter. The words are `SkyWords`.
//

import SwiftUI

/// Your Moments waiting to share, from the latest map read.
@Observable
@MainActor
final class MomentsScheduled {
    static let shared = MomentsScheduled()

    var moments: [MomentDTO] = []

    /// The ones still waiting now (one whose time has come leaves the row before the next read brings its ring).
    var waitingMoments: [MomentDTO] {
        let now = Date()
        return moments.filter { (MomentTime.parse($0.sky.shareAt) ?? .distantPast) > now }
    }

    var waiting: Bool {
        !waitingMoments.isEmpty
    }

    /// Deletes one before its time; false when the server said no.
    func delete(_ moment: MomentDTO) async -> Bool {
        do {
            try await MomentsAPI.send(MomentsEndpoints.delete(id: moment.id))
            moments.removeAll { $0.id == moment.id }
            return true
        } catch {
            return false
        }
    }
}

/// Your face with "Shares at 6:40 pm" for each Moment waiting to share; a tap offers Delete.
struct MomentsScheduledCells: View {
    @State private var asked: MomentDTO?
    @State private var failed = false

    var body: some View {
        HStack(spacing: 2) {
            ForEach(MomentsScheduled.shared.waitingMoments) { moment in
                Button { asked = moment } label: { cell(moment).contentShape(Rectangle()) }
                    .buttonStyle(.plain)
                    .accessibilityLabel(MomentTime.parse(moment.sky.shareAt).map(SkyWords.sharesAt) ?? SkyWords.shareLater)
                    .accessibilityHint("Offers to delete it")
                    .accessibilityIdentifier("moments.strip.scheduled.\(moment.id)")
            }
        }
        .confirmationDialog(
            SkyWords.deleteScheduledTitle,
            isPresented: Binding(get: { asked != nil }, set: { if !$0 { asked = nil } }),
            titleVisibility: .visible,
            presenting: asked
        ) { moment in
            Button(SkyWords.delete, role: .destructive) {
                Task { failed = await !MomentsScheduled.shared.delete(moment) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text(SkyWords.deleteScheduledBody)
        }
        .alert(SkyWords.couldNotDelete, isPresented: $failed) {
            Button("OK", role: .cancel) {}
        }
    }

    private func cell(_ moment: MomentDTO) -> some View {
        VStack(spacing: Spacing.s1) {
            ZStack {
                Circle().fill(MomentsPalette.pinSurface).frame(width: 55, height: 55)
                Circle()
                    .inset(by: 1.5)
                    .stroke(Theme.Color.appTextMuted, style: StrokeStyle(lineWidth: 2.5, dash: [4, 3.5]))
                    .frame(width: 54.5, height: 54.5)
                MomentAvatar(author: moment.author, size: 44)
            }
            .frame(width: 56, height: 56)
            Text(MomentTime.parse(moment.sky.shareAt).map(SkyWords.sharesAt) ?? SkyWords.shareLater)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(Theme.Color.appText)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .frame(maxWidth: 66)
        }
        .frame(width: 70)
    }
}
