//
//  PenNameViews.swift
//  Pantopus
//
//  The pieces every made-up-name screen shares: the drawn picture, the "Made-up name" mark, and the "Post as" row of the
//  Pulse composer and the reply box (contract "What each app builds", 1 and 4). Identifiers are mirrored on Android.
//

import SwiftUI

/// The made-up name's drawn picture (the server draws it; nobody uploads one), over its initials while it loads.
struct PenNameAvatar: View {
    let name: String
    let url: URL?
    var size: CGFloat = 32

    var body: some View {
        FeedAvatar(
            initials: PulseFeedViewModel.initials(from: name),
            tint: .violet,
            size: size,
            imageURL: url
        )
        .accessibilityHidden(true)
    }
}

/// The made-up name's violet for words: magic in light mode, the lighter violet in dark mode (magic stays dark there,
/// too faint on the dark fills), as the curator chip switches its tokens.
private struct PenNameInk: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content.foregroundStyle(colorScheme == .dark ? Theme.Color.business : Theme.Color.magic)
    }
}

extension View {
    func penNameInk() -> some View {
        modifier(PenNameInk())
    }
}

/// The small "Made-up name" mark beside a made-up name on a card, the post's page and a reply.
struct PenNameMark: View {
    var body: some View {
        Text("Made-up name")
            .font(.system(size: 10, weight: .semibold))
            .penNameInk()
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Theme.Color.magicBg)
            .clipShape(Capsule())
            .accessibilityLabel("Made-up name")
    }
}

/// "Post as": the person's own name ("your name and profile") or their made-up name ("others can't see it's you").
/// When the account may not use one, the made-up row shows why (`/me`'s `refusal`) and can't be chosen.
struct PostAsRow: View {
    let voice: PenNameVoice
    /// `/me`, once read; nil shows the made-up row as "Made-up name" until it is.
    let me: PenNameMeResponse?
    let onSelect: (PenNameVoice) -> Void
    /// "pulseCompose" or "pulseReply": the identifiers' prefix.
    var idPrefix = "pulseCompose"

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("Post as")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .accessibilityAddTraits(.isHeader)
            option(
                .own,
                title: PenNameStore.ownName,
                caption: "your name and profile",
                avatar: nil
            )
            option(
                .penName,
                title: me?.penName?.name ?? "Made-up name",
                caption: refusal ?? "others can't see it's you",
                avatar: me?.penName
            )
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("\(idPrefix)PostAs")
    }

    /// Why the made-up name can't be chosen, in the server's words.
    private var refusal: String? {
        guard let me, !me.allowed else { return nil }
        return me.refusal?.message ?? "A made-up name isn't open to this account."
    }

    private func option(_ value: PenNameVoice, title: String, caption: String, avatar: PenNameDTO?) -> some View {
        let active = voice == value
        let disabled = value == .penName && refusal != nil
        return Button { onSelect(value) } label: {
            HStack(spacing: Spacing.s2) {
                ZStack {
                    Circle()
                        .stroke(active ? Theme.Color.primary600 : Theme.Color.appBorderStrong, lineWidth: 2)
                        .frame(width: 20, height: 20)
                    if active {
                        Circle().fill(Theme.Color.primary600).frame(width: 10, height: 10)
                    }
                }
                if value == .penName {
                    PenNameAvatar(name: avatar?.name ?? "?", url: avatar?.avatar, size: 24)
                        .opacity(disabled ? 0.5 : 1)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .pantopusTextStyle(.body)
                        .foregroundStyle(disabled ? Theme.Color.appTextMuted : Theme.Color.appText)
                        .lineLimit(1)
                    Text(caption)
                        .pantopusTextStyle(.caption)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: Spacing.s0)
            }
            .padding(.horizontal, Spacing.s2)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("\(idPrefix)PostAs_\(value == .own ? "own" : "penName")")
    }
}

/// "Posting as Night Gardener": the top of the composer, or the reply box, while the made-up name is chosen, in the
/// made-up name's look.
struct PostingAsBanner: View {
    let penName: PenNameDTO
    var identifier = "pulseComposePostingAs"

    var body: some View {
        HStack(spacing: Spacing.s2) {
            PenNameAvatar(name: penName.name, url: penName.avatar, size: 28)
            Text("Posting as \(penName.name)")
                .font(.system(size: 14, weight: .semibold))
                .penNameInk()
                .lineLimit(1)
            Spacer(minLength: Spacing.s0)
            PenNameMark()
        }
        .padding(.horizontal, Spacing.s3)
        .padding(.vertical, Spacing.s2)
        .background(Theme.Color.magicBgSoft)
        .overlay(
            RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                .stroke(Theme.Color.magicBorder, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}
