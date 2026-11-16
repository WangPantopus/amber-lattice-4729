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
    /// Guests say how many adults and how many kids.
    public let kidsWelcome: Bool
    public let headcount: PlanHeadcountDTO?
    public let answers: PlanAnswerCountsDTO?

    /// What every card from a server before H1 is.
    static let none = PlanCardGuestsPart(kidsWelcome: false, headcount: nil, answers: nil)

    enum CodingKeys: String, CodingKey {
        case headcount, answers
        case kidsWelcome = "kids_welcome"
    }

    init(kidsWelcome: Bool, headcount: PlanHeadcountDTO?, answers: PlanAnswerCountsDTO?) {
        self.kidsWelcome = kidsWelcome
        self.headcount = headcount
        self.answers = answers
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kidsWelcome = (try? container.decodeIfPresent(Bool.self, forKey: .kidsWelcome)) ?? false
        headcount = try? container.decodeIfPresent(PlanHeadcountDTO.self, forKey: .headcount)
        answers = try? container.decodeIfPresent(PlanAnswerCountsDTO.self, forKey: .answers)
    }
}

public extension PlanCardDTO {
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
