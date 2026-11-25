//
//  TodayAroundYouModel.swift
//  Pantopus
//
//  What Today's Around you page shows and keeps (`TodayAroundYou.swift`): the
//  page for the place, its posts as Pulse cards, and the post open from it.
//  The open post's model, where it is shown and what it presents live here,
//  above the screens, because on the iPhone Duo a fold or a turn makes the
//  post's screen anew (pushed over the list, or on the page beside it).
//  The lists behind the first page (founder, 2026-11-24: topics, and scroll
//  back for as long as there are stories) are read here a page at a time and
//  drawn by `TodayAroundYouLists.swift`.
//

import Observation
import SwiftUI

/// The Around you page for the place Today shows. It keeps the last answer
/// for that place; a failed read keeps it. Another place starts from the
/// screen store's copy for it, or blank without one.
@Observable
@MainActor
final class TodayAroundYouModel {
    private(set) var page: AroundYouDTO?
    /// The page's posts as Pulse cards and what the viewer's taps did to them
    /// (the profile's card model: the same taps, endpoints and menus).
    private(set) var cards: ProfilePostCardsModel
    /// Who the cards are for: another account gets its own.
    private(set) var viewerId: String?
    /// Action feedback ("Saved to your bookmarks."), shown at the page's foot.
    var toast: String?
    /// The post open from the page: pushed over it, or beside it on a screen with room for both.
    private(set) var openedPostId: String?
    /// The open post's model, kept here because a fold or a turn of the iPhone Duo makes the post's screen anew
    /// (pushed, or beside the list): an unfinished reply, where it was read and the keyboard stay.
    @ObservationIgnored private var postModel: PulsePostDetailViewModel?
    /// The picture viewer and the story's browser sheet for the page's posts and the open post, presented by
    /// Today's own screen, so they stay through that too.
    let presentations = PostPresentationHost()
    /// The open post is on the page beside the list now. It follows the room there is only once a fold or a turn
    /// is over and the post has left the stack: a post's screen made while the screens are still moving gave the
    /// keyboard back too early, and it was gone when they settled.
    private(set) var postShowsBeside = false
    /// The reply box had the keyboard when a fold or a turn began; the post's next screen gives it back.
    @ObservationIgnored private var hadKeyboard: Bool?
    /// Counts the times the open post's screen was made once more to give the keyboard back; its identity.
    private(set) var postScreen = 0
    private var placeKey: String?
    /// The place the page is for, as its reads name it.
    @ObservationIgnored private var place: AroundYouPlace?
    /// Which list shows: "all" (the page's sections, then every earlier story) or a chip's own.
    private(set) var list = AroundYouListDTO.all
    /// The open list's posts read so far, each once, in the server's order.
    private(set) var listPosts: [FeedPostDTO] = []
    /// How the open list's read stands.
    private(set) var listState: AroundYouListState = .idle
    /// Counts the list's reads: the list's foot is made anew after each, so reaching it again asks for the next.
    private(set) var listFoot = 0
    /// More than one page of the open list was read: its end says so.
    private(set) var listRanLong = false
    @ObservationIgnored private var listNext: String?
    @ObservationIgnored private var listPages = 0
    /// Bumped when the open list starts over (another chip, another place): a read still out is for the old one.
    @ObservationIgnored private var listRun = 0
    private let api: APIClient
    private let store: ScreenStore

    init(api: APIClient = .shared) {
        self.api = api
        store = ScreenStore.store(for: api)
        cards = ProfilePostCardsModel(viewerId: nil, client: api, store: store)
    }

    private func useCards(for viewer: String?) {
        guard viewer != viewerId else { return }
        viewerId = viewer
        cards = ProfilePostCardsModel(viewerId: viewer, client: api, store: store)
        cards.onToast = { [weak self] message in self?.toast = message }
        closePost()
    }

    /// Opens a post from its card. Another post takes the open one's place.
    func open(postId: String) {
        guard openedPostId != postId else { return }
        postModel = nil
        openedPostId = postId
    }

    /// Opens a post from its card's Reply, or from its reply preview: its reply box takes the keyboard once the
    /// post shows. A post already open beside the list gets its screen made once more, which gives it.
    func openToReply(postId: String) {
        let alreadyOpen = openedPostId == postId
        open(postId: postId)
        let post = model(forPost: postId)
        post.openedToReply()
        guard alreadyOpen, postShowsBeside else { return }
        post.screens.screensMoved()
        postScreen += 1
    }

    /// The open post closed (Back, or its place or account went).
    func closePost() {
        openedPostId = nil
        postModel = nil
        postShowsBeside = false
        hadKeyboard = nil
    }

    /// The page beside the list shows: where to tap before a post is picked, or the post once it is there.
    var showsPostColumn: Bool {
        openedPostId == nil || postShowsBeside
    }

    /// The open post is on the page beside the list, or left it for the stack.
    func postMoved(beside: Bool) {
        postShowsBeside = beside && openedPostId != nil
    }

    /// A fold or a turn is starting: whether the reply box has the keyboard, noted once, before its screen goes.
    func noteKeyboard() {
        if hadKeyboard == nil { hadKeyboard = postModel?.returnsToComposer ?? false }
    }

    /// The post's next screen is about to be made: if the reply box had the keyboard, that screen gives it back.
    /// Returns whether it had it.
    @discardableResult
    func handKeyboardOn() -> Bool {
        let had = hadKeyboard == true
        if had { postModel?.composerReturnPending() }
        hadKeyboard = nil
        return had
    }

    /// The reply box had the keyboard before a fold or a turn and nothing is being typed in now: the post's screen
    /// is made once more, and that one gives it back (the first can be made a moment too early on a busy phone).
    func giveKeyboardAgainIfLost() {
        guard openedPostId != nil, let postModel, !TextEditingState.shared.isEditing else { return }
        postModel.composerReturnPending()
        postModel.screens.screensMoved()
        postScreen += 1
    }

    /// The open post's model, the same one however often its screen is made.
    func model(forPost postId: String) -> PulsePostDetailViewModel {
        if let postModel, postModel.postId == postId { return postModel }
        let model = PulsePostDetailViewModel(postId: postId, currentUserId: viewerId)
        postModel = model
        return model
    }

    /// A fold or a turn moved the open post between the stack and the page beside the list: its new screen reads
    /// nothing again for that (`PulseScreenRebuilds`).
    func postScreenMoved() {
        postModel?.screens.screensMoved()
    }

    /// Something to show for this place: Today offers the switch.
    var available: Bool {
        page?.available == true && page?.sections.isEmpty == false
    }

    func load(for detail: PlaceDetailViewModel?, viewerId viewer: String?) async {
        useCards(for: viewer)
        guard let detail else {
            page = nil
            placeKey = nil
            place = nil
            startList(AroundYouListDTO.all)
            closePost()
            return
        }
        let place = AroundYouPlace(detail)
        if placeKey != detail.identity {
            placeKey = detail.identity
            self.place = place
            closePost()
            startList(AroundYouListDTO.all)
            // The answer kept for this place (on the phone, after a relaunch) shows before any wait, so Today opens
            // with the switch it had last time instead of growing it a moment later.
            page = place.flatMap { store.peek($0.page, as: AroundYouDTO.self)?.value }
            // A copy never undoes a tap (-1 is no read's revision).
            if page != nil { showCards(readRevision: -1) }
        }
        guard let place else { return }
        let key = detail.identity
        let cards = cards
        // A tap made while this read is out keeps its value over the read's (`ProfilePostCardsModel.show`).
        let revision = cards.actionRevision
        do {
            // Every look asks the server, as before; the store keeps the answer for the next first look. An area's
            // read is a POST (its point stays out of the URL), which the store sends straight through, keeping nothing.
            let answer = try await store.load(place.page, as: AroundYouDTO.self, kind: .today, force: true).value
            guard placeKey == key, cards === self.cards else { return }
            page = answer
            // A chip the place no longer offers (a quieter week) falls back to All.
            if list != AroundYouListDTO.all, !lists.contains(where: { $0.id == list }) {
                startList(AroundYouListDTO.all)
            }
            showCards(readRevision: revision)
            seed(answer.posts)
            // The open list as it is now: a reply or a reaction made on a post's page shows on its card.
            await rereadList()
        } catch {
            // The last answer for this place stays.
        }
    }

    // MARK: - Lists

    /// The chips the page offers, "all" first; empty from a server before the lists, where the page is as it was.
    var lists: [AroundYouListDTO] {
        guard let page, page.hasPosts else { return [] }
        return page.lists
    }

    /// The open list's posts as they show: under All the earlier stories, without the ones on the first page.
    var shownListPosts: [FeedPostDTO] {
        guard list == AroundYouListDTO.all, let page else { return listPosts }
        let onPage = Set(page.posts.map(\.id))
        return listPosts.filter { !onPage.contains($0.id) }
    }

    /// A chip was picked: its list starts from the top (All's earlier stories wait until its end nears).
    func select(list id: String) {
        guard id != list else { return }
        startList(id)
        showCards(readRevision: cards.actionRevision)
        if id != AroundYouListDTO.all { Task { await readNextPage() } }
    }

    /// The list's foot came near the screen: the next page is read (the first, for the stories under All).
    func listEndNeared() {
        guard !lists.isEmpty, listState == .idle || listState == .more else { return }
        Task { await readNextPage() }
    }

    /// "Try again" under a list that could not be read.
    func retryList() {
        guard listState == .failed else { return }
        Task { await readNextPage() }
    }

    private func startList(_ id: String) {
        list = id
        listPosts = []
        listNext = nil
        listPages = 0
        listRanLong = false
        listState = .idle
        listRun += 1
        listFoot += 1
    }

    private func readNextPage() async {
        guard let place, listState != .loading, listState != .ended else { return }
        let run = listRun
        let asked = list
        listState = .loading
        let revision = cards.actionRevision
        do {
            let answer = try await api.request(place.list(asked, before: listNext), as: AroundYouListPageDTO.self)
            guard run == listRun else { return }
            var seen = Set(listPosts.map(\.id))
            listPosts += answer.posts.filter { seen.insert($0.id).inserted }
            listNext = answer.next
            listPages += 1
            listRanLong = listPages > 1
            listState = answer.next == nil ? .ended : .more
            listFoot += 1
            showCards(readRevision: revision)
            seed(answer.posts)
        } catch {
            guard run == listRun else { return }
            listState = .failed
        }
    }

    /// Reads the open list's pages again, as many as were read, and swaps them in whole: each post stays where it
    /// was, with its counts and its reply preview as they are now. A failed read keeps what shows.
    private func rereadList() async {
        guard let place, listPages > 0, listState != .loading else { return }
        let run = listRun
        let asked = list
        let pages = listPages
        let revision = cards.actionRevision
        var posts: [FeedPostDTO] = []
        var seen = Set<String>()
        var next: String?
        for index in 0..<pages {
            guard let answer = try? await api.request(place.list(asked, before: next), as: AroundYouListPageDTO.self),
                  run == listRun, pages == listPages else { return }
            posts += answer.posts.filter { seen.insert($0.id).inserted }
            next = answer.next
            if next == nil, index < pages - 1 { break }
        }
        guard run == listRun, pages == listPages, listState != .loading else { return }
        listPosts = posts
        listNext = next
        listState = next == nil ? .ended : .more
        listFoot += 1
        showCards(readRevision: revision)
        seed(posts)
    }

    /// The page's and the open list's posts as cards, each post once.
    private func showCards(readRevision: Int) {
        var seen = Set<String>()
        let posts = ((page?.posts ?? []) + listPosts).filter { seen.insert($0.id).inserted }
        cards.show(posts, readRevision: readRevision)
    }

    /// A post's page opens at once from its card's copy while the post and its replies load (as from Pulse).
    private func seed(_ posts: [FeedPostDTO]) {
        for post in posts {
            store.seed(post, for: PostsEndpoints.detail(id: post.id))
        }
    }

    /// "3 hr ago", "Yesterday", "2 days ago": how long since the story was first seen.
    static func seenAgo(_ iso: String, now: Date = Date()) -> String? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let seen = withFraction.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return nil }
        let minutes = max(0, Int((now.timeIntervalSince(seen) / 60).rounded()))
        if minutes < 60 { return minutes < 2 ? "Just now" : "\(minutes) min ago" }
        let hours = Int((Double(minutes) / 60).rounded())
        if hours < 24 { return "\(hours) hr ago" }
        let days = Int((Double(hours) / 24).rounded())
        return days == 1 ? "Yesterday" : "\(days) days ago"
    }
}
