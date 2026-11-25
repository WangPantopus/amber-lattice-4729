//
//  PostCollectionModel.swift
//  Pantopus
//
//  My posts' Saved and Reposts tabs: the posts the viewer saved
//  (`GET /api/posts/saved`) or reposted (`GET /api/posts/reposts`,
//  PULSEREPOST contract §4) and can still open, newest first, each with its
//  row action (Remove, or Undo repost). Kept apart from `MyPostsViewModel`
//  because each reads a different list (other people's posts, paged by
//  offset) with a different row action; the rows reuse that model's row
//  helpers, and `MyPostsViewModel` hands the list shell to the selected
//  tab's model. One model, two kinds: the tabs are built the same way.
//  Each post is drawn as its Pulse card (`cards`), with the card's own
//  controls: unsaving a post on Saved, or undoing a repost on Reposts,
//  takes it off the list once the server agrees.
//

import Foundation
import Observation

/// Which collection a `PostCollectionModel` lists.
public enum PostCollectionKind: Sendable {
    case saved
    case reposts
    /// Your posts under your made-up name (`GET /api/pen-names/me/posts`), paged by `before`.
    case madeUp

    /// The tab's id in My posts.
    var tab: String {
        switch self {
        case .saved: MyPostsTab.saved
        case .reposts: MyPostsTab.reposts
        case .madeUp: MyPostsTab.madeUp
        }
    }

    func page(limit: Int, offset: Int, before: String? = nil) -> Endpoint {
        switch self {
        case .saved: PostsEndpoints.savedPosts(limit: limit, offset: offset)
        case .reposts: PostsEndpoints.repostedPosts(limit: limit, offset: offset)
        case .madeUp: PenNamesEndpoints.myPosts(before: before, limit: limit)
        }
    }

    var loadError: String {
        switch self {
        case .saved: "Couldn't load your saved posts."
        case .reposts: "Couldn't load your reposts."
        case .madeUp: "Couldn't load your made-up name's posts."
        }
    }

    var loadMoreError: String {
        switch self {
        case .saved: "Couldn't load more saved posts."
        case .reposts: "Couldn't load more reposts."
        case .madeUp: "Couldn't load more of your made-up name's posts."
        }
    }

    var emptyContent: ListOfRowsState.EmptyContent {
        switch self {
        case .saved:
            ListOfRowsState.EmptyContent(
                icon: .bookmark,
                headline: "Nothing saved yet",
                subcopy: "Posts you save show up here."
            )
        case .reposts:
            ListOfRowsState.EmptyContent(
                icon: .arrowsRepeat,
                headline: "No reposts yet",
                subcopy: "Posts you repost show up here and on your profile."
            )
        case .madeUp:
            ListOfRowsState.EmptyContent(
                icon: .eyeOff,
                headline: "Nothing under your made-up name yet",
                subcopy: "Posts you write under your made-up name show up here. Only you can see this is you."
            )
        }
    }

    var removeFailure: String {
        switch self {
        case .saved: "Couldn't remove it. Try again."
        case .reposts: "Couldn't undo the repost. Try again."
        case .madeUp: "Couldn't do that. Try again."
        }
    }
}

@Observable
@MainActor
public final class PostCollectionModel {
    public private(set) var state: ListOfRowsState = .loading
    public private(set) var loadMoreError: String?
    /// A failed row action says so; the row stays.
    public var toastMessage: String?
    /// The posts as Pulse cards and what the viewer's taps did to them.
    public let cards: ProfilePostCardsModel

    public let kind: PostCollectionKind
    private let api: APIClient
    /// The first page as last read, shown at once on the next visit while it reads again.
    private let store: ScreenStore
    private let onOpenPost: @MainActor (MyPostDTO) -> Void
    private let now: @Sendable () -> Date
    private var posts: [MyPostDTO] = []
    /// The same posts read as the feed's, for the cards.
    private var feedPosts: [FeedPostDTO] = []
    private var nextOffset: Int?
    /// Where the Made-up name tab's next page starts (`next_before`).
    private var nextBefore: String?
    private var loadedOnce = false
    private var loadingMore = false
    /// Bumped by every first-page load so a page that lands later can't append to its replacement.
    private var generation = 0
    private var removing: Set<String> = []

    static let pageSize = 50

    init(
        kind: PostCollectionKind,
        api: APIClient,
        viewerId: String?,
        onOpenPost: @escaping @MainActor (MyPostDTO) -> Void,
        now: @escaping @Sendable () -> Date
    ) {
        self.kind = kind
        self.api = api
        store = ScreenStore.store(for: api)
        self.onOpenPost = onOpenPost
        self.now = now
        cards = ProfilePostCardsModel(viewerId: viewerId, client: api, store: store)
        // Unsaved on Saved, or the repost undone on Reposts: the post leaves this list.
        switch kind {
        case .saved:
            cards.onSaveSettled = { [weak self] postId, saved in
                if !saved { Task { await self?.drop(postId: postId) } }
            }
        case .reposts:
            cards.onRepostSettled = { [weak self] postId, reposted in
                if !reposted { Task { await self?.drop(postId: postId) } }
            }
        case .madeUp:
            break
        }
    }

    private var firstPage: Endpoint {
        kind.page(limit: Self.pageSize, offset: 0)
    }

    /// Every visit to the tab re-reads it, so posts saved (or reposted) elsewhere since show up; the list as last
    /// read shows meanwhile. A server without the list (an older one's 404) shows the error state with Try again.
    func load() async {
        generation += 1
        let current = generation
        let readRevision = cards.actionRevision
        loadingMore = false
        loadMoreError = nil
        if !loadedOnce, let copy = store.peek(firstPage, as: SavedPostsResponse.self) {
            await apply(copy.value, readRevision: -1)
            guard current == generation else { return }
        }
        if !loadedOnce { state = .loading }
        do {
            let response = try await store.load(
                firstPage,
                as: SavedPostsResponse.self,
                kind: .post,
                topics: [ScreenTopic.posts],
                force: true
            ).value
            guard current == generation else { return }
            await apply(response, readRevision: readRevision)
        } catch {
            guard current == generation else { return }
            // A failed read is not an empty list: keep what's shown, or say so.
            if loadedOnce {
                await rebuild()
            } else {
                state = .error(message: (error as? APIError)?.errorDescription ?? kind.loadError)
            }
        }
    }

    private func apply(_ response: SavedPostsResponse, readRevision: Int) async {
        posts = response.posts
        feedPosts = response.feedPosts
        cards.show(feedPosts, readRevision: readRevision)
        nextOffset = Self.nextOffset(after: response)
        nextBefore = response.nextBefore
        loadedOnce = true
        await rebuild()
    }

    /// Footer reached: append the next page. A failed page keeps the rows and offers Try again.
    func loadMoreIfNeeded() async {
        guard !loadingMore, nextOffset != nil || nextBefore != nil else { return }
        let offset = nextOffset ?? 0
        let current = generation
        loadingMore = true
        loadMoreError = nil
        do {
            let response: SavedPostsResponse = try await api.request(
                kind.page(limit: Self.pageSize, offset: offset, before: nextBefore)
            )
            guard current == generation else { return }
            let seen = Set(posts.map(\.id))
            posts += response.posts.filter { !seen.contains($0.id) }
            let seenCards = Set(feedPosts.map(\.id))
            feedPosts += response.feedPosts.filter { !seenCards.contains($0.id) }
            cards.show(feedPosts, readRevision: -1)
            nextOffset = Self.nextOffset(after: response)
            nextBefore = response.nextBefore
        } catch {
            guard current == generation else { return }
            loadMoreError = kind.loadMoreError
        }
        loadingMore = false
        await rebuild()
    }

    /// The row action: Remove from Saved, or Undo repost. The request asks for the state wanted ("not saved",
    /// "not reposted"), so a re-send can't flip it back, and the row leaves once the server confirms.
    func remove(postId: String) async {
        guard !removing.contains(postId) else { return }
        removing.insert(postId)
        defer { removing.remove(postId) }
        do {
            let stillThere: Bool
            switch kind {
            case .saved:
                let response: PostSaveResponse = try await api.request(PostsEndpoints.toggleSave(id: postId, saved: false))
                stillThere = response.saved
                // A Pulse card still showing it saved would re-save it on its next tap: lists refetch.
                if !stillThere { PulsePostsRefresh.notifyPostsDidChange() }
            case .reposts:
                let response: PostShareResponse = try await api.request(
                    PostsEndpoints.share(id: postId, shareType: "repost", reposted: false)
                )
                stillThere = response.reposted == true
                if !stillThere {
                    // A card showing it reposted changes in place: ↻ and "You reposted" go.
                    var change = PulsePostChange(postId: postId)
                    change.isReposted = false
                    change.shareCount = response.shareCount
                    PulsePostsRefresh.notifyPostChanged(change)
                }
            case .madeUp:
                // No row action here: its card's own Delete takes a made-up-name post away.
                return
            }
            if stillThere {
                // A server that still toggles put it back (it had been taken out elsewhere): re-read the list.
                await load()
                return
            }
            await drop(postId: postId)
        } catch {
            toastMessage = kind.removeFailure
        }
    }

    /// The post is no longer saved (or reposted): it leaves the list.
    private func drop(postId: String) async {
        guard posts.contains(where: { $0.id == postId }) || feedPosts.contains(where: { $0.id == postId }) else { return }
        posts.removeAll { $0.id == postId }
        feedPosts.removeAll { $0.id == postId }
        cards.show(feedPosts, readRevision: -1)
        // The ones after it move up one, so the next page starts one earlier or it would skip one.
        nextOffset = nextOffset.map { max(0, $0 - 1) }
        await rebuild()
    }

    private func rebuild() async {
        if posts.isEmpty, hasMore {
            if loadMoreError != nil {
                // Reading on failed, which isn't "nothing here": say so, with Try again.
                state = .error(message: kind.loadError)
            } else {
                // A page the visibility check emptied isn't the end of the list.
                state = .loading
                await loadMoreIfNeeded()
            }
            return
        }
        if posts.isEmpty {
            state = .empty(kind.emptyContent)
            return
        }
        let snapshot = now()
        state = .loaded(
            sections: [RowSection(id: kind.tab, rows: posts.map { row(for: $0, now: snapshot) })],
            hasMore: hasMore
        )
    }

    private func row(for dto: MyPostDTO, now: Date) -> RowModel {
        let intent = PulseIntent.from(postType: dto.postType)
        let time = MyPostsViewModel.timeMetaLabel(for: dto, now: now)
        // Saved and reposted posts are other people's: the meta line names who wrote it.
        let meta = [dto.authorName, time.isEmpty ? nil : time]
            .compactMap { $0?.isEmpty == false ? $0 : nil }
            .joined(separator: " · ")
        return RowModel(
            id: dto.id,
            title: "",
            template: .statusChip,
            leading: .none,
            trailing: .none,
            onTap: { [weak self] in
                guard let self else { return }
                Task { @MainActor in self.onOpenPost(dto) }
            },
            body: MyPostsViewModel.postBody(for: dto),
            bodyEmphasis: .primary,
            headerChips: [MyPostsViewModel.intentChip(for: intent, isArchived: false)]
                + [MyPostsViewModel.lifecycleChip(for: dto)].compactMap(\.self),
            timeMeta: meta,
            engagement: RowEngagement(
                items: MyPostsViewModel.engagementItems(for: dto, intent: intent),
                cta: rowAction(for: dto.id)
            )
        )
    }

    /// More to read after the loaded posts.
    private var hasMore: Bool {
        nextOffset != nil || nextBefore != nil
    }

    /// Remove on a saved post; Undo repost on a reposted one (`myPostsUndoRepost_<id>`, contract §10); none on a
    /// made-up-name post (its card has Edit and Delete).
    private func rowAction(for postId: String) -> RowEngagementCTA? {
        let handler: @Sendable () -> Void = { [weak self] in
            Task { @MainActor in await self?.remove(postId: postId) }
        }
        switch kind {
        case .saved:
            return RowEngagementCTA(label: "Remove", icon: .bookmark, accessibilityLabel: "Remove from Saved", handler: handler)
        case .reposts:
            return RowEngagementCTA(
                label: "Undo repost",
                icon: .arrowsRepeat,
                accessibilityIdentifier: "myPostsUndoRepost_\(postId)",
                handler: handler
            )
        case .madeUp:
            return nil
        }
    }

    /// Where the next page starts, or nil when the server read the last of the list.
    static func nextOffset(after response: SavedPostsResponse) -> Int? {
        guard response.pagination?.hasMore == true else { return nil }
        return response.pagination?.nextOffset
    }
}
