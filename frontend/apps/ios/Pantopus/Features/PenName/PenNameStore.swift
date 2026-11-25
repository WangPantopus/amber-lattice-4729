//
//  PenNameStore.swift
//  Pantopus
//
//  The signed-in person's made-up name (`GET /api/pen-names/me`), read once and shared by the Pulse composer, the reply
//  box, My posts and Settings. In the app the words are "made-up name"; in code it is a pen name
//  (contract `docs/product/made-up-names/README.md`).
//

import Foundation
import Observation

@Observable
@MainActor
public final class PenNameStore {
    public static let shared = PenNameStore()

    /// The last answer from `/me`, for the account it was read for.
    private var answer: (userId: String, me: PenNameMeResponse)?
    @ObservationIgnored private var inFlight: Task<PenNameMeResponse?, Never>?
    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    /// `/me` for the person signed in now; nil before it is read (or when it couldn't be).
    public var me: PenNameMeResponse? {
        guard let answer, answer.userId == Self.signedInUserId else { return nil }
        return answer.me
    }

    /// The person's made-up name, once read.
    public var penName: PenNameDTO? {
        me?.penName
    }

    /// Reads `/me` when it hasn't been read for this account yet (or `force`). Returns what it read.
    @discardableResult
    public func load(force: Bool = false) async -> PenNameMeResponse? {
        guard let userId = Self.signedInUserId else { return nil }
        if !force, let me { return me }
        if let inFlight { return await inFlight.value }
        let api = api
        let task = Task<PenNameMeResponse?, Never> { @MainActor in
            try? await api.request(PenNamesEndpoints.me, as: PenNameMeResponse.self)
        }
        inFlight = task
        let read = await task.value
        inFlight = nil
        if let read, Self.signedInUserId == userId { answer = (userId, read) }
        return read
    }

    /// A name was taken: every screen shows it at once, and `/me` is read again for the rest.
    public func adopt(_ penName: PenNameDTO) {
        if let userId = Self.signedInUserId, let current = me {
            answer = (userId, PenNameMeResponse(
                penName: penName,
                allowed: current.allowed,
                refusal: current.refusal,
                postTypes: current.postTypes,
                promise: current.promise,
                suggestions: []
            ))
        }
        Task { await load(force: true) }
    }

    /// Whether a post of this kind may carry the made-up name. False until `/me` has answered for this account: a
    /// server without made-up names (a 404), or a read that failed (offline), leaves every screen as it was before
    /// them, with no "Post as".
    public func allows(postType: String) -> Bool {
        guard let me else { return false }
        return me.postTypes.contains(postType)
    }

    /// The person's own name, as "Post as …" names it.
    public static var ownName: String {
        guard case let .signedIn(user) = AuthManager.shared.state else { return "your name" }
        if let name = user.displayName?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty { return name }
        return MadeUpUsername.chosen(user.username) ?? "your name"
    }

    static var signedInUserId: String? {
        if case let .signedIn(user) = AuthManager.shared.state { return user.id }
        return nil
    }
}

/// Which name a post or a reply carries.
public enum PenNameVoice: String, Sendable, Hashable {
    /// The person's own name and profile.
    case own
    /// Their made-up name.
    case penName
}
