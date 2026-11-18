//
//  HomeVerifyOptionsStore.swift
//  Pantopus
//
//  The server's `verify-options` answer per Home, kept in memory for this
//  sign-in so the verify sheet opens already knowing which rows to draw.
//  A 404 (`FAST_CHECK_OFF`, the switch off) or any failure means today's
//  screens: nothing here changes what a person sees while the switch is off.
//

import Foundation
import Observation

@Observable
@MainActor
final class HomeVerifyOptionsStore {
    static let shared = HomeVerifyOptionsStore()

    private enum Entry {
        /// The switch is off for this person (404), or the answer couldn't be read.
        case off
        case options(HomeVerifyOptions)
    }

    private var entries: [String: Entry] = [:]
    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    /// The last answer for this Home, without asking the server. Nil: today's screens.
    func cached(homeId: String) -> HomeVerifyOptions? {
        guard let key = key(homeId), case let .options(options) = entries[key] else { return nil }
        return options
    }

    /// Asks the server and keeps the answer. Nil while the switch is off or the answer couldn't be read.
    @discardableResult
    func load(homeId: String) async -> HomeVerifyOptions? {
        guard let key = key(homeId) else { return nil }
        do {
            let options: HomeVerifyOptions = try await api.request(HomeFastVerifyEndpoints.verifyOptions(homeId: homeId))
            guard options.homeId.caseInsensitiveCompare(homeId) == .orderedSame else {
                entries[key] = .off
                return nil
            }
            entries[key] = .options(options)
            return options
        } catch is CancellationError {
            return cached(homeId: homeId)
        } catch {
            // Off (404) or unreadable: today's screens. A transport failure keeps the last answer.
            if let apiError = error as? APIError, case .transport = apiError { return cached(homeId: homeId) }
            entries[key] = .off
            return nil
        }
    }

    /// Forgets a Home's answer after a check changed it (the next read asks again).
    func forget(homeId: String) {
        guard let key = key(homeId) else { return }
        entries[key] = nil
    }

    private func key(_ homeId: String) -> String? {
        let auth = api.authProvider ?? AuthManager.shared
        guard case let .signedIn(user) = auth.state, !homeId.isEmpty else { return nil }
        return "\(user.id)/\(homeId.lowercased())"
    }
}
