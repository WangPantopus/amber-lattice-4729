//
//  PlanGuestDTOs.swift
//  Pantopus
//
//  Plans for the holidays, step H1 (founder approval 2026-11-15; contract
//  docs/product/plans-holidays/03-build-contract.md, sections 5 and 6): a
//  private plan with room for up to 100, guests who say how many adults and
//  kids, and the host's counts. Behind `plans_guest_answers`, read for the
//  host. Every key here is new and read only with `guests=1`: an older server
//  sends none of them, and a plan reads as it always did.
//
//  Route: backend/routes/plans.js and backend/services/plans/planService.js.
//

import Foundation

/// `headcount`: the people coming, as adults and kids (contract 6.5). For the
/// host and the people who are in.
public struct PlanHeadcountDTO: Decodable, Sendable, Hashable {
    public let adults: Int
    public let kids: Int

    public var total: Int {
        adults + kids
    }

    enum CodingKeys: String, CodingKey {
        case adults, kids
    }

    public init(adults: Int, kids: Int) {
        self.adults = adults
        self.kids = kids
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        adults = (try? container.decodeIfPresent(Int.self, forKey: .adults)) ?? 0
        kids = (try? container.decodeIfPresent(Int.self, forKey: .kids)) ?? 0
    }
}

/// `answers`: for the host only, how many people said they're in, maybe, or
/// haven't answered yet, counted in people (contract 6.5).
public struct PlanAnswerCountsDTO: Decodable, Sendable, Hashable {
    public let inCount: Int
    public let maybe: Int
    public let noAnswer: Int

    enum CodingKeys: String, CodingKey {
        case maybe
        case inCount = "in"
        case noAnswer = "no_answer"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        inCount = (try? container.decodeIfPresent(Int.self, forKey: .inCount)) ?? 0
        maybe = (try? container.decodeIfPresent(Int.self, forKey: .maybe)) ?? 0
        noAnswer = (try? container.decodeIfPresent(Int.self, forKey: .noAnswer)) ?? 0
    }
}

/// The H1 keys of a plan card, decoded from the card's own keys.
public struct PlanCardGuestsPart: Decodable, Sendable, Hashable {
    /// The server sent H1's keys: the host has `plans_guest_answers` and this build said `guests=1`.
    public let isOn: Bool
    /// Guests say how many adults and how many kids.
    public let kidsWelcome: Bool
    public let headcount: PlanHeadcountDTO?
    public let answers: PlanAnswerCountsDTO?

    /// What every card from a server before H1 is.
    static let none = PlanCardGuestsPart(isOn: false, kidsWelcome: false, headcount: nil, answers: nil)

    enum CodingKeys: String, CodingKey {
        case headcount, answers
        case kidsWelcome = "kids_welcome"
    }

    init(isOn: Bool, kidsWelcome: Bool, headcount: PlanHeadcountDTO?, answers: PlanAnswerCountsDTO?) {
        self.isOn = isOn
        self.kidsWelcome = kidsWelcome
        self.headcount = headcount
        self.answers = answers
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        isOn = container.contains(.kidsWelcome)
        kidsWelcome = (try? container.decodeIfPresent(Bool.self, forKey: .kidsWelcome)) ?? false
        headcount = try? container.decodeIfPresent(PlanHeadcountDTO.self, forKey: .headcount)
        answers = try? container.decodeIfPresent(PlanAnswerCountsDTO.self, forKey: .answers)
    }
}

public extension PlanCardDTO {
    /// The plan takes H1's answers (adults and kids, Maybe, the open link): its host has the switch.
    var takesGuestAnswers: Bool {
        guestsPart.isOn && !isBusiness && kind != .playdate
    }

    /// Guests say how many adults and kids come.
    var kidsWelcome: Bool {
        guestsPart.kidsWelcome
    }

    /// The people coming as adults and kids, for the host and people who are in.
    var headcount: PlanHeadcountDTO? {
        guestsPart.headcount
    }

    /// The host's counts: in, maybe, haven't answered.
    var answerCounts: PlanAnswerCountsDTO? {
        guestsPart.answers
    }
}

// MARK: - The host's invitation list (`guests=1`)

/// `guest` on a row of the host's list: a guest without an account, never their email.
public struct PlanInviteGuestDTO: Decodable, Sendable, Hashable {
    public let name: String
    public let adults: Int
    public let kids: Int

    enum CodingKeys: String, CodingKey {
        case name, adults, kids
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        adults = (try? container.decodeIfPresent(Int.self, forKey: .adults)) ?? 1
        kids = (try? container.decodeIfPresent(Int.self, forKey: .kids)) ?? 0
    }
}

/// `open_link`: the plan's one link for everyone (contract 6.4).
public struct PlanOpenLinkDTO: Decodable, Sendable, Hashable {
    public let isOn: Bool
    public let url: String?
    public let hostSaysYesFirst: Bool

    enum CodingKeys: String, CodingKey {
        case url
        case isOn = "on"
        case hostSaysYesFirst = "host_says_yes_first"
    }

    public init(isOn: Bool, url: String?, hostSaysYesFirst: Bool) {
        self.isOn = isOn
        self.url = url
        self.hostSaysYesFirst = hostSaysYesFirst
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        isOn = (try? container.decodeIfPresent(Bool.self, forKey: .isOn)) ?? false
        url = try? container.decodeIfPresent(String.self, forKey: .url)
        hostSaysYesFirst = (try? container.decodeIfPresent(Bool.self, forKey: .hostSaysYesFirst)) ?? false
    }
}

/// `remind`: how many a reminder would reach, unopened text invitations, and whether the host reminded today.
public struct PlanRemindStateDTO: Decodable, Sendable, Hashable {
    public let count: Int
    public let unopenedLinks: Int
    public let remindedToday: Bool

    enum CodingKeys: String, CodingKey {
        case count
        case unopenedLinks = "unopened_links"
        case remindedToday = "reminded_today"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        count = (try? container.decodeIfPresent(Int.self, forKey: .count)) ?? 0
        unopenedLinks = (try? container.decodeIfPresent(Int.self, forKey: .unopenedLinks)) ?? 0
        remindedToday = (try? container.decodeIfPresent(Bool.self, forKey: .remindedToday)) ?? false
    }
}

/// `POST /api/plans/:id/invites/open-link`.
public struct PlanOpenLinkBody: Encodable, Sendable {
    public let hostSaysYesFirst: Bool?
    public let rotate: Bool?
    public let confirmSharesAddress: Bool?

    enum CodingKeys: String, CodingKey {
        case rotate
        case hostSaysYesFirst = "host_says_yes_first"
        case confirmSharesAddress = "confirm_shares_address"
    }

    public init(hostSaysYesFirst: Bool?, rotate: Bool? = nil, confirmSharesAddress: Bool?) {
        self.hostSaysYesFirst = hostSaysYesFirst
        self.rotate = rotate
        self.confirmSharesAddress = confirmSharesAddress
    }
}

/// The open link and the words to share it with, in the host's voice.
public struct PlanOpenLinkResponse: Decodable, Sendable, Hashable {
    public let url: String
    public let message: String
    public let hostSaysYesFirst: Bool

    enum CodingKeys: String, CodingKey {
        case url, message
        case hostSaysYesFirst = "host_says_yes_first"
    }
}

/// `POST /api/plans/:id/invites/remind`.
public struct PlanRemindResponse: Decodable, Sendable, Hashable {
    public let reminded: Int
    public let skipped: Int
}

/// "2 adults, 1 kid"; "1 adult" with no kids. Kids are named only where there are some.
enum PlanHeadcountCopy {
    static func adultsAndKids(adults: Int, kids: Int) -> String {
        let grown = "\(adults) adult\(adults == 1 ? "" : "s")"
        guard kids > 0 else { return grown }
        return "\(grown), \(kids) kid\(kids == 1 ? "" : "s")"
    }

    static func adultsAndKids(_ headcount: PlanHeadcountDTO) -> String {
        adultsAndKids(adults: headcount.adults, kids: headcount.kids)
    }
}
