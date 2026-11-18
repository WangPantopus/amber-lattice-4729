//
//  PlanGuestAnswers.swift
//  Pantopus
//
//  Plans for the holidays, H1, on a plan's screen: the host's invitation list
//  for "Remind" (board 4's footer), "Remind" itself, and an invited person's
//  "Maybe" (board 18). The routes are planGuests.js's; the server decides.
//

import Foundation

extension PlanScreenViewModel {
    /// `GET /api/plans/:id/invites` with `guests=1`, for the host of a plan that takes answers.
    func hostInviteList() async throws -> PlanInviteListDTO {
        try await api.request(PlansEndpoints.invites(planId: planId))
    }

    /// How many a reminder would reach right now; 0 after a reminder today.
    var remindable: Int {
        guard let remind = hostInvites?.remind, !remind.remindedToday else { return 0 }
        return remind.count
    }

    /// "Remind the {n} who haven't answered": everyone who hasn't, the way each was invited. Once a day.
    func remindEveryone() async -> Bool {
        var reminded = 0
        let done = await perform {
            let reply: PlanRemindResponse = try await api.request(PlansEndpoints.remind(planId: planId))
            reminded = reply.reminded
            hostInvites = try? await hostInviteList()
        }
        if done { notice = "Reminded \(reminded == 1 ? "1 person" : "\(reminded) people")." }
        return done
    }

    /// What board 18's sheet starts from: what the person sent, when they're in.
    var answerPrefill: PlanAnswerPrefill? {
        guard mode == .going, let mine = plan?.myRequest else { return nil }
        return PlanAnswerPrefill(adults: mine.partySize ?? 1, kids: mine.kidsCount ?? 0, note: mine.note)
    }

    /// Board 18's "I'm in": the ordinary ask with the adults and kids. Nil when it went through.
    func answerIn(_ body: AskToJoinBody) async -> String? {
        let wasIn = mode == .going
        guard await ask(body) else {
            // Someone in who asked for more seats than are left: the server keeps their answer (#4198), in its words.
            if wasIn, actionError == PlanErrors.fullSentence { return "There's no room for more people. Your answer stays as it was." }
            return actionError ?? "We couldn't send that. Please try again."
        }
        return nil
    }

    /// Board 18's "Maybe" for an invited account. Someone in or waiting is taken out first (the server).
    func sayMaybe() async -> Bool {
        await perform {
            _ = try await api.request(PlansEndpoints.sayMaybe(planId: planId), as: EmptyResponse.self)
            await load()
        }
    }
}
