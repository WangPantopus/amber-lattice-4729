//
//  PlanComposerPrivate.swift
//  Pantopus
//
//  Plans step 1, private plans: the host's draft of who can see the plan
//  ("Who can see this", board Details), "Guests can bring a friend", and the
//  people chosen in the preview's "Invite" list (board Preview). A private
//  plan has no 3-mile rule and may start up to 60 days ahead; the people
//  invited get in right away, so "How people get in" doesn't apply. The server
//  decides everything again (planService.js).
//

import Foundation
import Observation

@Observable
@MainActor
final class PlanPrivateDraft {
    enum PeoplePhase: Equatable {
        case idle
        case loading
        case loaded
        case error(String)
    }

    /// "Anyone nearby" or "Only people I invite".
    var audience: PlanAudience = .nearby
    /// "Guests can bring a friend": each person invited may invite one more.
    var guestsCanInvite = false
    /// Plans for the holidays H1 ("Add to this plan"): guests say how many adults and kids.
    var kidsWelcome = false
    /// The host's people (connections, people who came to their plans), for the preview's "Invite" list.
    private(set) var people: [PlanInviteCandidateDTO] = []
    private(set) var peoplePhase = PeoplePhase.idle
    /// The people chosen, in the order chosen.
    private(set) var chosen: [String] = []
    /// "Text a link" or "Email" in the preview: the invite sheet opens once the plan is posted.
    var opensInviteSheet = false
    /// The plan posted but some or all invitations didn't go: the posted screen says so.
    private(set) var inviteProblem: String?

    var isPrivate: Bool {
        audience == .invited
    }

    func isChosen(_ person: PlanInviteCandidateDTO) -> Bool {
        chosen.contains(person.userId)
    }

    func toggle(_ person: PlanInviteCandidateDTO) {
        if let index = chosen.firstIndex(of: person.userId) {
            chosen.remove(at: index)
        } else if chosen.count < Self.inviteLimit {
            chosen.append(person.userId)
        }
    }

    /// Up to 30 people go with the plan as it is posted (the server's limit).
    static let inviteLimit = 30

    /// `GET /api/plans/invites/people`: the people the host can invite before the plan exists.
    func loadPeople(api: APIClient = .shared) async {
        guard peoplePhase != .loading else { return }
        peoplePhase = .loading
        do {
            let found: PlanInvitePeopleResponse = try await api.request(PlansEndpoints.peopleToInvite())
            people = found.people
            // Someone who can't be invited any more drops out of the chosen.
            chosen.removeAll { id in !found.people.contains { $0.userId == id } }
            peoplePhase = .loaded
        } catch is CancellationError {
            peoplePhase = .idle
        } catch {
            peoplePhase = .error(PlanErrors.sentence(for: error))
        }
    }

    /// How the invitations sent with the plan went: the server's sentence when none could be sent, or how
    /// many people couldn't be invited.
    func noteInvites(_ reply: PlanCreatedResponse) {
        if let error = reply.inviteError?.trimmingCharacters(in: .whitespacesAndNewlines), !error.isEmpty {
            inviteProblem = error
            return
        }
        let missed = reply.inviteResults.filter { $0.outcome == "unavailable" }.count
        let people = missed == 1 ? "1 person" : "\(missed) people"
        inviteProblem = missed == 0 ? nil : "Couldn't invite \(people). You can invite people from the plan."
    }

    /// The private keys of `POST /api/plans`; `kids_welcome` only where the host has `plans_guest_answers`.
    func apply(to body: inout CreatePlanBody, guestAnswers: Bool) {
        body.audience = .invited
        body.guestsCanInvite = guestsCanInvite
        body.inviteUserIds = chosen.isEmpty ? nil : chosen
        if guestAnswers { body.kidsWelcome = kidsWelcome }
    }

    /// "Host again": who the plan was for, "Bring a friend" and "Kids welcome", as the plan had them.
    func restore(from card: PlanCardDTO) {
        audience = card.isPrivate && PlansFlags.shared.privatePlans ? .invited : .nearby
        guestsCanInvite = card.guestsCanInvite
        kidsWelcome = card.kidsWelcome
    }
}

extension PlanComposerModel {
    /// The host may post a private plan (the switch is on, and it's their own plan, never a business's).
    var offersPrivate: Bool {
        PlansFlags.shared.privatePlans && !isBusiness
    }

    /// A private plan is being drafted.
    var isPrivate: Bool {
        privacy.isPrivate && !isBusiness
    }

    /// Plans for the holidays H1 (board 3): a private plan, with `plans_guest_answers` on for the host, has
    /// "Room for" up to 100 and the "Add to this plan" card. A playdate (one seat a family) and a pickup game
    /// (players needed) keep their own rows.
    var offersGuestAnswers: Bool {
        PlansFlags.shared.guestAnswers && isPrivate && kind != .playdate && kind != .pickupGame
    }

    /// The most the spots stepper goes to: 100 for a private plan with guest answers, otherwise 30.
    var spotsLimit: Int {
        offersGuestAnswers ? 100 : 30
    }

    /// How far ahead the plan may start: a business by its limits, a private plan 60 days, otherwise 14.
    var daysAhead: Int {
        if let business = hostAs { return business.limits.daysAhead }
        return isPrivate ? 60 : 14
    }

    /// The refusal under the form when the start is too far ahead (the server's words).
    var tooFarAheadProblem: String {
        isPrivate ? "Private plans can start up to 60 days ahead." : "Plans can start up to 14 days from now."
    }
}
