//
//  GuidanceSteps.swift
//  Pantopus
//
//  The cards that follow what the person does (GUIDE spec §2, §5): the cards
//  right after doing something for the first time (16 to 23), the reminders
//  of the next step on Place (24 to 27) and the introductions (28's pattern).
//  An after-action card shows right after the app's own success message, or
//  on the next visit to its screen when the action finished elsewhere. A
//  reminder shows at most once a week across the four, never on a day another
//  centre card showed, each at most twice and only while its condition holds.
//  An introduction shows on whichever tab is open, older accounts too, at most
//  one per app update; none is switched on yet. The few things the phone
//  doesn't know on its own (the home's members, a connection, a post made
//  elsewhere) it asks the server, only while the card could still show.
//

import Foundation

@MainActor
final class GuidanceSteps {
    /// What to do on this screen now.
    enum Choice: Equatable {
        case card(GuidanceCardID)
        /// A server question this card needs is out: show nothing else meanwhile.
        case wait
        case nothing
    }

    /// The server questions the cards ask.
    enum Question: Hashable {
        /// How many people live in this home (cards 23 and 27).
        case members(homeId: String)
        /// Whether this person has a connection (card 21).
        case connected
        /// Whether this person has posted to Pulse (card 18 and the "Post to Pulse" pointer).
        case posted
    }

    /// Called when an answer comes in: the cards are chosen again.
    var onAnswer: (() -> Void)?

    private var answers: [Question: (count: Int?, at: Date)] = [:]
    private var asking: Set<Question> = []
    private var actions: [Action] = []

    /// A screen's own action for a card's button.
    private struct Action {
        let token: UUID
        let id: GuidanceCardID
        let run: () -> Void
    }

    /// An answer is good for a minute; "yes" (a post, a connection) stays.
    private static let answerLife: TimeInterval = 60
    private static let day: TimeInterval = 24 * 60 * 60

    /// A new account: nothing it asked carries over.
    func reset() {
        answers = [:]
        asking = []
    }

    /// Right after doing something (new accounts), an introduction (older accounts too), then a reminder.
    func next(on entry: GuidanceScreenEntry, record: GuidanceRecord, account: String) -> Choice {
        if record.newAccount {
            let done = afterAction(on: entry, record: record, account: account)
            if done != .nothing { return done }
        }
        if let intro = introduction(record: record) { return .card(intro) }
        return record.newAccount ? reminder(on: entry, record: record) : .nothing
    }

    // MARK: - Right after doing something

    /// The after-action card for this screen, if any (new accounts only; the caller checks).
    func afterAction(on entry: GuidanceScreenEntry, record: GuidanceRecord, account: String) -> Choice {
        let fresh: (GuidanceCardID) -> Bool = { !record.hasSeen($0) }
        let pending: (GuidanceCardID) -> Bool = { fresh($0) && record.pending.contains($0.rawValue) }
        switch entry.screen {
        case .place:
            return afterActionOnPlace(entry.variants.home, fresh: fresh)
        case .pulse:
            if pending(.doneFirstPost) || (fresh(.doneFirstPost) && record.has(.posted)) { return .card(.doneFirstPost) }
            guard fresh(.doneFirstPost) else { return .nothing }
            return answer(.posted, account: account).map { $0 > 0 ? .card(.doneFirstPost) : .nothing } ?? .wait
        case .moments:
            return pending(.doneFirstMoment) ? .card(.doneFirstMoment) : .nothing
        case .plans:
            return pending(.doneFirstPlan) ? .card(.doneFirstPlan) : .nothing
        case .mail:
            return pending(.doneFirstLetter) || (fresh(.doneFirstLetter) && entry.variants.sentAny) ? .card(.doneFirstLetter) : .nothing
        case .messages:
            if pending(.doneConnected) { return .card(.doneConnected) }
            guard fresh(.doneConnected) else { return .nothing }
            return answer(.connected, account: account).map { $0 > 0 ? .card(.doneConnected) : .nothing } ?? .wait
        case .today:
            return .nothing
        }
    }

    /// Place: "Your home is set up", "You're verified", then "Your household".
    private func afterActionOnPlace(_ home: GuidanceHomeFacts?, fresh: (GuidanceCardID) -> Bool) -> Choice {
        guard let home else { return .nothing }
        if !home.invited, fresh(.doneHomeSetup) { return .card(.doneHomeSetup) }
        if home.verified, fresh(.doneVerified) { return .card(.doneVerified) }
        guard fresh(.doneHousehold) else { return .nothing }
        return answer(.members(homeId: home.id)).map { $0 >= 2 ? .card(.doneHousehold) : .nothing } ?? .wait
    }

    // MARK: - Reminders of the next step

    /// The reminder for Place now, if any (new accounts only; the caller checks).
    func reminder(on entry: GuidanceScreenEntry, record: GuidanceRecord, now: Date = Date()) -> Choice {
        guard entry.screen == .place, Self.reminderDayOpen(record, now: now) else { return .nothing }
        let left: (GuidanceCardID) -> Bool = { record.times($0) < 2 }
        let variants = entry.variants
        if variants.firstRun, left(.nextAddAddress), Self.olderThan(record.createdAt, days: 2, now: now) {
            return .card(.nextAddAddress)
        }
        // The saved-address root shows only while there is no home.
        if variants.savedAddress, left(.nextSetupHome), Self.olderThan(variants.savedPlaceAt, days: 3, now: now) {
            return .card(.nextSetupHome)
        }
        guard let home = variants.home, Self.olderThan(home.setUpAt, days: 7, now: now) else { return .nothing }
        if !home.verified, home.verifiable, left(.nextVerify) { return .card(.nextVerify) }
        guard !home.invited, left(.nextInvite) else { return .nothing }
        return answer(.members(homeId: home.id)).map { $0 == 1 ? .card(.nextInvite) : .nothing } ?? .wait
    }

    /// At most one reminder a week across the four, and never on a day another centre card showed.
    private static func reminderDayOpen(_ record: GuidanceRecord, now: Date) -> Bool {
        let lastReminder = GuidanceCardID.reminders.compactMap(record.lastSeen).max()
        if let lastReminder, now.timeIntervalSince(lastReminder) < 7 * day { return false }
        let today = GuidanceRecord.day(now)
        if record.lastCentreDay == today { return false }
        return !GuidanceCardID.allCases.contains { id in
            id.isCentre && record.lastSeen(id).map(GuidanceRecord.day) == today
        }
    }

    private static func olderThan(_ iso: String?, days: Double, now: Date) -> Bool {
        guard let date = iso.flatMap(GuidanceRecord.date) else { return false }
        return now.timeIntervalSince(date) >= days * day
    }

    // MARK: - Introductions

    /// The introduction to show, if one is switched on and none showed in this app version.
    func introduction(record: GuidanceRecord) -> GuidanceCardID? {
        guard record.lastIntroVersion != Self.appVersion else { return nil }
        return GuidanceCatalog.activeIntroductions.first { !record.hasSeen($0) && Self.isAvailable($0) }
    }

    /// An introduction only for what this person's app has (Plans while its tab is on).
    private static func isAvailable(_ id: GuidanceCardID) -> Bool {
        switch id {
        case .newPlans: PlansFlags.shared.plans
        default: false
        }
    }

    static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    }

    // MARK: - Asking the server

    /// The server said this person has posted (the "Post to Pulse" pointer is for someone who hasn't).
    var hasPosted: Bool {
        (answers[.posted]?.count ?? 0) > 0
    }

    /// The answer, asked now when it isn't known or is over a minute old ("yes, a post" or "yes, a connection"
    /// stays). Nil while the first ask is out. A failed ask answers 0: no card, and it is asked again later.
    private func answer(_ question: Question, account: String? = nil) -> Int? {
        guard let known = answers[question] else {
            ask(question, account: account)
            return nil
        }
        let count = known.count ?? 0
        let lasting = count > 0 && !Self.isMembers(question)
        if !lasting, Date().timeIntervalSince(known.at) >= Self.answerLife { ask(question, account: account) }
        return count
    }

    private static func isMembers(_ question: Question) -> Bool {
        if case .members = question { return true }
        return false
    }

    private func ask(_ question: Question, account: String?) {
        guard !asking.contains(question) else { return }
        asking.insert(question)
        Task { @MainActor [weak self] in
            let count = await Self.count(question, account: account)
            guard let self else { return }
            asking.remove(question)
            answers[question] = (count, Date())
            onAnswer?()
        }
    }

    /// One short list read: how many rows came back.
    private static func count(_ question: Question, account: String?) async -> Int? {
        let endpoint: Endpoint
        switch question {
        case let .members(homeId):
            endpoint = HomesEndpoints.listOccupants(homeId: homeId)
        case .connected:
            endpoint = RelationshipsEndpoints.list(status: "accepted", limit: 1)
        case .posted:
            guard let account else { return nil }
            endpoint = PostsEndpoints.userPosts(userId: account, limit: 1)
        }
        let reply: GuidanceListCount? = try? await APIClient.shared.request(endpoint)
        return reply?.count
    }

    // MARK: - The buttons' own actions (cards 24 to 27)

    func setAction(_ token: UUID, id: GuidanceCardID, run: @escaping () -> Void) {
        actions.removeAll { $0.token == token }
        actions.append(Action(token: token, id: id, run: run))
    }

    func removeAction(_ token: UUID) {
        actions.removeAll { $0.token == token }
    }

    /// What the button of this card does on the screen showing now (the last one to register it).
    func action(for id: GuidanceCardID) -> (() -> Void)? {
        actions.last { $0.id == id }?.run
    }
}

/// The length of the list a read answers (`occupants`, `relationships` or `posts`), without reading its rows.
private struct GuidanceListCount: Decodable {
    let count: Int

    private struct Key: CodingKey {
        let stringValue: String
        var intValue: Int? {
            nil
        }

        init?(stringValue: String) {
            self.stringValue = stringValue
        }

        init?(intValue _: Int) {
            nil
        }
    }

    private static let lists: Set = ["occupants", "relationships", "posts"]

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: Key.self)
        guard let key = container.allKeys.first(where: { Self.lists.contains($0.stringValue) }) else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "No list in the answer"))
        }
        count = try container.nestedUnkeyedContainer(forKey: key).count ?? 0
    }
}

/// A tab's first screen, as it last said.
struct GuidanceScreenEntry {
    let screen: GuidanceScreen
    var ready: Bool
    var variants: GuidanceVariants
}

/// What is on screen now.
enum GuidancePresentation: Equatable {
    /// A centre card; `replay` when the person asked for it again from the tips list (not counted).
    case centre(GuidanceCentreCard, replay: Bool)
    case pointer(GuidancePointerCard)

    var id: GuidanceCardID {
        switch self {
        case let .centre(card, _): card.id
        case let .pointer(card): card.id
        }
    }

    var isReplay: Bool {
        if case let .centre(_, replay) = self { return replay }
        return false
    }
}
