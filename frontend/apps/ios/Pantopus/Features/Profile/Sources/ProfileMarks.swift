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
    @ObservationIgnored private let defaults: UserDefaults

    /// Whether the server answered rings the last time it was asked, kept on the phone so the room around avatars is
    /// right from the first frame after a relaunch. An older server, or one with its switch off, answers 404.
    private(set) var serverHasMarks: Bool
    static let serverHasMarksKey = "profileMarks.serverHasMarks"

    init(client: APIClient = .shared, defaults: UserDefaults = .standard) {
        self.client = client
        self.defaults = defaults
        serverHasMarks = defaults.object(forKey: Self.serverHasMarksKey) as? Bool ?? true
    }

    /// Whether avatars wear the ring at all in this build.
    static var isOn: Bool {
        LaunchFeatures.profileSources
    }

    /// Whether an avatar showing this person keeps room for a ring from its first frame. Anyone may get one: who does
    /// is the server's answer, a moment after the avatar shows, and nothing beside the avatar moves when it comes.
    func keepsRoom(for userId: String?) -> Bool {
        guard Self.isOn, serverHasMarks, let userId, !userId.isEmpty else { return false }
        return true
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
            setServerHasMarks(true)
        } catch APIError.notFound {
            unsupported = true
            setServerHasMarks(false)
        } catch {
            for id in ids {
                answeredAt[id] = nil
            }
        }
    }

    private func setServerHasMarks(_ has: Bool) {
        if serverHasMarks != has { serverHasMarks = has }
        defaults.set(has, forKey: Self.serverHasMarksKey)
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

    func body(content: Content) -> some View {
        if ProfileMarks.isOn, let userId {
            let marks = ProfileMarks.shared
            let mark = marks.mark(for: userId)
            ProfileMarkRoom(keeps: marks.keepsRoom(for: userId)) {
                content
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
            }
        } else {
            content
        }
    }
}

/// The room around an avatar for the ring of a person's mark (board 6 counts the ring as part of the avatar), kept
/// from the avatar's first frame: the avatar keeps its size in the middle, and what sits beside it is placed past the
/// room before the ring has come in, so nothing moves when it does (as on the web and Android). The room is the
/// thickest ring's, so every name in a list starts at the same place whatever each person's ring.
struct ProfileMarkRoom: Layout {
    let keeps: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        guard let avatar = subviews.first else { return .zero }
        let size = avatar.sizeThatFits(proposal)
        let room = room(around: size)
        return CGSize(width: size.width + 2 * room, height: size.height + 2 * room)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        guard let avatar = subviews.first else { return }
        let size = avatar.sizeThatFits(proposal)
        avatar.place(at: CGPoint(x: bounds.midX, y: bounds.midY), anchor: .center, proposal: ProposedViewSize(size))
    }

    private func room(around size: CGSize) -> CGFloat {
        keeps ? ProfileAvatarRing.room(diameter: min(size.width, size.height)) : 0
    }
}
