//
//  ProfileWorkBlocks.swift
//  Pantopus
//
//  The Work tab's blocks (board 7, CONTRACT.md §3.2, §3.6): Can do counted
//  from pieces, pinned pieces with their covers, the work rings opened flat
//  with a dot per piece, the list of pieces, and Owns. Phase 1 draws what the
//  phase 1 server sends; credits and the work circle wait on the founder (9.1).
//

import SwiftUI

// MARK: - can_do

struct ProfileCanDoBlock: View {
    let title: String
    let subtitle: String?
    let skills: [ProfileSkillLineDTO]

    var body: some View {
        let most = max(1, skills.map(\.pieces).max() ?? 1)
        ProfileBlockCard {
            VStack(alignment: .leading, spacing: Spacing.s0) {
                HStack(alignment: .firstTextBaseline) {
                    ProfileBlockTitle(title: title)
                    Spacer(minLength: Spacing.s2)
                    if let subtitle {
                        Text(subtitle).scaledFont(12).foregroundStyle(Theme.Color.appTextSecondary)
                    }
                }
                .padding(.bottom, 6)
                ForEach(Array(skills.enumerated()), id: \.offset) { index, skill in
                    if index > 0 { ProfileRowDivider(inset: 0) }
                    row(skill, most: most, position: index)
                }
            }
        }
    }

    @ViewBuilder
    private func row(_ skill: ProfileSkillLineDTO, most: Int, position: Int) -> some View {
        let source = skill.line.sourceLine(at: position)
        if skill.pieces > 0, let inks = skill.inks {
            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline) {
                    Text(skill.name)
                        .scaledFont(15, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: Spacing.s2)
                    Text(skill.line.how)
                        .scaledFont(12)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
                GeometryReader { proxy in
                    ProfileRecordMeter(seen: inks.seen, signed: inks.signed, said: inks.said)
                        .frame(width: proxy.size.width * CGFloat(skill.pieces) / CGFloat(most))
                }
                .frame(height: 8)
                Text(Self.mix(inks))
                    .scaledFont(12)
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
            .padding(.vertical, 10)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(skill.name). \(skill.line.how). \(Self.mix(inks))")
        } else {
            HStack(alignment: .firstTextBaseline, spacing: Spacing.s3) {
                Text(skill.name)
                    .profileSaidFont(source.ink == .said ? ProfileSourceType.said : ProfileSourceType.body)
                    .foregroundStyle(Theme.Color.appTextStrong)
                Spacer(minLength: Spacing.s2)
                Text(source.source)
                    .scaledFont(12)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .multilineTextAlignment(.trailing)
            }
            .padding(.vertical, 10)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(source.spoken)
        }
    }

    /// "3 seen, 5 signed, 1 said": the meter is never read by its line style alone.
    static func mix(_ inks: ProfileSkillLineDTO.Inks) -> String {
        [(inks.seen, "seen"), (inks.signed, "signed"), (inks.said, "said")]
            .filter { $0.0 > 0 }
            .map { "\($0.0) \($0.1)" }
            .joined(separator: ", ")
    }
}

// MARK: - pieces

struct ProfilePiecesBlock: View {
    let title: String?
    let block: ProfilePiecesDTO
    let context: ProfileBlockContext

    private var style: String {
        block.style
    }

    private var subtitle: String? {
        block.subtitle
    }

    private var pieces: [ProfilePieceDTO] {
        block.pieces
    }

    private var filters: [String] {
        block.filters
    }

    private var more: ProfilePageMoreDTO? {
        block.more
    }

    @State private var filter: String?

    var body: some View {
        if style == "pinned" {
            pinned
        } else {
            list
        }
    }

    private var pinned: some View {
        VStack(alignment: .leading, spacing: 10) {
            header.padding(.horizontal, 4)
            if let first = pieces.first {
                ProfilePieceCover(piece: first, height: 238, large: true, context: context)
            }
            let rest = Array(pieces.dropFirst())
            if !rest.isEmpty {
                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 12, alignment: .top), GridItem(.flexible(), spacing: 12, alignment: .top)],
                    spacing: 12
                ) {
                    ForEach(rest) { piece in
                        ProfilePieceCover(piece: piece, height: 130, large: false, context: context)
                    }
                }
            }
        }
    }

    private var shownPieces: [ProfilePieceDTO] {
        pieces.filter { piece in
            filter == nil || piece.kind == filter
        }
    }

    private var list: some View {
        ProfileBlockCard {
            VStack(alignment: .leading, spacing: Spacing.s0) {
                header
                if filters.count > 1 {
                    Picker("Show", selection: $filter) {
                        Text("All").tag(String?.none)
                        ForEach(filters, id: \.self) { kind in
                            Text(ProfilePieceCover.kindWord(kind) ?? kind.capitalized).tag(String?.some(kind))
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.vertical, Spacing.s3)
                }
                ForEach(Array(shownPieces.enumerated()), id: \.element.id) { index, piece in
                    if index > 0 { ProfileRowDivider(inset: 0) }
                    ProfilePieceRow(piece: piece, context: context)
                }
                ProfileMoreLink(more: more, context: context)
            }
        }
    }

    @ViewBuilder private var header: some View {
        if title != nil || subtitle != nil {
            HStack(alignment: .firstTextBaseline) {
                if let title { ProfileBlockTitle(title: title) }
                Spacer(minLength: Spacing.s2)
                if let subtitle {
                    Text(subtitle).scaledFont(12).foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
        }
    }
}

/// A pinned piece: its cover (or a drawn one), "Built · 2026" and what it holds on the picture, then the title and
/// how we know it.
struct ProfilePieceCover: View {
    let piece: ProfilePieceDTO
    let height: CGFloat
    let large: Bool
    let context: ProfileBlockContext

    static func kindWord(_ kind: String?) -> String? {
        switch kind {
        case "did": "Did"
        case "built": "Built"
        case "owns": "Owns"
        default: nil
        }
    }

    private var tag: String? {
        let parts = [Self.kindWord(piece.kind), piece.year.map(String.init) ?? piece.when].compactMap(\.self)
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        let source = piece.line.sourceLine(at: 0)
        Button { context.openLink(piece.opening) } label: {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                ZStack(alignment: .topLeading) {
                    ProfilePiecePicture(url: piece.coverURL)
                        .frame(height: height)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    HStack {
                        if let tag { ProfileCoverTag(text: tag) }
                        Spacer(minLength: 0)
                        if large, let media = ProfilePieceRow.mediaText(piece.media, kinds: [.photos, .videos]) {
                            ProfileCoverTag(text: media)
                        }
                    }
                    .padding(10)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(piece.title)
                        .scaledFont(large ? 17 : 14, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        ProfileInkGlyph(ink: source.ink, size: 9)
                        Text(source.source)
                            .scaledFont(12)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 4)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([piece.title, tag, source.source].compactMap(\.self).joined(separator: ". "))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("profilePiece_\(piece.id)")
    }
}

struct ProfileCoverTag: View {
    let text: String

    var body: some View {
        Text(text)
            .scaledFont(11, weight: .semibold)
            .foregroundStyle(Theme.Color.appText)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Theme.Color.appSurface.opacity(0.92), in: Capsule())
            // Over a cover: the words grow up to what the cover can hold.
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }
}

/// A piece's picture, or the drawn cover every piece without one shares (one cover shape everywhere).
struct ProfilePiecePicture: View {
    let url: URL?

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Theme.Color.businessBg, Theme.Color.appSurfaceSunken],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Icon(.hammer, size: 22, color: Theme.Color.business.opacity(0.6))
            if let url {
                CachedAsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color.clear
                    }
                }
            }
        }
        .clipped()
        .accessibilityHidden(true)
    }
}

struct ProfilePieceRow: View {
    let piece: ProfilePieceDTO
    let context: ProfileBlockContext

    @Environment(\.dynamicTypeSize) private var typeSize

    enum MediaPart {
        case photos, videos, documents, links
    }

    /// "5 photos · 1 video": what a piece holds, of the parts asked for.
    static func mediaText(
        _ media: ProfilePieceDTO.Media?,
        kinds: Set<MediaPart> = [.photos, .videos, .documents, .links]
    ) -> String? {
        guard let media else { return nil }
        let parts = [
            (media.photos, "photo", MediaPart.photos), (media.videos, "video", .videos),
            (media.documents, "document", .documents), (media.links, "link", .links)
        ]
        .filter { $0.0 > 0 && kinds.contains($0.2) }
        .map { ($0.0, $0.1) }
        .map { "\($0.0) \($0.1)\($0.0 == 1 ? "" : "s")" }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// "Seen · Built · August 2026 · a paid job": the ink word is always written (board 7 draws only the mark).
    private var detail: String {
        let source = piece.line.sourceLine(at: 0)
        let how = source.how?.trimmingCharacters(in: .whitespacesAndNewlines)
        return [source.ink.word, ProfilePieceCover.kindWord(piece.kind), piece.when, how.flatMap { $0.isEmpty ? nil : $0 }]
            .compactMap(\.self)
            .joined(separator: " · ")
    }

    private var picture: some View {
        ProfilePiecePicture(url: piece.coverURL)
            .frame(width: 52, height: 52)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func words(_ source: ProfileSourceLine) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(piece.title)
                .scaledFont(14, weight: .semibold)
                .foregroundStyle(Theme.Color.appText)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                ProfileInkGlyph(ink: source.ink, size: 9)
                Text(detail)
                    .scaledFont(12)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let onlyYou {
                Text(onlyYou)
                    .scaledFont(12, weight: .semibold)
                    .foregroundStyle(Theme.Color.appTextStrong)
            }
        }
    }

    /// The owner's own view only: a draft or hidden piece reaches nobody else (P2.1).
    private var onlyYou: String? {
        if piece.draft { return "Draft · only you see it" }
        if piece.hidden { return "Hidden · only you see it" }
        return nil
    }

    var body: some View {
        let source = piece.line.sourceLine(at: 0)
        Button { context.openLink(piece.opening) } label: {
            Group {
                if typeSize.isAccessibilitySize {
                    // The words get the full width: the small picture sits on its own line above them.
                    VStack(alignment: .leading, spacing: Spacing.s2) {
                        HStack {
                            picture
                            Spacer(minLength: 0)
                            Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
                        }
                        words(source)
                    }
                } else {
                    HStack(spacing: Spacing.s3) {
                        picture
                        words(source).frame(maxWidth: .infinity, alignment: .leading)
                        Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
                    }
                }
            }
            .padding(.vertical, Spacing.s3)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([piece.title, detail, onlyYou].compactMap(\.self).joined(separator: ". "))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("profilePiece_\(piece.id)")
    }
}

// MARK: - owns

struct ProfileOwnsBlock: View {
    let title: String
    let lines: [ProfileOwnsLineDTO]
    let context: ProfileBlockContext

    var body: some View {
        ProfileBlockCard(padded: false) {
            ProfileBlockTitle(title: title)
                .padding(.horizontal, Spacing.s4)
                .padding(.top, 14)
                .padding(.bottom, 2)
            ForEach(Array(lines.enumerated()), id: \.offset) { index, item in
                if index > 0 { ProfileRowDivider() }
                let source = item.line.sourceLine(at: index)
                let row = HStack(spacing: Spacing.s3) {
                    badge(item.badge)
                    VStack(alignment: .leading, spacing: 2) {
                        // A Said line ("Tools she brings") is the person's own words, in their serif (board 7).
                        if source.ink == .said {
                            Text(item.line.text)
                                .profileSaidFont(15)
                                .foregroundStyle(Theme.Color.appTextStrong)
                                .fixedSize(horizontal: false, vertical: true)
                        } else {
                            Text(item.line.text)
                                .scaledFont(14, weight: .semibold)
                                .foregroundStyle(Theme.Color.appText)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            ProfileInkGlyph(ink: source.ink, size: 9)
                            Text(source.source)
                                .scaledFont(12)
                                .foregroundStyle(Theme.Color.appTextSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if item.line.link != nil {
                        Icon(.chevronRight, size: 18, color: Theme.Color.appTextMuted)
                    }
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
                .contentShape(Rectangle())
                if let link = item.line.link {
                    Button { context.openLink(link) } label: { row }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(source.spoken)
                        .accessibilityAddTraits(.isButton)
                } else {
                    row.accessibilityElement(children: .ignore).accessibilityLabel(source.spoken)
                }
            }
            Color.clear.frame(height: Spacing.s1)
        }
    }

    private func badge(_ badge: ProfileOwnsLineDTO.Badge?) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Theme.Color.businessBg)
            if let url = badge?.pictureURL.flatMap(URL.init(string:)) {
                CachedAsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                }
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            } else if let initials = badge?.initials {
                Text(initials).scaledFont(13, weight: .bold).foregroundStyle(Theme.Color.business)
            } else {
                Icon(.badgeCheck, size: 18, color: Theme.Color.business)
            }
        }
        .frame(width: 36, height: 36)
        .accessibilityHidden(true)
    }
}

extension ProfilePieceDTO {
    /// Where a tap opens it: on this page, or on its owner's when it is theirs ("With Maria Kovács").
    var opening: ProfilePageLinkDTO {
        if case let .piece(id, owner?) = line.link { return .piece(id: id, owner: owner) }
        if let with, let owner = with.userId ?? with.username { return .piece(id: id, owner: owner) }
        return .piece(id: id)
    }
}
