//
//  ProfileSourcesRows.swift
//  Pantopus
//
//  The row-shaped blocks of the profile with sources: doors, the shelf, plain
//  link rows (Posts in Pulse, Moments) and "shows more to people closer", and
//  the tile row they share (the boards' `.row` with its `.tile`).
//

import SwiftUI

// MARK: - doors

struct ProfileDoorsBlock: View {
    let title: String?
    let doors: [ProfileDoorDTO]
    let leaveCard: ProfileLeaveCardDTO?
    let signInNote: String?
    let context: ProfileBlockContext

    var body: some View {
        ProfileBlockCard(padded: false) {
            if let title {
                ProfileBlockTitle(title: title)
                    .padding(.horizontal, Spacing.s4)
                    .padding(.top, 14)
                    .padding(.bottom, 2)
            }
            ForEach(Array(doors.enumerated()), id: \.offset) { index, door in
                if index > 0 { ProfileRowDivider() }
                ProfileTileRow(
                    tile: tile(door.key),
                    title: door.text,
                    detail: door.note,
                    action: door.link.map { link in { context.openLink(link) } }
                )
            }
            // Leave your card (board 20) is phase 3: its button arrives with the server read that sends it.
            if let signInNote {
                Text(signInNote)
                    .scaledFont(12)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .padding(.horizontal, Spacing.s4)
                    .padding(.bottom, Spacing.s3)
            }
        }
    }

    private func tile(_ key: String) -> ProfileTile {
        switch key {
        case "hire", "see_work": ProfileTile(icon: .hammer, tint: .work)
        case "ask": ProfileTile(icon: .messageCircle, tint: .me)
        case "borrow": ProfileTile(icon: .arrowRightLeft, tint: .home)
        case "invite": ProfileTile(icon: .calendar, tint: .me)
        case "send_card": ProfileTile(icon: .mail, tint: .plain)
        default: ProfileTile(icon: .doorOpen, tint: .plain)
        }
    }
}

/// The square icon at the start of a row (the boards' `.tile`).
struct ProfileTile {
    enum Tint {
        case home, work, me, plain
    }

    let icon: PantopusIcon
    let tint: Tint

    var background: Color {
        switch tint {
        case .home: Theme.Color.homeBg
        case .work: Theme.Color.businessBg
        case .me: Theme.Color.personalBg
        case .plain: Theme.Color.appSurfaceSunken
        }
    }

    var foreground: Color {
        switch tint {
        case .home: Theme.Color.home
        case .work: Theme.Color.business
        case .me: Theme.Color.personal
        case .plain: Theme.Color.appTextStrong
        }
    }
}

/// A row of a card: an optional tile, a title and detail, and a chevron when it opens something.
struct ProfileTileRow: View {
    var tile: ProfileTile?
    let title: String
    var detail: String?
    var action: (() -> Void)?

    var body: some View {
        if let action {
            Button(action: action) { row(chevron: true) }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
        } else {
            row(chevron: false).accessibilityElement(children: .combine)
        }
    }

    private func row(chevron: Bool) -> some View {
        HStack(spacing: Spacing.s3) {
            if let tile {
                Icon(tile.icon, size: 18, color: tile.foreground)
                    .frame(width: 36, height: 36)
                    .background(tile.background, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .scaledFont(14, weight: .semibold)
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail {
                    Text(detail)
                        .scaledFont(12)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if chevron {
                Icon(.chevronRight, size: 18, color: Theme.Color.appTextMuted)
            }
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s3)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }
}

struct ProfileRowDivider: View {
    var inset: CGFloat = Spacing.s4

    var body: some View {
        Rectangle()
            .fill(Theme.Color.appBorderSubtle)
            .frame(height: 1)
            .padding(.leading, inset)
            .accessibilityHidden(true)
    }
}

// MARK: - shelf

struct ProfileShelfBlock: View {
    let title: String?
    let objects: [ProfileShelfObjectDTO]

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        ProfileBlockCard {
            VStack(alignment: .leading, spacing: 10) {
                if let title { ProfileBlockTitle(title: title) }
                if typeSize.isAccessibilitySize {
                    // Five captions side by side break mid-word at the largest sizes: one object a row instead.
                    ForEach(objects) { object in
                        HStack(spacing: Spacing.s3) {
                            picture(object)
                                .frame(width: 64, height: 64)
                                .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .accessibilityHidden(true)
                            Text(object.caption)
                                .scaledFont(12)
                                .foregroundStyle(Theme.Color.appTextStrong)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .accessibilityElement(children: .combine)
                    }
                } else {
                    shelf
                }
            }
        }
    }

    private var shelf: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(objects) { object in
                    picture(object)
                        .frame(maxWidth: .infinity, maxHeight: 96, alignment: .bottom)
                        .accessibilityLabel(object.caption)
                }
            }
            .frame(height: 96, alignment: .bottom)
            RoundedRectangle(cornerRadius: 3)
                .fill(Theme.Color.warmAmber.opacity(0.55))
                .frame(height: 9)
                .accessibilityHidden(true)
            // Captions are captions, not lines: no ink is claimed for them (the contract sends none).
            HStack(alignment: .top, spacing: 4) {
                ForEach(objects) { object in
                    Text(object.caption)
                        .scaledFont(12)
                        .foregroundStyle(Theme.Color.appTextStrong)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .accessibilityHidden(true)
                }
            }
        }
    }

    private func picture(_ object: ProfileShelfObjectDTO) -> some View {
        CachedAsyncImage(url: object.pictureURL.flatMap(URL.init(string:))) { phase in
            if let image = phase.image {
                image.resizable().scaledToFit()
            } else {
                Color.clear
            }
        }
    }
}

// MARK: - rows

struct ProfileRowsBlock: View {
    let rows: [ProfilePageRowDTO]
    let context: ProfileBlockContext

    var body: some View {
        ProfileBlockCard(padded: false) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                if index > 0 { ProfileRowDivider(inset: 0) }
                ProfileTileRow(
                    title: row.title,
                    detail: row.detail,
                    action: row.link.map { link in { context.openLink(link) } }
                )
                .accessibilityIdentifier("profileRow_\(row.key)")
            }
        }
    }
}

// MARK: - more_closer

struct ProfileMoreCloserBlock: View {
    let title: String
    let text: String
    let onConnect: (() -> Void)?

    var body: some View {
        ProfileBlockCard {
            HStack(alignment: .top, spacing: Spacing.s3) {
                Icon(.users, size: 18, color: Theme.Color.appTextStrong)
                    .frame(width: 36, height: 36)
                    .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .scaledFont(15, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(text)
                        .scaledFont(13)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let onConnect {
                        Button(action: onConnect) {
                            Text("Ask to connect")
                                .scaledFont(14, weight: .semibold)
                                .foregroundStyle(Theme.Color.appText)
                                .padding(.horizontal, Spacing.s4)
                                .frame(minHeight: 44)
                                .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 6)
                        .accessibilityIdentifier("profileMoreCloserConnect")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

// MARK: - notice

/// One row for something waiting for the owner that this app can't show yet: the server's words, opened on
/// pantopus.com. The owner's own page only, at the top of the first tab.
struct ProfileNoticeRow: View {
    let text: String
    let onOpen: (() -> Void)?

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        ProfileBlockCard {
            Button { onOpen?() } label: {
                // At the largest sizes the bell takes its own line, so the words keep the whole width.
                if typeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: Spacing.s2) {
                        HStack {
                            bell
                            Spacer(minLength: Spacing.s2)
                            arrow
                        }
                        words
                    }
                    .contentShape(Rectangle())
                } else {
                    HStack(alignment: .top, spacing: Spacing.s3) {
                        bell
                        words
                        arrow.padding(.top, Spacing.s2)
                    }
                    .contentShape(Rectangle())
                }
            }
            .buttonStyle(.plain)
            .disabled(onOpen == nil)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(onOpen == nil ? [] : .isLink)
        .accessibilityIdentifier("profileNotice")
    }

    private var bell: some View {
        Icon(.bell, size: 18, color: Theme.Color.primary600)
            .frame(width: 36, height: 36)
            .background(Theme.Color.infoBg, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    private var words: some View {
        Text(text)
            .scaledFont(14, weight: .medium)
            .foregroundStyle(Theme.Color.appText)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var arrow: some View {
        if onOpen != nil {
            Icon(.externalLink, size: 16, color: Theme.Color.appTextMuted)
        }
    }
}
