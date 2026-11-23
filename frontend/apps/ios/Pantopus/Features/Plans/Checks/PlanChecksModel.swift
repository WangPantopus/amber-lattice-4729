//
//  PlanChecksModel.swift
//  Pantopus
//
//  Plans for the holidays, the business track B5 (07-screens C3, picture 14):
//  what the business's guest list with money shows and does, for staff with
//  plans.manage. `GET …/checks` read again every 5 seconds while open (no
//  socket push); "Send a check" (`POST …/checks`) and a refund (`POST
//  …/checks/:id/refund`), each answered in the server's words. The app sends
//  only the amounts typed.
//

import Foundation
import Observation

@Observable
@MainActor
final class PlanChecksModel {
    enum Phase: Equatable {
        case loading
        case loaded
        case error(String)
    }

    enum Filter: String, CaseIterable, Identifiable {
        case all = "All"
        case notPaid = "Not paid"
        case paid = "Paid"

        var id: String {
            rawValue
        }

        var key: String {
            switch self {
            case .all: "all"
            case .notPaid: "not_paid"
            case .paid: "paid"
            }
        }
    }

    let planId: String
    private(set) var phase = Phase.loading
    private(set) var list: PlanChecksListDTO?
    private(set) var title = ""
    var filter = Filter.all
    var toast: String?

    private let api: APIClient

    init(planId: String, api: APIClient = .shared) {
        self.planId = planId
        self.api = api
    }

    var rows: [PlanChecksRowDTO] {
        let all = list?.rows ?? []
        switch filter {
        case .all: return all
        case .notPaid: return all.filter { $0.state == "none" || $0.state == "sent" }
        case .paid: return all.filter { $0.state == "paid" || $0.state == "refunded" }
        }
    }

    /// The list now, then every 5 seconds while the screen is open.
    func watch() async {
        if title.isEmpty, let detail: PlanDetailDTO = try? await api.request(PlansEndpoints.detail(id: planId)) {
            title = detail.card.title
        }
        while !Task.isCancelled {
            await load()
            try? await Task.sleep(nanoseconds: 5_000_000_000)
        }
    }

    func load() async {
        do {
            list = try await api.request(PlansEndpoints.checks(planId: planId))
            phase = .loaded
        } catch is CancellationError {
        } catch {
            if list == nil { phase = .error(PlanErrors.sentence(for: error)) }
        }
    }

    /// "Send a check": the amount on the bill and, with a deal on the bill, the part it doesn't cover. Nil when sent.
    func send(to row: PlanChecksRowDTO, amount: String, noDeal: String) async -> String? {
        guard let cents = PlanDealDraft.cents(amount) else { return "Type the amount on the bill." }
        var noDealCents: Int?
        if list?.dealOnBill == true {
            let typed = noDeal.trimmingCharacters(in: .whitespaces)
            if typed.isEmpty || typed == "0" {
                noDealCents = 0
            } else if let part = PlanDealDraft.cents(typed) {
                noDealCents = part
            } else {
                return "Type the part the deal doesn't cover, or 0."
            }
        }
        do {
            let body = PlanCheckAmountBody(amountCents: cents, requestId: row.requestId, noDealCents: noDealCents)
            let _: PlanCheckResponse = try await api.request(PlansEndpoints.sendCheck(planId: planId, body))
            toast = "Check sent to \(PlanCardLines.firstName(row.name))"
            await load()
            return nil
        } catch {
            return PlanErrors.sentence(for: error)
        }
    }

    /// A refund of all of a paid check (nil amount) or a part typed in dollars. Nil when done.
    func refund(_ row: PlanChecksRowDTO, amount: String?) async -> String? {
        guard let check = row.check else { return nil }
        var cents: Int?
        if let amount {
            guard let part = PlanDealDraft.cents(amount) else { return "Type an amount to refund." }
            cents = part
        }
        do {
            list = try await api.request(
                PlansEndpoints.refundCheck(planId: planId, checkId: check.id, PlanCheckRefundBody(amountCents: cents))
            )
            toast = "Refund sent"
            return nil
        } catch {
            return PlanErrors.sentence(for: error)
        }
    }
}

extension PlanChecksTotalsDTO {
    /// A total drawn large with its words under it: "$126.24" over "paid so far" (the server's text, split once).
    static func split(_ text: String) -> (big: String, small: String) {
        guard let space = text.firstIndex(of: " ") else { return (text, "") }
        return (String(text[..<space]), String(text[text.index(after: space)...]))
    }
}
