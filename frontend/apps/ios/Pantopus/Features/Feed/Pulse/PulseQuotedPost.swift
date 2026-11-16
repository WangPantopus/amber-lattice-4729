//
//  PulseQuotedPost.swift
//  Pantopus
//
//  "Repost with your words" (PULSEREPOST contract §8.3): the compact,
//  read-only card of the quoted post inside a quote post (feed cards,
//  profile cards, the post page), and the same card, not tappable, under
//  the composer's text box. The original's small photo and name, its
//  time, up to three lines of its words (title first) and its first photo
//  or video frame; no reactions, menu or repost on it.
//

import SwiftUI

/// What a quote post shows of the post it quotes.
public enum PulseQuotedPost: Sendable, Hashable {
    case available(PulseQuotedCard)
    /// The original is gone or not readable by this viewer: "This post isn't available."
    case unavailable

    /// Nil for an ordinary post.
    init?(_ quoted: FeedQuotedPost?) {
        switch quoted {
        case let .available(post)?: self = .available(PulseQuotedCard(post: post))
        case .unavailable?: self = .unavailable
        case nil: return nil
        }
    }

    /// The original's id when it can be opened.
    var openablePostId: String? {
        if case let .available(card) = self { return card.id }
        return nil
    }

    /// VoiceOver's words for it inside the quoting card's one label.
    var spoken: String {
        switch self {
        case .unavailable:
            return "Quoted post isn't available"
        case let .available(card):
            let words = [card.title, card.body].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ". ")
            return words.isEmpty ? "Quoting \(card.authorName)" : "Quoting \(card.authorName): \(words)"
        }
    }
}

/// The quoted post's card content, render-ready.
public struct PulseQuotedCard: Sendable, Hashable, Identifiable {
    /// The original post's id: a tap opens its page.
    public let id: String
    public let authorName: String
    public let authorInitials: String
    public let avatarTint: FeedAvatarTint
    public let authorAvatarURL: URL?
    /// "2h ago", as the Pulse card's meta line says it.
    public let time: String
    public let title: String?
    public let body: String
    /// The first photo, or a video's poster frame.
    public let thumbnailURL: URL?
    /// The first attachment is a video: the thumbnail wears a play mark.
    public let isVideo: Bool

    init(post: FeedPostDTO) {
        self.init(
            id: post.id,
            creator: post.creator,
            isBusiness: post.creator?.accountType == "business" || post.businessAuthorId != nil,
            title: post.title,
            body: post.content,
            createdAt: post.createdAt,
            media: PostMediaItem.items(
                urls: post.mediaURLs,
                types: post.mediaTypes,
                thumbnails: post.mediaThumbnails,
                liveURLs: post.mediaLiveURLs
            )
        )
    }

    init(detail post: PostDetailDTO) {
        self.init(
            id: post.id,
            creator: post.creator,
            isBusiness: post.creator?.accountType == "business",
            title: post.title,
            body: post.content,
            createdAt: post.createdAt,
            media: PostMediaItem.items(
                urls: post.mediaURLs,
                types: post.mediaTypes,
                thumbnails: post.mediaThumbnails,
                liveURLs: post.mediaLiveURLs
            )
        )
    }

    private init(
        id: String,
        creator: PostCreatorDTO?,
        isBusiness: Bool,
        title: String?,
        body: String,
        createdAt: String,
        media: [PostMediaItem]
    ) {
        let name = creator?.displayName ?? "Pantopus user"
        self.id = id
        authorName = name
        authorInitials = PulseFeedViewModel.initials(from: name)
        avatarTint = isBusiness ? .violet : .sky
        authorAvatarURL = creator?.profilePictureURL.flatMap(URL.init(string:))
        time = PulseFeedViewModel.relative(timestamp: createdAt)
        let trimmedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.title = trimmedTitle?.isEmpty == false ? trimmedTitle : nil
        self.body = body.trimmingCharacters(in: .whitespacesAndNewlines)
        let first = media.first { $0.kind != .document }
        switch first?.kind {
        case .video:
            thumbnailURL = first?.thumbnailURL
            isVideo = true
        case .image, .livePhoto:
            thumbnailURL = first?.thumbnailURL ?? first?.url
            isVideo = false
        case .document, nil:
            thumbnailURL = nil
            isVideo = false
        }
    }
}

/// "Repost with your words" opened on a post: the composer shows its card under the text box and posts
/// `quotedPostId` with the new post.
public struct PulseComposeQuote: Sendable, Hashable, Identifiable {
    /// The quoted post's id.
    public var id: String {
        card.id
    }

    public let card: PulseQuotedCard

    public init(card: PulseQuotedCard) {
        self.card = card
    }
}

/// The quoted post's compact card. `onOpen` opens the original's post page; nil (the composer, an unavailable
/// original) draws it without a tap.
struct PulseQuotedPostView: View {
    let quoted: PulseQuotedPost
    let accessibilityID: String
    var onOpen: (@MainActor (String) -> Void)?

    var body: some View {
        switch quoted {
        case .unavailable:
            Text("This post isn't available.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Spacing.s3)
                .background(Theme.Color.appSurfaceSunken)
                .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                        .stroke(Theme.Color.appBorderSubtle, lineWidth: 1)
                )
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier(accessibilityID)
        case let .available(card):
            if let onOpen {
                // Inside a card whose own tap opens the quoting post, this tap wins.
                Button { onOpen(card.id) } label: {
                    PulseQuotedCardBody(card: card)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(PulseQuotedPost.available(card).spoken)
                .accessibilityHint("Opens the quoted post")
                .accessibilityIdentifier(accessibilityID)
            } else {
                PulseQuotedCardBody(card: card)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(PulseQuotedPost.available(card).spoken)
                    .accessibilityIdentifier(accessibilityID)
            }
        }
    }
}

/// The card itself: photo, name and time on top, the words under them, the thumbnail at the end.
private struct PulseQuotedCardBody: View {
    let card: PulseQuotedCard

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                FeedAvatar(
                    initials: card.authorInitials,
                    tint: card.avatarTint,
                    size: 20,
                    imageURL: card.authorAvatarURL
                )
                Text(card.authorName)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                    .lineLimit(1)
                Text("· \(card.time)")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .lineLimit(1)
                    .layoutPriority(1)
                Spacer(minLength: Spacing.s0)
            }
            HStack(alignment: .top, spacing: Spacing.s3) {
                words
                    .frame(maxWidth: .infinity, alignment: .leading)
                if card.thumbnailURL != nil || card.isVideo {
                    thumbnail
                }
            }
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                .stroke(Theme.Color.appBorder, lineWidth: 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
    }

    /// Up to three lines: the title first when there is one.
    private var words: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let title = card.title {
                Text(title)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                    .lineLimit(1)
            }
            if !card.body.isEmpty {
                Text(card.body)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.appTextStrong)
                    .lineLimit(card.title == nil ? 3 : 2)
                    .multilineTextAlignment(.leading)
            }
        }
    }

    private var thumbnail: some View {
        ZStack {
            Theme.Color.appSurfaceSunken
            if let url = card.thumbnailURL {
                CachedAsyncImage(url: url, maxPixelSize: 160) { phase in
                    if case let .success(image) = phase {
                        image.resizable().scaledToFill()
                    } else {
                        Theme.Color.appSurfaceSunken
                    }
                }
            }
            if card.isVideo {
                Icon(.play, size: 14, strokeWidth: 2.4, color: Theme.Color.appTextInverse)
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(Theme.Color.appText.opacity(0.55)))
            }
        }
        .frame(width: 52, height: 52)
        .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
        .accessibilityHidden(true)
    }
}
