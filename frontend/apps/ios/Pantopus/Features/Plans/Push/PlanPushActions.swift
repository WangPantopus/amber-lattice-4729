//
//  PlanPushActions.swift
//  Pantopus
//
//  Board A3: the Plans push categories and their buttons. The host
//  answers a request from the lock screen (Accept, Decline); a guest says
//  "On my way" or "Can't make it" to a reminder, and "Still coming" or
//  "Can't make it" when the host moved the plan; someone invited says
//  "I'm in" or "Can't make it". Each button calls the Plans endpoint with
//  the ids in the payload; a button that fails opens the plan with an
//  honest note instead.
//

import UserNotifications

/// What a Plans push carries (`type`, `link`, `plan_id`, `request_id`, `recipient_user_id`; a guest's `invite_id` and
/// `guest_name`, Plans for the holidays).
struct PlanPushPayload {
    let category: String
    let planId: String?
    let requestId: String?
    let recipient: String?
    let requesterName: String?
    let inviteId: String?

    init(category: String, userInfo: [AnyHashable: Any]) {
        self.category = category
        planId = userInfo["plan_id"] as? String ?? userInfo["planId"] as? String
        requestId = userInfo["request_id"] as? String ?? userInfo["requestId"] as? String
        recipient = userInfo["recipient_user_id"] as? String
        requesterName = userInfo["requester_name"] as? String ?? userInfo["guest_name"] as? String
        inviteId = userInfo["invite_id"] as? String ?? userInfo["inviteId"] as? String
    }
}

@MainActor
enum PlanPushActions {
    nonisolated static let accept = "PLAN_ACCEPT"
    nonisolated static let decline = "PLAN_DECLINE"
    nonisolated static let onMyWay = "PLAN_ON_MY_WAY"
    nonisolated static let cantMakeIt = "PLAN_CANT_MAKE_IT"
    nonisolated static let stillComing = "PLAN_STILL_COMING"
    nonisolated static let imIn = "PLAN_IM_IN"
    /// Plans for the holidays: a guest from the open link waits for the host's yes.
    nonisolated static let letIn = "PLAN_LET_IN"
    nonisolated static let notThisTime = "PLAN_NOT_THIS_TIME"

    static let all: Set<String> = [accept, decline, onMyWay, cantMakeIt, stillComing, imIn, letIn, notThisTime]

    /// PLAN_REQUEST (Accept, Decline), PLAN_REMINDER (On my way, Can't make
    /// it), PLAN_CHANGED (Still coming, Can't make it), PLAN_INVITE (I'm in,
    /// Can't make it; never for a playdate, which asks the kids' ages), PLAN_GUEST_OK (Let in, Not this time).
    nonisolated static var categories: [UNNotificationCategory] {
        let request = UNNotificationCategory(
            identifier: "PLAN_REQUEST",
            actions: [
                UNNotificationAction(identifier: accept, title: "Accept", options: [.authenticationRequired]),
                UNNotificationAction(identifier: decline, title: "Decline", options: [.authenticationRequired])
            ],
            intentIdentifiers: [],
            options: []
        )
        let reminder = UNNotificationCategory(
            identifier: "PLAN_REMINDER",
            actions: [
                UNNotificationAction(identifier: onMyWay, title: "On my way", options: [.authenticationRequired]),
                UNNotificationAction(identifier: cantMakeIt, title: "Can't make it", options: [.authenticationRequired, .destructive])
            ],
            intentIdentifiers: [],
            options: []
        )
        let changed = UNNotificationCategory(
            identifier: "PLAN_CHANGED",
            actions: [
                UNNotificationAction(identifier: stillComing, title: "Still coming", options: [.authenticationRequired]),
                UNNotificationAction(identifier: cantMakeIt, title: "Can't make it", options: [.authenticationRequired, .destructive])
            ],
            intentIdentifiers: [],
            options: []
        )
        let invite = UNNotificationCategory(
            identifier: "PLAN_INVITE",
            actions: [
                UNNotificationAction(identifier: imIn, title: "I'm in", options: [.authenticationRequired]),
                UNNotificationAction(identifier: cantMakeIt, title: "Can't make it", options: [.authenticationRequired, .destructive])
            ],
            intentIdentifiers: [],
            options: []
        )
        let guest = UNNotificationCategory(
            identifier: "PLAN_GUEST_OK",
            actions: [
                UNNotificationAction(identifier: letIn, title: "Let in", options: [.authenticationRequired]),
                UNNotificationAction(identifier: notThisTime, title: "Not this time", options: [.authenticationRequired, .destructive])
            ],
            intentIdentifiers: [],
            options: []
        )
        return [request, reminder, changed, invite, guest]
    }

    /// Runs a button. Only for the account the push was for, only with Plans
    /// on, never while the app is locked; anything that doesn't go through
    /// opens the plan with a sentence saying so.
    static func handle(action: String, payload: PlanPushPayload) async {
        guard let planId = payload.planId else { return }
        let auth = AuthManager.shared
        if auth.state == .unknown { await auth.restoreSession() }
        guard case let .signedIn(user) = auth.state, payload.recipient == nil || payload.recipient == user.id else { return }
        PlansFlags.shared.prime(account: user.id)
        guard PlansFlags.shared.plans else { return }
        AppLockManager.shared.configure(userID: user.id)
        let scope = HomeClaimSessionScope(api: .shared)
        guard !AppLockManager.shared.isLocked, scope.isCurrent else {
            open(planId: planId, action: action, note: nil)
            return
        }
        do {
            try await perform(action, payload: payload, planId: planId)
            PlansStoreReads.changed(planId: planId)
        } catch {
            open(planId: planId, action: action, note: failure(action, payload: payload, error: error))
        }
    }

    private static func perform(_ action: String, payload: PlanPushPayload, planId: String) async throws {
        let api = APIClient.shared
        if guestActions.contains(action) {
            try await answerGuest(action, payload: payload, planId: planId)
            return
        }
        switch action {
        case accept:
            guard let requestId = payload.requestId else { throw CancellationError() }
            // At home the first yes shares the address: only once the host
            // agreed to that on this phone; otherwise the plan's requests open.
            let confirmed = PlanHomeSharing.isConfirmed(planId)
            _ = try await api.request(
                PlansEndpoints.accept(planId: planId, requestId: requestId, confirmSharesAddress: confirmed ? true : nil),
                as: EmptyResponse.self
            )
        case decline:
            guard let requestId = payload.requestId else { throw CancellationError() }
            _ = try await api.request(PlansEndpoints.decline(planId: planId, requestId: requestId), as: EmptyResponse.self)
        case onMyWay:
            _ = try await api.request(PlansEndpoints.onMyWay(planId: planId), as: EmptyResponse.self)
        case stillComing:
            _ = try await api.request(PlansEndpoints.stillComing(planId: planId, coming: true), as: EmptyResponse.self)
        case imIn:
            // From the lock screen it's just them; they can change who's coming on the plan.
            _ = try await api.request(PlansEndpoints.ask(planId: planId, AskToJoinBody(partySize: 1, note: nil)), as: EmptyResponse.self)
        case cantMakeIt:
            if payload.category == "PLAN_CHANGED" {
                _ = try await api.request(PlansEndpoints.stillComing(planId: planId, coming: false), as: EmptyResponse.self)
            } else if payload.category == "PLAN_INVITE" {
                _ = try await api.request(PlansEndpoints.declineInvite(planId: planId), as: EmptyResponse.self)
            } else {
                _ = try await api.request(PlansEndpoints.withdraw(planId: planId), as: EmptyResponse.self)
            }
        default:
            return
        }
    }

    private static let guestActions: Set = [letIn, notThisTime]

    /// "Let in" and "Not this time" on a guest waiting from the open link (PLAN_GUEST_OK), by the invitation's id.
    private static func answerGuest(_ action: String, payload: PlanPushPayload, planId: String) async throws {
        guard let inviteId = payload.inviteId else { throw CancellationError() }
        let endpoint = action == letIn
            ? PlansEndpoints.letIn(planId: planId, inviteId: inviteId)
            : PlansEndpoints.cancelInvite(planId: planId, inviteId: inviteId)
        _ = try await APIClient.shared.request(endpoint, as: EmptyResponse.self)
    }

    /// The honest sentence the plan shows when a button didn't go through, in
    /// the words Android's notification uses: "Couldn't accept Priya. This
    /// plan is full. They can stay on the waitlist."
    private static func failure(_ action: String, payload: PlanPushPayload, error: any Error) -> String {
        let who = payload.requesterName.map { PlanCardLines.firstName($0) } ?? "this request"
        let reason = reason(for: error)
        switch action {
        case accept: return "Couldn't accept \(who). \(reason)"
        case decline: return "Couldn't decline \(who). \(reason)"
        case onMyWay: return "Couldn't send \u{201C}On my way\u{201D}. \(reason)"
        case stillComing: return "Couldn't send \u{201C}Still coming\u{201D}. \(reason)"
        case imIn: return "Couldn't say you're in. \(reason)"
        case letIn: return "Couldn't let \(who) in. \(reason)"
        case notThisTime: return "Couldn't answer \(who). \(reason)"
        default: return "Couldn't tell the host you can't make it. \(reason)"
        }
    }

    /// Why: the server's own sentence when it sent one ("This plan is full.
    /// They can stay on the waitlist."), as Android shows it.
    private static func reason(for error: any Error) -> String {
        guard let apiError = error as? APIError else { return PlanErrors.sentence(for: error) }
        switch apiError {
        case let .clientError(_, body):
            if let code = PlanErrors.code(in: body), addressCodes.contains(code) {
                return "Accepting shares your address. Confirm it on the request first."
            }
            return apiError.errorDescription ?? PlanErrors.sentence(for: error)
        case .notFound:
            return "This plan isn't available anymore."
        default:
            return PlanErrors.sentence(for: error)
        }
    }

    /// Refusals that mean the host must first agree that accepting shares their address (H10).
    private static let addressCodes: Set = ["confirm_shares_address", "confirm_shares_address_required", "needs_address_confirmation"]

    /// The plan, its requests (Accept, Decline) or "Who's coming" (Let in, Not this time).
    private static func open(planId: String, action: String, note: String?) {
        PlansNavigator.shared.notice = note
        let path = switch action {
        case accept, decline: "/plans/\(planId)/requests"
        case letIn, notThisTime: "/plans/\(planId)/guests"
        default: "/plans/\(planId)"
        }
        DeepLinkRouter.shared.handle(path: path)
    }
}
