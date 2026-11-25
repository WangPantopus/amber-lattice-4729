//
//  ProfilePieceParts.swift
//  Pantopus
//
//  The parts a piece is drawn with, on Work, on an opened piece and in the editor (boards 7, 8, 10, 11): its chips,
//  a link as a card of words, the play mark over a video and the row of chips that wraps.
//

import SwiftUI

// MARK: - Chips

/// A kind, a month or a skill (board 8): kinds and skills in the work tint, the rest plain.
struct ProfilePieceChip: View {
    let text: String
    let tinted: Bool

    var body: some View {
        Text(text)
            .scaledFont(13, weight: .semibold)
            .foregroundStyle(tinted ? Theme.Color.business : Theme.Color.appTextStrong)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(tinted ? Theme.Color.businessBg : Theme.Color.appSurfaceSunken, in: Capsule())
            .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Link card

/// A link on a piece as a card of words (boards 8 and 11): the kind and the site, the page's title and words, and how
/// we know it is the person's. No picture is ever loaded from the page.
struct ProfileLinkCardView: View {
    let card: ProfilePieceReadDTO.LinkCard
    var onOpen: ((URL) -> Void)?

    static func kindWord(_ kind: String?) -> String {
        switch kind {
        case "video": "Video"
        case "code": "Code"
        case "app": "App"
        case "article": "Article"
        case "paper": "Paper"
        default: "Site"
        }
    }

    static func icon(_ kind: String?) -> PantopusIcon {
        switch kind {
        case "video": .playCircle
        case "code": .monitor
        case "app": .smartphone
        case "article": .newspaper
        case "paper": .fileText
        default: .globe
        }
    }

    private var url: URL? {
        URL(string: card.url).flatMap { $0.scheme == "https" || $0.scheme == "http" ? $0 : nil }
    }

    var body: some View {
        if let url, let onOpen {
            Button { onOpen(url) } label: { content }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spoken)
                .accessibilityHint("Opens the page")
                .accessibilityAddTraits(.isLink)
        } else {
            content.accessibilityElement(children: .ignore).accessibilityLabel(spoken)
        }
    }

    private var source: String {
        let ink = ProfileInk(rawValue: card.ink) ?? .said
        guard let how = card.how, !how.isEmpty else { return ink.word }
        return "\(ink.word) · \(how)"
    }

    private var heading: String {
        [Self.kindWord(card.kind), card.site].compactMap(\.self).joined(separator: " · ")
    }

    private var spoken: String {
        [heading, card.title, card.description, source].compactMap(\.self).joined(separator: ". ")
    }

    private var content: some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Theme.Color.appSurface)
                Icon(Self.icon(card.kind), size: 18, color: Theme.Color.primary600)
            }
            .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text(heading.uppercased())
                    .scaledFont(11, weight: .semibold)
                    .tracking(0.6)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .lineLimit(1)
                Text(card.title ?? card.site ?? card.url)
                    .scaledFont(15, weight: .semibold)
                    .foregroundStyle(Theme.Color.appText)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if let description = card.description {
                    Text(description)
                        .scaledFont(13)
                        .foregroundStyle(Theme.Color.appTextStrong)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    ProfileInkGlyph(ink: ProfileInk(rawValue: card.ink) ?? .said, size: 9)
                    Text(source)
                        .scaledFont(12)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Spacing.s3)
        .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .contentShape(Rectangle())
    }
}

// MARK: - Play mark

/// The play mark over a video's picture.
struct ProfilePlayMark: View {
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(Theme.Color.appText.opacity(0.72))
            Icon(.play, size: size * 0.42, color: Theme.Color.appSurface)
                .offset(x: size * 0.04)
        }
        .frame(width: size, height: size)
        .environment(\.colorScheme, .light)
        .accessibilityHidden(true)
    }
}

// MARK: - Wrapping chips

/// Chips left to right, onto as many rows as they need. A chip wider than the row is offered the row's width, so at
/// the largest text size its words wrap inside it instead of running off the screen.
struct ProfileWrapLayout: Layout {
    var spacing: CGFloat = Spacing.s2

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout Void) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout Void) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for (index, size) in row.items {
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var items: [(Int, CGSize)] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for index in subviews.indices {
            var size = subviews[index].sizeThatFits(.unspecified)
            if size.width > width {
                size = subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil))
            }
            if !row.items.isEmpty, row.width + spacing + size.width > width {
                rows.append(row)
                row = Row()
            }
            row.width += (row.items.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.items.append((index, size))
        }
        if !row.items.isEmpty { rows.append(row) }
        return rows
    }
}

// MARK: - Video backdrop

/// Under a video's play mark: its own picture when it has one, else a plain dark backdrop (never the drawn cover).
struct ProfileVideoBackdrop: View {
    let url: URL?

    var body: some View {
        ZStack {
            Theme.Color.appText.opacity(0.82)
            if let url {
                CachedAsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                }
            }
        }
        .environment(\.colorScheme, .light)
        .clipped()
        .accessibilityHidden(true)
    }
}

// MARK: - What they wrote

/// A review from the job the piece started from ("What Dan wrote", board 8): the words, then who wrote it, what they
/// did and when, with the ink word.
struct ProfilePieceWritten: View {
    let line: ProfilePageLineDTO
    let position: Int

    private var title: String {
        guard let name = line.who?.name, let first = name.split(separator: " ").first else { return "What they wrote" }
        return "What \(first) wrote"
    }

    var body: some View {
        let source = line.sourceLine(at: position)
        let who = [line.who?.name, line.who?.did, line.when].compactMap(\.self).joined(separator: " · ")
        ProfileBlockCard {
            ProfileBlockTitle(title: title).padding(.bottom, Spacing.s2)
            Text(line.text)
                .scaledFont(17)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                ProfileInkGlyph(ink: source.ink, size: 9)
                Text(who.isEmpty ? source.source : "\(source.ink.word) · \(who)")
                    .scaledFont(12)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, Spacing.s2)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(title). " + ProfileSourceLine.spokenJoin(line.text, who.isEmpty ? source.source : "\(source.ink.word), \(who)")
        )
    }
}
