//
//  ReinventedPulseModel.swift
//  Pantopus
//
//  "Pulse, reinvented" phase 1 (PHASE-1 §2, pieces 2 to 5; CONTRACT 6a): the one Pulse tab's list. One request draws
//  the first screen (`GET /api/reinvented/list`): the Moments that fade and the posts that stay, ordered by reach,
//  with the distance bands and the chips this place has. Only while `pulse_reinvented` is on for the person; a refusal
//  (`403 PULSE_REINVENTED_OFF`) re-reads the switch, and an older server (404) puts today's Pulse back until it is
//  asked again a few minutes later (`ReinventedServer`).
//

import CoreLocation
import Foundation
import Observation

/// Whether the server knows the phase 1 routes. A 404 from one marks it behind; today's screens show until it is
/// tried again a minute later.
@Observable
@MainActor
final class ReinventedServer {
    static let shared = ReinventedServer()
    private(set) var behindUntil: Date?

    var behind: Bool {
        guard let until = behindUntil else { return false }
        return until > Date()
    }

    func markBehind() {
        behindUntil = Date().addingTimeInterval(60)
    }

    func clear() {
        behindUntil = nil
    }
}

@Observable
@MainActor
final class ReinventedPulseModel {
    enum Load: Equatable {
        case loading
        case loaded
        case needsPlace
        case failed(String)
    }

    /// One row of the list: a band's line, a heading (Explore's "Today, elsewhere"), a Moment, or a post; in Explore
    /// each item carries why it is there.
    enum Row: Identifiable {
        case band(ReinventedBandDTO)
        case heading(String)
        case moment(MomentDTO, why: String?, kept: Bool)
        case post(PulsePostCardContent, why: String?)

        var id: String {
            switch self {
            case let .band(band): "band-\(band.band)"
            case let .heading(words): "heading-\(words)"
            case let .moment(moment, _, _): "moment-\(moment.id)"
            case let .post(card, _): "post-\(card.id)"
            }
        }
    }

    private(set) var load: Load = .loading
    private(set) var placeLabel: String?
    private(set) var chips: [String] = ["all"]
    private(set) var end: String?
    /// Explore pauses here ("Keep exploring?") until the person asks for more.
    private(set) var pause: String?
    private(set) var loadingMore = false
    /// Close circle (`close`), Around me (`around`) or Explore (`explore`).
    private(set) var reach = "around"
    private(set) var miles = 25
    private(set) var chip = "all"
    let cards: ProfilePostCardsModel

    @ObservationIgnored private var items: [ReinventedListItemDTO] = []
    /// Explore: why each item is there, and how many of the first are "Today, elsewhere".
    @ObservationIgnored private var why: [String: String] = [:]
    @ObservationIgnored private var pickedCount = 0
    @ObservationIgnored private var bands: [ReinventedBandDTO] = []
    @ObservationIgnored private var cursor: String?
    @ObservationIgnored private var reading: Task<Void, Never>?
    @ObservationIgnored private let api: APIClient
    @ObservationIgnored private let viewerId: String?

    init(api: APIClient = .shared) {
        self.api = api
        var viewer: String?
        if case let .signedIn(user) = AuthManager.shared.state { viewer = user.id }
        viewerId = viewer
        cards = ProfilePostCardsModel(viewerId: viewer, client: api, store: ScreenStore.store(for: api))
    }

    /// The list as drawn: each band's line where the band changes, then its items.
    var rows: [Row] {
        let cardsById = Dictionary(cards.cards.map { ($0.id, $0) }) { first, _ in first }
        var rows: [Row] = []
        var lastBand: String?
        for (index, item) in items.enumerated() {
            if reach == "explore", index == 0, pickedCount > 0 { rows.append(.heading("Today, elsewhere")) }
            if reach == "explore", index == pickedCount, pickedCount > 0 { rows.append(.heading("New elsewhere")) }
            if let band = item.band, band != lastBand, let line = bands.first(where: { $0.band == band }) {
                rows.append(.band(line))
                lastBand = band
            }
            switch item.content {
            case let .moment(moment): rows.append(.moment(moment, why: why[item.id], kept: item.kept))
            case let .post(post): if let card = cardsById[post.id] { rows.append(.post(card, why: why[item.id])) }
            }
        }
        return rows
    }

    var isEmpty: Bool {
        items.isEmpty
    }

    var hasMore: Bool {
        cursor != nil
    }

    /// The Moment's author is the person watching.
    func isMine(_ moment: MomentDTO) -> Bool {
        moment.author.id == viewerId
    }

    // MARK: - Reading

    func refresh() async {
        reading?.cancel()
        let task = Task { await read(cursor: nil) }
        reading = task
        await task.value
    }

    func loadMore() async {
        guard let cursor, !loadingMore, load == .loaded else { return }
        loadingMore = true
        defer { loadingMore = false }
        await read(cursor: cursor)
    }

    func pick(chip: String) async {
        guard chip != self.chip else { return }
        self.chip = chip
        await refresh()
    }

    func pick(reach: String, miles: Int) async {
        guard reach != self.reach || miles != self.miles else { return }
        self.reach = reach
        self.miles = miles
        chip = "all"
        await refresh()
    }

    private func read(cursor: String?) async {
        if cursor == nil, items.isEmpty { load = .loading }
        // A tap made while this read is out keeps its value over what the read brings.
        let revision = cards.actionRevision
        let here = CLLocationManager().location?.coordinate
        if reach == "explore" { return await readExplore(cursor: cursor, at: here, revision: revision) }
        let endpoint = ReinventedEndpoints.list(
            reach: reach,
            miles: reach == "around" ? miles : nil,
            chip: chip,
            at: here.map { ($0.latitude, $0.longitude) },
            cursor: cursor
        )
        guard let data = await fetch(endpoint) else { return }
        guard let page = try? JSONDecoder().decode(ReinventedListResponse.self, from: data) else {
            if items.isEmpty { load = .failed("Couldn't load Pulse. Try again.") }
            return
        }
        show(page, appending: cursor != nil, revision: revision)
    }

    /// One read of a phase 1 route: its body on success. An older server (404) puts today's Pulse back and is asked
    /// again later; a refusal (403) re-reads the switch; anything else says so when there's nothing on screen.
    private func fetch(_ endpoint: Endpoint) async -> Data? {
        let response: APIClient.DataResponse
        do {
            response = try await api.requestDataResponse(endpoint, includingForbidden: true, includingNotFound: true)
        } catch {
            if !Task.isCancelled, items.isEmpty { load = .failed("Couldn't load Pulse. Check your connection and try again.") }
            return nil
        }
        guard !Task.isCancelled else { return nil }
        switch response.response.statusCode {
        case 200..<300:
            ReinventedServer.shared.clear()
            return response.data
        case 404:
            ReinventedServer.shared.markBehind()
        case 403:
            await PulseReinventedFlags.shared.recheck()
        default:
            if items.isEmpty { load = .failed("Couldn't load Pulse. Try again.") }
        }
        return nil
    }

    /// Explore (CONTRACT 6f): the picked ten on the first page, then newest with variety, pausing at "Keep exploring?".
    private func readExplore(cursor: String?, at here: CLLocationCoordinate2D?, revision: Int) async {
        let endpoint = ReinventedEndpoints.explore(at: here.map { ($0.latitude, $0.longitude) }, cursor: cursor)
        guard let data = await fetch(endpoint),
              let page = try? JSONDecoder().decode(ReinventedExploreResponse.self, from: data) else { return }
        let appending = cursor != nil
        let fresh = page.picked + page.items
        if !appending {
            why = [:]
            pickedCount = page.picked.count
            bands = []
            chips = ["all"]
        }
        for entry in fresh {
            why[entry.id] = entry.why
        }
        items = (appending ? items : []) + fresh.map(\.item)
        self.cursor = page.nextCursor
        end = page.nextCursor == nil ? "That's everything for now." : nil
        pause = page.pause
        showPosts(revision: revision)
        load = .loaded
    }

    private func show(_ page: ReinventedListResponse, appending: Bool, revision: Int) {
        items = appending ? items + page.items : page.items
        if !appending {
            bands = page.bands
            if let chips = page.chips { self.chips = chips.isEmpty ? ["all"] : chips }
            placeLabel = page.placeLabel
        }
        cursor = page.nextCursor
        end = page.end
        pause = nil
        showPosts(revision: revision)
        load = page.needsPlace && items.isEmpty ? .needsPlace : .loaded
    }

    private func showPosts(revision: Int) {
        let posts: [FeedPostDTO] = items.compactMap {
            if case let .post(post) = $0.content { return post }
            return nil
        }
        cards.show(posts, readRevision: revision)
    }
}
