//
//  SkySharePantopus.swift
//  Pantopus
//
//  "Or share in Pantopus", under the share preview's Share video and Share
//  photo: the same picture, drawn at the tap — with its four-second clip as
//  the photo's motion when rain or snow falls — posted to Pulse as a Local
//  Update or sent in a chat (`ShareInChatFlow`). Parity twin of Android's
//  `SkySharePantopus.kt`.
//

import SwiftUI

/// The picture and, when rain or snow falls, its clip, drawn at the tap.
struct SkyShareAttachment: Identifiable {
    let id = UUID()
    let picture: Data
    let clip: Data?
    /// "Today in Camas": the files' name.
    let name: String

    /// For the Pulse composer: the picture, moving with the clip when pressed, as a Live Photo does.
    var photo: PulseComposePhoto {
        PulseComposePhoto(data: picture, mimeType: "image/png", filename: "\(name).png", liveVideo: clip)
    }

    /// For a chat's composer: the same picture and clip.
    var chatAttachment: ChatQueuedAttachment {
        ChatQueuedAttachment(
            id: id.uuidString,
            kind: .image,
            filename: "\(name).png",
            mimeType: "image/png",
            data: picture,
            liveVideo: clip
        )
    }
}

extension SkyShareCard {
    /// The picture, and the clip when rain or snow falls: the files the share sheet sends, read back.
    @MainActor
    func attachment() async throws -> SkyShareAttachment {
        let picture = try Data(contentsOf: pictureFile())
        let clip: Data? = if falls { try await Data(contentsOf: clipFile()) } else { nil }
        return SkyShareAttachment(picture: picture, clip: clip, name: fileName)
    }
}

/// Which of the two ways in Pantopus.
enum SkySharePantopusKind {
    case pulse
    case chat
}

/// Where "Or share in Pantopus" goes once the picture is drawn.
enum SkySharePantopusRoute: Identifiable {
    case pulse(SkyShareAttachment)
    case chat(SkyShareAttachment)

    var id: UUID {
        switch self {
        case let .pulse(attachment), let .chat(attachment): attachment.id
        }
    }
}

/// "Or share in Pantopus": Post to Pulse and Send in a chat, side by side,
/// or one above the other at the largest text sizes.
struct SkyShareInPantopus: View {
    /// The one being drawn: its button spins and the other waits.
    let making: SkySharePantopusKind?
    /// False while the video for the share sheet is being made.
    let isEnabled: Bool
    let onShare: (SkySharePantopusKind) async -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(spacing: Spacing.s2) {
            Text("Or share in Pantopus")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .frame(maxWidth: .infinity)
            let layout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(spacing: Spacing.s3))
                : AnyLayout(HStackLayout(spacing: Spacing.s3))
            layout {
                GhostButton(title: "Post to Pulse", isLoading: making == .pulse, isEnabled: isEnabled && making != .chat) {
                    await onShare(.pulse)
                }
                .accessibilityIdentifier("todaySkySharePulse")
                GhostButton(title: "Send in a chat", isLoading: making == .chat, isEnabled: isEnabled && making != .pulse) {
                    await onShare(.chat)
                }
                .accessibilityIdentifier("todaySkyShareChat")
            }
        }
    }
}
