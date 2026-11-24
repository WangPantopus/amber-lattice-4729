//
//  HomeRecordViewModel.swift
//  Pantopus
//
//  Loads the home record page for a looked-up address
//  (`GET /api/public/home-record`) or for a Home (`GET /api/homes/:id/record`).
//

import Foundation
import Observation

/// Where the record comes from.
enum HomeRecordSource: Hashable {
    /// A looked-up address, in the words the lookup answered with.
    case lookup(address: String)
    /// A Home the person belongs to.
    case home(homeId: String)

    /// "This home's record" or "Your home's record".
    var title: String {
        switch self {
        case .lookup: "This home's record"
        case .home: "Your home's record"
        }
    }
}

@Observable
@MainActor
final class HomeRecordViewModel {
    enum State: Equatable {
        case loading
        case loaded(HomeRecord)
        case error(headline: String, message: String)
    }

    let source: HomeRecordSource
    private(set) var state: State = .loading
    /// A refresh that failed while the page was showing: the page stays.
    var refreshFailureMessage: String?

    private let api: APIClient

    init(source: HomeRecordSource, api: APIClient = .shared) {
        self.source = source
        self.api = api
    }

    /// First load. Does nothing once the page is showing.
    func load() async {
        if case .loaded = state { return }
        await fetch(keepingPage: false)
    }

    /// Pull to refresh and Try again.
    func refresh() async {
        await fetch(keepingPage: true)
    }

    private func fetch(keepingPage: Bool) async {
        let showing: HomeRecord? = if case let .loaded(record) = state { record } else { nil }
        if showing == nil || !keepingPage { state = .loading }
        do {
            let record = try await answer()
            guard !Task.isCancelled else { return }
            state = .loaded(record)
            refreshFailureMessage = nil
        } catch {
            guard !Task.isCancelled, !(error is CancellationError) else { return }
            if keepingPage, showing != nil {
                refreshFailureMessage = "We couldn't refresh this record. What you see is from before."
            } else {
                state = .error(headline: "Couldn't load the record", message: message(for: error))
            }
        }
    }

    #if DEBUG
    /// Previews: the page already drawn.
    func showForPreview(_ record: HomeRecord) {
        state = .loaded(record)
    }
    #endif

    private func answer() async throws -> HomeRecord {
        #if DEBUG
        if let fixture = HomeRecordFixtures.requested(for: source) { return fixture }
        #endif
        switch source {
        case let .lookup(address):
            return try await api.request(HomeRecordEndpoints.lookup(address: address))
        case let .home(homeId):
            return try await api.request(HomeRecordEndpoints.home(homeId: homeId))
        }
    }

    private func message(for error: Error) -> String {
        guard let apiError = error as? APIError else {
            return "We couldn't load this home's record. Try again in a moment."
        }
        switch apiError {
        case let .clientError(status, message) where status == 429:
            // The lookup's own limit: the server's sentence says when it opens again.
            return message ?? "You've looked up as many addresses as you can today. Try again tomorrow."
        case .notFound:
            return source.isLookup
                ? "We couldn't find a record for this address."
                : "We couldn't find this home's record."
        case .forbidden:
            return "Only the people of this home can see its record."
        case .transport:
            return "We couldn't reach Pantopus. Check your connection and try again."
        default:
            return "We couldn't load this home's record. Try again in a moment."
        }
    }
}

extension HomeRecordSource {
    var isLookup: Bool {
        if case .lookup = self { return true }
        return false
    }
}
