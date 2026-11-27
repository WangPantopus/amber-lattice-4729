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

    /// One row of the list: a band's line, a Moment, a post, or the end line.
    enum Row: Identifiable {
        case band(ReinventedBandDTO)
        case moment(MomentDTO)
        case post(PulsePostCardContent)

        var id: String {
            switch self {
            case let .band(band): "band-\(band.band)"
            case let .moment(moment): "moment-\(moment.id)"
            case let .post(card): "post-\(card.id)"
            }
        }
    }

    private(set) var load: Load = .loading
    private(set) var placeLabel: String?
    private(set) var chips: [String] = ["all"]
    private(set) var end: String?
    private(set) var loadingMore = false
    /// Close circle (`close`) or Around me (`around`).
    private(set) var reach = "around"
    private(set) var miles = 25
    private(set) var chip = "all"
    let cards: ProfilePostCardsModel

    @ObservationIgnored private var items: [ReinventedListItemDTO] = []
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
        for item in items {
            if let band = item.band, band != lastBand, let line = bands.first(where: { $0.band == band }) {
                rows.append(.band(line))
                lastBand = band
            }
            switch item.content {
            case let .moment(moment): rows.append(.moment(moment))
            case let .post(post): if let card = cardsById[post.id] { rows.append(.post(card)) }
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
        let endpoint = ReinventedEndpoints.list(
            reach: reach,
            miles: reach == "around" ? miles : nil,
            chip: chip,
            at: here.map { ($0.latitude, $0.longitude) },
            cursor: cursor
        )
        let response: APIClient.DataResponse
        do {
            response = try await api.requestDataResponse(endpoint, includingForbidden: true, includingNotFound: true)
        } catch {
            guard !Task.isCancelled else { return }
            if items.isEmpty { load = .failed("Couldn't load Pulse. Check your connection and try again.") }
            return
        }
        guard !Task.isCancelled else { return }
        switch response.response.statusCode {
        case 200..<300:
            break
        case 404:
            // An older server: today's Pulse comes back, and the new one is asked again later.
            ReinventedServer.shared.markBehind()
            return
        case 403:
            await PulseReinventedFlags.shared.recheck()
            return
        default:
            if items.isEmpty { load = .failed("Couldn't load Pulse. Try again.") }
            return
        }
        guard let page = try? JSONDecoder().decode(ReinventedListResponse.self, from: response.data) else {
            if items.isEmpty { load = .failed("Couldn't load Pulse. Try again.") }
            return
        }
        ReinventedServer.shared.clear()
        show(page, appending: cursor != nil, revision: revision)
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
        let posts: [FeedPostDTO] = items.compactMap {
            if case let .post(post) = $0.content { return post }
            return nil
        }
        cards.show(posts, readRevision: revision)
        load = page.needsPlace && items.isEmpty ? .needsPlace : .loaded
    }
}
