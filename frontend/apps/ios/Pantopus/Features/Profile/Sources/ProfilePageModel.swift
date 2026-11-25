//
//  ProfilePageModel.swift
//  Pantopus
//
//  Reads the profile with sources (CONTRACT.md v1) beside today's profile read, so the page's first call is no
//  slower than today's (SPEC 4.13). Anything but a page (the server's switch off, an older server, an error) leaves
//  the profile screen exactly as it is today: the app never draws half of the new page.
//

import Foundation
import Logging
import Observation

/// The page, ready to draw.
struct ProfileSourcesContent: Equatable {
    let page: ProfilePageDTO
    let rings: ProfileRings?
    /// Tabs with something the app knows how to draw, in the server's order.
    let tabs: [ProfileSourcesTab]

    var header: ProfilePageHeaderDTO {
        page.header
    }

    var isOwner: Bool {
        page.view == "owner"
    }

    init(page: ProfilePageDTO) {
        self.page = page
        let raw = page.header.rings
        rings = ProfileRings(from: raw.from, now: raw.now, lanes: [.home: raw.home, .work: raw.work, .others: raw.others])
        let owner = page.view == "owner"
        tabs = page.tabs.compactMap { tab in
            // The owner's Work stays even when empty: it is where "Add a piece" and the offered jobs are (SPEC 2A).
            guard let key = ProfileSourcesTab.Key(rawValue: tab.key), !tab.blocks.isEmpty || (owner && key == .work) else {
                return nil
            }
            return ProfileSourcesTab(key: key, title: tab.title, blocks: tab.blocks)
        }
    }

    /// The tab a link names, when it was sent.
    func tab(_ key: ProfileSourcesTab.Key) -> ProfileSourcesTab? {
        tabs.first { $0.key == key }
    }

    /// Whose a piece is when it is another person's on this page ("With Maria Kovács").
    func with(pieceId id: String) -> ProfilePieceWithDTO? {
        for tab in tabs {
            for block in tab.blocks {
                if case let .pieces(group) = block.content, let piece = group.pieces.first(where: { $0.id == id }), piece.with != nil {
                    return piece.with
                }
            }
        }
        return nil
    }

    /// The piece's ink, wherever this page lists it (for the dots on the work rings).
    func pieceInk(_ id: String) -> ProfileInk? {
        for tab in tabs {
            for block in tab.blocks {
                if case let .pieces(group) = block.content, let piece = group.pieces.first(where: { $0.id == id }) {
                    return ProfileInk(serverValue: piece.line.ink)
                }
            }
        }
        return nil
    }
}

struct ProfileSourcesTab: Equatable, Identifiable {
    enum Key: String {
        case person, work, record
    }

    let key: Key
    let title: String
    let blocks: [ProfilePageBlockDTO]

    var id: Key {
        key
    }
}

@Observable
@MainActor
final class ProfilePageModel {
    enum State: Equatable {
        /// Not asked yet, or asking with nothing to show.
        case loading
        case loaded(ProfileSourcesContent)
        /// Not a page: today's screen draws instead.
        case unavailable
    }

    private(set) var state: State = .loading
    var selectedTab: ProfileSourcesTab.Key = .person
    /// The month opened on the Record chart, and what the server sent for it.
    var openedMonth: ProfileRingMonth?
    private(set) var monthLines: ProfileMonthDTO?
    private(set) var monthLoading = false
    /// The piece opened from Work.
    private(set) var openedPiece: ProfilePieceReadDTO?
    var openingPieceId: String?
    /// The owner's pieces with the jobs and plans offered (`GET /me/pieces`); nil for anyone else, or on a server
    /// without it (the owner then keeps phase 1's "Add or remove pieces").
    private(set) var ownerPieces: ProfileMyPiecesDTO?
    /// "Asked of you" on your own Work (P2.5); nil for anyone else or while the server's ties are off.
    private(set) var asks: [ProfileAskDTO]?
    /// The opened piece is another person's (a piece "With Maria" on the signer's Work): read from their profile.
    private(set) var openedPieceOwner: String?
    /// That person's name, for the first row of "Who was on it".
    private(set) var openedPieceOwnerName: String?
    @ObservationIgnored private var piecesObserver: ProfileObserverToken?

    private let identifier: String
    private let previewAs: String?
    private let client: APIClient
    private let logger = Logger(label: "app.pantopus.ios.ProfilePage")

    /// Pages read in the last few minutes, by viewer and person: reopening one shows it at once, then reads again.
    private static var recent: [String: (content: ProfileSourcesContent, at: Date)] = [:]
    private static let keepFor: TimeInterval = 300

    init(identifier: String, previewAs: String?, client: APIClient = .shared) {
        self.identifier = identifier
        self.previewAs = previewAs
        self.client = client
        if previewAs == nil, let kept = Self.recent[cacheKey], Date().timeIntervalSince(kept.at) < Self.keepFor {
            state = .loaded(kept.content)
        }
    }

    /// Whether this build asks for the new page at all.
    static var isOn: Bool {
        LaunchFeatures.profileSources
    }

    private var cacheKey: String {
        "\(PublicProfileViewModel.signedInUserId() ?? "-")|\(identifier.lowercased())"
    }

    var content: ProfileSourcesContent? {
        if case let .loaded(content) = state { return content }
        return nil
    }

    /// The person's account id once known; the page answers by id after the first read.
    var userId: String? {
        content?.header.userId
    }

    /// Reads the page. A failed refresh keeps the page on screen; a failed first read hands the screen back.
    func load() async {
        do {
            let page: ProfilePageDTO = try await client.request(
                ProfilePageEndpoints.page(identifier: userId ?? identifier, previewAs: previewAs)
            )
            let content = ProfileSourcesContent(page: page)
            if !content.tabs.contains(where: { $0.key == selectedTab }), let first = content.tabs.first {
                selectedTab = first.key
            }
            state = .loaded(content)
            if previewAs == nil, let tab = ProfileOpenTab.take(for: [identifier, page.header.userId, page.header.username]),
               content.tabs.contains(where: { $0.key == tab }) {
                selectedTab = tab
            }
            if content.isOwner, previewAs == nil {
                async let pieces: ProfileMyPiecesDTO? = try? await client.request(ProfilePageEndpoints.myPieces())
                async let asked = readAsks()
                ownerPieces = await pieces
                asks = await asked
                watchPieces()
            }
            if previewAs == nil {
                Self.recent[cacheKey] = (content, Date())
                // The person's own ring is known now, without asking (board 6).
                if let rings = content.rings {
                    ProfileMarks.shared.remember(ProfileMarkSummary(rings: rings), for: page.header.userId)
                }
            }
        } catch is CancellationError {
            return
        } catch {
            if Task.isCancelled { return }
            logger.info("Profile page not drawn: \(error)")
            if case .loaded = state { return }
            state = .unavailable
        }
    }

    /// Opens a month of the rings (board 13). A month the server doesn't answer closes the sheet (CONTRACT §1).
    func open(month: ProfileRingMonth) async {
        openedMonth = month
        monthLines = nil
        monthLoading = true
        defer { monthLoading = false }
        if let answer = await read(month), openedMonth == month {
            monthLines = answer
        } else if openedMonth == month {
            closeMonth()
        }
    }

    /// The month before or after with something this viewer may open; the sheet stays on this month when there is none.
    func step(from month: ProfileRingMonth, by delta: Int, rings: ProfileRings) async {
        var candidate = month
        monthLoading = true
        defer { monthLoading = false }
        for _ in 0..<24 {
            guard let next = ProfileMonthSheet.nextMonth(from: candidate, by: delta, rings: rings) else { return }
            if let answer = await read(next) {
                guard openedMonth == month else { return }
                openedMonth = next
                monthLines = answer
                return
            }
            candidate = next
        }
    }

    private func read(_ month: ProfileRingMonth) async -> ProfileMonthDTO? {
        let key = String(format: "%04d-%02d", month.year, month.month + 1)
        return try? await client.request(
            ProfilePageEndpoints.month(identifier: userId ?? identifier, month: key, previewAs: previewAs)
        )
    }

    func closeMonth() {
        openedMonth = nil
        monthLines = nil
    }

    /// Reads "Asked of you"; a 404 means the server's ties are off (no asks, no credits, no gap).
    private func readAsks() async -> [ProfileAskDTO]? {
        do {
            let answer: ProfileAsksDTO = try await client.request(ProfilePageEndpoints.asks())
            ProfileTies.isOn = true
            return answer.asks
        } catch APIError.notFound {
            ProfileTies.isOn = false
            return nil
        } catch {
            return asks
        }
    }

    /// After a sign or a "Not me": the asks and the page read again.
    func reloadAsks() async {
        asks = await readAsks()
        Self.recent[cacheKey] = nil
        await load()
    }

    /// Opens a piece from Work; nil when it isn't there for this viewer (the sheet closes). `owner` when the piece
    /// is another person's (one this person signed, "With Maria").
    func open(pieceId: String, owner: String? = nil, ownerName: String? = nil) async {
        openingPieceId = pieceId
        openedPieceOwner = owner
        openedPieceOwnerName = owner == nil ? nil : ownerName ?? content?.with(pieceId: pieceId)?.name
        openedPiece = nil
        do {
            let answer: ProfilePieceReadDTO = try await client.request(
                ProfilePageEndpoints.piece(identifier: owner ?? userId ?? identifier, pieceId: pieceId, previewAs: previewAs)
            )
            guard openingPieceId == pieceId else { return }
            openedPiece = answer
        } catch {
            guard openingPieceId == pieceId else { return }
            openingPieceId = nil
        }
    }

    func closePiece() {
        openingPieceId = nil
        openedPieceOwner = nil
        openedPieceOwnerName = nil
        openedPiece = nil
    }

    /// A piece was made, changed or removed in the editor: the page, the owner's list and an open piece read again.
    private func watchPieces() {
        guard piecesObserver == nil else { return }
        piecesObserver = ProfileObserverToken(
            NotificationCenter.default.addObserver(forName: .profilePiecesChanged, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor [weak self] in await self?.reloadAfterPieceChange() }
            }
        )
    }

    private func reloadAfterPieceChange() async {
        Self.recent[cacheKey] = nil
        await load()
        if content?.isOwner == true { asks = await readAsks() }
        if let pieceId = openingPieceId {
            if let answer: ProfilePieceReadDTO = try? await client.request(
                ProfilePageEndpoints.piece(identifier: openedPieceOwner ?? userId ?? identifier, pieceId: pieceId, previewAs: previewAs)
            ), openingPieceId == pieceId {
                openedPiece = answer
            } else if openingPieceId == pieceId {
                closePiece()
            }
        }
    }
}

/// Removes a notification observer when whatever holds it goes.
final class ProfileObserverToken {
    private let token: any NSObjectProtocol

    init(_ token: any NSObjectProtocol) {
        self.token = token
    }

    deinit {
        NotificationCenter.default.removeObserver(token)
    }
}

/// Whether the server's ties (credits, asks, roles, the circle) are on, as the owner's last read of "Asked of you" found.
@MainActor
enum ProfileTies {
    static var isOn: Bool?
}

/// The tab a link asks a profile to open on (`/u/:id?tab=work`, the ask notification), taken once by that profile.
@MainActor
enum ProfileOpenTab {
    private static var pending: (who: String, tab: ProfileSourcesTab.Key)?

    static func request(_ tab: String?, for who: String) {
        guard let tab, let key = ProfileSourcesTab.Key(rawValue: tab.lowercased()) else { return }
        pending = (who.lowercased(), key)
    }

    static func take(for candidates: [String?]) -> ProfileSourcesTab.Key? {
        guard let pending, candidates.compactMap({ $0?.lowercased() }).contains(pending.who) else { return nil }
        self.pending = nil
        return pending.tab
    }
}
