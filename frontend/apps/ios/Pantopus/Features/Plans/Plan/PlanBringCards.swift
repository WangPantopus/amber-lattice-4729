//
//  PlanBringCards.swift
//  Pantopus
//
//  Plans for the holidays, boards 4 and 20: the bring list on a plan's page.
//  For the host, "Bring list · 4 of 6 taken", who is bringing each thing or
//  "Still open", and "Add something" (the list, board 19). For someone who is
//  in, "{n} still open", "I'll bring it", "You're bringing it" with "Give back",
//  and "Bring something else" when guests may add. A claim someone else got
//  first says so ("Dana got to that one first.").
//

import SwiftUI

/// Board 4's card, for the host.
struct PlanBringHostCard: View {
    let bring: PlanBringDTO
    let onOpen: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    private var rowLayout: AnyLayout {
        PlanBringRowLayout.make(typeSize)
    }

    var body: some View {
        PlanCardBox(padding: 14) {
            VStack(alignment: .leading, spacing: 0) {
                PlanBringHeader(trailing: "\(bring.takenCount) of \(bring.items.count) taken")
                ForEach(bring.items) { item in
                    Divider().overlay(Theme.Color.appBorder)
                    rowLayout {
                        PlanBringWords(item: item)
                        if let claim = item.claim {
                            PlanBringWho(name: claim.mine ? "You" : claim.name, isYou: claim.mine)
                        } else {
                            PlanBringOpenChip()
                        }
                    }
                    .padding(.vertical, 10)
                    .accessibilityElement(children: .combine)
                }
                Button(action: onOpen) {
                    HStack(spacing: Spacing.s2) {
                        Icon(.plus, size: 16, color: Theme.Color.primaryInk)
                        Text("Add something").planFont(.bodyStrong).foregroundStyle(Theme.Color.primaryInk)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the bring list")
                .accessibilityIdentifier("planBringAddSomething")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planBringHostCard")
    }
}

/// Board 20's card, for someone who is in.
struct PlanBringGuestCard: View {
    let viewModel: PlanScreenViewModel
    let bring: PlanBringDTO

    @State private var working: String?
    @State private var line: String?
    @State private var asksForItem = false
    @State private var newItem = ""
    @Environment(\.dynamicTypeSize) private var typeSize

    private var rowLayout: AnyLayout {
        PlanBringRowLayout.make(typeSize)
    }

    var body: some View {
        PlanCardBox(padding: 14) {
            VStack(alignment: .leading, spacing: 0) {
                PlanBringHeader(trailing: bring.openCount == 0 ? "All taken" : "\(bring.openCount) still open")
                ForEach(bring.items) { item in
                    Divider().overlay(Theme.Color.appBorder)
                    row(item)
                }
                if let line {
                    Text(line)
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.warning)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, Spacing.s1)
                        .accessibilityIdentifier("planBringLine")
                }
                if bring.guestsCanAdd {
                    Button { asksForItem = true } label: {
                        HStack(spacing: Spacing.s2) {
                            Icon(.plus, size: 16, color: Theme.Color.primaryInk)
                            Text("Bring something else").planFont(.bodyStrong).foregroundStyle(Theme.Color.primaryInk)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(working != nil)
                    .accessibilityIdentifier("planBringSomethingElse")
                }
            }
        }
        .alert("Bring something else", isPresented: $asksForItem) {
            TextField("Cranberry sauce", text: $newItem)
            Button("Add") { run("new") { await viewModel.addBringItem(newItem) } }
            Button("Cancel", role: .cancel) { newItem = "" }
        } message: {
            Text("It goes on the list as yours.")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planBringGuestCard")
    }

    private func row(_ item: PlanBringItemDTO) -> some View {
        rowLayout {
            VStack(alignment: .leading, spacing: 0) {
                Text(item.label).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                if item.claim?.mine == true {
                    Text("You're bringing it").planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                } else if let note = item.note {
                    Text(note).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            if let claim = item.claim, claim.mine {
                Button("Give back") { run(item.id) { await viewModel.giveBackBring(item.id) } }
                    .planFont(.bodyStrong)
                    .foregroundStyle(Theme.Color.primaryInk)
                    .frame(minHeight: 44)
                    .disabled(working != nil)
                    .accessibilityLabel("Give back \(item.label)")
                    .accessibilityIdentifier("planBringGiveBack")
            } else if let claim = item.claim {
                PlanBringWho(name: claim.name)
            } else {
                Button { run(item.id) { await viewModel.claimBring(item.id) } } label: {
                    Text("I'll bring it")
                        .planFont(.smallStrong)
                        .foregroundStyle(Theme.Color.primaryInk)
                        .padding(.horizontal, Spacing.s3)
                        .frame(minHeight: 36)
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.Color.primary600, lineWidth: 1))
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(working != nil)
                .accessibilityLabel("I'll bring \(item.label)")
                .accessibilityIdentifier("planBringClaim")
            }
        }
        .padding(.vertical, 6)
    }

    private func run(_ key: String, _ action: @escaping () async -> String?) {
        Task {
            working = key
            line = nil
            line = await action()
            working = nil
            newItem = ""
        }
    }
}

private struct PlanBringHeader: View {
    let trailing: String

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 2) {
                    title
                    count
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(alignment: .firstTextBaseline) {
                    title
                    Spacer()
                    count
                }
            }
        }
        .padding(.bottom, Spacing.s2)
        .accessibilityElement(children: .combine)
    }

    private var title: some View {
        Text("Bring list").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText).accessibilityAddTraits(.isHeader)
    }

    private var count: some View {
        Text(trailing).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
    }
}

/// A row's words, then who is bringing it or its button: side by side, or the second under the first at the
/// largest text sizes, so a name or "I'll bring it" never squeezes the item's name.
private enum PlanBringRowLayout {
    static func make(_ typeSize: DynamicTypeSize) -> AnyLayout {
        typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.s2))
            : AnyLayout(HStackLayout(spacing: Spacing.s3))
    }
}

private struct PlanBringWords: View {
    let item: PlanBringItemDTO

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(item.label).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
            if let note = item.note { Text(note).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Who is bringing it: a small letter avatar and the first name.
private struct PlanBringWho: View {
    let name: String
    var isYou = false

    var body: some View {
        HStack(spacing: 6) {
            PlanAvatar(name: name, size: 24)
            Text(name).planFont(.smallStrong).foregroundStyle(Theme.Color.appTextStrong).lineLimit(1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isYou ? "You're bringing it" : "\(name) is bringing it")
    }
}

private struct PlanBringOpenChip: View {
    var body: some View {
        Text("Still open")
            .planFont(.caption)
            .foregroundStyle(Theme.Color.appTextSecondary)
            .fixedSize()
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Capsule().fill(Theme.Color.appSurfaceSunken))
    }
}

// MARK: - Actions

extension PlanScreenViewModel {
    /// "I'll bring it". Nil when it went through; "{Name} got to that one first." when someone did.
    func claimBring(_ itemId: String) async -> String? {
        await bringAction { try await api.request(PlansEndpoints.claimBring(planId: planId, itemId: itemId), as: EmptyResponse.self) }
    }

    /// "Give back".
    func giveBackBring(_ itemId: String) async -> String? {
        await bringAction { try await api.request(PlansEndpoints.giveBackBring(planId: planId, itemId: itemId), as: EmptyResponse.self) }
    }

    /// "Bring something else": one item, claimed by this person (1 to 60 characters).
    func addBringItem(_ label: String) async -> String? {
        let trimmed = String(label.trimmingCharacters(in: .whitespacesAndNewlines).prefix(PlanBringEditor.labelLimit))
        guard !trimmed.isEmpty else { return nil }
        return await bringAction {
            try await api.request(PlansEndpoints.addBringItem(planId: planId, PlanBringAddBody(label: trimmed)), as: EmptyResponse.self)
        }
    }

    private func bringAction(_ work: () async throws -> EmptyResponse) async -> String? {
        do {
            _ = try await work()
            PlansStoreReads.changed(planId: planId)
            await load()
            return nil
        } catch {
            await load()
            if case let .clientError(status, body) = error as? APIError, status == 409, let body,
               let taken = try? JSONDecoder().decode(PlanBringTakenDTO.self, from: Data(body.utf8)) {
                return taken.message ?? taken.claimName.map { "\($0) got to that one first." }
            }
            return PlanErrors.sentence(for: error)
        }
    }
}
