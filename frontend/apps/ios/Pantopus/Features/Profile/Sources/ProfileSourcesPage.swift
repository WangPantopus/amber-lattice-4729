//
//  ProfileSourcesPage.swift
//  Pantopus
//
//  A person's profile with sources (SPEC §5 phase 1, boards 1–4, 7, 12, 13):
//  the header card, the first tab's opening blocks (Says, Known for, You and,
//  doors), then the tabs (first name, Work, Record) that stay under the top bar
//  as the page scrolls. A tab with nothing isn't sent; with one tab left there
//  is no tab bar. The screen's buttons, sheets and the owner's own parts come
//  from `PublicProfileView`, as on today's page.
//

import SwiftUI

struct ProfileSourcesPage<Actions: View, OwnerTop: View, OwnerBottom: View>: View {
    let content: ProfileSourcesContent
    @Bindable var model: ProfilePageModel
    let avatarColor: ProfileAvatarColor
    let context: ProfileBlockContext
    /// Back or ✕ (the profile cover); nil in a preview, whose banner has Done.
    let leading: ProfileTopBar.Leading?
    let onBack: @MainActor () -> Void
    /// The top bar's Share: the share sheet with parts on your own page, the link on anyone else's.
    let onShare: (@MainActor () -> Void)?
    /// ⋯: follow, block, report and the rest, as today.
    let onMore: (@MainActor () -> Void)?
    let moreLabel: String
    var onRefresh: (@MainActor () async -> Void)?
    /// Your own page: today's portfolio (add, open, delete), on Work, or on the first tab while there is no Work.
    var onManagePieces: (@MainActor () -> Void)?
    /// Your own page on a server with pieces (phase 2): the editor, pushed, for a new piece or one started from a job.
    var onEditPiece: (@MainActor (ProfilePieceEditorStart) -> Void)?
    @ViewBuilder let actions: () -> Actions
    /// Your own page: the tips only you see, under the header.
    @ViewBuilder let ownerTop: () -> OwnerTop
    /// Your own page: your month, Your account and Log out, at the foot.
    @ViewBuilder let ownerBottom: () -> OwnerBottom

    @State private var headerGone = false
    /// The tabs have scrolled up under the top bar: a copy stays drawn there.
    @State private var tabsPinned = false
    @Environment(\.dynamicTypeSize) private var typeSize

    private static var tabsAnchor: String {
        "profileSourcesTabsAnchor"
    }

    /// The first tab's opening run: drawn above the tabs, as board 1 does.
    private static func isLead(_ block: ProfilePageBlockDTO) -> Bool {
        switch block.content {
        case .says, .knownFor, .inCommon, .doors: true
        case .lines: block.id == "key_lines"
        default: false
        }
    }

    private var person: ProfileSourcesTab? {
        content.tab(.person)
    }

    /// `key_lines` sits inside the header card.
    private var keyLines: [ProfilePageLineDTO] {
        guard let first = person?.blocks.first, first.id == "key_lines", case let .lines(lines, _) = first.content else { return [] }
        return lines
    }

    private var leadBlocks: [ProfilePageBlockDTO] {
        guard let blocks = person?.blocks else { return [] }
        let lead = Array(blocks.prefix { Self.isLead($0) })
        return lead.filter { $0.id != "key_lines" }
    }

    private func tabBlocks(_ tab: ProfileSourcesTab) -> [ProfilePageBlockDTO] {
        guard tab.key == .person else { return tab.blocks }
        return Array(tab.blocks.drop { Self.isLead($0) })
    }

    private var selected: ProfileSourcesTab? {
        content.tab(model.selectedTab) ?? content.tabs.first
    }

    var body: some View {
        VStack(spacing: Spacing.s0) {
            // A preview has its own banner with Done, and nothing else to put in the bar.
            if leading != nil || onShare != nil || onMore != nil {
                topBar
            }
            ScrollViewReader { scroller in
                ScrollView {
                    // A plain stack: every block is laid out, so picking a tab lands exactly on its top. The tabs stay
                    // under the top bar by a copy drawn over the page once the real ones have scrolled up there.
                    VStack(alignment: .leading, spacing: Spacing.s3) {
                        ProfileSourcesHeader(
                            content: content,
                            avatarColor: avatarColor,
                            keyLines: keyLines,
                            onOpenRecord: content.tab(.record) == nil ? nil : { select(.record, scroller) },
                            onOpenLink: context.openLink,
                            actions: actions
                        )
                        // The name moves into the top bar as the card's last lines go under it.
                        .onGeometryChange(for: Bool.self) { $0.frame(in: .scrollView).maxY < 56 } action: { headerGone = $0 }
                        .padding(.horizontal, Spacing.s4)
                        // The tips keep today's own inset (20 pt); the page's cards sit 16 pt in.
                        ownerTop()
                            .padding(.horizontal, Spacing.s4 - Spacing.s5)
                        ProfileBlockList(blocks: leadBlocks, context: context)
                            .padding(.horizontal, Spacing.s4)
                        if content.tabs.count > 1 {
                            tabBar(scroller)
                                .id(Self.tabsAnchor)
                                .onGeometryChange(for: Bool.self) { $0.frame(in: .scrollView).minY < 0 } action: { tabsPinned = $0 }
                        }
                        tabContent
                    }
                    .padding(.top, Spacing.s3)
                    .padding(.bottom, Spacing.s10)
                }
                .overlay(alignment: .top) {
                    if tabsPinned, content.tabs.count > 1 {
                        tabBar(scroller)
                            .accessibilityHidden(true)
                    }
                }
                .refreshable {
                    if let onRefresh { await Task { await onRefresh() }.value }
                }
            }
        }
        .background(Theme.Color.appBg)
        .accessibilityIdentifier("profileSourcesPage")
    }

    /// The picked tab's blocks, then your own page's parts and a link's footer.
    @ViewBuilder private var tabContent: some View {
        if let selected {
            if selected.key == .work, content.isOwner, let mine = model.ownerPieces, let onEditPiece {
                ProfileOwnerWorkCard(mine: mine) { onEditPiece($0) }
                    .padding(.horizontal, Spacing.s4)
            }
            ProfileBlockList(blocks: tabBlocks(selected), context: context)
                .padding(.horizontal, Spacing.s4)
            if let onManagePieces, model.ownerPieces == nil,
               selected.key == .work || (selected.key == .person && content.tab(.work) == nil) {
                ProfileBlockCard(padded: false) {
                    ProfileTileRow(
                        tile: ProfileTile(icon: .plus, tint: .work),
                        title: "Add or remove pieces",
                        detail: "Your portfolio: pictures, videos, documents and links",
                        action: onManagePieces
                    )
                }
                .padding(.horizontal, Spacing.s4)
                .accessibilityIdentifier("profileSourcesManagePieces")
            }
            if selected.key == .record {
                ProfileReadingGuide(firstName: content.header.firstName, asOf: content.recordChart?.asOf)
                    .padding(.horizontal, Spacing.s4)
            }
        }
        ownerBottom()
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s3)
        if let footer = content.page.footer {
            Text(footer.text)
                .scaledFont(13)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .frame(maxWidth: .infinity)
                .padding(.top, Spacing.s4)
        }
    }

    // MARK: - Top bar

    /// Back, the person's small picture and name once the header has scrolled away, Share and ⋯.
    private var topBar: some View {
        HStack(spacing: Spacing.s0) {
            if let leading {
                Button(action: onBack) {
                    Icon(leading == .back ? .chevronLeft : .x, size: 24, strokeWidth: 2.25, color: Theme.Color.appText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(leading == .back ? "Back" : "Close")
                .accessibilityIdentifier("publicProfileBack")
            } else {
                Color.clear.frame(width: 44, height: 44)
            }
            Spacer(minLength: Spacing.s2)
            if headerGone {
                HStack(spacing: Spacing.s2) {
                    ProfileAvatarDisc(
                        name: content.header.name,
                        showsInitials: !content.header.name.isEmpty,
                        imageURL: content.header.portraitURL,
                        color: avatarColor,
                        size: 26
                    )
                    .momentsRing(of: content.header.userId, lineWidth: 1.5, gap: 1.5, spoken: false)
                    Text(content.header.name)
                        .scaledFont(16, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .lineLimit(1)
                }
                .accessibilityHidden(true)
                .transition(.opacity)
            }
            Spacer(minLength: Spacing.s2)
            if let onShare {
                Button(action: onShare) {
                    Icon(.share, size: 20, color: Theme.Color.appText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(content.isOwner ? "Share your profile" : "Share \(content.header.firstName)'s profile")
                .accessibilityIdentifier("profileSourcesShare")
            }
            if let onMore {
                Button(action: onMore) {
                    Icon(.moreHorizontal, size: 20, color: Theme.Color.appText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(moreLabel)
                .accessibilityIdentifier("publicProfileMore")
            }
        }
        .padding(.horizontal, 6)
        .background(Theme.Color.appBg)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.Color.appBorder).frame(height: headerGone ? 1 : 0)
        }
        .animation(.easeOut(duration: 0.15), value: headerGone)
        .topBarSpansWindow()
    }

    // MARK: - Tabs

    private func tabBar(_ scroller: ScrollViewProxy) -> some View {
        HStack(spacing: Spacing.s0) {
            ForEach(content.tabs) { tab in
                let on = tab.key == selected?.key
                Button { select(tab.key, scroller) } label: {
                    Text(tab.title)
                        .scaledFont(14, weight: .semibold)
                        .foregroundStyle(on ? Theme.Color.primaryInk : Theme.Color.appTextSecondary)
                        .lineLimit(typeSize.isAccessibilitySize ? 2 : 1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(on ? Theme.Color.primaryInk : Color.clear).frame(height: 2)
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                .accessibilityIdentifier("profileSourcesTab_\(tab.key.rawValue)")
            }
        }
        .background(Theme.Color.appSurface)
        .overlay(alignment: .top) { Rectangle().fill(Theme.Color.appBorder).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.Color.appBorder).frame(height: 1) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tabs")
    }

    /// Picks a tab and brings its top under the bar, as the boards show Work and Record.
    private func select(_ key: ProfileSourcesTab.Key, _ scroller: ScrollViewProxy) {
        model.selectedTab = key
        guard content.tabs.count > 1 else { return }
        // Once the new tab has laid out.
        Task { @MainActor in
            await Task.yield()
            scroller.scrollTo(Self.tabsAnchor, anchor: .top)
        }
    }
}
