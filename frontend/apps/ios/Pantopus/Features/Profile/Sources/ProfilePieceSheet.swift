//
//  ProfilePieceSheet.swift
//  Pantopus
//
//  One piece of work, opened from Work (`GET …/piece/:id`, CONTRACT.md §5):
//  its pictures, what it is and when, how we know it, the person's own words
//  about it, the skills it used and its links (words only). A piece that isn't
//  there for this viewer closes the sheet. Board 8's credits wait on 9.1.
//

import SwiftUI

struct ProfilePieceSheet: View {
    let model: ProfilePageModel
    let onClose: () -> Void

    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            ScrollView {
                if let piece = model.openedPiece?.piece {
                    content(piece)
                        .padding(Spacing.s4)
                } else {
                    VStack(alignment: .leading, spacing: Spacing.s3) {
                        Shimmer(height: 220, cornerRadius: 16)
                        Shimmer(width: 220, height: 22, cornerRadius: Radii.sm)
                        Shimmer(height: 14, cornerRadius: Radii.sm)
                    }
                    .padding(Spacing.s4)
                    .accessibilityHidden(true)
                }
            }
            .background(Theme.Color.appBg)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: onClose)
                }
            }
        }
        .accessibilityIdentifier("profilePieceSheet")
    }

    private func content(_ piece: ProfilePieceReadDTO.Piece) -> some View {
        let summary = piece.summary
        let source = summary.line.sourceLine(at: 0)
        let kind = [ProfilePieceCover.kindWord(summary.kind), summary.when].compactMap(\.self).joined(separator: " · ")
        return VStack(alignment: .leading, spacing: Spacing.s4) {
            let photos = piece.media.filter { $0.kind == "photo" }
            if photos.isEmpty {
                ProfilePiecePicture(url: summary.coverURL)
                    .frame(height: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                TabView {
                    ForEach(Array(photos.enumerated()), id: \.offset) { _, photo in
                        ProfilePiecePicture(url: URL(string: photo.url))
                    }
                }
                .tabViewStyle(.page)
                .frame(height: 260)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityLabel(photos.count == 1 ? "1 photo" : "\(photos.count) photos")
            }
            VStack(alignment: .leading, spacing: Spacing.s1) {
                if !kind.isEmpty {
                    Text(kind).scaledFont(13, weight: .semibold).foregroundStyle(Theme.Color.appTextSecondary)
                }
                Text(summary.title)
                    .scaledFont(24, weight: .bold)
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    ProfileInkGlyph(ink: source.ink)
                    Text(source.source).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                }
                .accessibilityElement(children: .combine)
            }
            if let description = piece.description {
                ProfileBlockCard {
                    ProfileInkLineView(line: description.sourceLine(at: 0))
                }
            }
            if !piece.skills.isEmpty {
                VStack(alignment: .leading, spacing: Spacing.s2) {
                    ProfileBlockTitle(title: "Skills used")
                    Text(piece.skills.joined(separator: " · "))
                        .scaledFont(14)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            let others = piece.media.filter { $0.kind != "photo" }
            if !others.isEmpty || !piece.links.isEmpty {
                ProfileBlockCard(padded: false) {
                    ForEach(Array(others.enumerated()), id: \.offset) { index, item in
                        if index > 0 { ProfileRowDivider() }
                        ProfileTileRow(
                            tile: ProfileTile(icon: item.kind == "video" ? .video : .fileText, tint: .work),
                            title: item.kind == "video" ? "Video" : "Document",
                            action: URL(string: item.url).map { url in { openURL(url) } }
                        )
                    }
                    ForEach(Array(piece.links.enumerated()), id: \.offset) { index, link in
                        if index > 0 || !others.isEmpty { ProfileRowDivider() }
                        ProfileTileRow(
                            tile: ProfileTile(icon: .link, tint: .plain),
                            title: link.title ?? link.site ?? link.url,
                            detail: link.site,
                            action: URL(string: link.url).flatMap { url in
                                url.scheme == "https" || url.scheme == "http" ? { openURL(url) } : nil
                            }
                        )
                    }
                }
            }
        }
    }
}
