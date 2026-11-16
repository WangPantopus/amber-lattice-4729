//
//  PlanBringDTOs.swift
//  Pantopus
//
//  Plans for the holidays, step H2 (contract section 7): the bring list. The
//  host lists what's needed; people who are in (and guests in a browser) pick
//  what they'll bring. Behind `plans_bring_list`, read for the host. The card
//  carries `bring` to the host and people who are in; no list, no key.
//
//  Route: backend/routes/plans.js (`/:id/bring…`), services/plans/planBring.js.
//

import Foundation

/// Who is bringing an item, as the app sees it: a first name, and whether it's this person.
public struct PlanBringClaimDTO: Decodable, Sendable, Hashable {
    public let name: String
    public let mine: Bool

    enum CodingKeys: String, CodingKey {
        case name, mine
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = (try? container.decodeIfPresent(String.self, forKey: .name)) ?? ""
        mine = (try? container.decodeIfPresent(Bool.self, forKey: .mine)) ?? false
    }
}

public struct PlanBringItemDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let label: String
    public let note: String?
    public let claim: PlanBringClaimDTO?

    enum CodingKeys: String, CodingKey {
        case id, label, note, claim
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        label = try container.decode(String.self, forKey: .label)
        let rawNote = try? container.decodeIfPresent(String.self, forKey: .note)
        note = rawNote.flatMap { $0.isEmpty ? nil : $0 }
        claim = try? container.decodeIfPresent(PlanBringClaimDTO.self, forKey: .claim)
    }
}

/// `bring` on a card: the list, its revision, whether guests may add, and how many are still open.
public struct PlanBringDTO: Decodable, Sendable, Hashable {
    public let rev: Int
    public let guestsCanAdd: Bool
    public let openCount: Int
    public let items: [PlanBringItemDTO]

    enum CodingKeys: String, CodingKey {
        case rev, items
        case guestsCanAdd = "guests_can_add"
        case openCount = "open_count"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        rev = (try? container.decodeIfPresent(Int.self, forKey: .rev)) ?? 0
        guestsCanAdd = (try? container.decodeIfPresent(Bool.self, forKey: .guestsCanAdd)) ?? false
        items = (try? container.decodeIfPresent(LossyList<PlanBringItemDTO>.self, forKey: .items))?.items ?? []
        openCount = (try? container.decodeIfPresent(Int.self, forKey: .openCount)) ?? items.filter { $0.claim == nil }.count
    }

    public var takenCount: Int {
        items.count - items.filter { $0.claim == nil }.count
    }
}

/// The answer of every bring-list route: `{ bring }` (nil once the list is empty).
public struct PlanBringResponse: Decodable, Sendable {
    public let bring: PlanBringDTO?
}

/// `409 taken`: someone got there first. The server's sentence, their name and the list as it is now.
public struct PlanBringTakenDTO: Decodable, Sendable {
    public let message: String?
    public let claimName: String?
    public let bring: PlanBringDTO?

    enum CodingKeys: String, CodingKey {
        case message, bring
        case claimName = "claim_name"
    }
}

/// One item as the host sends it: `id` for one kept (its claim stays), `mine` to claim or give it back.
public struct PlanBringItemBody: Encodable, Sendable, Hashable {
    public let id: String?
    public let label: String
    public let note: String?
    public let mine: Bool?

    public init(id: String?, label: String, note: String?, mine: Bool?) {
        self.id = id
        self.label = label
        self.note = note
        self.mine = mine
    }
}

/// `PUT /api/plans/:id/bring`, and `bring` on `POST /api/plans`.
public struct PlanBringBody: Encodable, Sendable, Hashable {
    public let items: [PlanBringItemBody]
    public let guestsCanAdd: Bool

    enum CodingKeys: String, CodingKey {
        case items
        case guestsCanAdd = "guests_can_add"
    }

    public init(items: [PlanBringItemBody], guestsCanAdd: Bool) {
        self.items = items
        self.guestsCanAdd = guestsCanAdd
    }
}

/// `POST /api/plans/:id/bring/items`: one thing someone in will bring.
public struct PlanBringAddBody: Encodable, Sendable {
    public let label: String
    public let note: String?

    public init(label: String, note: String? = nil) {
        self.label = label
        self.note = note
    }
}

public extension PlanCardDTO {
    /// The bring list, for the host and people who are in; nil when there is none.
    var bring: PlanBringDTO? {
        guestsPart.bring
    }
}
