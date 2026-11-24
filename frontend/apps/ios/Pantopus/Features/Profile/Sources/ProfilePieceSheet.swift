//
//  ProfilePieceSheet.swift
//  Pantopus
//
//  One piece of work, opened from Work (board 8; `GET …/piece/:id`, CONTRACT.md §5 and P2.2): its pictures and
//  video, kind, month and city, the person's own words, how we know it (each source its own line), the skills it
//  shows, what is attached (a video plays, a document opens as the app opens documents, a link is a card of words),
//  and what the person who hired them wrote. A piece that isn't there for this viewer closes the sheet. It opens in
//  a sheet with its own navigation stack, so it opens from every place the profile does (DECISIONS, phase 2).
//

import SwiftUI
import UniformTypeIdentifiers

struct ProfilePieceSheet: View {
    let model: ProfilePageModel
    let onClose: () -> Void

    @Environment(\.openURL) private var openURL
    /// The gallery opened full screen, from this item.
    @State private var viewing: ProfilePieceViewing?
    @State private var documentURL: URL?
    @State private var openingDocument: String?
    @State private var documentFailed = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if let piece = model.openedPiece?.piece {
                    content(piece)
                } else {
                    skeleton
                }
            }
            .background(Theme.Color.appBg)
            .navigationTitle("Piece")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: onClose)
                }
            }
        }
        .accessibilityIdentifier("profilePieceSheet")
        .fullScreenCover(item: $viewing) { viewing in
            MediaViewerView(items: viewing.items, startIndex: viewing.start)
        }
        .quickLookPreview($documentURL)
        .alert("Couldn't open that document", isPresented: $documentFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Check your connection and try again.")
        }
    }

    private var skeleton: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Shimmer(height: 290, cornerRadius: 0)
            VStack(alignment: .leading, spacing: Spacing.s3) {
                Shimmer(width: 220, height: 24, cornerRadius: Radii.sm)
                Shimmer(height: 14, cornerRadius: Radii.sm)
                Shimmer(height: 14, cornerRadius: Radii.sm)
            }
            .padding(.horizontal, Spacing.s4)
        }
        .accessibilityHidden(true)
    }

    private func content(_ piece: ProfilePieceReadDTO.Piece) -> some View {
        let summary = piece.summary
        let shown = piece.attachments.filter { $0.kind == "photo" || $0.kind == "video" }
        let others = piece.attachments.filter { $0.kind != "photo" }
        return VStack(alignment: .leading, spacing: Spacing.s4) {
            ProfilePieceGallery(summary: summary, items: shown) { index in
                viewing = ProfilePieceViewing(items: shown.compactMap(Self.mediaItem), start: index)
            }
            VStack(alignment: .leading, spacing: Spacing.s4) {
                heading(piece)
                if !piece.howWeKnow.isEmpty {
                    ProfileBlockCard {
                        ProfileBlockTitle(title: "How we know").padding(.bottom, Spacing.s3)
                        VStack(alignment: .leading, spacing: 14) {
                            ForEach(Array(piece.howWeKnow.enumerated()), id: \.offset) { index, line in
                                ProfileInkLineView(line: line.sourceLine(at: index))
                            }
                        }
                    }
                }
                if !piece.showsCan.isEmpty {
                    skills(piece.showsCan)
                }
                if !others.isEmpty || !piece.links.isEmpty {
                    attached(others: others, links: piece.links, shown: shown)
                }
                ForEach(Array(piece.written.enumerated()), id: \.offset) { index, line in
                    ProfilePieceWritten(line: line, position: index)
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.bottom, Spacing.s6)
        }
    }

    // MARK: Heading

    private func heading(_ piece: ProfilePieceReadDTO.Piece) -> some View {
        let summary = piece.summary
        return VStack(alignment: .leading, spacing: Spacing.s3) {
            let chips = [summary.when, summary.place].compactMap(\.self)
            if ProfilePieceCover.kindWord(summary.kind) != nil || !chips.isEmpty {
                ProfileWrapLayout(spacing: Spacing.s2) {
                    if let kind = ProfilePieceCover.kindWord(summary.kind) {
                        ProfilePieceChip(text: kind, tinted: true)
                    }
                    ForEach(chips, id: \.self) { ProfilePieceChip(text: $0, tinted: false) }
                }
                .accessibilityElement(children: .combine)
            }
            Text(summary.title)
                .scaledFont(24, weight: .bold)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if piece.howWeKnow.isEmpty, piece.description == nil {
                let source = summary.line.sourceLine(at: 0)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    ProfileInkGlyph(ink: source.ink, size: 9)
                    Text(source.source)
                        .scaledFont(ProfileSourceType.how)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(source.source)
            }
            if let description = piece.description {
                let line = description.sourceLine(at: 0)
                VStack(alignment: .leading, spacing: 6) {
                    Text(line.text)
                        .profileSaidFont(17)
                        .foregroundStyle(Theme.Color.appTextStrong)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(line.source)
                        .scaledFont(ProfileSourceType.how)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(line.spoken)
            }
        }
        .padding(.top, Spacing.s1)
    }

    // MARK: Skills

    private func skills(_ names: [String]) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            ProfileBlockTitle(title: "Skills it shows").padding(.horizontal, 4)
            ProfileWrapLayout(spacing: Spacing.s2) {
                ForEach(names, id: \.self) { ProfilePieceChip(text: $0, tinted: true) }
            }
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: Attached

    private func attached(
        others: [ProfilePieceReadDTO.Attachment],
        links: [ProfilePieceReadDTO.LinkCard],
        shown: [ProfilePieceReadDTO.Attachment]
    ) -> some View {
        ProfileBlockCard(padded: false) {
            ProfileBlockTitle(title: "Attached")
                .padding(.horizontal, Spacing.s4)
                .padding(.top, 14)
                .padding(.bottom, Spacing.s1)
            ForEach(Array(others.enumerated()), id: \.offset) { index, item in
                if index > 0 { ProfileRowDivider() }
                ProfilePieceAttachmentRow(item: item, opening: openingDocument == item.url) {
                    open(item, shown: shown)
                }
            }
            if !links.isEmpty {
                VStack(spacing: Spacing.s3) {
                    ForEach(Array(links.enumerated()), id: \.offset) { _, card in
                        ProfileLinkCardView(card: card) { url in openURL(url) }
                    }
                }
                .padding(.horizontal, Spacing.s3)
                .padding(.top, others.isEmpty ? Spacing.s1 : Spacing.s2)
            }
            Color.clear.frame(height: Spacing.s3)
        }
    }

    private func open(_ item: ProfilePieceReadDTO.Attachment, shown: [ProfilePieceReadDTO.Attachment]) {
        switch item.kind {
        case "video":
            let items = shown.compactMap(Self.mediaItem)
            let start = shown.firstIndex { $0.url == item.url } ?? 0
            viewing = ProfilePieceViewing(items: items, start: start)
        default:
            guard openingDocument == nil else { return }
            openingDocument = item.url
            Task {
                defer { openingDocument = nil }
                do {
                    // The type from the file's own name, so the document opens as what it is (a PDF, a sheet).
                    let ext = URL(string: item.url)?.pathExtension ?? ""
                    documentURL = try await ChatMediaURL.download(
                        raw: item.url,
                        filename: item.title ?? "Document",
                        mimeType: UTType(filenameExtension: ext)?.preferredMIMEType
                    )
                } catch {
                    documentFailed = true
                }
            }
        }
    }

    static func mediaItem(_ item: ProfilePieceReadDTO.Attachment) -> PostMediaItem? {
        guard let url = URL(string: item.url) else { return nil }
        return PostMediaItem(
            id: item.id ?? item.url,
            kind: item.kind == "video" ? .video : .image,
            url: url,
            thumbnailURL: item.thumbnailURL.flatMap(URL.init(string:))
        )
    }
}

/// The gallery opened full screen.
struct ProfilePieceViewing: Identifiable {
    let id = UUID()
    let items: [PostMediaItem]
    let start: Int
}

// MARK: - Gallery

/// The piece's pictures and videos: a big one with "1 of 6" and what it holds, and a strip to choose from (board 8).
/// Without any, the cover (or the drawn one every piece shares).
private struct ProfilePieceGallery: View {
    let summary: ProfilePieceDTO
    let items: [ProfilePieceReadDTO.Attachment]
    let onOpen: (Int) -> Void

    @State private var shown = 0

    /// "5 photos · 1 video", counted from what the gallery holds (the counts on the piece when it holds none).
    private var holds: String? {
        guard !items.isEmpty else { return ProfilePieceRow.mediaText(summary.media, kinds: [.photos, .videos]) }
        let photos = items.filter { $0.kind == "photo" }.count
        let videos = items.count - photos
        let parts = [(photos, "photo"), (videos, "video")].filter { $0.0 > 0 }.map { "\($0.0) \($0.1)\($0.0 == 1 ? "" : "s")" }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(spacing: Spacing.s2) {
            ZStack(alignment: .bottom) {
                if items.isEmpty {
                    ProfilePiecePicture(url: summary.coverURL)
                } else {
                    TabView(selection: $shown) {
                        ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                            Button { onOpen(index) } label: { picture(item) }
                                .buttonStyle(.plain)
                                .tag(index)
                                .accessibilityLabel(spoken(item, index))
                                .accessibilityHint(item.kind == "video" ? "Plays it" : "Opens it full screen")
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                }
                HStack {
                    if items.count > 1 {
                        ProfileGalleryTag(text: "\(shown + 1) of \(items.count)")
                    }
                    Spacer(minLength: 0)
                    if let media = holds {
                        ProfileGalleryTag(text: media)
                    }
                }
                .padding(10)
                .accessibilityHidden(true)
            }
            .frame(height: 290)
            .clipped()
            if items.count > 1 {
                ScrollViewReader { reader in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.s2) {
                            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                                Button { shown = index } label: { thumb(item, chosen: index == shown) }
                                    .buttonStyle(.plain)
                                    .id(index)
                                    .accessibilityLabel(spoken(item, index))
                                    .accessibilityAddTraits(index == shown ? .isSelected : [])
                            }
                        }
                        .padding(.horizontal, Spacing.s4)
                    }
                    .onChange(of: shown) { _, index in
                        withAnimation(.easeOut(duration: 0.2)) { reader.scrollTo(index, anchor: .center) }
                    }
                }
            }
        }
    }

    private func picture(_ item: ProfilePieceReadDTO.Attachment) -> some View {
        ZStack {
            if item.kind == "video" {
                ProfileVideoBackdrop(url: item.thumbnailURL.flatMap(URL.init(string:)))
                ProfilePlayMark(size: 54)
            } else {
                ProfilePiecePicture(url: URL(string: item.url))
            }
        }
    }

    private func thumb(_ item: ProfilePieceReadDTO.Attachment, chosen: Bool) -> some View {
        ZStack {
            if item.kind == "video" {
                ProfileVideoBackdrop(url: item.thumbnailURL.flatMap(URL.init(string:)))
                ProfilePlayMark(size: 22)
            } else {
                ProfilePiecePicture(url: URL(string: item.thumbnailURL ?? item.url))
            }
        }
        .frame(width: 56, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(chosen ? Theme.Color.appText : Color.clear, lineWidth: 2)
        )
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    private func spoken(_ item: ProfilePieceReadDTO.Attachment, _ index: Int) -> String {
        let what = item.title ?? (item.kind == "video" ? "Video" : "Photo")
        return "\(what), \(index + 1) of \(items.count)"
    }
}

/// "1 of 6" and "5 photos · 1 video" on a picture: light words on a dark pill, the same in light and dark mode.
private struct ProfileGalleryTag: View {
    let text: String

    var body: some View {
        Text(text)
            .scaledFont(11, weight: .semibold)
            .foregroundStyle(Theme.Color.appSurface)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(Theme.Color.appText.opacity(0.82), in: Capsule())
            .environment(\.colorScheme, .light)
            // Over a picture: the words grow with the reader's size up to what the picture can hold.
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }
}

// MARK: - Attached rows and link cards

/// A video (plays on the piece) or a document (opens as the app opens documents).
private struct ProfilePieceAttachmentRow: View {
    let item: ProfilePieceReadDTO.Attachment
    let opening: Bool
    let onOpen: () -> Void

    private var title: String {
        item.title ?? (item.kind == "video" ? "Video" : "Document")
    }

    private var detail: String? {
        item.detail.flatMap { $0 == title ? nil : $0 }
    }

    var body: some View {
        let video = item.kind == "video"
        Button(action: onOpen) {
            HStack(spacing: Spacing.s3) {
                ZStack {
                    if video {
                        ProfileVideoBackdrop(url: item.thumbnailURL.flatMap(URL.init(string:)))
                        ProfilePlayMark(size: 24)
                    } else {
                        Theme.Color.appSurfaceSunken
                        Icon(.fileText, size: 22, color: Theme.Color.appTextSecondary)
                    }
                }
                .frame(width: 64, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .scaledFont(15, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if let detail {
                        Text(detail).scaledFont(12).foregroundStyle(Theme.Color.appTextSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if opening {
                    ProgressView()
                } else if !video {
                    Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.vertical, Spacing.s3)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([title, detail].compactMap(\.self).joined(separator: ". "))
        .accessibilityHint(video ? "Plays it" : "Opens it")
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - What they wrote

/// A review from the job the piece started from ("What Dan wrote", board 8): the words, then who wrote it, what they
/// did and when, with the ink word.
private struct ProfilePieceWritten: View {
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
        .accessibilityLabel("\(title). \(line.text). \(who.isEmpty ? source.source : "\(source.ink.word), \(who)")")
    }
}
