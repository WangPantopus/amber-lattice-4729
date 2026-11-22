//
//  PlanFirstOpen.swift
//  Pantopus
//
//  A new account opens on the plan that brought the person (JOURNEYS section
//  2, change 3). Someone who answered an invitation in a browser, then
//  installed the app and signed up with that email, used to land on Place and
//  had to find the dinner under Plans. `GET /api/plans/mine` already moves a
//  browser answer, and an email invitation, to the account with the same
//  verified email and lists it.
//
//  So once, when a signed-in account's tabs first show on this phone, while
//  the account is under 24 hours old and Plans is on, that list is read
//  (through the store the Plans screens use). If it has a plan that isn't
//  over under going, asked, waitlisted or invited (never one the person
//  hosts), the soonest one opens as a link to it would: on the Plans tab's
//  stack. Back from it lands on the app's usual first screen, Place
//  (`PlansTabRoot` asks `leftPlan`). A link or notification already opening
//  wins. An answer, a plan or none, counts the account as checked on this
//  phone; a read that fails or takes too long asks again next launch.
//
//  While the list is read (`deciding`) the daily briefings notice, which asks
//  the phone's notification question, and the tip cards wait, as they wait
//  for an opening link; while the plan shows they wait because it is not
//  their screen.
//

import SwiftUI

@Observable
@MainActor
final class PlanFirstOpen {
    static let shared = PlanFirstOpen()

    /// Reading the new account's plans: the first screen's notices and tip cards wait for the answer.
    private(set) var deciding = false
    /// The plan opened for the new account, while Back from it should land on the first tab.
    private(set) var planId: String?

    /// How long the first screen's notices wait for the answer before the app opens as usual.
    static let decideLimit: Duration = .seconds(6)
    /// A new account is one under a day old.
    static let newAccountAge: TimeInterval = 24 * 60 * 60

    private init() {}

    fileprivate func setDeciding(_ value: Bool) {
        guard deciding != value else { return }
        deciding = value
        if !value { GuidanceCenter.shared.scheduleEvaluation() }
    }

    fileprivate func opened(_ id: String) {
        planId = id
    }

    /// The person went somewhere else themselves (a tab on the bar, another tab's link): the plan stays where a
    /// link would have left it, and Back from it is the Plans tab's own.
    func forget() {
        planId = nil
    }

    /// The Plans stack changed. True once: the person went back from the plan this opened, so the app shows its
    /// usual first screen. Another plan in its place (a link) ends the arrangement.
    func leftPlan(path: [PlansRoute]) -> Bool {
        guard let planId else { return false }
        if path.isEmpty {
            self.planId = nil
            return true
        }
        if case let .plan(id, _)? = path.first, id == planId { return false }
        self.planId = nil
        return false
    }
}

struct PlanFirstOpenLanding: ViewModifier {
    /// The signed-in account.
    let account: String?
    let tabs: RootTabModel
    /// A link is waiting to open (or its invitation is showing).
    let linkWaiting: () -> Bool

    private enum Answer {
        /// The soonest plan the person is in, asked to join, waits for or is invited to.
        case plan(PlanCardDTO)
        /// Not a new account, Plans off, or no such plan.
        case nothing
        /// The server didn't answer: asked again next launch.
        case unanswered
    }

    func body(content: Content) -> some View {
        content.task(id: account) { await land() }
    }

    private func land() async {
        guard let account, !Self.checked(account) else { return }
        if linkWon(account) {
            Self.markChecked(account)
            return
        }
        let state = PlanFirstOpen.shared
        state.setDeciding(true)
        // The notices wait this long at most; an answer that comes later opens nothing now.
        let limit = Task { @MainActor in
            try? await Task.sleep(for: PlanFirstOpen.decideLimit)
            if !Task.isCancelled { state.setDeciding(false) }
        }
        let answer = await Self.read()
        limit.cancel()
        let inTime = state.deciding
        state.setDeciding(false)
        // Signed out or another account meanwhile: not this one's answer.
        guard !Task.isCancelled, Self.signedInAccount == account else { return }
        switch answer {
        case .unanswered:
            return
        case .nothing:
            Self.markChecked(account)
        case let .plan(card):
            // Too late to open over whatever showed meanwhile: the next launch opens it.
            guard inTime else { return }
            Self.markChecked(account)
            guard !linkWon(account) else { return }
            GuidanceCenter.shared.noteLinkOpening()
            PlansStoreReads.seed(card)
            state.opened(card.id)
            PlansNavigator.shared.pending = .plan(id: card.id, intent: .view)
            tabs.selected = .plans
        }
    }

    private static func read() async -> Answer {
        let profile: ProfileResponse
        do {
            profile = try await APIClient.shared.request(UsersEndpoints.profile())
        } catch {
            return .unanswered
        }
        guard let created = GuidanceRecord.date(profile.user.createdAt),
              Date().timeIntervalSince(created) < PlanFirstOpen.newAccountAge else { return .nothing }
        // Plans' switch for this person; right after a first sign-in this waits for the server's answer.
        await PlansFlags.shared.ready(account: profile.user.id)
        guard PlansFlags.shared.plans else { return .nothing }
        guard let mine = try? await PlansStoreReads.mine(force: true).value else { return .unanswered }
        return soonest(in: mine).map(Answer.plan) ?? .nothing
    }

    /// The soonest plan that isn't over among the ones the person is in, asked to join, waits for or is invited
    /// to; never one they host.
    static func soonest(in mine: MyPlansResponse) -> PlanCardDTO? {
        (mine.going + mine.asked + mine.waitlisted + mine.invited)
            .filter { $0.state == .upcoming || $0.state == .live }
            .min { ($0.startsAtDate ?? $0.startsOnDate ?? .distantFuture) < ($1.startsAtDate ?? $1.startsOnDate ?? .distantFuture) }
    }

    /// A link waits, or one already opened for this account: the tab that owns a link can take it before the
    /// root sees it (as `WaitingCardLanding` checks).
    private func linkWon(_ account: String) -> Bool {
        if linkWaiting() { return true }
        guard let link = DeepLinkRouter.shared.lastLiveLink, link.account == account else { return false }
        return WaitingCardLanding.opens(link.destination)
    }

    private static var signedInAccount: String? {
        if case let .signedIn(user) = AuthManager.shared.state { return user.id }
        return nil
    }

    private static func key(_ account: String) -> String {
        "pantopus.plans.firstPlanChecked.\(account)"
    }

    static func checked(_ account: String) -> Bool {
        UserDefaults.standard.bool(forKey: key(account))
    }

    private static func markChecked(_ account: String) {
        UserDefaults.standard.set(true, forKey: key(account))
    }
}
