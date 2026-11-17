//
//  PlanFindDateCards.swift
//  Pantopus
//
//  Plans for the holidays, find a date on the plan's page (08-extras section 2). For an invited person (board 24):
//  "{Host} is picking a date", "Which times work?" with a switch a time and "{4} can make it", "Who's coming" with
//  their numbers and "Change", and "Save my times" in the footer. Ticking is the answer while the host picks: the
//  ordinary "I'm in" is refused until then. For the host: a card saying how many answered and "Pick a date", which
//  opens board 25. Every word naming a date or a count is the server's.
//

import SwiftUI

/// What an invited person has ticked and their numbers, kept per plan while the page is open and seeded from the
/// server's answer until they change something.
@Observable
@MainActor
final class PlanDatesDraft {
    private(set) var ticks: Set<String> = []
    var adults = 1
    var kids = 0
    var editsNumbers = false
    private(set) var isSaving = false
    private var edited = false
    private var seededFrom: PlanDatesDTO?

    private static var drafts: [String: PlanDatesDraft] = [:]

    /// The draft for one plan; the body card and the footer's button share it.
    static func of(_ planId: String) -> PlanDatesDraft {
        if let draft = drafts[planId] { return draft }
        let draft = PlanDatesDraft()
        drafts[planId] = draft
        return draft
    }

    /// Starts from what the server has for this person, unless they already changed something here.
    func seed(_ dates: PlanDatesDTO) {
        guard !edited, seededFrom != dates else { return }
        seededFrom = dates
        ticks = Set(dates.options.filter(\.mine).map(\.id))
        adults = max(1, dates.mine?.partySize ?? 1)
        kids = max(0, dates.mine?.kidsCount ?? 0)
    }

    func toggle(_ optionId: String) {
        edited = true
        if ticks.contains(optionId) { ticks.remove(optionId) } else { ticks.insert(optionId) }
    }

    func numbersChanged() {
        edited = true
    }

    /// `PUT …/dates/mine`. Nil when it went through, else the server's sentence.
    func save(_ viewModel: PlanScreenViewModel, card: PlanCardDTO) async -> String? {
        guard !isSaving, let dates = card.extrasPart.dates else { return nil }
        isSaving = true
        defer { isSaving = false }
        // Only times still offered; a time that has gone by left the list.
        let chosen = dates.options.map(\.id).filter { ticks.contains($0) }
        let body = PlanDatesTickBody(options: chosen, partySize: adults, kidsCount: card.kidsWelcome ? kids : nil)
        do {
            _ = try await viewModel.api.request(PlansEndpoints.tickDates(planId: viewModel.planId, body), as: EmptyResponse.self)
            edited = false
            editsNumbers = false
            seededFrom = nil
            PlansStoreReads.changed(planId: viewModel.planId)
            await viewModel.load()
            return nil
        } catch {
            await viewModel.load()
            return PlanErrors.sentence(for: error)
        }
    }
}

/// Board 24's banner: "{Host} is picking a date".
struct PlanPickingBanner: View {
    let card: PlanCardDTO

    var body: some View {
        let host = PlanCardLines.hostName(card)
        HStack(spacing: Spacing.s3) {
            PlanAvatar(name: card.host.displayName, url: card.host.avatarUrl)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(host) is picking a date").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                Text("Tick every time that works for you. \(host) chooses one, and you'll hear.")
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, Spacing.s3)
        .background(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).fill(Theme.Color.infoBg))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("planPickingBanner")
    }
}

/// Board 24's "Which times work?" and "Who's coming", for an invited person while the host picks.
struct PlanDatesGuestCard: View {
    let card: PlanCardDTO
    let dates: PlanDatesDTO
    @Bindable var draft: PlanDatesDraft

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            PlanCardBox(padding: 14) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Which times work?")
                            .planFont(.bodyStrong)
                            .foregroundStyle(Theme.Color.appText)
                            .accessibilityAddTraits(.isHeader)
                        Spacer(minLength: Spacing.s2)
                        Text(dates.answeredText).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                    }
                    .padding(.bottom, Spacing.s2)
                    ForEach(Array(dates.options.enumerated()), id: \.element.id) { index, option in
                        if index > 0 { Divider().overlay(Theme.Color.appBorder) }
                        Toggle(isOn: Binding(get: { draft.ticks.contains(option.id) }, set: { _ in draft.toggle(option.id) })) {
                            VStack(alignment: .leading, spacing: 0) {
                                Text(option.text).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                                Text(option.canText).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                            }
                        }
                        .tint(Theme.Color.successSolid)
                        .padding(.vertical, Spacing.s2)
                        .frame(minHeight: 56)
                        .accessibilityIdentifier("planDateOption")
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("planDatesCard")
            numbers
        }
        .onAppear { draft.seed(dates) }
        .onChange(of: dates) { _, new in draft.seed(new) }
    }

    /// "Who's coming · 2 adults, 1 kid · Change"; Change opens the steppers (board 18's).
    private var numbers: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Who's coming").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    Text(numbersLine).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                }
                .accessibilityElement(children: .combine)
                Spacer()
                Button(draft.editsNumbers ? "Done" : "Change") { draft.editsNumbers.toggle() }
                    .planButton(.text, size: .small)
                    .fixedSize()
                    .accessibilityLabel(draft.editsNumbers ? "Done changing who's coming" : "Change who's coming")
                    .accessibilityIdentifier("planDatesChangeNumbers")
            }
            if draft.editsNumbers {
                PlanCardBox(padding: 14) {
                    VStack(spacing: Spacing.s3) {
                        stepper(card.kidsWelcome ? "Adults" : "People", value: $draft.adults, range: 1...10)
                        if card.kidsWelcome { stepper("Kids", value: $draft.kids, range: 0...10) }
                    }
                }
            }
        }
    }

    private var numbersLine: String {
        guard card.kidsWelcome else { return draft.adults == 1 ? "Just you" : "\(draft.adults) people" }
        return PlanHeadcountCopy.adultsAndKids(adults: draft.adults, kids: draft.kids)
    }

    private func stepper(_ title: String, value: Binding<Int>, range: ClosedRange<Int>) -> some View {
        HStack {
            Text(title).planFont(.body).foregroundStyle(Theme.Color.appText)
            Spacer()
            PlanStepper(value: value, range: range, label: title)
        }
        .onChange(of: value.wrappedValue) { _, _ in draft.numbersChanged() }
    }
}

/// The footer while the host picks: "Save my times" and "You're in when {Host} picks a time you ticked".
struct PlanDatesSaveBar: View {
    let viewModel: PlanScreenViewModel
    let card: PlanCardDTO

    var body: some View {
        let draft = PlanDatesDraft.of(card.id)
        Button {
            Task {
                if let problem = await draft.save(viewModel, card: card) {
                    viewModel.actionError = problem
                } else {
                    viewModel.notice = "Your times are saved"
                }
            }
        } label: {
            PlanButtonLabel(title: "Save my times", kind: .primary, isLoading: draft.isSaving)
        }
        .planButton(.primary)
        .disabled(draft.isSaving)
        .accessibilityIdentifier("planDatesSave")
        Text("You're in when \(PlanCardLines.hostName(card)) picks a time you ticked")
            .planFont(.caption)
            .foregroundStyle(Theme.Color.appTextSecondary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The host's card while picking: how many answered, and "Pick a date" (board 25).
struct PlanDatesHostCard: View {
    let card: PlanCardDTO
    let dates: PlanDatesDTO

    var body: some View {
        PlanCardBox(padding: 14) {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack(spacing: Spacing.s3) {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Theme.Color.appSurfaceSunken)
                        .frame(width: 36, height: 36)
                        .overlay(Icon(.calendarCheck, size: 18, color: Theme.Color.appTextStrong))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(card.pickingText ?? "Picking a date").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                        Text(dates.answeredText).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityElement(children: .combine)
                NavigationLink(value: PlansRoute.pickDate(planId: card.id)) {
                    Text("Pick a date")
                }
                .planButton(.primary, size: .small)
                .accessibilityIdentifier("planPickDate")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planDatesHostCard")
    }
}
