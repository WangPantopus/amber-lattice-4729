//
//  PlanCheckModel.swift
//  Pantopus
//
//  Plans for the holidays, the business track B5 (07-screens C1 and C2): the
//  guest's check at the place. Reads the plan and `GET …/checks/mine`; a tip
//  choice is quoted by the server (`…/quote`) before its lines and total show;
//  "Pay" asks the server for the payment (`…/pay`, whose answer is what shows),
//  opens the shipped payment sheet, then confirms (`…/confirm`). The app never
//  adds a tip, takes off a deal or works out a total.
//

import Foundation
import Observation

@Observable
@MainActor
final class PlanCheckModel {
    enum Phase: Equatable {
        case loading
        case loaded
        case error(String)
    }

    /// The guest's tip: one of the server's three choices, another amount (cents), or none.
    enum Tip: Equatable {
        case choice(Int)
        case other(Int)
        case none
    }

    let planId: String
    private(set) var phase = Phase.loading
    private(set) var card: PlanCardDTO?
    /// The check as read (its tip choices and base lines).
    private(set) var check: PlanCheckDTO?
    /// The check as the chosen tip makes it (the server's quote, or the pay answer).
    private(set) var shown: PlanCheckDTO?
    private(set) var canStart = false
    private(set) var tip: Tip?
    private(set) var isWorking = false
    var problem: String?

    private let api: APIClient
    private var quoteToken = 0

    init(planId: String, api: APIClient = .shared) {
        self.planId = planId
        self.api = api
    }

    var businessName: String {
        card?.business?.name ?? "the business"
    }

    /// Paying is open once a tip is chosen ("No tip" counts), or at once on a check that takes no tip.
    var canPay: Bool {
        guard let check, check.isOpen, !isWorking else { return false }
        return !check.tipsOn || tip != nil
    }

    func load() async {
        do {
            async let detail: PlanDetailDTO = api.request(PlansEndpoints.detail(id: planId))
            async let mine: PlanMyCheckResponse = api.request(PlansEndpoints.myCheck(planId: planId))
            let (plan, answer) = try await (detail, mine)
            card = plan.card
            canStart = answer.canStart
            if answer.check?.id != check?.id || answer.check?.state != check?.state {
                tip = nil
                shown = nil
            }
            check = answer.check
            phase = .loaded
            if let tip, check?.isOpen == true { await quote(tip) }
        } catch is CancellationError {
        } catch {
            if check == nil { phase = .error(PlanErrors.sentence(for: error)) } else { problem = PlanErrors.sentence(for: error) }
        }
    }

    /// "What's your total?" (only with no deal on the bill, K7): the server makes the check from the typed amount.
    func start(typed: String) async {
        guard let cents = PlanDealDraft.cents(typed) else {
            problem = "Type the total on your bill."
            return
        }
        await work {
            let answer: PlanCheckResponse = try await self.api.request(
                PlansEndpoints.startMyCheck(planId: self.planId, PlanCheckAmountBody(amountCents: cents))
            )
            self.check = answer.check
            self.shown = nil
            self.tip = nil
        }
    }

    /// The tip in cents the server is asked about: a choice's own `tip_cents`, the typed amount, or 0.
    func cents(for tip: Tip) -> Int {
        switch tip {
        case let .choice(index): check?.tipChoices.indices.contains(index) == true ? check?.tipChoices[index].tipCents ?? 0 : 0
        case let .other(cents): cents
        case .none: 0
        }
    }

    func choose(_ choice: Tip) async {
        tip = choice
        problem = nil
        await quote(choice)
    }

    /// "Another amount": dollars typed, checked by the server (up to the amount of the check).
    func chooseOther(typed: String) async {
        guard let cents = PlanDealDraft.cents(typed) else {
            problem = "Type a tip in dollars."
            return
        }
        await choose(.other(cents))
    }

    private func quote(_ choice: Tip) async {
        guard let check else { return }
        quoteToken += 1
        let token = quoteToken
        do {
            let answer: PlanCheckResponse = try await api.request(
                PlansEndpoints.quoteCheck(planId: planId, checkId: check.id, PlanCheckTipBody(tipCents: cents(for: choice)))
            )
            guard token == quoteToken else { return }
            shown = answer.check
        } catch is CancellationError {
        } catch {
            guard token == quoteToken else { return }
            if case .other = choice { tip = nil }
            shown = nil
            problem = PlanErrors.sentence(for: error)
        }
    }

    /// C1 "Pay": the server's payment for its total, the shipped sheet, then confirm. Answers whether it was paid.
    func pay(presenter: PaymentSheetPresenting = StripePaymentSheetPresenter()) async {
        guard let check, canPay else { return }
        isWorking = true
        problem = nil
        defer { isWorking = false }
        let reply: PlanCheckPayResponse
        do {
            reply = try await api.request(
                PlansEndpoints.payCheck(planId: planId, checkId: check.id, PlanCheckTipBody(tipCents: tip.map(cents(for:)) ?? 0))
            )
        } catch {
            problem = PlanErrors.sentence(for: error)
            return
        }
        shown = reply.check
        let payment = reply.payment
        let result = await presenter.presentPayment(
            clientSecret: payment.clientSecret,
            customer: payment.customerId ?? "",
            ephemeralKey: payment.ephemeralKey ?? "",
            isSetupIntent: false,
            publishableKey: payment.publishableKey
        )
        switch result {
        case .canceled:
            return
        case let .failed(message):
            problem = message
        case .completed:
            await confirm(checkId: check.id)
        }
    }

    /// `POST …/confirm`: once more after a moment while the payment is still settling.
    private func confirm(checkId: String) async {
        for attempt in 0..<3 {
            do {
                let answer: PlanCheckResponse = try await api.request(PlansEndpoints.confirmCheck(planId: planId, checkId: checkId))
                check = answer.check
                shown = nil
                tip = nil
                PlansStoreReads.changed(planId: planId)
                return
            } catch let APIError.clientError(_, body) where PlanErrors.code(in: body) == "payment_not_complete" && attempt < 2 {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            } catch {
                problem = PlanErrors.sentence(for: error)
                return
            }
        }
        problem = "This payment hasn't gone through yet."
    }

    private func work(_ body: @escaping () async throws -> Void) async {
        isWorking = true
        problem = nil
        do {
            try await body()
        } catch {
            problem = PlanErrors.sentence(for: error)
        }
        isWorking = false
    }

    /// C2's "Something's wrong with this payment": the conversation's first line names the payment (07 C2).
    var paymentFirstLine: String? {
        guard let check, !check.isOpen else { return nil }
        let day = check.paidText?.components(separatedBy: " · ").first ?? ""
        return day.isEmpty ? "About my payment of \(check.totalText): " : "About my payment of \(check.totalText) on \(day): "
    }
}
