//
//  MomentRepliesSheet.swift
//  Pantopus
//
//  The replies everyone who sees a Moment can read ("Pulse, reinvented" phase 3; CONTRACT 8a), over the viewer: oldest
//  first, a page of 30 at a time, each with Remove (its writer and the Moment's author) and Report (Pulse's reasons),
//  and a box to add one while the Moment takes them. Opened from `MomentRepliesChip`, only while the switch is on.
//

import Observation
import SwiftUI

@Observable
@MainActor
final class MomentRepliesModel {
    let momentId: String
    private(set) var replies: [MomentReplyDTO] = []
    private(set) var loading = true
    private(set) var nextCursor: String?
    private(set) var reported: Set<String> = []
    var error: String?
    var draft = ""
    private(set) var sending = false

    init(momentId: String) {
        self.momentId = momentId
    }

    func load() async {
        await read(cursor: nil)
    }

    func loadMore() async {
        guard let nextCursor else { return }
        await read(cursor: nextCursor)
    }

    private func read(cursor: String?) async {
        loading = true
        defer { loading = false }
        do {
            let page: MomentRepliesPageDTO = try await MomentsAPI.send(TogetherEndpoints.replies(momentId: momentId, cursor: cursor))
            replies = cursor == nil ? page.replies : replies + page.replies.filter { reply in !replies.contains { $0.id == reply.id } }
            nextCursor = page.nextCursor
        } catch {
            fail(error)
        }
    }

    func send() async {
        let words = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty, !sending else { return }
        sending = true
        error = nil
        defer { sending = false }
        do {
            let created: MomentReplyCreatedDTO = try await MomentsAPI.send(TogetherEndpoints.addReply(momentId: momentId, text: words))
            replies.append(created.reply)
            draft = ""
            bump(1)
        } catch {
            fail(error)
        }
    }

    func remove(_ reply: MomentReplyDTO) async {
        error = nil
        do {
            try await MomentsAPI.send(TogetherEndpoints.removeReply(momentId: momentId, replyId: reply.id))
            replies.removeAll { $0.id == reply.id }
            bump(-1)
        } catch {
            fail(error)
        }
    }

    func report(_ reply: MomentReplyDTO, reason: String) async {
        error = nil
        do {
            try await MomentsAPI.send(TogetherEndpoints.reportReply(momentId: momentId, replyId: reply.id, reason: reason))
            reported.insert(reply.id)
        } catch {
            fail(error)
        }
    }

    func isReported(_ reply: MomentReplyDTO) -> Bool {
        reported.contains(reply.id)
    }

    /// The chip's count follows what the reader just did.
    private func bump(_ by: Int) {
        let prompt = MomentRepliesPrompt.shared
        let base = prompt.counts[momentId] ?? prompt.open?.together.replies?.count ?? replies.count - by
        prompt.counts[momentId] = max(0, base + by)
    }

    private func fail(_ failure: any Error) {
        error = MomentRepliesWords.failure(failure)
        // Turned off on the server (403 PULSE_REINVENTED_OFF): the switch is read again, and today's viewer comes back.
        Task { await PulseReinventedFlags.shared.recheck() }
    }
}

struct MomentRepliesSheet: View {
    let canReply: Bool
    @State private var model: MomentRepliesModel
    @State private var reporting: MomentReplyDTO?
    @Environment(\.dismiss) private var dismiss

    init(moment: MomentDTO, canReply: Bool) {
        self.canReply = canReply
        _model = State(initialValue: MomentRepliesModel(momentId: moment.id))
    }

    var body: some View {
        VStack(spacing: Spacing.s0) {
            header
            Divider()
            list
            Divider()
            footer
        }
        .background(Theme.Color.appBg)
        .task { await model.load() }
        .confirmationDialog(
            "Why are you reporting this reply?",
            isPresented: Binding(get: { reporting != nil }, set: { if !$0 { reporting = nil } }),
            titleVisibility: .visible,
            presenting: reporting
        ) { reply in
            ForEach(MomentsViewer.reportReasons, id: \.token) { reason in
                Button(reason.label) { Task { await model.report(reply, reason: reason.token) } }
            }
            Button("Cancel", role: .cancel) {}
        }
        .accessibilityIdentifier("moments.replies")
    }

    private var header: some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Replies")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Theme.Color.appText)
                Text("Everyone who sees this Moment can read them.")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { dismiss() } label: {
                Icon(.x, size: 18, strokeWidth: 2.2, color: Theme.Color.appText)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Theme.Color.appSurface))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close replies")
            .accessibilityIdentifier("moments.replies.close")
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.top, Spacing.s5)
        .padding(.bottom, Spacing.s3)
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Spacing.s4) {
                if model.replies.isEmpty {
                    Text(model.loading ? "Loading…" : "No replies yet.")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.s5)
                }
                ForEach(model.replies) { reply in
                    row(reply)
                }
                if model.nextCursor != nil {
                    Button(model.loading ? "Loading…" : "Show more") { Task { await model.loadMore() } }
                        .font(.system(size: 15, weight: .semibold))
                        .disabled(model.loading)
                        .frame(maxWidth: .infinity)
                        .accessibilityIdentifier("moments.replies.more")
                }
            }
            .padding(Spacing.s4)
        }
    }

    private func row(_ reply: MomentReplyDTO) -> some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            if let author = reply.author {
                MomentAvatar(author: author, size: 36)
            } else {
                Circle().fill(Theme.Color.appSurface).frame(width: 36, height: 36)
            }
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: Spacing.s2) {
                    Text(reply.author?.name.isEmpty == false ? reply.author?.name ?? "" : "Someone")
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(Theme.Color.appText)
                    Text(MomentRepliesWords.ago(reply.at))
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
                Text(reply.text)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
                actions(reply)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.replies.reply")
    }

    private func actions(_ reply: MomentReplyDTO) -> some View {
        HStack(spacing: Spacing.s4) {
            if reply.canRemove {
                Button("Remove") { Task { await model.remove(reply) } }
                    .accessibilityIdentifier("moments.replies.remove")
            }
            if !reply.mine {
                if model.isReported(reply) {
                    Text("Reported. We'll review it.")
                        .foregroundStyle(Theme.Color.appTextSecondary)
                } else {
                    Button("Report") { reporting = reply }
                        .accessibilityIdentifier("moments.replies.report")
                }
            }
        }
        .font(.system(size: 13.5, weight: .semibold))
        .foregroundStyle(Theme.Color.primaryTint)
        .buttonStyle(.plain)
        .padding(.top, 2)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            if let error = model.error {
                Text(error)
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.Color.error)
                    .accessibilityIdentifier("moments.replies.error")
            }
            if canReply {
                HStack(spacing: Spacing.s2) {
                    TextField("Reply for everyone who sees it", text: $model.draft, axis: .vertical)
                        .lineLimit(1...4)
                        .font(.system(size: 15))
                        .padding(.horizontal, Spacing.s3)
                        .padding(.vertical, 10)
                        .typesInFieldOnTap()
                        .background(RoundedRectangle(cornerRadius: Radii.lg).fill(Theme.Color.appSurface))
                        .onChange(of: model.draft) { _, words in
                            if words.count > 500 { model.draft = String(words.prefix(500)) }
                        }
                        .accessibilityIdentifier("moments.replies.field")
                    Button { Task { await model.send() } } label: {
                        Text(model.sending ? "Sending…" : "Send")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, Spacing.s4)
                            .frame(height: 40)
                            .background(Capsule().fill(Theme.Color.primarySolid))
                    }
                    .buttonStyle(.plain)
                    .disabled(model.sending || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("moments.replies.send")
                }
            } else {
                Text("Replies are read-only now.")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
        .padding(Spacing.s4)
    }
}
