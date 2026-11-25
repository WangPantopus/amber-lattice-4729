//
//  TodayAroundYou.swift
//  Pantopus
//
//  Today's two halves (founder decision 2026-11-14): "At home" is Today as it
//  was; "Around you" lists local headlines for the same place, each the
//  outlet's own with its name, opened at the outlet. The switch is the big
//  two-part one Pulse draws for List | Map, and it shows only when the server
//  has something for this place (`available`), so an area without local
//  sources sees Today unchanged. Each headline is a post by the Pantopus
//  curator account, drawn with the Pulse card (emoji reactions, Save, the
//  post menu; a tap opens its post page with the reply threads, pushed on
//  Today's own stack); "Read at <outlet>" opens the story. A server from
//  before the posts sends rows, drawn as the first build drew them.
//  On the iPhone Duo (founder, 2026-11-15): closed it is the phone's page;
//  open and held sideways the list is the page left of the hinge and the
//  open post the page right of it (`TodayAroundYouColumns`); open and
//  upright the list and the post are a centered column of a phone's reading
//  width, not rows and pictures stretched across the screen.
//  Topics and scrolling back (founder, 2026-11-24): a row of chips over the
//  page, each a list that keeps loading as its end nears, and under All the
//  sections are followed by every earlier story (`TodayAroundYouLists.swift`).
//  A card's Reply, and the reply preview under a card people replied to, open
//  the post with its reply box ready to type in.
//  Parity twin of Android's `TodayAroundYou.kt`.
//

import SafariServices
import SwiftUI

/// The Around you page: under each section's name, its headlines as Pulse
/// cards, or, from a server before the posts, a card of the first build's rows.
struct TodayAroundYouPage: View {
    let page: AroundYouDTO
    let model: TodayAroundYouModel
    /// The open post shows beside this page (the open iPhone Duo held sideways), where everywhere else it is
    /// pushed over it.
    var postBeside = false
    let onRefresh: () async -> Void
    @State private var opened: OpenedStory?
    /// The post whose page is pushed on Today's stack: the open post, where it isn't beside the page.
    @State private var pushedPost: OpenedPost?
    /// A fold or a turn is under way (`TodayScreenSpace.isMoving`): the open post moves when it is over.
    @Environment(\.todayScreenSpace) private var screenSpace

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s5) {
                    if let area = page.area {
                        Text(page.hasPosts
                            ? "From local news outlets around \(area). Each post links to the story where it was published."
                            : "From local news outlets around \(area). Each headline opens the story where it was published.")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, Spacing.s5)
                    }
                    // The chips: which list shows. None from a server before the lists, or for a place with one.
                    if model.lists.count > 1 {
                        TodayAroundYouChips(lists: model.lists, active: model.list) { list in
                            model.select(list: list)
                        }
                    }
                    if model.list == AroundYouListDTO.all {
                        ForEach(page.sections) { section in
                            if page.hasPosts {
                                postSection(section)
                            } else {
                                sectionCard(section)
                                    .padding(.horizontal, Spacing.s4)
                            }
                        }
                    }
                    // The list behind the first page: the earlier stories under All, or the chosen chip's own.
                    if !model.lists.isEmpty {
                        listBody
                    }
                }
                .padding(.top, Spacing.s2)
                .padding(.bottom, Spacing.s10)
                // Where the screen is wider (the open Duo upright), a centered column, as the post page is.
                .frame(maxWidth: TodayAroundYouColumns.readingWidth)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await onRefresh() }
            if let toast = model.toast {
                ToastView(message: ToastMessage(text: toast, kind: .neutral))
                    .padding(.bottom, Spacing.s10)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .dismissToast(after: toast, minimum: 2) { model.toast = nil }
            }
        }
        .sheet(item: $opened) { story in
            StoryBrowser(url: story.url).ignoresSafeArea()
        }
        // "Repost with your words" opens the composer over Today, once for the page's cards.
        .modifier(ProfilePostQuoteComposer(model: model.cards))
        // The card of the post open beside the list is tinted, as in Pulse.
        .environment(\.selectedPulsePostId, postBeside ? model.openedPostId : nil)
        // Two pages from the width that holds them, whatever the half under this one asks for.
        .readableColumnWidens(from: TodayAroundYouColumns.minimumScreenWidth)
        .navigationDestination(item: $pushedPost) { post in
            PostPageDestination(
                postId: post.id,
                currentUserId: model.viewerId ?? "",
                viewModel: model.model(forPost: post.id)
            ) {
                pushedPost = nil
            } onOpenProfile: { userId in
                DeepLinkRouter.shared.handle(path: "/u/\(userId)")
            } onEdit: { _ in }
                .id(model.postScreen)
                .readableColumn(width: TodayAroundYouColumns.readingWidth)
                .toolbar(.hidden, for: .navigationBar)
                // A pushed screen doesn't inherit the pushing screen's environment.
                .environment(\.postPresentationHost, model.presentations)
        }
        .onChange(of: pushedPost) { previous, now in
            guard previous != nil, now == nil else { return }
            // Off the stack because there is room beside the list now: the post goes there, still open.
            if postBeside {
                model.postMoved(beside: true)
                return
            }
            // Back from a post page: it is closed, and its replies and reactions show on the cards.
            model.closePost()
            Task { await onRefresh() }
        }
        .onChange(of: postBeside, initial: true) { _, _ in placePost() }
        .onChange(of: isMoving) { _, _ in placePost() }
        .onChange(of: model.openedPostId) { previous, _ in
            // Beside the list, the post that was open shows what was done on it once another takes its place.
            if postBeside, previous != nil { Task { await onRefresh() } }
        }
        .accessibilityIdentifier("aroundYouPanel")
    }

    /// Opens a card's post: pushed over the list, or in the page beside it. `toReply` (the card's Reply, its reply
    /// preview) opens it with the reply box ready to type in.
    private func open(_ postId: String, toReply: Bool = false) {
        if toReply {
            model.openToReply(postId: postId)
        } else {
            model.open(postId: postId)
        }
        if postBeside {
            model.postMoved(beside: true)
        } else {
            pushedPost = OpenedPost(id: postId)
        }
    }

    private var isMoving: Bool {
        screenSpace?.isMoving ?? false
    }

    /// Puts the open post where the room is: on the page beside the list, or pushed over it. During a fold or a
    /// turn it waits until the screens have settled, then moves with no slide; the reply box keeps its keyboard.
    private func placePost() {
        model.noteKeyboard()
        guard !isMoving else { return }
        var transaction = Transaction()
        transaction.disablesAnimations = true
        if postBeside {
            guard pushedPost != nil else {
                keepKeyboard(model.handKeyboardOn())
                model.postMoved(beside: true)
                return
            }
            // Off the stack first; the page beside the list takes it once it has left (`onChange(of: pushedPost)`).
            model.postScreenMoved()
            keepKeyboard(model.handKeyboardOn())
            withTransaction(transaction) { pushedPost = nil }
        } else {
            let open = model.openedPostId.map { OpenedPost(id: $0) }
            guard pushedPost != open else {
                keepKeyboard(model.handKeyboardOn())
                return
            }
            model.postScreenMoved()
            keepKeyboard(model.handKeyboardOn())
            model.postMoved(beside: false)
            withTransaction(transaction) { pushedPost = open }
        }
    }

    /// The reply box had the keyboard: once the post's new screen has had its chance, check that it has it back.
    private func keepKeyboard(_ had: Bool) {
        guard had else { return }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(1300))
            model.giveKeyboardAgainIfLost()
        }
    }

    private func sectionHeading(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.system(size: 11, weight: .bold))
            .kerning(0.77)
            .foregroundStyle(Theme.Color.appTextSecondary)
            .accessibilityAddTraits(.isHeader)
    }

    /// A section's posts, full-width rows as in Pulse; a section whose posts
    /// all left (removed, hidden) shows nothing.
    @ViewBuilder
    private func postSection(_ section: AroundYouSectionDTO) -> some View {
        let ids = Set((section.posts ?? []).map(\.id))
        cardGroup(
            heading: section.title,
            cards: model.cards.cards.filter { ids.contains($0.id) },
            identifier: "aroundYouSection_\(section.id)"
        )
    }

    /// The open list's stories under the day each was first seen, then the list's foot, which asks for the next
    /// page as it nears the screen.
    @ViewBuilder private var listBody: some View {
        let posts = model.shownListPosts
        let cards = Dictionary(model.cards.cards.map { ($0.id, $0) }) { first, _ in first }
        ForEach(AroundYouDayGroup.groups(of: posts, list: model.list)) { group in
            cardGroup(
                heading: group.heading,
                cards: group.postIds.compactMap { cards[$0] },
                identifier: "aroundYouListPosts_\(model.list)"
            )
        }
        TodayAroundYouListFoot(
            list: model.list,
            state: model.listState,
            isEmpty: posts.isEmpty,
            ranLong: model.listRanLong,
            onNear: { model.listEndNeared() },
            onRetry: { model.retryList() }
        )
        // Made anew after each read, so a foot that is still near asks for the page after.
        .id(model.listFoot)
    }

    /// Cards under a heading, full-width rows as in Pulse; nothing when there are no cards.
    @ViewBuilder
    private func cardGroup(heading: String?, cards: [PulsePostCardContent], identifier: String) -> some View {
        if !cards.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                if let heading {
                    sectionHeading(heading)
                        .padding(.horizontal, Spacing.s5)
                }
                LazyVStack(spacing: Spacing.s0) {
                    ForEach(cards) { card in
                        pulseCard(card)
                            // "Post options" (Share…, Report post) and the report reasons, as on a profile, from
                            // the card's own options button: on a wide screen they are a bubble that points at it.
                            .overlay(alignment: .topTrailing) {
                                Color.clear
                                    .frame(width: 28, height: 28)
                                    .padding(.top, 29)
                                    .padding(.trailing, Spacing.s4)
                                    .allowsHitTesting(false)
                                    .accessibilityHidden(true)
                                    .modifier(ProfilePostCardSurfaces(model: model.cards, postId: card.id))
                            }
                    }
                }
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(Theme.Color.appBorderSubtle)
                        .frame(height: 1)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier(identifier)
        }
    }

    /// One headline with the controls a Pulse card gives it. A Repost shows it
    /// to the reposter's connections in Pulse; the post itself lists only here.
    private func pulseCard(_ card: PulsePostCardContent) -> PulsePostCard {
        let cards = model.cards
        let postId = card.id
        var options: (@MainActor () -> Void)?
        if cards.hasOptions(card) {
            options = { cards.overflowPostId = postId }
        }
        let react: @MainActor (PostReactionEmoji) -> Void = { emoji in
            Task { await cards.pickReaction(postId: postId, emoji: emoji) }
        }
        let going: @MainActor () -> Void = { Task { await cards.tapReaction(postId: postId) } }
        let save: @MainActor () -> Void = { Task { await cards.toggleSave(postId: postId) } }
        // ↻ opens the Repost chooser, as on every Pulse card: "Repost", or "Repost with your words".
        let repost: @MainActor () -> Void = { cards.openRepostChooser(postId: postId) }
        let rsvp: (@MainActor () -> Void)? = card.attendees == nil ? nil : going
        // Reply, and the reply preview: the post opens with its reply box ready to type in.
        let reply: @MainActor () -> Void = { open(postId, toReply: true) }
        return PulsePostCard(
            content: card,
            onTap: { open(postId) },
            onPickReaction: react,
            onRSVP: rsvp,
            onOverflow: options,
            onToggleSave: save,
            onToggleRepost: repost,
            // The chooser opens from this card's ↻, pointing at it.
            repostChooser: PulseCardRepostChooser(
                target: Binding(get: { cards.repostChooser }, set: { cards.repostChooser = $0 }),
                onToggle: { postId in Task { await cards.toggleRepost(postId: postId) } },
                onQuote: { postId in cards.beginQuote(postId: postId) }
            ),
            onReply: reply
        )
    }

    private struct OpenedPost: Identifiable, Hashable {
        let id: String
    }
}

/// The first build's rows, for a server from before the posts (an extension, so the page's own type stays within
/// SwiftLint's length).
private extension TodayAroundYouPage {
    func sectionCard(_ section: AroundYouSectionDTO) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            sectionHeading(section.title)
                .padding(.horizontal, Spacing.s1)
            VStack(spacing: Spacing.s0) {
                ForEach(Array(section.items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { PlaceRowDivider() }
                    row(item)
                }
            }
            .background(Theme.Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radii.xl, style: .continuous)
                    .strokeBorder(Theme.Color.appBorder, lineWidth: 1)
            )
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("aroundYouSection_\(section.id)")
    }

    @ViewBuilder
    func row(_ item: AroundYouItemDTO) -> some View {
        if let link = item.url.flatMap(URL.init(string:)), ["https", "http"].contains(link.scheme?.lowercased() ?? "") {
            Button {
                opened = OpenedStory(url: link)
            } label: {
                HStack(alignment: .top, spacing: Spacing.s3) {
                    rowText(item, timed: true)
                    Icon(.externalLink, size: 16, color: Theme.Color.appTextMuted)
                        .padding(.top, 2)
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the story at \(item.source ?? "its outlet").")
            .accessibilityIdentifier("aroundYouItem")
        } else {
            // A tip is its own text: nothing to open, and no time (it is not news).
            rowText(item, timed: false)
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("aroundYouItem")
        }
    }

    func rowText(_ item: AroundYouItemDTO, timed: Bool) -> some View {
        let meta = [item.source, timed ? TodayAroundYouModel.seenAgo(item.seenAt) : nil]
            .compactMap { $0 }
            .joined(separator: " · ")
        return VStack(alignment: .leading, spacing: Spacing.s1) {
            Text(item.title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.appText)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            if !meta.isEmpty {
                Text(meta)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    struct OpenedStory: Identifiable {
        let url: URL
        var id: String {
            url.absoluteString
        }
    }
}

/// The story at its outlet, in the app's own browser sheet (as a link in a post opens).
private struct StoryBrowser: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context _: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_: SFSafariViewController, context _: Context) {}
}
