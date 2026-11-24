//
//  ProfileMarks.swift
//  Pantopus
//
//  The ring on every avatar (board 6), read the way the Moments rings are
//  (`MomentsPeopleRings`): a circle that comes on screen asks about its person,
//  the asks of one screenful go to the server together
//  (`GET /api/profile-page/marks`), and an answer is kept a minute. The
//  server decides who may be seen; someone it leaves out has no ring. Only
//  while the `profile_sources` launch key is on.
//

import Foundation
import Observation
import SwiftUI

/// One person's ring, as the server sends it.
struct ProfileMarkDTO: Decodable, Hashable {
    let userId: String
    /// The first month with anything on record, "2015-01".
    let since: String?
    let seen: Bool

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case since
        case seen
    }
}

struct ProfileMarksResponse: Decodable {
    let marks: [ProfileMarkDTO]
}

@Observable
@MainActor
final class ProfileMarks {
    static let shared = ProfileMarks()

    /// The ring of each person the server answered for, by account id.
    private(set) var marks: [String: ProfileMarkSummary] = [:]

    /// An answer is kept a minute at most (CONTRACT §7).
    static let keepFor: TimeInterval = 60
    static let gatherFor: Duration = .milliseconds(120)
    static let mostPerRequest = 100

    @ObservationIgnored private var account: String?
    @ObservationIgnored private var answeredAt: [String: Date] = [:]
    @ObservationIgnored private var waiting: Set<String> = []
    @ObservationIgnored private var sending: Task<Void, Never>?
    /// A server without this read (or with the switch off): not asked again until the app starts again.
    @ObservationIgnored private var unsupported = false
    @ObservationIgnored private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    /// Whether avatars wear the ring at all in this build.
    static var isOn: Bool {
        LaunchFeatures.profileSources
    }

    func mark(for userId: String?) -> ProfileMarkSummary? {
        guard Self.isOn, let userId else { return nil }
        return marks[userId]
    }

    /// The person's own page was read: their ring is known without asking.
    func remember(_ summary: ProfileMarkSummary, for userId: String) {
        guard Self.isOn, let me = signedInId else { return }
        if me != account { reset(for: me) }
        answeredAt[userId] = Date()
        if marks[userId] != summary { marks[userId] = summary }
    }

    /// A circle showing this person is on screen.
    func want(_ userId: String?) {
        guard Self.isOn, let userId, !userId.isEmpty, !unsupported, let me = signedInId else { return }
        if me != account { reset(for: me) }
        if let at = answeredAt[userId], Date().timeIntervalSince(at) < Self.keepFor { return }
        waiting.insert(userId)
        gather()
    }

    private var signedInId: String? {
        if case let .signedIn(user) = AuthManager.shared.state { return user.id }
        return nil
    }

    private func reset(for newAccount: String) {
        account = newAccount
        marks = [:]
        answeredAt = [:]
        waiting = []
        sending?.cancel()
        sending = nil
    }

    private func gather() {
        guard sending == nil else { return }
        let asker = account
        sending = Task { [weak self] in
            try? await Task.sleep(for: Self.gatherFor)
            guard !Task.isCancelled else { return }
            await self?.send(as: asker)
        }
    }

    private func send(as asker: String?) async {
        let ids = Array(waiting.prefix(Self.mostPerRequest))
        waiting.subtract(ids)
        defer {
            sending = nil
            if !waiting.isEmpty, asker == account { gather() }
        }
        guard !ids.isEmpty, asker == account else { return }
        let now = Date()
        for id in ids {
            answeredAt[id] = now
        }
        do {
            let answer: ProfileMarksResponse = try await client.request(ProfilePageEndpoints.marks(ids: ids))
            guard asker == account else { return }
            var next = marks
            for id in ids {
                next[id] = nil
            }
            for mark in answer.marks {
                next[mark.userId] = ProfileMarkSummary(since: mark.since, hasSeen: mark.seen)
            }
            if next != marks { marks = next }
        } catch APIError.notFound {
            unsupported = true
        } catch {
            for id in ids {
                answeredAt[id] = nil
            }
        }
    }
}

extension View {
    /// The outer ring of the person's mark alone (board 6), for a circle that doesn't wear the Moments ring (a plan's
    /// people). Nothing while the `profile_sources` key is off or the server answered no ring for them.
    func profileMarkRing(of userId: String?) -> some View {
        modifier(ProfileMarkRingModifier(userId: userId))
    }
}

private struct ProfileMarkRingModifier: ViewModifier {
    let userId: String?

    @State private var diameter: CGFloat = 0

    func body(content: Content) -> some View {
        if ProfileMarks.isOn, let userId {
            let marks = ProfileMarks.shared
            let mark = marks.mark(for: userId)
            content
                .onGeometryChange(for: CGFloat.self) { min($0.size.width, $0.size.height) } action: { diameter = $0 }
                .overlay {
                    if let mark {
                        GeometryReader { proxy in
                            ProfileAvatarRing(summary: mark, diameter: min(proxy.size.width, proxy.size.height))
                        }
                    }
                }
                .task(id: userId) {
                    while !Task.isCancelled {
                        marks.want(userId)
                        try? await Task.sleep(for: .seconds(ProfileMarks.keepFor + 1))
                    }
                }
                .padding(mark.map { ProfileAvatarRing.reach($0, diameter: diameter) } ?? 0)
        } else {
            content
        }
    }
}
