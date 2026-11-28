//
//  ReinventedCircles.swift
//  Pantopus
//
//  Circles and the weekly magazine ("Pulse, reinvented" phase 3, PHASE-3 piece 8; CONTRACT 8d): circles of 2 to 8
//  close people, made from a person's connections. Nobody is in one without their own yes, nobody is told who said no,
//  and nobody outside a circle learns it exists. Close circle in the reach dial can be one circle (only its people who
//  are in), and each circle has a magazine of its week, laid out by the server on read. Only while the switch is on:
//  the reach dial, where circles are reached, exists only then; the circles are read when the dial opens, never
//  beside what opens the tab.
//

import Foundation
import Observation

/// One circle as the reader reads it (`<Circle>`); an invitee sees its name, its owner and who is in.
struct ReinventedCircleDTO: Decodable, Hashable, Identifiable {
    struct Member: Hashable {
        let person: MomentAuthorDTO
        let state: String

        var isIn: Bool {
            state == "in"
        }
    }

    let id: String
    let name: String
    let owner: MomentAuthorDTO?
    let members: [Member]
    let mine: Bool
    let weekDay: Int
    let magazineReady: Bool
    let myState: String?
    let myKeepFaded: Bool

    var inCount: Int {
        members.filter(\.isIn).count
    }

    var invitedCount: Int {
        members.count - inCount
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, owner, members, mine
        case weekDay = "week_day"
        case magazineReady = "magazine_ready"
        case myState = "my_state"
        case myKeepFaded = "my_keep_faded"
    }

    private struct RawMember: Decodable {
        let person: MomentAuthorDTO?
        let state: String?

        init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: Keys.self)
            person = try? c.decodeIfPresent(MomentAuthorDTO.self, forKey: .person)
            state = try? c.decodeIfPresent(String.self, forKey: .state)
        }

        private enum Keys: String, CodingKey {
            case person, state
        }
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        owner = try? c.decodeIfPresent(MomentAuthorDTO.self, forKey: .owner)
        // A person whose account is gone comes as null: left out.
        members = ((try? c.decodeIfPresent([RawMember].self, forKey: .members)) ?? []).compactMap { raw in
            raw.person.map { Member(person: $0, state: raw.state ?? "invited") }
        }
        mine = (try? c.decodeIfPresent(Bool.self, forKey: .mine)) ?? false
        weekDay = (try? c.decodeIfPresent(Int.self, forKey: .weekDay)) ?? 0
        magazineReady = (try? c.decodeIfPresent(Bool.self, forKey: .magazineReady)) ?? false
        myState = try? c.decodeIfPresent(String.self, forKey: .myState)
        myKeepFaded = (try? c.decodeIfPresent(Bool.self, forKey: .myKeepFaded)) ?? false
    }
}

/// `GET /api/reinvented/circles`: the circles the reader is in, and the ones they are invited to.
struct ReinventedCirclesPageDTO: Decodable {
    let circles: [ReinventedCircleDTO]
    let invites: [ReinventedCircleDTO]

    private enum CodingKeys: String, CodingKey {
        case circles, invites
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        circles = (try? c.decodeIfPresent([ReinventedCircleDTO].self, forKey: .circles)) ?? []
        invites = (try? c.decodeIfPresent([ReinventedCircleDTO].self, forKey: .invites)) ?? []
    }
}

/// The answer of a change: `{ circle }`, or nothing when the circle ended.
struct ReinventedCircleAnswerDTO: Decodable {
    let circle: ReinventedCircleDTO?
}

private struct CircleMakeBody: Encodable {
    let name: String
    let people: [String]
}

private struct CircleJoinBody: Encodable {
    let keepFaded: Bool

    private enum CodingKeys: String, CodingKey {
        case keepFaded = "keep_faded"
    }
}

private struct CircleChangeBody: Encodable {
    let name: String?
    let add: [String]?
    let remove: [String]?
}

private struct EmptyBody: Encodable {}

enum ReinventedCirclesEndpoints {
    private static let base = "/api/reinvented/circles"

    private static func one(_ id: String) -> String {
        "\(base)/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)"
    }

    /// The person's own time zone, so a week's day is theirs (Pacific otherwise).
    private static var zone: [String: String] {
        ["tz": TimeZone.current.identifier]
    }

    /// `GET /api/reinvented/circles?tz=`. Route `backend/routes/reinvented.js:577`.
    static var circles: Endpoint {
        Endpoint(method: .get, path: base, query: zone, cachePolicy: .reloadIgnoringLocalCacheData)
    }

    /// `POST /api/reinvented/circles` `{ name, people }` (1 to 7 connections): `201 { circle }`. Route `:578`.
    static func make(name: String, people: [String]) -> Endpoint {
        Endpoint(method: .post, path: base, body: CircleMakeBody(name: name, people: people))
    }

    /// `POST …/:id/join` `{ keep_faded }`: an invitee says yes. Route `:579`.
    static func join(_ id: String, keepFaded: Bool) -> Endpoint {
        Endpoint(method: .post, path: "\(one(id))/join", body: CircleJoinBody(keepFaded: keepFaded))
    }

    /// `POST …/:id/me` `{ keep_faded }`: the member's own choice for this circle. Route `:580`.
    static func keepFaded(_ id: String, keep: Bool) -> Endpoint {
        Endpoint(method: .post, path: "\(one(id))/me", body: CircleJoinBody(keepFaded: keep))
    }

    /// `POST …/:id/leave`: a member leaves, or an invitee says no (nobody is told who). Route `:581`.
    static func leave(_ id: String) -> Endpoint {
        Endpoint(method: .post, path: "\(one(id))/leave", body: EmptyBody())
    }

    /// `PATCH …/:id` `{ name?, add?, remove? }`: its maker. Route `:582`.
    static func change(_ id: String, name: String? = nil, add: [String]? = nil, remove: [String]? = nil) -> Endpoint {
        Endpoint(method: .patch, path: one(id), body: CircleChangeBody(name: name, add: add, remove: remove))
    }

    /// `DELETE …/:id`: its maker ends it for everyone. Route `:583`.
    static func end(_ id: String) -> Endpoint {
        Endpoint(method: .delete, path: one(id))
    }

    /// `GET …/:id/magazine?week=&tz=`: the circle's week, laid out on read. Route `:584`.
    static func magazine(_ id: String, week: String?) -> Endpoint {
        var query = zone
        if let week { query["week"] = week }
        return Endpoint(method: .get, path: "\(one(id))/magazine", query: query, cachePolicy: .reloadIgnoringLocalCacheData)
    }
}

/// The reader's circles, read when the reach dial opens and again after each change.
@Observable
@MainActor
final class ReinventedCirclesModel {
    static let shared = ReinventedCirclesModel()

    enum Reading: Equatable {
        case idle, reading, read, failed
    }

    private(set) var reading = Reading.idle
    private(set) var circles: [ReinventedCircleDTO] = []
    private(set) var invites: [ReinventedCircleDTO] = []
    private(set) var busy = false
    var problem: String?
    @ObservationIgnored private var account: String?

    /// Invites and magazines not opened yet: the dial's "N new".
    var news: Int {
        invites.count + circles.filter(\.magazineReady).count
    }

    func circle(_ id: String) -> ReinventedCircleDTO? {
        circles.first { $0.id == id }
    }

    func read() async {
        let current = MomentsComposerModel.account
        if account != current { (circles, invites, account, reading) = ([], [], current, .idle) }
        if reading != .read { reading = .reading }
        do {
            let page: ReinventedCirclesPageDTO = try await MomentsAPI.send(ReinventedCirclesEndpoints.circles)
            circles = page.circles
            invites = page.invites
            reading = .read
        } catch {
            if reading != .read { reading = .failed }
            // The switch may have gone off on the server: read it again, and the dial goes with it.
            await PulseReinventedFlags.shared.recheck()
        }
    }

    /// Sends one change for its effect (a leave or an end may answer with no body); on success reads the circles
    /// again. Says why when it didn't go through.
    @discardableResult
    func send(_ endpoint: Endpoint) async -> Bool {
        await attempt { try await MomentsAPI.send(endpoint) } != nil
    }

    /// Makes a circle: the one made, to open it.
    func make(name: String, people: [String]) async -> ReinventedCircleDTO? {
        let answer: ReinventedCircleAnswerDTO? = await attempt {
            try await MomentsAPI.send(ReinventedCirclesEndpoints.make(name: name, people: people))
        }
        return answer?.circle
    }

    private func attempt<Value>(_ work: () async throws -> Value) async -> Value? {
        busy = true
        problem = nil
        defer { busy = false }
        do {
            let value = try await work()
            await read()
            return value
        } catch let failure as MomentsFailure {
            problem = failure.message
        } catch {
            problem = "Couldn't do that. Try again."
        }
        await PulseReinventedFlags.shared.recheck()
        return nil
    }
}
