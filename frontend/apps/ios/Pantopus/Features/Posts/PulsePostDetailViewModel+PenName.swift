//
//  PulsePostDetailViewModel+PenName.swift
//  Pantopus
//
//  "Post as" in the reply box (made-up names, contract `docs/product/made-up-names/README.md`, "What each app builds"
//  1 and 7). One voice per conversation: once the person is in it (they wrote the post or a reply), the name is fixed,
//  told from the loaded thread — a row with `viewer_is_author` and `made_up_name` is the made-up voice, a row whose
//  `user_id` is the viewer's without `made_up_name` the person's own.
//

import SwiftUI

/// Which name the reply box offers.
public enum PulseReplyVoiceState: Sendable, Equatable {
    /// The person may pick ("Post as").
    case free
    /// They are in the conversation under their made-up name: every reply carries it.
    case fixedPenName
    /// They are in it under their own name, or the post takes no made-up-name reply: no choice is shown.
    case ownOnly
}

extension PulsePostDetailViewModel {
    /// The reply box's choice, from the post and the replies loaded on the post page.
    var replyVoiceState: PulseReplyVoiceState {
        guard case let .loaded(content) = state else { return .ownOnly }
        let post = content.post
        let me = currentUserId ?? ""
        if post.madeUpName, post.viewerIsAuthor { return .fixedPenName }
        if post.comments.contains(where: { $0.madeUpName && $0.viewerIsAuthor }) { return .fixedPenName }
        if !me.isEmpty, !post.madeUpName, post.userId == me { return .ownOnly }
        if !me.isEmpty, post.comments.contains(where: { !$0.madeUpName && $0.userId == me }) { return .ownOnly }
        // The server says where a made-up name may reply (`takes_made_up_name_reply`); the app never works it out.
        return post.takesMadeUpNameReply && !post.isRemovedByModerator ? .free : .ownOnly
    }

    /// The name the next reply carries.
    var effectiveReplyVoice: PenNameVoice {
        switch replyVoiceState {
        case .free: replyVoice == .penName && PenNameStore.shared.penName != nil ? .penName : .own
        case .fixedPenName: .penName
        case .ownOnly: .own
        }
    }

    /// The made-up name the reply box shows: the person's own, else the one the thread shows as theirs.
    var replyPenName: PenNameDTO? {
        if let penName = PenNameStore.shared.penName { return penName }
        guard case let .loaded(content) = state else { return nil }
        let post = content.post
        let author = post.viewerIsAuthor && post.madeUpName
            ? (post.author ?? post.creator)
            : post.comments.first { $0.madeUpName && $0.viewerIsAuthor }?.author
        guard let author, let id = author.penNameId else { return nil }
        return PenNameDTO(id: id, name: author.displayName, avatarURL: author.profilePictureURL)
    }

    /// A choice in the reply box's "Post as". The made-up name chosen before there is one opens the name screen.
    func selectReplyVoice(_ value: PenNameVoice) {
        guard replyVoiceState == .free else { return }
        if value == .own {
            replyVoice = .own
            return
        }
        guard let me = PenNameStore.shared.me, me.allowed else { return }
        if me.penName == nil {
            showsPenNameSetup = true
            return
        }
        replyVoice = .penName
    }

    /// The name screen kept a name: it is chosen, and a reply that waited for it goes out.
    func replyPenNameTaken() {
        replyVoice = .penName
        let resends = sendsReplyAfterPenName
        sendsReplyAfterPenName = false
        if resends { Task { await sendComment() } }
    }

    /// The name screen closed without a name: the reply stays on the person's own name.
    func replyPenNameSetupClosed() {
        sendsReplyAfterPenName = false
        if PenNameStore.shared.penName == nil { replyVoice = .own }
    }

    /// Reads `/me` for the reply box when it could offer the made-up name.
    func loadReplyPostAs() async {
        guard replyVoiceState != .ownOnly else { return }
        await PenNameStore.shared.load()
    }

    /// A tap on a made-up name on this page: its small card (Report reports the post, never a reply).
    func openPenNameCard(_ penNameId: String, onPost: Bool) {
        guard case let .loaded(content) = state else { return }
        let mine = onPost ? content.post.viewerIsAuthor : false
        penNameCard = PenNameCardTarget(penNameId: penNameId, reportPostId: onPost && !mine ? content.post.id : nil)
    }
}

/// Made-up names on the post page: the small card of a tapped name, and the name screen from the reply box.
struct PulsePostDetailPenNameSurfaces: ViewModifier {
    @Bindable var viewModel: PulsePostDetailViewModel

    func body(content: Content) -> some View {
        content
            .penNameCardSheet($viewModel.penNameCard) { Task { await viewModel.refresh() } }
            .sheet(
                isPresented: $viewModel.showsPenNameSetup,
                onDismiss: { viewModel.replyPenNameSetupClosed() },
                content: { PenNameSetupView { _ in viewModel.replyPenNameTaken() } }
            )
    }
}
