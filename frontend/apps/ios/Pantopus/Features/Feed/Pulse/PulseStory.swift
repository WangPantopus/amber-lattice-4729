//
//  PulseStory.swift
//  Pantopus
//
//  A story Today's Around you posted for an outlet, as its card and its page
//  draw it (founder, 2026-11-24): the outlet that published it where an
//  author goes ("The Columbian", via Pantopus), its topic where the post kind
//  goes, the headline apart from the outlet's summary, and, on a card people
//  replied to, who replied and the latest reply. Every other post's card is
//  as it was. Parity twin of the web's `aroundStory` (PostMetadata.tsx) and
//  the card's conversation strip (PostCard.tsx).
//

import SwiftUI

/// An Around you story: who published it, its topic, and its headline apart from the summary. The post's text is
/// the headline, then the outlet's summary on the next line.
public struct PulseStory: Sendable, Hashable {
    /// The outlet that published it ("The Columbian"); nil when the post names none.
    public let outlet: String?
    /// Its first topic's name ("Sports"), as the chips name it; nil when it has none this build knows.
    public let topic: String?
    public let headline: String
    public let summary: String

    /// Around you's topics, as the chips name them (`backend/services/aroundYou/topics.js`).
    private static let topicTitles = [
        "events": "Events", "kids": "Kids & schools", "sports": "Sports", "government": "Government",
        "business": "Business", "safety": "Roads & safety"
    ]

    /// Nil for every post Around you didn't make (`aroundYou` is its mark, which only the server sets).
    public init?(aroundYou: PostAroundYou?, source: PostSource?, text: String) {
        guard let aroundYou else { return nil }
        // The byline is the outlet's name alone; "(subscription)" stays on the link that opens the story.
        let name = source?.name?.replacingOccurrences(
            of: #"\s*\(subscription\)$"#, with: "", options: [.regularExpression, .caseInsensitive]
        )
        outlet = name?.isEmpty == false ? name : nil
        topic = aroundYou.topics.lazy.compactMap { Self.topicTitles[$0] }.first
        let parts = text.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
        headline = parts.first.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } ?? ""
        summary = parts.count > 1 ? parts[1].trimmingCharacters(in: .whitespacesAndNewlines) : ""
    }
}

/// Who replied to a post and the latest reply, for the strip under its card.
public struct PulseConversation: Sendable, Hashable {
    public struct Face: Sendable, Hashable, Identifiable {
        public let id: String
        public let initials: String
        public let photo: URL?
    }

    /// The latest repliers, newest first, at most three.
    public let faces: [Face]
    public let latestName: String
    public let latestText: String

    public init?(_ conversation: PostConversation?) {
        guard let conversation, !conversation.latest.text.isEmpty else { return nil }
        faces = conversation.people.prefix(3).map { person in
            Face(
                id: person.id,
                initials: Self.initials(of: person.name),
                photo: person.avatarURL.flatMap(URL.init(string:))
            )
        }
        latestName = conversation.latest.name
        latestText = conversation.latest.text
    }

    private static func initials(of name: String) -> String {
        let letters = name.split(separator: " ").prefix(2).compactMap(\.first)
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }

    /// "Blake Tester · 4 replies", or "Blake Tester replied" for the first.
    func line(replyCount: Int) -> String {
        replyCount > 1 ? "\(latestName) · \(replyCount) replies" : "\(latestName) replied"
    }
}

/// The outlet where a card's author goes: a newspaper where the photo is, the outlet's name, and "via Pantopus"
/// with the card's time under it.
struct PulseStoryByline: View {
    let outlet: String
    /// The account that posted it for the outlet ("Pantopus").
    let via: String
    let meta: String
    var size: CGFloat = 32

    var body: some View {
        HStack(alignment: .center, spacing: 9) {
            Circle()
                .fill(Theme.Color.appSurfaceSunken)
                .frame(width: size, height: size)
                .overlay { Icon(.newspaper, size: size * 0.5, color: Theme.Color.appTextSecondary) }
                .overlay { Circle().stroke(Theme.Color.appBorder, lineWidth: 1) }
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(outlet)
                    .font(.system(size: size >= 44 ? 14 : 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                    .lineLimit(1)
                Text(meta.isEmpty ? "via \(via)" : "via \(via) · \(meta)")
                    .font(.system(size: size >= 44 ? 12 : 10.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// A story's words on its card: the headline, then the outlet's summary in the secondary color.
struct PulseStoryText: View {
    let story: PulseStory

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s1) {
            Text(story.headline)
                .font(.system(size: 14.5, weight: .semibold))
                .foregroundStyle(Theme.Color.appText)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            if !story.summary.isEmpty {
                Text(story.summary)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .lineLimit(2)
            }
        }
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The conversation so far, under a card's buttons: the latest repliers' faces, who replied last and how many
/// replies there are, and the latest reply on one line. A tap opens the post to reply.
struct PulseConversationStrip: View {
    let conversation: PulseConversation
    let replyCount: Int
    let postId: String
    let onOpen: @MainActor () -> Void

    private static let tints: [FeedAvatarTint] = [.sky, .violet, .green]

    var body: some View {
        Button(action: onOpen) {
            VStack(spacing: Spacing.s0) {
                Rectangle()
                    .fill(Theme.Color.appBorderSubtle)
                    .frame(height: 1)
                HStack(alignment: .top, spacing: Spacing.s2) {
                    HStack(spacing: -7) {
                        ForEach(Array(conversation.faces.enumerated()), id: \.element.id) { index, face in
                            FeedAvatar(
                                initials: face.initials,
                                tint: Self.tints[index % Self.tints.count],
                                size: 22,
                                imageURL: face.photo
                            )
                            .overlay(Circle().stroke(Theme.Color.appSurface, lineWidth: 2))
                        }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(conversation.line(replyCount: replyCount))
                            .font(.system(size: 11.5, weight: .semibold))
                            .foregroundStyle(Theme.Color.appText)
                            .lineLimit(1)
                        Text(conversation.latestText)
                            .font(.system(size: 11.5))
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.top, Spacing.s2)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(conversation.line(replyCount: replyCount)). \(conversation.latestText)")
        .accessibilityHint("Opens the replies.")
        .accessibilityIdentifier("pulsePostConversation_\(postId)")
    }
}

/// The post page's header for a story: the outlet where the author goes, and its topic (or the post kind) as the
/// chip, laid out as `PostAuthorHeader` lays out a person.
struct PulseStoryPageHeader: View {
    let outlet: String
    let via: String
    let time: String
    let chipLabel: String
    let intent: PostIntent

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            PulseStoryByline(outlet: outlet, via: via, meta: time, size: 44)
            Spacer()
            StatusChip(chipLabel.uppercased(), variant: intent.chipVariant, icon: intent.icon)
                .accessibilityLabel("Topic: \(chipLabel)")
        }
        .padding(.horizontal, Spacing.s4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("pulsePostDetail-storyHeader")
    }
}
