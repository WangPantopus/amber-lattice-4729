//
//  PlanFooter.swift
//  Pantopus
//
//  The sticky footer of a plan (one primary action per screen, board P2):
//  "Ask to join" (J1/J2), "Change who's coming" and "Withdraw request"
//  (J5), "Leave the waitlist" (J6), "Can't make it" (J7). Also the
//  confirmations those actions ask for first.
//

import SwiftUI

struct PlanFooter: View {
    let viewModel: PlanScreenViewModel
    /// Opens J3/J4; true when changing an earlier request.
    let onAsk: (Bool) -> Void
    let onConfirm: (PlanConfirmation) -> Void

    var body: some View {
        // Hosting and closed plans have no footer button, but an action that failed there
        // ("Remove from plan", a report) still says so here.
        if let card = viewModel.card, content(card) != nil || viewModel.actionError != nil {
            VStack(spacing: Spacing.s2) {
                content(card)
                if let error = viewModel.actionError {
                    Text(error)
                        .planFont(.footnote)
                        .foregroundStyle(Theme.Color.error)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("planActionError")
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s3)
            .padding(.bottom, Spacing.s2)
            .frame(maxWidth: .infinity)
            .background(Theme.Color.appSurface.ignoresSafeArea(edges: .bottom))
            .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
        }
    }

    private func content(_ card: PlanCardDTO) -> AnyView? {
        switch viewModel.mode {
        case .browsing:
            AnyView(browsing(card))
        case .requested:
            AnyView(VStack(spacing: Spacing.s2) {
                Button("Change who's coming") { onAsk(true) }
                    .planButton(.secondary)
                    .accessibilityIdentifier("planChangeRequest")
                Button("Withdraw request") { onConfirm(.withdraw(host: PlanCardLines.hostName(card))) }
                    .planButton(.textDanger, size: .extraSmall)
                    .accessibilityIdentifier("planWithdraw")
            })
        case .waitlisted:
            AnyView(VStack(spacing: Spacing.s2) {
                Button("Leave the waitlist") { onConfirm(.leaveWaitlist) }
                    .planButton(.secondary)
                    .accessibilityIdentifier("planLeaveWaitlist")
                caption(waitlistCaption(card))
            })
        case .going where card.isOnline:
            // Board Online: "Join" opens the link; leaving stays under it.
            AnyView(VStack(spacing: Spacing.s2) {
                PlanOnlineJoin(place: viewModel.plan?.place)
                Button("Can't make it") { onConfirm(.cantMakeIt(host: PlanCardLines.hostName(card), online: true)) }
                    .planButton(.textDanger, size: .extraSmall)
                    .accessibilityIdentifier("planCantMakeIt")
            })
        case .going:
            AnyView(VStack(spacing: Spacing.s2) {
                Button("Can't make it") { onConfirm(.cantMakeIt(host: PlanCardLines.hostName(card), money: card.paid?.leaveText)) }
                    .planButton(.textDanger)
                    .accessibilityIdentifier("planCantMakeIt")
                // D2 item 5: leaving gives up a deal that's ready.
                if card.myDeal?.state == .ready { caption("Leaving gives up your deal") }
            })
        case .hosting where card.answerCounts != nil && viewModel.remindable > 0 && card.state == .upcoming:
            // Board 4: one reminder each, the way they were invited.
            AnyView(VStack(spacing: Spacing.s2) {
                Button { Task { _ = await viewModel.remindEveryone() } } label: {
                    PlanButtonLabel(
                        title: "Remind the \(viewModel.remindable) who \(viewModel.remindable == 1 ? "hasn't" : "haven't") answered",
                        kind: .primary,
                        isLoading: viewModel.isWorking
                    )
                }
                .planButton(.primary)
                .disabled(viewModel.isWorking)
                .accessibilityIdentifier("planRemind")
                caption("One reminder each, by the way they were invited")
            })
        case .hosting where card.isOnline && card.state != .cancelled && card.state != .ended:
            AnyView(VStack(spacing: Spacing.s2) { PlanOnlineJoin(place: viewModel.plan?.place) })
        case .hosting, .closed, .notThisTime:
            nil
        }
    }

    /// One primary action, as on Android: "I'm in" to an invitation, ask (or
    /// join the waitlist), verify, share a location, or the reason someone
    /// can't, greyed out.
    @ViewBuilder
    private func browsing(_ card: PlanCardDTO) -> some View {
        let viewer = card.viewer
        if let invite = viewModel.openInvite, viewer?.canAsk == true || viewer?.cannotAskReason == .fullUseWaitlist {
            invited(card, invite)
        } else if viewer?.canAsk ?? true {
            Button { onAsk(false) } label: {
                PlanButtonLabel(
                    title: card.isFull ? "Join the waitlist" : (Self.joinsRightAway(card) ? "Join" : "Ask to join"),
                    kind: .primary,
                    isLoading: viewModel.isWorking
                )
            }
            .planButton(.primary)
            .accessibilityIdentifier("planAsk")
            if let text = card.isFull ? PlanCannotAskCopy.waitlist : askCaption(card) { caption(text) }
        } else if let reason = viewer?.cannotAskReason {
            switch reason {
            case .fullUseWaitlist:
                Button { onAsk(false) } label: { PlanButtonLabel(title: "Join the waitlist", kind: .primary) }
                    .planButton(.primary)
                    .accessibilityIdentifier("planAsk")
                caption(PlanCannotAskCopy.waitlist)
            case .needsVerifiedAddress:
                Button("Verify your address to join") { PlanVerification.open() }
                    .planButton(.primary)
                    .accessibilityIdentifier("planVerify")
                caption("This plan is for people with a verified address.")
            case .needsLocation:
                Button { Task { await viewModel.shareLocation() } } label: {
                    PlanButtonLabel(title: "Share your location to join", kind: .primary, isLoading: viewModel.isWorking)
                }
                .planButton(.primary)
                .disabled(viewModel.isWorking)
                .accessibilityIdentifier("planShareLocation")
                caption("Hosts only see a distance like \u{201C}about 1 mi\u{201D}.")
            default:
                Button(PlanCannotAskCopy.title(reason)) {}
                    .planButton(.primary)
                    .disabled(true)
                    .accessibilityIdentifier("planCannotAsk")
                if let text = PlanCannotAskCopy.caption(reason) { caption(text) }
            }
        }
    }

    /// The host's invitation: "I'm in" (the waitlist when it's full) and "Can't make it", which the person can
    /// still change their mind about.
    @ViewBuilder
    private func invited(_ card: PlanCardDTO, _ invite: PlanMyInviteDTO) -> some View {
        let host = PlanCardLines.hostName(card)
        Button { onAsk(false) } label: {
            PlanButtonLabel(title: card.isFull ? "Join the waitlist" : "I'm in", kind: .primary, isLoading: viewModel.isWorking)
        }
        .planButton(.primary)
        .disabled(viewModel.isWorking)
        .accessibilityIdentifier("planInviteYes")
        if invite.status == .pending {
            Button("Can't make it") {
                Task { if await viewModel.declineInvite() { viewModel.notice = "We told \(host)" } }
            }
            .planButton(.text, size: .extraSmall)
            .disabled(viewModel.isWorking)
            .accessibilityIdentifier("planInviteNo")
        }
        caption(PlanInviteCopy.footer(card: card, invite: invite))
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .planFont(.caption)
            .foregroundStyle(Theme.Color.appTextSecondary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// "Sam usually answers within an hour" when the server says. Otherwise a
    /// playdate says "Maya approves each family" (J2); other plans already say
    /// how people get in above the footer.
    private func askCaption(_ card: PlanCardDTO) -> String? {
        // Plans for the holidays B1 (D1 item 5): the deal's line under the join button, in the server's words.
        if card.isBusiness, let line = card.price?.joinText ?? card.deal?.joinText { return line }
        // A business's plan (board G3): in right away, or the business approves each person.
        if card.isBusiness {
            return Self.joinsRightAway(card)
                ? "You're in right away. No approval needed."
                : "\(PlanCardLines.hostName(card)) approves each person."
        }
        // Board J2: a playdate says who approves each family.
        if card.kind == .playdate { return PlanCardLines.approval(card) }
        if card.howPeopleGetIn == "automatic" { return "You're in as soon as you ask, until the spots fill." }
        if let within = PlanCardLines.answersWithin(card) { return String(within.dropLast()) }
        return nil
    }

    /// A business's plan that lets anyone in right away: "Join", no request.
    static func joinsRightAway(_ card: PlanCardDTO) -> Bool {
        card.isBusiness && card.viewer?.autoRule == .open
    }

    /// "Starts in 7 hours. The waitlist closes 30 minutes before it ends."
    private func waitlistCaption(_ card: PlanCardDTO) -> String {
        let starts = card.state == .live ? "Happening now." : card.startsAtDate.map { PlanFormat.startsIn($0) + "." } ?? ""
        let closes = card.kind == .pickupGame || card.kind == .walkCoffee
            ? "The waitlist closes 30 minutes before it ends."
            : "The waitlist closes when it starts."
        return [starts, closes].filter { !$0.isEmpty }.joined(separator: " ")
    }
}

/// The J1 footer's words when someone can't ask (as on Android).
enum PlanCannotAskCopy {
    /// Under "Join the waitlist".
    static let waitlist = "Full for now. If a spot opens, we'll tell you right away."

    /// The greyed-out button.
    static func title(_ reason: PlanCannotAskReason) -> String {
        switch reason {
        case .tooFar: "Too far to join"
        case .ended: "Asking has closed"
        default: "Ask to join"
        }
    }

    /// Why, under the greyed-out button.
    static func caption(_ reason: PlanCannotAskReason) -> String? {
        switch reason {
        case .tooFar: "This plan is for people who live or are close by."
        case .tooManyRequests: "You have 10 open requests. Withdraw one to ask here."
        case .declined, .removed: "This one didn't work out."
        case .blocked: "You can't join this plan."
        case .other: "You can't ask to join this plan right now."
        case .needsVerifiedAddress, .needsLocation, .fullUseWaitlist, .ended: nil
        }
    }
}

/// The words around an invitation (the same on Android).
enum PlanInviteCopy {
    /// Under "I'm in".
    static func footer(card: PlanCardDTO, invite: PlanMyInviteDTO) -> String {
        let host = PlanCardLines.hostName(card)
        if invite.status == .declined { return "You said you can't make it. If that changes, tap I'm in." }
        if card.isFull { return PlanCannotAskCopy.waitlist }
        // The plan's one link for everyone with "I say yes first" (contract 6.9, A10 item 5).
        if invite.needsHostOk, invite.cameByOpenLink { return "\(host) says yes to each person who uses this link" }
        if invite.needsHostOk { return "This invitation went to another address, so \(host) says yes first." }
        return "\(host) invited you, so you're in as soon as you say so."
    }

    /// The banner over the plan: "Sam invited you".
    static func banner(card: PlanCardDTO, invite: PlanMyInviteDTO) -> (title: String, message: String) {
        let host = PlanCardLines.hostName(card)
        let place = card.kind == .playdate ? "the time and the exact place"
            : card.placeKind == .home ? "the address" : card.isOnline ? "the link" : "the exact place"
        if invite.needsHostOk {
            return ("\(host) invited you", "Say you're in and \(host) gets a request. You see \(place) once they say yes.")
        }
        return ("\(host) invited you", "No request needed. You see \(place) once you say you're in.")
    }
}

/// The confirmations a plan's actions ask for first.
enum PlanConfirmation: Identifiable, Equatable {
    case withdraw(host: String)
    case leaveWaitlist
    /// `online`: an online plan, whose guests lose its link (Plans step 3).
    case cantMakeIt(host: String, online: Bool = false, money: String? = nil)
    /// "Can't make it" to the host's "Still coming?" (H11): answers it and leaves.
    case notComing(host: String, online: Bool = false)
    case blockHost(name: String)
    case removeGuest(name: String, requestId: String, atHome: Bool, online: Bool = false)
    /// A repeating plan's date skipped (Plans step 2): "Skip Thursday's walk?", and the button's "Skip Thursday".
    case skipDate(title: String, message: String, label: String)
    case stopRepeating
    /// Plans for the holidays B1: staff mark a guest's free thing used ("Mark Dana's free appetizer used?").
    case markDealUsed(name: String, item: String, requestId: String)

    var id: String {
        switch self {
        case .withdraw: "withdraw"
        case .leaveWaitlist: "leaveWaitlist"
        case .cantMakeIt: "cantMakeIt"
        case .notComing: "notComing"
        case .blockHost: "blockHost"
        case let .removeGuest(_, requestId, _, _): "remove.\(requestId)"
        case .skipDate: "skipDate"
        case .stopRepeating: "stopRepeating"
        case let .markDealUsed(_, _, requestId): "dealUsed.\(requestId)"
        }
    }

    var title: String {
        switch self {
        case .withdraw: "Withdraw your request?"
        case .leaveWaitlist: "Leave the waitlist?"
        case .cantMakeIt, .notComing: "Can't make it?"
        case let .blockHost(name): "Block \(name)?"
        case let .removeGuest(name, _, _, _): "Remove \(PlanCardLines.firstName(name))?"
        case let .skipDate(title, _, _): title
        case .stopRepeating: "Stop repeating?"
        case let .markDealUsed(name, item, _): "Mark \(PlanCardLines.firstName(name))'s \(item) used?"
        }
    }

    var message: String {
        switch self {
        case let .withdraw(host):
            "\(host) won't see it anymore."
        case .leaveWaitlist:
            "You'll lose your place in line."
        case let .cantMakeIt(_, _, money?):
            // B2: a paid spot says what leaving now gives back, in the server's words.
            money
        case let .cantMakeIt(host, online, _), let .notComing(host, online):
            "We'll tell \(host), and your spot goes to the next person waiting. "
                + "You'll lose \(online ? "the link" : "the exact place"), the note and the chat."
        case .blockHost:
            "You won't see each other's plans, requests or messages."
        case let .removeGuest(name, _, atHome, online):
            atHome || online
                ? "\(PlanCardLines.firstName(name)) has already seen the \(online ? "link" : "address"). "
                + "They lose the plan, the note and the chat from now on."
                : "They lose the plan, the exact place, the note and the chat from now on."
        case let .skipDate(_, message, _):
            message
        case .stopRepeating:
            PlanRepeatCopy.stopMessage
        case .markDealUsed:
            "This can't be undone."
        }
    }

    var confirmLabel: String {
        switch self {
        case .withdraw: "Withdraw"
        case .leaveWaitlist: "Leave"
        case .cantMakeIt, .notComing: "I can't make it"
        case .blockHost: "Block"
        case .removeGuest: "Remove"
        case let .skipDate(_, _, label): label
        case .stopRepeating: "Stop repeating"
        case .markDealUsed: "Mark used"
        }
    }

    /// Runs it; returns the toast to show when it went through.
    func perform(_ viewModel: PlanScreenViewModel) async -> String? {
        switch self {
        case .withdraw:
            await viewModel.withdraw() ? "Request withdrawn" : nil
        case .leaveWaitlist:
            await viewModel.withdraw() ? "You left the waitlist" : nil
        case let .cantMakeIt(host, _, _):
            await viewModel.withdraw() ? "We told \(host)" : nil
        case let .notComing(host, _):
            await viewModel.stillComing(false) ? "We told \(host)" : nil
        case .blockHost:
            await viewModel.blockHost() ? "Blocked. You won't see each other's plans." : nil
        case let .removeGuest(_, requestId, _, _):
            await viewModel.remove(requestId: requestId) ? "Removed. They no longer see the plan." : nil
        case .skipDate:
            await viewModel.skipDate()
        case .stopRepeating:
            await viewModel.stopRepeating() ? "It won't repeat. This date stays." : nil
        case let .markDealUsed(_, _, requestId):
            await viewModel.markDealUsed(requestId: requestId) ? "Marked used" : nil
        }
    }
}
