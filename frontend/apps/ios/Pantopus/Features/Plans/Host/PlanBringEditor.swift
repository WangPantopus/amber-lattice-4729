//
//  PlanBringEditor.swift
//  Pantopus
//
//  Plans for the holidays, board 19 (Bring): the host's bring list while it is
//  being edited. On the host form it is a draft that goes with the new plan;
//  on a posted plan "Done" saves the whole list (`PUT /api/plans/:id/bring`),
//  and someone else's change in between reloads it with a sentence saying so.
//  The server checks every item again (planBring.js).
//

import Foundation
import Observation

@Observable
@MainActor
final class PlanBringEditor {
    struct Item: Identifiable, Hashable {
        let id: UUID
        /// The server's id for an item kept from the plan (its claim stays); nil for a new one.
        var serverId: String?
        var label: String
        var note: String
        /// Who is bringing it, when it isn't the host.
        var claimName: String?
        /// The host is bringing it.
        var mine: Bool
        /// The host was bringing it when the list was read (a change of `mine` is sent, nothing else).
        var wasMine = false

        /// "Two, please · Sam is bringing it", "You're bringing it", "Still open".
        var line: String {
            let who = mine ? "You're bringing it" : claimName.map { "\($0) is bringing it" } ?? "Still open"
            let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? who : "\(trimmed) · \(who)"
        }
    }

    static let maxItems = 30
    static let labelLimit = 60
    static let noteLimit = 80

    /// The posted plan whose list this is; nil on the host form.
    let planId: String?
    var items: [Item]
    var guestsCanAdd: Bool
    /// "Add something".
    var newLabel = ""
    private(set) var isSaving = false
    var error: String?

    private let api: APIClient

    init(planId: String? = nil, bring: PlanBringDTO? = nil, api: APIClient = .shared) {
        self.planId = planId
        self.api = api
        items = []
        guestsCanAdd = bring?.guestsCanAdd ?? true
        if let bring { take(bring) }
    }

    /// A draft started from a starter list (an occasion, H3): names only.
    convenience init(labels: [String], guestsCanAdd: Bool) {
        self.init()
        items = labels.prefix(Self.maxItems).map { Item(id: UUID(), serverId: nil, label: $0, note: "", claimName: nil, mine: false) }
        self.guestsCanAdd = guestsCanAdd
    }

    var canAdd: Bool {
        items.count < Self.maxItems && !newLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// "Add something": 1 to 60 characters, up to 30 things.
    func add() {
        let label = String(newLabel.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.labelLimit))
        guard !label.isEmpty, items.count < Self.maxItems else { return }
        items.append(Item(id: UUID(), serverId: nil, label: label, note: "", claimName: nil, mine: false))
        newLabel = ""
    }

    func remove(_ item: Item) {
        items.removeAll { $0.id == item.id }
    }

    func update(_ item: Item) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        var kept = item
        kept.label = String(item.label.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.labelLimit))
        kept.note = String(item.note.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.noteLimit))
        // An item the host now brings is theirs; giving it back leaves it open.
        if kept.mine { kept.claimName = nil }
        if kept.label.isEmpty { return }
        items[index] = kept
    }

    /// What goes to the server: every item, kept ones by id, the host's own claims.
    var body: PlanBringBody {
        PlanBringBody(
            items: items.map { item in
                let note = item.note.trimmingCharacters(in: .whitespacesAndNewlines)
                return PlanBringItemBody(
                    id: item.serverId,
                    label: item.label,
                    note: note.isEmpty ? nil : note,
                    mine: item.mine != item.wasMine ? item.mine : nil
                )
            },
            guestsCanAdd: guestsCanAdd
        )
    }

    /// "Done" on a posted plan: saves the whole list. True when it went through.
    func save() async -> Bool {
        guard let planId, !isSaving else { return planId == nil }
        isSaving = true
        error = nil
        defer { isSaving = false }
        do {
            let reply: PlanBringResponse = try await api.request(PlansEndpoints.putBring(planId: planId, body))
            if let bring = reply.bring { take(bring) } else { items = [] }
            PlansStoreReads.changed(planId: planId)
            return true
        } catch {
            if case let .clientError(status, body) = error as? APIError, status == 409, PlanErrors.code(in: body) == "bring_changed" {
                await reload()
                self.error = "Someone just changed the list. Here's the latest."
            } else {
                self.error = PlanErrors.sentence(for: error)
            }
            return false
        }
    }

    /// The list as the plan has it now.
    func reload() async {
        guard let planId, let detail = try? await PlansStoreReads.detail(id: planId) else { return }
        items = []
        if let bring = detail.card.bring { take(bring) }
    }

    private func take(_ bring: PlanBringDTO) {
        guestsCanAdd = bring.guestsCanAdd
        items = bring.items.map { item in
            Item(
                id: UUID(),
                serverId: item.id,
                label: item.label,
                note: item.note ?? "",
                claimName: item.claim.flatMap { $0.mine ? nil : $0.name },
                mine: item.claim?.mine == true,
                wasMine: item.claim?.mine == true
            )
        }
    }
}
