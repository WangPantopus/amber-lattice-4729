//
//  ShareSuggestions.swift
//  Pantopus
//
//  The people and groups a person messages in Pantopus, told to iOS so the
//  share sheet can suggest them in its top row, above the row of apps
//  (founder, 2026-11-27). iOS orders both rows itself, by what the person
//  uses; this is the one thing an app does to be offered there. Each message
//  sent donates its chat. A tap on a suggestion opens the share extension
//  with that chat named (`ShareModel.suggestedChat`), and the app opens it
//  with what was shared in its composer. Signing out forgets them all.
//

import Foundation
import Intents
import Logging

@MainActor
enum ShareSuggestions {
    private nonisolated static let logger = Logger(label: "app.pantopus.ios.ShareSuggestions")
    /// Each chat's picture, read once while the app is open.
    private static var pictures: [String: Data] = [:]

    /// A message was sent in `roomId`, to the person or group `name`.
    static func sent(roomId: String, name: String, avatarURL: URL?) {
        guard !roomId.isEmpty, !name.isEmpty else { return }
        Task {
            if pictures[roomId] == nil, let avatarURL,
               let (data, reply) = try? await URLSession.shared.data(from: avatarURL),
               (reply as? HTTPURLResponse)?.statusCode == 200, data.count < 2_000_000 {
                pictures[roomId] = data
            }
            donate(roomId: roomId, name: name, picture: pictures[roomId])
        }
    }

    private static func donate(roomId: String, name: String, picture: Data?) {
        let person = INPerson(
            personHandle: INPersonHandle(value: roomId, type: .unknown),
            nameComponents: nil,
            displayName: name,
            image: nil,
            contactIdentifier: nil,
            customIdentifier: roomId
        )
        let intent = INSendMessageIntent(
            recipients: [person],
            outgoingMessageType: .outgoingMessageText,
            content: nil,
            speakableGroupName: INSpeakableString(spokenPhrase: name),
            conversationIdentifier: roomId,
            serviceName: nil,
            sender: nil,
            attachments: nil
        )
        if let picture {
            intent.setImage(INImage(imageData: picture), forParameterNamed: \.speakableGroupName)
        }
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .outgoing
        interaction.donate { error in
            // Nothing the person can act on: the chat just isn't suggested. Logged without the chat or the name.
            if let error { logger.warning("share suggestion not donated: \(error.localizedDescription)") }
        }
    }

    /// Nobody is signed in: the share sheet suggests none of the last account's chats.
    static func forget() {
        pictures = [:]
        INInteraction.deleteAll(completion: nil)
    }
}
