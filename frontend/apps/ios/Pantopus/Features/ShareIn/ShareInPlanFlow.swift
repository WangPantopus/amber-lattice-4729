//
//  ShareInPlanFlow.swift
//  Pantopus
//
//  "Share with a plan": something shared from another app, sent to the chat
//  of a plan the person hosts or is in (`ShareInCoordinator`). It lists those
//  plans, soonest first; the one picked opens its chat with the pictures in
//  the composer and the words in the text box, through the same flow a
//  message uses (`ShareInChatFlow`). A plan whose chat hasn't opened, or has
//  closed, says so and stays in the list.
//

import SwiftUI

struct ShareInPlanFlow: View {
    let attachments: [ChatQueuedAttachment]
    let text: String
    let onClose: @MainActor () -> Void

    /// The plans to pick from; nil while reading.
    @State private var plans: [PlanCardDTO]?
    @State private var failed = false
    /// The plan being opened, and the chat it led to.
    @State private var opening: String?
    @State private var roomId: String?
    @State private var note: String?

    var body: some View {
        Group {
            if let roomId {
                ShareInChatFlow(attachments: attachments, text: text, roomId: roomId, onClose: onClose)
            } else {
                picker
            }
        }
        .task { await load() }
    }

    private var picker: some View {
        VStack(spacing: 0) {
            ZStack {
                Text("Share with a plan")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                HStack {
                    Button("Cancel") { onClose() }
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.Color.primaryInk)
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("shareIn.plans.cancel")
                    Spacer()
                }
            }
            .padding(.horizontal, Spacing.s4)
            .frame(minHeight: 52)
            Divider()
            if let plans, !plans.isEmpty {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        if let note {
                            Text(note)
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.Color.appTextSecondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(Spacing.s4)
                                .accessibilityIdentifier("shareIn.plans.note")
                        }
                        ForEach(plans) { plan in
                            row(plan)
                            Divider().padding(.leading, Spacing.s4)
                        }
                    }
                }
            } else if plans != nil {
                state("No plans yet", "Plans you host or join show here, and what you share goes to the plan's chat.")
            } else if failed {
                state("Couldn't read your plans", "Check your connection and try again.") {
                    GhostButton(title: "Try again") {
                        failed = false
                        await load()
                    }
                    .frame(maxWidth: 200)
                }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Reading your plans")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.Color.appBg.ignoresSafeArea())
    }

    private func row(_ plan: PlanCardDTO) -> some View {
        Button {
            Task { await open(plan) }
        } label: {
            HStack(spacing: Spacing.s3) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(plan.title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.leading)
                    if let when = PlanFormat.rowWhen(state: plan.state, start: plan.startsAtDate, end: plan.endsAtDate) {
                        Text(when)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.Color.appTextSecondary)
                    }
                }
                Spacer(minLength: Spacing.s2)
                if opening == plan.id {
                    ProgressView()
                } else {
                    Icon(.chevronRight, size: 16, strokeWidth: 2, color: Theme.Color.appTextSecondary)
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.vertical, Spacing.s3)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(opening != nil)
        .accessibilityHint("Opens the plan's chat with what you shared")
        .accessibilityIdentifier("shareIn.plans.row")
    }

    private func state(_ title: String, _ detail: String, @ViewBuilder action: () -> some View = { EmptyView() }) -> some View {
        VStack(spacing: Spacing.s2) {
            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.Color.appText)
            Text(detail)
                .font(.system(size: 15))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .multilineTextAlignment(.center)
            action()
                .padding(.top, Spacing.s2)
        }
        .padding(Spacing.s5)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// The plans the person hosts or is going to, and ones that just ended: the ones with a chat they're in.
    private func load() async {
        guard plans == nil else { return }
        do {
            let mine = try await PlansStoreReads.mine().value
            var seen = Set<String>()
            plans = (mine.hosting + mine.going + mine.recent)
                .filter { seen.insert($0.id).inserted }
                .sorted { ($0.startsAtDate ?? .distantFuture) < ($1.startsAtDate ?? .distantFuture) }
        } catch {
            failed = true
        }
    }

    private func open(_ plan: PlanCardDTO) async {
        opening = plan.id
        defer { opening = nil }
        note = nil
        guard let detail = try? await PlansStoreReads.detail(id: plan.id) else {
            note = "Couldn't open that plan. Try again."
            return
        }
        guard let room = detail.chatRoomId, detail.chatOpen != false else {
            note = detail.chatRoomId == nil
                ? "\(plan.title) has no chat yet. It opens once someone joins."
                : "\(plan.title)'s chat has closed."
            return
        }
        roomId = room
    }
}
