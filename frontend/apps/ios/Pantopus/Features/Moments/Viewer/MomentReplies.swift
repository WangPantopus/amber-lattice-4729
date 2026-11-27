//
//  MomentReplies.swift
//  Pantopus
//
//  Replies people can see on a Moment ("Pulse, reinvented" phase 3, PHASE-3 piece 4; CONTRACT 8a; founder's decision
//  3). On a Friends Moment replies show under it; on a Nearby Moment only if its author chose so; never on a
//  made-up-name Moment; and only while the switch is on for the Moment's author (the server decides each). Under the
//  viewer's header a chip reads "3 replies" (or "Reply for everyone") and opens them: everyone who sees the Moment can
//  read them, its author can remove any, a writer can remove their own, and each can be reported as a Pulse reply is.
//  In Moment options the author shows them or hides them (they stay stored). Today's private reply to chat stays
//  exactly as it is. With the switch off none of this is drawn or sent.
//

import Observation
import SwiftUI

/// The replies open over the viewer (one at a time), and the counts the reader changed in this run.
@Observable
@MainActor
final class MomentRepliesPrompt {
    static let shared = MomentRepliesPrompt()

    var open: MomentDTO?
    /// By Moment: the count after the reader added or removed a reply, until the Moment is read again.
    var counts: [String: Int] = [:]
}

extension MomentsViewerModel {
    /// The replies under the Moment showing, while the switch is on and they show.
    var shownReplies: MomentRepliesDTO? {
        guard PulseReinventedFlags.shared.isOn, let replies = moment?.together.replies, replies.shown else { return nil }
        return replies
    }

    /// The viewer holds still while the replies are open.
    var repliesOpen: Bool {
        MomentRepliesPrompt.shared.open != nil
    }

    /// In the author's Moment options: show the replies to everyone who sees it, or hide them. Nil where it isn't
    /// offered: the switch off, someone else's Moment, a made-up name, an ended Moment.
    var repliesShownChoice: String? {
        guard PulseReinventedFlags.shared.isOn, isMine, let moment, let replies = moment.together.replies,
              !moment.together.underPenName, (moment.expiresAtDate ?? .distantPast) > Date() else { return nil }
        return replies.shown ? "Hide replies from everyone" : "Show replies to everyone who sees it"
    }

    /// The author's choice for this Moment; the Moment is read again with it.
    func flipRepliesShown() {
        guard let moment, let replies = moment.together.replies else { return }
        Task {
            do {
                let answer: MomentEnvelope = try await MomentsAPI.send(
                    TogetherEndpoints.repliesShown(momentId: moment.id, shown: !replies.shown)
                )
                MomentRepliesPrompt.shared.counts[moment.id] = nil
                cache.forget(answer.moment.id)
                retry()
                show(Toast(text: replies.shown
                        ? "Replies are hidden. They stay stored."
                        : "Replies show to everyone who sees it."))
            } catch {
                show(Toast(text: MomentRepliesWords.failure(error)))
                await PulseReinventedFlags.shared.recheck()
            }
        }
    }
}

/// Under the header: "3 replies", or "Reply for everyone" before the first, opening the replies.
struct MomentRepliesChip: View {
    let model: MomentsViewerModel
    private let prompt = MomentRepliesPrompt.shared

    var body: some View {
        if let replies = model.shownReplies, let moment = model.moment {
            Button { prompt.open = moment } label: {
                HStack(spacing: 6) {
                    Icon(.messageCircle, size: 15, strokeWidth: 2.2, color: .white)
                    Text(title(replies, momentId: moment.id))
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(Color.black.opacity(0.45)))
                .overlay(Capsule().stroke(Color.white.opacity(0.35), lineWidth: 1))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 58)
            .padding(.top, Spacing.s1)
            .accessibilityHint("Opens the replies everyone who sees this Moment can read")
            .accessibilityIdentifier("moments.viewer.replies")
            .sheet(item: Binding(get: { prompt.open }, set: { prompt.open = $0 })) { opened in
                MomentRepliesSheet(moment: opened, canReply: opened.together.replies?.canReply ?? false)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
        }
    }

    private func title(_ replies: MomentRepliesDTO, momentId: String) -> String {
        let count = prompt.counts[momentId] ?? replies.count
        if count > 0 { return count == 1 ? "1 reply" : "\(count) replies" }
        return replies.canReply ? "Reply for everyone" : "Replies"
    }
}

/// The words the replies say when something can't be done.
enum MomentRepliesWords {
    static func failure(_ error: any Error) -> String {
        switch error as? MomentsFailure {
        case .ended: "This Moment has ended."
        case let .other(message) where !message.isEmpty: message
        case let failure?: failure.message
        case nil: "Couldn't do that. Try again."
        }
    }

    /// "now", "5m", "3h", "2d".
    static func ago(_ iso: String) -> String {
        guard let date = MomentTime.parse(iso) else { return "" }
        let minutes = max(0, Int(Date().timeIntervalSince(date) / 60))
        if minutes < 1 { return "now" }
        if minutes < 60 { return "\(minutes)m" }
        if minutes < 1440 { return "\(minutes / 60)h" }
        return "\(minutes / 1440)d"
    }
}
