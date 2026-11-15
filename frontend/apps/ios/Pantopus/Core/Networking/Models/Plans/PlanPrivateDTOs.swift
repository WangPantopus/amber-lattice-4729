//
//  PlanPrivateDTOs.swift
//  Pantopus
//
//  Plans step 1, private plans (founder approval 2026-11-14; the apps'
//  contract is CONTRACT-step1.md in the PLANSMORE stream folder): a person
//  hosts a plan only the people they invite can see. Behind `plans_private`.
//  Every key here is new: an older server sends none of them, and its plans
//  read as plans for people nearby, as they always were.
//
//  Route: backend/routes/plans.js and backend/services/plans/planService.js.
//

import Foundation

/// Who a plan is for: people nearby, who ask to join (every plan until now),
/// or only the people its host invites (a private plan).
public enum PlanAudience: String, Sendable, Hashable {
    case nearby
    case invited

    public init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PlanAudience(rawValue: raw) ?? .nearby
    }
}

extension PlanAudience: Codable {}

/// `viewer.friend_invite`: a guest who is in on a private plan whose host lets
/// guests bring a friend. `used` once they made their one link.
public struct PlanFriendInviteDTO: Decodable, Sendable, Hashable {
    public let canInvite: Bool
    public let used: Bool

    enum CodingKeys: String, CodingKey {
        case used
        case canInvite = "can_invite"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        canInvite = try container.decodeIfPresent(Bool.self, forKey: .canInvite) ?? false
        used = try container.decodeIfPresent(Bool.self, forKey: .used) ?? false
    }
}

/// The private-plan keys of a plan card, decoded from the card's own keys.
/// `audience` missing (an older server) means `nearby`.
public struct PlanCardPrivatePart: Decodable, Sendable, Hashable {
    public let audience: PlanAudience
    /// Each person the host invited may invite one more.
    public let guestsCanInvite: Bool
    /// A private plan at a public place, for the person invited: its name, address and point before
    /// they answer. Nil at a home and for everyone else (the detail's own `place` once they're in).
    public let place: PlanPlaceDTO?
    /// "Bring a friend", for a guest who is in.
    public let friendInvite: PlanFriendInviteDTO?

    /// A plan for people nearby: what every card from an older server is.
    static let nearby = PlanCardPrivatePart(audience: .nearby, guestsCanInvite: false, place: nil, friendInvite: nil)

    enum CodingKeys: String, CodingKey {
        case audience, place, viewer
        case guestsCanInvite = "guests_can_invite"
    }

    enum ViewerKeys: String, CodingKey {
        case friendInvite = "friend_invite"
    }

    init(audience: PlanAudience, guestsCanInvite: Bool, place: PlanPlaceDTO?, friendInvite: PlanFriendInviteDTO?) {
        self.audience = audience
        self.guestsCanInvite = guestsCanInvite
        self.place = place
        self.friendInvite = friendInvite
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        audience = (try? container.decodeIfPresent(PlanAudience.self, forKey: .audience)) ?? .nearby
        guestsCanInvite = (try? container.decodeIfPresent(Bool.self, forKey: .guestsCanInvite)) ?? false
        // Only a private plan's card says where it is before you're in (a business's place is its own part).
        place = audience == .invited ? try? container.decodeIfPresent(PlanPlaceDTO.self, forKey: .place) : nil
        let viewer = try? container.nestedContainer(keyedBy: ViewerKeys.self, forKey: .viewer)
        friendInvite = try? viewer?.decodeIfPresent(PlanFriendInviteDTO.self, forKey: .friendInvite)
    }
}

/// `POST /api/plans`'s answer: the PlanDetail and, for a private plan posted with people chosen, how each
/// invitation went (`invited`, `already_invited`, `already_in`, `unavailable`, `host`), or `invite_error` when
/// none could be sent. The plan is posted either way.
public struct PlanCreatedResponse: Decodable, Sendable {
    public let plan: PlanDetailDTO
    public let inviteResults: [PlanInviteResultDTO]
    public let inviteError: String?

    enum CodingKeys: String, CodingKey {
        case inviteResults = "invite_results"
        case inviteError = "invite_error"
    }

    public init(from decoder: any Decoder) throws {
        plan = try PlanDetailDTO(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        inviteResults = (try? container.decodeIfPresent(LossyList<PlanInviteResultDTO>.self, forKey: .inviteResults))?.items ?? []
        inviteError = try? container.decodeIfPresent(String.self, forKey: .inviteError)
    }
}

public extension PlanCardDTO {
    /// Only its host, the people invited and the people in or waiting can see it.
    var isPrivate: Bool {
        privatePart.audience == .invited
    }

    /// A private plan whose guests may each bring a friend.
    var guestsCanInvite: Bool {
        privatePart.guestsCanInvite
    }

    /// Where a private plan is, for the person invited (a public place only).
    var invitedPlace: PlanPlaceDTO? {
        privatePart.place
    }

    /// "Bring a friend" for this viewer, or nil.
    var friendInvite: PlanFriendInviteDTO? {
        privatePart.friendInvite
    }
}
