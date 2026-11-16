//
//  PlanInviteDTOs.swift
//  Pantopus
//
//  Plans invitations (founder decision, October 31): a host invites people
//  on Pantopus, by email, or with a one-person link they text. An
//  invitation is the host's yes: the person says "I'm in" with the ordinary
//  ask and is in, with no distance or approval step. An email invitation
//  opened by an account the address isn't verified for waits for the
//  host's yes (`needs_host_ok`).
//
//  Route: backend/routes/plans.js (the invitation routes), the service
//  backend/services/plans/planInvites.js.
//

import Foundation

// MARK: - Values

/// Where the viewer's invitation stands. `maybe` (Plans for the holidays H1) comes only with `guests=1`.
public enum PlanInviteStatus: String, Sendable, Hashable {
    case pending, accepted, declined, cancelled, maybe

    public init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PlanInviteStatus(rawValue: raw) ?? .pending
    }
}

extension PlanInviteStatus: Codable {}

/// How the host sent it. `open` (H1, with `guests=1`): a guest answered the plan's one link for everyone.
public enum PlanInviteChannel: String, Sendable, Hashable {
    case account, email, link
    /// Sent as `open`.
    case openLink = "open"

    public init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PlanInviteChannel(rawValue: raw) ?? .account
    }
}

extension PlanInviteChannel: Codable {}

/// One invitation as the host sees it.
public enum PlanInviteState: String, Sendable, Hashable {
    /// Not answered yet.
    case invited
    /// A text invite someone opened.
    case opened
    /// They said they're in.
    case isIn = "in"
    case waitlisted
    /// An email invitation opened by someone else (a forwarded email): waiting for the host's yes.
    case asked
    case cantMakeIt = "cant_make_it"
    /// They said yes, then left.
    case left
    /// H1, with `guests=1`: they said maybe.
    case maybe
    /// H1, with `guests=1`: a guest who answered "I'm in" from the open link, waiting for the host's yes.
    case waitingOk = "waiting_ok"

    public init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PlanInviteState(rawValue: raw) ?? .invited
    }
}

extension PlanInviteState: Codable {}

// MARK: - On a plan card

/// `PlanCard.my_invite`: the viewer's own invitation.
public struct PlanMyInviteDTO: Codable, Sendable, Hashable {
    public let id: String
    public let status: PlanInviteStatus
    public let channel: PlanInviteChannel
    /// The host says yes first (an email opened by an account it wasn't sent to).
    public let needsHostOk: Bool
    public let invitedAt: String?
    /// Plans for the holidays (contract 6.9, `guests=1`): how it came, `account`, `email`, `link` or `open` (the
    /// plan's one link for everyone, claimed in the app).
    public let via: String?

    enum CodingKeys: String, CodingKey {
        case id, status, channel, via
        case needsHostOk = "needs_host_ok"
        case invitedAt = "invited_at"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        status = try container.decodeIfPresent(PlanInviteStatus.self, forKey: .status) ?? .pending
        channel = try container.decodeIfPresent(PlanInviteChannel.self, forKey: .channel) ?? .account
        needsHostOk = try container.decodeIfPresent(Bool.self, forKey: .needsHostOk) ?? false
        invitedAt = try container.decodeIfPresent(String.self, forKey: .invitedAt)
        via = try? container.decodeIfPresent(String.self, forKey: .via)
    }

    /// Claimed from the plan's one link for everyone (contract 6.9).
    var cameByOpenLink: Bool {
        via == "open"
    }

    /// Not answered, "Can't make it" or "Maybe" (the person can still change their mind).
    var isOpen: Bool {
        status == .pending || status == .declined || status == .maybe
    }
}

/// `PlanCard.invites` (host only): whether they can invite now, and how it stands.
public struct PlanHostInvitesDTO: Codable, Sendable, Hashable {
    public let canInvite: Bool
    public let invited: Int
    public let saidYes: Int
    public let cantMakeIt: Int

    enum CodingKeys: String, CodingKey {
        case canInvite = "can_invite"
        case invited
        case saidYes = "said_yes"
        case cantMakeIt = "cant_make_it"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        canInvite = try container.decodeIfPresent(Bool.self, forKey: .canInvite) ?? false
        invited = try container.decodeIfPresent(Int.self, forKey: .invited) ?? 0
        saidYes = try container.decodeIfPresent(Int.self, forKey: .saidYes) ?? 0
        cantMakeIt = try container.decodeIfPresent(Int.self, forKey: .cantMakeIt) ?? 0
    }
}

// MARK: - The host's invitations

/// Someone named on an invitation or in the people list.
public struct PlanInvitePersonDTO: Decodable, Sendable, Hashable {
    public let userId: String
    public let displayName: String
    public let avatarUrl: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case displayName = "display_name"
        case avatarUrl = "avatar_url"
    }
}

/// One invitation in the host's list. An email invitation shows the address until the person says they're in.
public struct PlanInviteRowDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let channel: PlanInviteChannel
    public let state: PlanInviteState
    public let person: PlanInvitePersonDTO?
    public let email: String?
    /// The email couldn't be sent (the address said no to invitation emails, or it bounced).
    public let emailFailed: Bool
    /// For `asked`: the request to say yes or no to.
    public let requestId: String?
    public let canCancel: Bool
    public let invitedAt: String?
    /// H1 (`guests=1`): a guest without an account, by the name they typed, with their numbers.
    public let guest: PlanInviteGuestDTO?
    /// H1: a guest from the open link waiting for the host's yes (`POST …/invites/:id/ok`).
    public let canOk: Bool
    /// Contract 6.9: an account's numbers on a row with an ask (pending, waitlisted or in).
    public let party: PlanInvitePartyDTO?

    enum CodingKeys: String, CodingKey {
        case id, channel, state, person, email, guest, party
        case emailFailed = "email_failed"
        case requestId = "request_id"
        case canCancel = "can_cancel"
        case invitedAt = "invited_at"
        case canOk = "can_ok"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        channel = try container.decodeIfPresent(PlanInviteChannel.self, forKey: .channel) ?? .account
        state = try container.decodeIfPresent(PlanInviteState.self, forKey: .state) ?? .invited
        person = try? container.decodeIfPresent(PlanInvitePersonDTO.self, forKey: .person)
        email = try container.decodeIfPresent(String.self, forKey: .email)
        emailFailed = try container.decodeIfPresent(Bool.self, forKey: .emailFailed) ?? false
        requestId = try container.decodeIfPresent(String.self, forKey: .requestId)
        canCancel = try container.decodeIfPresent(Bool.self, forKey: .canCancel) ?? false
        invitedAt = try container.decodeIfPresent(String.self, forKey: .invitedAt)
        guest = try? container.decodeIfPresent(PlanInviteGuestDTO.self, forKey: .guest)
        canOk = (try? container.decodeIfPresent(Bool.self, forKey: .canOk)) ?? false
        party = try? container.decodeIfPresent(PlanInvitePartyDTO.self, forKey: .party)
    }

    /// A person with an account who came by the plan's one link (contract 6.9, `via: open`).
    var isAccountFromOpenLink: Bool {
        channel == .openLink && person != nil
    }

    /// The name, the address, or "Text invite".
    var title: String {
        person?.displayName ?? guest?.name ?? email ?? "Text invite"
    }
}

/// How the host's invitations stand.
public struct PlanInviteCountsDTO: Decodable, Sendable, Hashable {
    public let invited: Int
    public let isIn: Int
    public let waitlisted: Int
    public let cantMakeIt: Int
    /// H1 (`guests=1`): rows that said maybe, guests waiting for the host's yes, and invitations nobody answered.
    public let maybe: Int
    public let waitingOk: Int
    public let noAnswer: Int

    enum CodingKeys: String, CodingKey {
        case invited, waitlisted, maybe
        case isIn = "in"
        case cantMakeIt = "cant_make_it"
        case waitingOk = "waiting_ok"
        case noAnswer = "no_answer"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        invited = try container.decodeIfPresent(Int.self, forKey: .invited) ?? 0
        isIn = try container.decodeIfPresent(Int.self, forKey: .isIn) ?? 0
        waitlisted = try container.decodeIfPresent(Int.self, forKey: .waitlisted) ?? 0
        cantMakeIt = try container.decodeIfPresent(Int.self, forKey: .cantMakeIt) ?? 0
        maybe = (try? container.decodeIfPresent(Int.self, forKey: .maybe)) ?? 0
        waitingOk = (try? container.decodeIfPresent(Int.self, forKey: .waitingOk)) ?? 0
        noAnswer = (try? container.decodeIfPresent(Int.self, forKey: .noAnswer)) ?? 0
    }
}

/// What happened to one person or address in `POST /invites`.
public struct PlanInviteResultDTO: Decodable, Sendable, Hashable {
    public let userId: String?
    public let email: String?
    /// invited, already_invited, already_in, unavailable, host.
    public let outcome: String

    enum CodingKeys: String, CodingKey {
        case email, outcome
        case userId = "user_id"
    }
}

/// `GET /api/plans/:id/invites`, and the answer to inviting or taking one back.
public struct PlanInviteListDTO: Decodable, Sendable, Hashable {
    public let invites: [PlanInviteRowDTO]
    /// Text invites nobody has opened yet (not listed one by one).
    public let unopenedLinks: Int
    public let counts: PlanInviteCountsDTO?
    public let emailsLeft: Int?
    public let canInvite: Bool
    /// Only after inviting.
    public let results: [PlanInviteResultDTO]
    /// H1 (`guests=1`): adults and kids in, the open link, and who a reminder would reach.
    public let headcount: PlanHeadcountDTO?
    public let openLink: PlanOpenLinkDTO?
    public let remind: PlanRemindStateDTO?

    enum CodingKeys: String, CodingKey {
        case invites, counts, results, headcount, remind
        case unopenedLinks = "unopened_links"
        case emailsLeft = "emails_left"
        case canInvite = "can_invite"
        case openLink = "open_link"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        invites = try container.decodeIfPresent(LossyList<PlanInviteRowDTO>.self, forKey: .invites)?.items ?? []
        unopenedLinks = try container.decodeIfPresent(Int.self, forKey: .unopenedLinks) ?? 0
        counts = try? container.decodeIfPresent(PlanInviteCountsDTO.self, forKey: .counts)
        emailsLeft = try container.decodeIfPresent(Int.self, forKey: .emailsLeft)
        canInvite = try container.decodeIfPresent(Bool.self, forKey: .canInvite) ?? true
        results = (try? container.decodeIfPresent([PlanInviteResultDTO].self, forKey: .results)) ?? []
        headcount = try? container.decodeIfPresent(PlanHeadcountDTO.self, forKey: .headcount)
        openLink = try? container.decodeIfPresent(PlanOpenLinkDTO.self, forKey: .openLink)
        remind = try? container.decodeIfPresent(PlanRemindStateDTO.self, forKey: .remind)
    }
}

/// Someone the host can invite: a connection, or someone who came to their plans.
public struct PlanInviteCandidateDTO: Decodable, Sendable, Hashable, Identifiable {
    public let userId: String
    public let displayName: String
    public let avatarUrl: String?
    /// connection, came_before, both.
    public let reason: String?
    /// in, asked, invited, or nil while they can be invited.
    public let state: String?

    public var id: String {
        userId
    }

    enum CodingKeys: String, CodingKey {
        case reason, state
        case userId = "user_id"
        case displayName = "display_name"
        case avatarUrl = "avatar_url"
    }
}

/// `GET /api/plans/:id/invites/people`.
public struct PlanInvitePeopleResponse: Decodable, Sendable, Hashable {
    public let people: [PlanInviteCandidateDTO]

    enum CodingKeys: String, CodingKey {
        case people
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        people = try container.decodeIfPresent(LossyList<PlanInviteCandidateDTO>.self, forKey: .people)?.items ?? []
    }
}

// MARK: - Bodies and answers

/// `POST /api/plans/:id/invites`.
public struct PlanInviteBody: Encodable, Sendable {
    public let userIds: [String]
    public let emails: [String]
    /// At a home, the host agreed that people who say they're in see the address.
    public let confirmSharesAddress: Bool?

    enum CodingKeys: String, CodingKey {
        case emails
        case userIds = "user_ids"
        case confirmSharesAddress = "confirm_shares_address"
    }

    public init(userIds: [String], emails: [String], confirmSharesAddress: Bool?) {
        self.userIds = userIds
        self.emails = emails
        self.confirmSharesAddress = confirmSharesAddress
    }
}

/// `POST /api/plans/:id/invites/link`.
public struct PlanInviteLinkBody: Encodable, Sendable {
    public let confirmSharesAddress: Bool?

    enum CodingKeys: String, CodingKey {
        case confirmSharesAddress = "confirm_shares_address"
    }

    public init(confirmSharesAddress: Bool?) {
        self.confirmSharesAddress = confirmSharesAddress
    }
}

/// A one-person link and the words to send with it, in the host's voice.
public struct PlanInviteLinkResponse: Decodable, Sendable, Hashable {
    public let inviteId: String
    public let url: String
    public let message: String

    enum CodingKeys: String, CodingKey {
        case url, message
        case inviteId = "invite_id"
    }
}

/// `POST /api/plans/:id/invites/claim`.
public struct PlanInviteClaimBody: Encodable, Sendable {
    public let token: String

    public init(token: String) {
        self.token = token
    }
}

/// `party` on a host's row: an account's adults and kids (kids only with kids welcome).
public struct PlanInvitePartyDTO: Decodable, Sendable, Hashable {
    public let adults: Int
    public let kids: Int

    enum CodingKeys: String, CodingKey {
        case adults, kids
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        adults = (try? container.decodeIfPresent(Int.self, forKey: .adults)) ?? 1
        kids = (try? container.decodeIfPresent(Int.self, forKey: .kids)) ?? 0
    }
}

/// `POST /api/plans/:id/invites/claim` with the plan's one link for everyone (contract 6.9).
public struct PlanOpenLinkClaimBody: Encodable, Sendable {
    public let open: String

    public init(open: String) {
        self.open = open
    }
}

/// The plan, as the person sees it now (claiming or declining an invitation).
public struct PlanInvitePlanResponse: Decodable, Sendable {
    public let plan: PlanDetailDTO
}

/// `GET /api/plans/invites/next`: the newest invitation the person hasn't opened.
public struct PlanNextInviteResponse: Decodable, Sendable {
    public let planId: String?

    enum CodingKeys: String, CodingKey {
        case planId = "plan_id"
    }
}
