//
//  PlanWhosComingModel.swift
//  Pantopus
//
//  Plans for the holidays, board 17: what "Who's coming" shows and does. The
//  host's invitation list (`GET /api/plans/:id/invites` with `guests=1`) in
//  sections, with each account's adults and kids from the plan's people, and
//  the actions: Let in, Not this time / Remove, Remind. The server decides
//  everything again (planInvites.js, planGuests.js).
//

import Foundation
import Observation

/// One person or invitation in "Who's coming".
struct PlanWhoRow: Identifiable, Hashable {
    enum Leading: Hashable {
        case person(name: String, avatarUrl: String?)
        case email
        case text
    }

    let id: String
    let name: String
    let line: String
    let leading: Leading
    /// The invitation to let in, or to remove (`DELETE …/invites/:id`).
    let inviteId: String?
    /// An account who is in: removed with the shipped request removal.
    let requestId: String?
    /// A guest from the open link waiting for the host's yes.
    let canLetIn: Bool
    let canRemove: Bool
    /// An email invitation someone else opened: the shipped Requests screen answers it.
    let opensRequests: Bool
    /// A person with an account from the plan's one link waiting for the yes (contract 6.9): "Let in" accepts their
    /// ask and "Not this time" declines it, as the shipped Requests screen does.
    var answersAsk = false
}

struct PlanWhoSection: Identifiable, Hashable {
    let id: String
    let title: String
    let rows: [PlanWhoRow]
}

@Observable
@MainActor
final class PlanWhosComingModel {
    enum Phase: Equatable {
        case loading
        case loaded
        case error(String)
    }

    let planId: String
    private(set) var plan: PlanDetailDTO?
    private(set) var list: PlanInviteListDTO?
    private(set) var phase = Phase.loading
    private(set) var working: Set<String> = []
    var error: String?
    var toast: String?
    /// "Remove {name}? They'll be told once."
    var confirmRemove: PlanWhoRow?
    private let api: APIClient

    init(planId: String, api: APIClient = .shared) {
        self.planId = planId
        self.api = api
    }

    var card: PlanCardDTO? {
        plan?.card
    }

    func load() async {
        do {
            async let detail = PlansStoreReads.detail(id: planId)
            async let invites: PlanInviteListDTO = api.request(PlansEndpoints.invites(planId: planId))
            let (loadedPlan, loadedList) = try await (detail, invites)
            plan = loadedPlan
            list = loadedList
            phase = .loaded
        } catch is CancellationError {
            return
        } catch {
            if list == nil { phase = .error(PlanErrors.sentence(for: error)) }
        }
    }

    // MARK: - Actions

    /// The plan is at the host's home: the first yes there shares the address, so it asks once (as Requests does).
    var isAtHome: Bool {
        card?.placeKind == .home
    }

    /// "Let in" for a person with an account from the link: the shipped accept of their ask.
    func acceptAsk(_ row: PlanWhoRow) async {
        guard let requestId = row.requestId else { return }
        await act(row.id) {
            _ = try await api.request(
                PlansEndpoints.accept(planId: planId, requestId: requestId, confirmSharesAddress: isAtHome ? true : nil),
                as: EmptyResponse.self
            )
        }
        if error == nil { toast = "\(PlanCardLines.firstName(row.name)) is in." }
    }

    /// "Not this time" for a person with an account from the link: the shipped decline of their ask.
    func declineAsk(_ row: PlanWhoRow) async {
        guard let requestId = row.requestId else { return }
        await act(row.id) {
            _ = try await api.request(PlansEndpoints.decline(planId: planId, requestId: requestId), as: EmptyResponse.self)
        }
        if error == nil { toast = "Declined. They won't see who said no." }
    }

    func letIn(_ row: PlanWhoRow) async {
        guard let inviteId = row.inviteId else { return }
        await act(row.id) {
            list = try await api.request(PlansEndpoints.letIn(planId: planId, inviteId: inviteId))
        }
        if error == nil { toast = "\(PlanCardLines.firstName(row.name)) is in." }
    }

    func remove(_ row: PlanWhoRow) async {
        await act(row.id) {
            if let requestId = row.requestId {
                _ = try await api.request(PlansEndpoints.remove(planId: planId, requestId: requestId), as: EmptyResponse.self)
            } else if let inviteId = row.inviteId {
                list = try await api.request(PlansEndpoints.cancelInvite(planId: planId, inviteId: inviteId))
            }
        }
        if error == nil { toast = "Removed." }
    }

    func remind() async {
        var reminded = 0
        await act("remind") {
            let reply: PlanRemindResponse = try await api.request(PlansEndpoints.remind(planId: planId))
            reminded = reply.reminded
        }
        if error == nil { toast = "Reminded \(reminded == 1 ? "1 person" : "\(reminded) people")." }
    }

    private func act(_ key: String, _ work: () async throws -> Void) async {
        working.insert(key)
        error = nil
        defer { working.remove(key) }
        do {
            try await work()
            PlansStoreReads.changed(planId: planId)
            await load()
        } catch {
            if case let APIError.clientError(_, body) = error, PlanErrors.code(in: body) == "not_waiting" {
                self.error = "They're no longer waiting."
            } else {
                self.error = PlanErrors.sentence(for: error)
            }
            await load()
        }
    }

    // MARK: - Sections

    var kidsWelcome: Bool {
        card?.kidsWelcome == true
    }

    /// Waiting for you, Coming, Maybe, Haven't answered, Can't make it; an empty section isn't drawn.
    var sections: [PlanWhoSection] {
        let rows = list?.invites ?? []
        var waiting: [PlanWhoRow] = []
        var coming: [PlanWhoRow] = []
        var maybe: [PlanWhoRow] = []
        var notYet: [PlanWhoRow] = []
        var cant: [PlanWhoRow] = []
        for invite in rows {
            switch invite.state {
            case .waitingOk, .asked: waiting.append(row(invite))
            case .isIn, .waitlisted: coming.append(row(invite))
            case .maybe: maybe.append(row(invite))
            case .invited, .opened: notYet.append(row(invite))
            case .cantMakeIt, .left: cant.append(row(invite))
            }
        }
        if let unopened = list?.unopenedLinks, unopened > 0 {
            notYet.append(PlanWhoRow(
                id: "unopened",
                name: unopened == 1 ? "A text invite" : "\(unopened) text invites",
                line: "Not opened yet",
                leading: .text,
                inviteId: nil,
                requestId: nil,
                canLetIn: false,
                canRemove: false,
                opensRequests: false
            ))
        }
        return [
            PlanWhoSection(id: "waiting", title: "Waiting for you", rows: waiting),
            PlanWhoSection(id: "coming", title: "Coming", rows: coming),
            PlanWhoSection(id: "maybe", title: "Maybe", rows: maybe),
            PlanWhoSection(id: "notYet", title: "Haven't answered", rows: notYet),
            PlanWhoSection(id: "cant", title: "Can't make it", rows: cant)
        ].filter { !$0.rows.isEmpty }
    }

    private func row(_ invite: PlanInviteRowDTO) -> PlanWhoRow {
        let person = invite.person.flatMap { who in plan?.people?.first { $0.userId == who.userId } }
        let name = invite.title
        let leading: PlanWhoRow.Leading = if let account = invite.person {
            .person(name: account.displayName, avatarUrl: account.avatarUrl)
        } else if let guest = invite.guest {
            .person(name: guest.name, avatarUrl: nil)
        } else {
            invite.channel == .email ? .email : .text
        }
        // A person with an account from the plan's one link, waiting for the yes (contract 6.9): their ask is answered here.
        let linkAsk = invite.isAccountFromOpenLink && invite.state == .asked && invite.requestId != nil
        return PlanWhoRow(
            id: invite.id,
            name: name,
            line: line(invite, person: person),
            leading: leading,
            inviteId: invite.id,
            requestId: linkAsk ? invite.requestId : invite.state == .isIn || invite.state == .waitlisted ? person?.requestId : nil,
            canLetIn: invite.canOk || linkAsk,
            canRemove: invite.canCancel || (invite.state == .isIn && person?.requestId != nil),
            opensRequests: invite.state == .asked && !linkAsk,
            answersAsk: linkAsk
        )
    }

    /// The line under a name: the numbers and how they answered, or where an invitation stands.
    private func line(_ invite: PlanInviteRowDTO, person: PlanPersonDTO?) -> String {
        if let guest = invite.guest, let line = guestLine(guest, state: invite.state) { return line }
        return accountLine(invite, person: person)
    }

    /// A guest without an account: "2 adults, 1 kid · answered from your link" / "· answered in a browser".
    private func guestLine(_ guest: PlanInviteGuestDTO, state: PlanInviteState) -> String? {
        let numbers = PlanHeadcountCopy.people(adults: guest.adults, kids: guest.kids, kidsWelcome: kidsWelcome)
        switch state {
        case .waitingOk: return "\(numbers) · answered from your link"
        case .isIn, .maybe: return "\(numbers) · answered in a browser"
        default: return nil
        }
    }

    private func accountLine(_ invite: PlanInviteRowDTO, person: PlanPersonDTO?) -> String {
        if invite.isAccountFromOpenLink, let line = openLinkLine(invite) { return line }
        switch invite.state {
        case .isIn:
            let adults = invite.party?.adults ?? person?.partySize ?? 1
            let kids = invite.party?.kids ?? person?.kidsCount ?? 0
            return PlanHeadcountCopy.people(adults: adults, kids: kidsWelcome ? kids : 0, kidsWelcome: kidsWelcome)
        case .maybe:
            return PlanHeadcountCopy.people(adults: 1, kids: 0, kidsWelcome: kidsWelcome)
        case .waitlisted: return "On the waitlist"
        case .asked: return "Opened your email invitation from another address"
        case .invited:
            if invite.emailFailed { return "Couldn't email this address" }
            return invite.channel == .email ? "Invited by email" : "Invited on Pantopus"
        case .opened: return "Opened your text invite"
        case .cantMakeIt: return "Can't make it"
        case .left: return "Said yes, then left"
        case .waitingOk: return "Waiting for your yes"
        }
    }

    /// A person with an account from the plan's one link (A5's added paragraph): waiting, "{2 adults} · on Pantopus ·
    /// from your link"; not answered, "Opened your link". In, the ordinary row.
    private func openLinkLine(_ invite: PlanInviteRowDTO) -> String? {
        switch invite.state {
        case .asked:
            let party = invite.party
            let kids = kidsWelcome ? party?.kids ?? 0 : 0
            let numbers = PlanHeadcountCopy.people(adults: party?.adults ?? 1, kids: kids, kidsWelcome: kidsWelcome)
            return "\(numbers) · on Pantopus · from your link"
        case .opened, .invited: return "Opened your link"
        default: return nil
        }
    }

    /// The footer: "Remind {n} people", or "Reminded today"; nil when nobody can be reminded.
    var remindTitle: String? {
        guard let remind = list?.remind else { return nil }
        if remind.remindedToday { return "Reminded today" }
        guard remind.count >= 1 else { return nil }
        return remind.count == 1 ? "Remind 1 person" : "Remind \(remind.count) people"
    }
}
