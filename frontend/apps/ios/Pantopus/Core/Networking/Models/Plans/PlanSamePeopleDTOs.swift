//
//  PlanSamePeopleDTOs.swift
//  Pantopus
//
//  Plans for the holidays, the same people again (08-extras section 6, board 30): the host's past plans, one
//  plan's people with a check each, and inviting them. Nothing here carries an address or an account id: a guest
//  invited by email shows by the name they gave. Route backend/services/plans/planSamePeople.js.
//

import Foundation

/// One of the host's ended plans that had anyone in.
public struct PlanPastPlanDTO: Decodable, Sendable, Hashable, Identifiable {
    public let postId: String
    public let title: String
    public let kind: PlanKind?
    /// "Nov 21", the server's.
    public let dateText: String
    /// The people who were in at the end, one a party.
    public let count: Int

    public var id: String { postId }

    enum CodingKeys: String, CodingKey {
        case title, kind, count
        case postId = "post_id"
        case dateText = "date_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        postId = try container.decode(String.self, forKey: .postId)
        title = try container.decode(String.self, forKey: .title)
        kind = try? container.decodeIfPresent(PlanKind.self, forKey: .kind)
        dateText = try container.decodeIfPresent(String.self, forKey: .dateText) ?? ""
        count = try container.decodeIfPresent(Int.self, forKey: .count) ?? 0
    }
}

/// `GET /api/plans/past-people`.
public struct PlanPastPlansResponse: Decodable, Sendable, Hashable {
    public let plans: [PlanPastPlanDTO]
}

/// How a person was reached on the past plan.
public enum PlanPastVia: String, Decodable, Sendable, Hashable {
    case pantopus, email, text
}

/// One person who was in, by name. `key` is `p:<user id>` or `g:<guest id>`, what `skip` takes.
public struct PlanPastPersonDTO: Decodable, Sendable, Hashable, Identifiable {
    public let key: String
    public let name: String
    public let avatarUrl: String?
    public let via: PlanPastVia
    /// False for a guest who came by a text invitation and gave no email: can't be reached again.
    public let canInvite: Bool

    public var id: String { key }

    enum CodingKeys: String, CodingKey {
        case key, name, via
        case avatarUrl = "avatar_url"
        case canInvite = "can_invite"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        key = try container.decode(String.self, forKey: .key)
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? ""
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        via = (try? container.decodeIfPresent(PlanPastVia.self, forKey: .via)) ?? .pantopus
        canInvite = try container.decodeIfPresent(Bool.self, forKey: .canInvite) ?? false
    }
}

/// `GET /api/plans/past-people/:postId`.
public struct PlanPastPeopleDTO: Decodable, Sendable, Hashable {
    public let postId: String
    public let title: String
    public let dateText: String
    public let people: [PlanPastPersonDTO]

    enum CodingKeys: String, CodingKey {
        case title, people
        case postId = "post_id"
        case dateText = "date_text"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        postId = try container.decode(String.self, forKey: .postId)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        dateText = try container.decodeIfPresent(String.self, forKey: .dateText) ?? ""
        people = try container.decodeIfPresent([PlanPastPersonDTO].self, forKey: .people) ?? []
    }
}

/// `POST /api/plans/:id/invites/from-plan` body.
public struct PlanFromPlanBody: Encodable, Sendable {
    public let fromPostId: String
    public let skip: [String]
    public let confirmSharesAddress: Bool?

    enum CodingKeys: String, CodingKey {
        case skip
        case fromPostId = "from_post_id"
        case confirmSharesAddress = "confirm_shares_address"
    }
}

/// The host's invitation list after `from-plan`, with the line to show ("Invited 4. 1 can only be reached by text.").
public struct PlanFromPlanResponse: Decodable, Sendable {
    public let list: PlanInviteListDTO
    public let text: String?

    enum CodingKeys: String, CodingKey {
        case text
    }

    public init(from decoder: any Decoder) throws {
        list = try PlanInviteListDTO(from: decoder)
        text = try decoder.container(keyedBy: CodingKeys.self).decodeIfPresent(String.self, forKey: .text)
    }
}
