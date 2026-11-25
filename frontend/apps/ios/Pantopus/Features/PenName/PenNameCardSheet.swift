//
//  PenNameCardSheet.swift
//  Pantopus
//
//  The small card a tap on a made-up name opens (contract "What each app builds", 5; `GET /api/pen-names/:id`): the
//  name, the drawn picture, the marks, the note, and Mute, Block and Report (Report is the post's own). Never a
//  profile, Message or Connect. The writer sees "Only you can see this is you" instead.
//

import Observation
import SwiftUI

/// A made-up name to show the small card for, and the post it was tapped on (Report reports that post; a reply has
/// no Report).
struct PenNameCardTarget: Identifiable, Hashable {
    let penNameId: String
    let reportPostId: String?

    var id: String {
        "\(penNameId)|\(reportPostId ?? "")"
    }
}

@Observable
@MainActor
final class PenNameCardViewModel {
    enum State: Equatable {
        case loading
        case loaded(PenNameCardDTO)
        case error(String)
    }

    private(set) var state: State = .loading
    private(set) var busy = false
    var toast: ToastMessage?
    let target: PenNameCardTarget
    private let api: APIClient

    init(target: PenNameCardTarget, api: APIClient = .shared) {
        self.target = target
        self.api = api
    }

    func load() async {
        if case .loaded = state {} else { state = .loading }
        do {
            let response: PenNameCardResponse = try await api.request(PenNamesEndpoints.card(id: target.penNameId))
            state = .loaded(response.penName)
        } catch {
            state = .error(PenNameRefusal.from(error)?.message
                ?? (error as? APIError)?.errorDescription
                ?? "Couldn't load this made-up name.")
        }
    }

    /// Mute or Block, or undo one. Lists re-read so what the name wrote leaves (or comes back). True when done.
    func set(block: Bool, on: Bool) async -> Bool {
        guard !busy else { return false }
        busy = true
        defer { busy = false }
        do {
            let endpoint = block
                ? PenNamesEndpoints.block(id: target.penNameId, on: on)
                : PenNamesEndpoints.mute(id: target.penNameId, on: on)
            _ = try await api.request(endpoint, as: PostActionAckResponse.self)
            PulsePostsRefresh.notifyPostsDidChange()
            await load()
            return true
        } catch {
            toast = ToastMessage(
                text: PenNameRefusal.from(error)?.message ?? "Couldn't do that. Try again.",
                kind: .error
            )
            return false
        }
    }

    func report(reason: String) async {
        guard let postId = target.reportPostId else { return }
        do {
            _ = try await api.request(PostsEndpoints.report(id: postId, reason: reason), as: PostActionAckResponse.self)
            toast = ToastMessage(text: "Report submitted. Thanks for flagging.", kind: .success)
        } catch {
            toast = ToastMessage(text: "Couldn't submit the report", kind: .error)
        }
    }
}

struct PenNameCardSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: PenNameCardViewModel
    @State private var asksReportReason = false

    init(target: PenNameCardTarget) {
        _viewModel = State(initialValue: PenNameCardViewModel(target: target))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            switch viewModel.state {
            case .loading:
                HStack(spacing: Spacing.s3) {
                    Shimmer(width: 56, height: 56, cornerRadius: 28)
                    VStack(alignment: .leading, spacing: Spacing.s2) {
                        Shimmer(width: 160, height: 18, cornerRadius: Radii.sm)
                        Shimmer(width: 200, height: 12, cornerRadius: Radii.sm)
                    }
                }
                Shimmer(height: 44, cornerRadius: Radii.md)
                    .accessibilityIdentifier("penNameCardLoading")
            case let .error(message):
                EmptyState(
                    icon: .alertCircle,
                    headline: "Couldn't load this made-up name",
                    subcopy: message,
                    cta: EmptyState.CTA(title: "Try again") { await viewModel.load() }
                )
                .accessibilityIdentifier("penNameCardError")
            case let .loaded(card):
                loaded(card)
            }
            Spacer(minLength: Spacing.s0)
        }
        .padding(Spacing.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appBg)
        .task { await viewModel.load() }
        .overlay(alignment: .bottom) {
            if let toast = viewModel.toast {
                ToastView(message: toast)
                    .padding(.bottom, Spacing.s4)
                    .dismissToast(after: toast, minimum: 2) { viewModel.toast = nil }
                    .transition(.opacity)
            }
        }
        .confirmationDialog("Report this post?", isPresented: $asksReportReason, titleVisibility: .visible) {
            ForEach(pulseReportReasons, id: \.key) { reason in
                Button(reason.label) { Task { await viewModel.report(reason: reason.key) } }
                    .accessibilityIdentifier("penNameCardReportReason_\(reason.key)")
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Reports are reviewed by the Pantopus team. The author isn't told who reported.")
        }
        .accessibilityIdentifier("penNameCard")
    }

    @ViewBuilder
    private func loaded(_ card: PenNameCardDTO) -> some View {
        HStack(spacing: Spacing.s3) {
            PenNameAvatar(name: card.name, url: card.avatarURL.flatMap(URL.init(string:)), size: 56)
            VStack(alignment: .leading, spacing: Spacing.s1) {
                Text(card.isYours ? "\(card.name) (you)" : card.name)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Theme.Color.appText)
                    .lineLimit(2)
                    .accessibilityIdentifier("penNameCardName")
                HStack(spacing: Spacing.s1) {
                    PenNameMark()
                    if card.badges.contains("verified_home") {
                        Text("Verified home nearby")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .lineLimit(1)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
        if card.isYours {
            Text("Only you can see this is you")
                .pantopusTextStyle(.caption)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .accessibilityIdentifier("penNameCardOnlyYou")
        }
        if let note = card.note, !note.isEmpty {
            Text(note)
                .pantopusTextStyle(.body)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("penNameCardNote")
        }
        if !card.isYours {
            VStack(spacing: Spacing.s2) {
                actionRow(
                    icon: .bellOff,
                    title: card.muted ? "Unmute" : "Mute",
                    identifier: "penNameCardMute",
                    tint: Theme.Color.appText
                ) {
                    if await viewModel.set(block: false, on: !card.muted), !card.muted { dismiss() }
                }
                actionRow(
                    icon: .ban,
                    title: card.blocked ? "Unblock" : "Block",
                    identifier: "penNameCardBlock",
                    tint: Theme.Color.error
                ) {
                    if await viewModel.set(block: true, on: !card.blocked), !card.blocked { dismiss() }
                }
                if viewModel.target.reportPostId != nil {
                    actionRow(
                        icon: .flag,
                        title: "Report",
                        identifier: "penNameCardReport",
                        tint: Theme.Color.error
                    ) {
                        asksReportReason = true
                    }
                }
            }
            .disabled(viewModel.busy)
        }
    }

    private func actionRow(
        icon: PantopusIcon,
        title: String,
        identifier: String,
        tint: Color,
        action: @escaping @MainActor () async -> Void
    ) -> some View {
        Button {
            Task { await action() }
        } label: {
            HStack(spacing: Spacing.s3) {
                Icon(icon, size: 18, strokeWidth: 2, color: tint)
                Text(title)
                    .pantopusTextStyle(.body)
                    .fontWeight(.semibold)
                    .foregroundStyle(tint)
                Spacer(minLength: Spacing.s0)
            }
            .padding(.horizontal, Spacing.s3)
            .frame(minHeight: 48)
            .background(Theme.Color.appSurface)
            .overlay(
                RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                    .stroke(Theme.Color.appBorder, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }
}

extension View {
    /// The small card for a tapped made-up name, as a short sheet. `onDismiss` runs when it closes (the page under
    /// it reads again, so a mute or a block shows at once).
    func penNameCardSheet(_ target: Binding<PenNameCardTarget?>, onDismiss: (() -> Void)? = nil) -> some View {
        sheet(item: target, onDismiss: onDismiss) { target in
            PenNameCardSheet(target: target)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
    }
}
