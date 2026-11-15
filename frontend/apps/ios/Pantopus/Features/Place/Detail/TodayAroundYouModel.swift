//
//  TodayAroundYouModel.swift
//  Pantopus
//
//  What Today's Around you page shows and keeps (`TodayAroundYou.swift`): the
//  page for the place, its posts as Pulse cards, and the post open from it.
//  The open post's model, where it is shown and what it presents live here,
//  above the screens, because on the iPhone Duo a fold or a turn makes the
//  post's screen anew (pushed over the list, or on the page beside it).
//

import Observation
import SwiftUI

/// The Around you page for the place Today shows. It keeps the last answer
/// for that place; a failed read keeps it, and another place starts blank.
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
            closePost()
            return
        }
        if placeKey != detail.identity {
            page = nil
            placeKey = detail.identity
            closePost()
        }
        let endpoint: Endpoint
        if let area = detail.area {
            endpoint = AroundYouEndpoints.area(AreaTodayBody(latitude: area.latitude, longitude: area.longitude))
        } else if let savedPlaceId = detail.savedPlaceId {
            endpoint = AroundYouEndpoints.savedPlace(id: savedPlaceId)
        } else if !detail.homeId.isEmpty {
            endpoint = AroundYouEndpoints.home(id: detail.homeId)
        } else {
            return
        }
        let key = detail.identity
        let cards = cards
        // A tap made while this read is out keeps its value over the read's (`ProfilePostCardsModel.show`).
        let revision = cards.actionRevision
        do {
            let answer: AroundYouDTO = try await api.request(endpoint)
            guard placeKey == key, cards === self.cards else { return }
            page = answer
            cards.show(answer.posts, readRevision: revision)
            // A post's page opens at once from its card's copy while the post and its replies load (as from Pulse).
            for post in answer.posts {
                store.seed(post, for: PostsEndpoints.detail(id: post.id))
            }
        } catch {
            // The last answer for this place stays.
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
