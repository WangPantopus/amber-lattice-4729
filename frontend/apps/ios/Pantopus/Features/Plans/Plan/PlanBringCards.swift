//
//  PlanBringCards.swift
//  Pantopus
//
//  Plans for the holidays, boards 4 and 20: the bring list on a plan's page.
//  For the host, "Bring list · 4 of 6 taken", who is bringing each thing or
//  "Still open", and "Add something" (the list, board 19). For someone who is
//  in, "{n} still open", "I'll bring it", "You're bringing it" with "Give back",
//  and "Bring something else" when guests may add. A claim someone else got
//  first says so ("Dana got to that one first."). JOURNEYS 2 (boards J2a and
//  J2b): the "You're in" banner points here with "See what to bring" while
//  things are open and this person has claimed none, and a claim that went
//  through says who can see it ("You're bringing bread. Jo and the other
//  guests can see it.").
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
    /// The thing this person claimed last, here: the green line says who can see it. "Give back" takes it away.
    @State private var claimed: String?
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
                if let claimed, let card = viewModel.card {
                    PlanBringClaimedLine(
                        thing: claimed,
                        host: PlanCardLines.hostName(card),
                        isHost: card.viewer?.isHost == true
                    )
                    .padding(.bottom, Spacing.s2)
                }
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
            Button("Add") {
                let label = newItem
                run("new", claims: label) { await viewModel.addBringItem(label) }
            }
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
                Button { run(item.id, claims: item.label) { await viewModel.claimBring(item.id) } } label: {
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

    /// `claims`: the thing this action claims; none for "Give back".
    private func run(_ key: String, claims: String? = nil, _ action: @escaping () async -> String?) {
        Task {
            working = key
            line = nil
            let failure = await action()
            line = failure
            // The green line follows the latest claim that went through; "Give back" takes it away.
            if failure == nil {
                let thing = claims?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                claimed = thing.isEmpty ? nil : String(thing.prefix(PlanBringEditor.labelLimit))
            }
            working = nil
            newItem = ""
        }
    }
}

// MARK: - JOURNEYS 2

extension PlanCardDTO {
    /// "See what to bring" on the "You're in" banner (board J2a): how many things are still open, while this
    /// person has claimed none; nil hides the row.
    var bringOpen: Int? {
        guard let bring, bring.openCount > 0, !bring.items.contains(where: { $0.claim?.mine == true }) else { return nil }
        return bring.openCount
    }
}

/// A plan's page as a scroll view that "See what to bring" can scroll to its bring card.
struct PlanBringScroll<Content: View>: View {
    @ViewBuilder let content: () -> Content

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The bring card's id on the page.
    static var anchor: String {
        "plan.bring"
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(content: content)
                .environment(\.planSeeBring) {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                        proxy.scrollTo(Self.anchor, anchor: .center)
                    }
                }
        }
    }
}

private struct PlanSeeBringKey: EnvironmentKey {
    static let defaultValue: (() -> Void)? = nil
}

extension EnvironmentValues {
    /// Scrolls the plan's page to its bring card; nil where the page can't.
    var planSeeBring: (() -> Void)? {
        get { self[PlanSeeBringKey.self] }
        set { self[PlanSeeBringKey.self] = newValue }
    }
}

/// The row under a hairline: a bag, "See what to bring" and "{n} still open" (`plan.inBanner.bring`).
struct PlanBringPointerRow: View {
    /// How many things are still open.
    let open: Int

    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.planSeeBring) private var seeBring

    var body: some View {
        if let seeBring { row(seeBring) }
    }

    private func row(_ action: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(Theme.Color.success.opacity(0.22))
                .frame(height: 1)
                .padding(.top, Spacing.s2)
            Button(action: action) {
                Group {
                    if typeSize.isAccessibilitySize {
                        // The largest text: the count goes under the words.
                        VStack(alignment: .leading, spacing: 2) {
                            words
                            count
                        }
                        .padding(.vertical, Spacing.s2)
                    } else {
                        HStack(spacing: Spacing.s2) {
                            words
                            Spacer(minLength: Spacing.s2)
                            count
                        }
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint("Shows the bring list")
            .accessibilityIdentifier("plan.inBanner.bring")
        }
    }

    private var words: some View {
        HStack(spacing: Spacing.s2) {
            Icon(.shoppingBag, size: 18, color: Theme.Color.primaryInk)
                .accessibilityHidden(true)
            Text("See what to bring").planFont(.bodyStrong).foregroundStyle(Theme.Color.primaryInk)
        }
    }

    private var count: some View {
        Text("\(open) still open").planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
    }
}

/// The green line at the top of the bring card after a claim (board J2b, `plan.bring.claimed`).
struct PlanBringClaimedLine: View {
    let thing: String
    /// The host's first name.
    let host: String
    /// The host claimed on their own plan.
    var isHost = false

    private var claim: String {
        "You're bringing \(Self.lowered(thing))."
    }

    private var who: String {
        isHost ? "Your guests can see it." : "\(host) and the other guests can see it."
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
            Icon(.check, size: 15, strokeWidth: 2.6, color: Theme.Color.success)
                .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 2 }
                .accessibilityHidden(true)
            (Text(claim).fontWeight(.semibold).foregroundStyle(Theme.Color.success)
                + Text(" \(who)").foregroundStyle(Theme.Color.appTextStrong))
                .planFont(.small)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, Spacing.s3)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous).fill(Theme.Color.successBg))
        .overlay(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous).strokeBorder(Theme.Color.success.opacity(0.3), lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("plan.bring.claimed")
        // A screen reader reads it when it appears, and again for a newer claim.
        .task(id: thing) { AccessibilityNotification.Announcement("\(claim) \(who)").post() }
    }

    /// The item's label with its first letter lowercased when its second letter is lowercase ("Bread" is "bread", "IPA" stays).
    static func lowered(_ label: String) -> String {
        let letters = Array(label)
        guard letters.count >= 2, letters[1].isLowercase else { return label }
        return letters[0].lowercased() + String(letters.dropFirst())
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
