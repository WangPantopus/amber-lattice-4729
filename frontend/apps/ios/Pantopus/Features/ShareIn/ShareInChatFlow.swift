//
//  ShareInChatFlow.swift
//  Pantopus
//
//  "Send in a chat": something handed to a chat from outside it. Today's sky
//  (`SkySharePantopus`) and a photo, video, link or words shared from another
//  app (`ShareInCoordinator`) both open the New Message picker, with recent
//  group chats too; the chat picked opens with the pictures in its composer
//  and the words in its text box. A chat already named (a person or group the
//  share sheet suggested) skips the picker.
//

import SwiftUI

struct ShareInChatFlow: View {
    let onClose: @MainActor () -> Void

    @State private var route: ShareInChatRoute
    @State private var picker: NewMessageViewModel

    /// `roomId`: the chat to open at once, without the picker.
    init(
        attachments: [ChatQueuedAttachment],
        text: String = "",
        roomId: String? = nil,
        onClose: @escaping @MainActor () -> Void
    ) {
        self.onClose = onClose
        let route = ShareInChatRoute(attachments: attachments, text: text, roomId: roomId)
        _route = State(initialValue: route)
        _picker = State(initialValue: NewMessageViewModel(
            includesGroups: true,
            onSelect: route.open,
            onCancel: onClose,
            onInvite: route.inviteSomeone
        ))
    }

    var body: some View {
        Group {
            if let chat = route.chat {
                ChatConversationView(viewModel: chat, mode: .dm, onBack: onClose)
            } else if route.opensNamedChat {
                // The suggested chat's name is being read; it opens in a moment.
                Theme.Color.appBg.ignoresSafeArea()
            } else {
                NewMessageView(viewModel: picker, title: "Send in a chat")
            }
        }
        .task { await route.openNamedChat() }
        .sheet(item: $route.invite) { request in request.makeView() }
    }
}

/// The chat "Send in a chat" opened, made once when it's picked.
@Observable
@MainActor
final class ShareInChatRoute {
    private(set) var chat: ChatConversationViewModel?
    /// A chat was named and is being opened; false again if it can't be, and the picker shows.
    private(set) var opensNamedChat: Bool
    /// "Invite someone to Pantopus", from the picker's empty frame.
    var invite: SystemSheetRequest?
    private let attachments: [ChatQueuedAttachment]
    private let text: String
    private let roomId: String?

    init(attachments: [ChatQueuedAttachment], text: String, roomId: String?) {
        self.attachments = attachments
        self.text = text
        self.roomId = roomId
        opensNamedChat = roomId != nil
    }

    func inviteSomeone() {
        invite = .share(items: InviteLinks.shareItems)
    }

    /// The person or group chat picked, with what was shared waiting in its composer.
    func open(_ picked: NewMessageDestination) {
        open(InboxConversationDestination(
            mode: picked.roomId.map { .room(id: $0) } ?? .person(otherUserId: picked.userId),
            displayName: picked.displayName,
            initials: picked.initials,
            avatarURL: picked.avatarURL?.absoluteString,
            identityKind: picked.identity == .business ? "business" : nil,
            verified: picked.verified
        ))
    }

    /// The chat the share sheet's suggestion stood for, opened as a link to it opens.
    func openNamedChat() async {
        guard opensNamedChat, chat == nil, let roomId, case let .signedIn(user) = AuthManager.shared.state else { return }
        await open(InboxTabRoot.linkedConversation(roomId: roomId, viewerId: user.id))
        opensNamedChat = false
    }

    private func open(_ destination: InboxConversationDestination) {
        guard chat == nil, case let .signedIn(user) = AuthManager.shared.state else { return }
        chat = ChatConversationViewModel(
            mode: destination.threadMode,
            counterparty: destination.counterparty,
            counterpartyAvatarURL: destination.avatarURL.flatMap(URL.init(string:)),
            currentUserId: user.id,
            initialComposerText: text,
            sharedAttachments: attachments
        )
    }
}
