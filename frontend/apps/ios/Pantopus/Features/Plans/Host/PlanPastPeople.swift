//
//  PlanPastPeople.swift
//  Pantopus
//
//  Plans for the holidays, the same people again (08-extras section 6, board 30). A row "People from a past plan" in
//  the host's invite sheet opens the host's past plans; "Invite all" opens that plan's people with a check each, and
//  "Invite" sends them all but the ones taken out. Each is invited the way they were last time, on Pantopus or by
//  email; the host never reads a guest's address, only the name they gave. Off (`plans_same_people`, or no past plan
//  with anyone in): the route answers 404 or nothing, and the row doesn't show.
//

import SwiftUI

@Observable
@MainActor
final class PlanPastPeopleModel {
    enum NamesPhase: Equatable {
        case loading
        case loaded
        case error(String)
    }

    let planId: String
    private(set) var plans: [PlanPastPlanDTO] = []
    private(set) var chosenPlan: PlanPastPlanDTO?
    private(set) var people: [PlanPastPersonDTO] = []
    private(set) var namesPhase: NamesPhase = .loading
    private(set) var skipped: Set<String> = []
    private(set) var isSending = false
    /// The server's line after sending ("Invited 4. 1 can only be reached by text.").
    private(set) var done: String?
    var isOpen = false
    var error: String?
    var asksAboutAddress = false

    private var addressAgreed = false
    private var namesTask: Task<Void, Never>?
    private let api: APIClient

    init(planId: String, api: APIClient = .shared) {
        self.planId = planId
        self.api = api
    }

    /// The host's past plans; nothing (and no row) when the switch is off or there are none.
    func loadPlans(opening postId: String? = nil) async {
        let reply: PlanPastPlansResponse? = try? await api.request(PlansEndpoints.pastPlans())
        plans = reply?.plans ?? []
        // Board 29's "Plan the next one with the same people": straight to that plan's people.
        if let postId, let plan = plans.first(where: { $0.postId == postId }) {
            open()
            choose(plan)
        }
    }

    func open() {
        chosenPlan = nil
        done = nil
        error = nil
        isOpen = true
    }

    func choose(_ plan: PlanPastPlanDTO) {
        chosenPlan = plan
        people = []
        skipped = []
        done = nil
        error = nil
        namesPhase = .loading
        namesTask?.cancel()
        namesTask = Task { await loadNames(plan) }
    }

    func back() {
        if chosenPlan == nil || done != nil {
            isOpen = false
        } else {
            namesTask?.cancel()
            chosenPlan = nil
            error = nil
        }
    }

    func loadNames(_ plan: PlanPastPlanDTO) async {
        do {
            let reply: PlanPastPeopleDTO = try await api.request(PlansEndpoints.pastPlanPeople(postId: plan.postId))
            guard chosenPlan?.postId == plan.postId else { return }
            people = reply.people
            namesPhase = .loaded
        } catch is CancellationError {
            return
        } catch {
            guard chosenPlan?.postId == plan.postId else { return }
            namesPhase = .error(PlanErrors.sentence(for: error))
        }
    }

    func isChosen(_ person: PlanPastPersonDTO) -> Bool {
        person.canInvite && !skipped.contains(person.key)
    }

    func toggle(_ person: PlanPastPersonDTO) {
        guard person.canInvite else { return }
        if skipped.contains(person.key) { skipped.remove(person.key) } else { skipped.insert(person.key) }
        error = nil
    }

    var chosenCount: Int {
        people.filter(isChosen).count
    }

    /// Sends the invitations; the invite sheet's list comes back in `onSent`.
    func send(onSent: (PlanInviteListDTO) -> Void) async {
        guard let plan = chosenPlan, chosenCount > 0, !isSending else { return }
        isSending = true
        error = nil
        defer { isSending = false }
        // Only the people the host took out; someone reached only by text stays in, so the server's line counts them.
        let skip = people.filter { $0.canInvite && skipped.contains($0.key) }.map(\.key)
        let body = PlanFromPlanBody(fromPostId: plan.postId, skip: skip, confirmSharesAddress: addressAgreed ? true : nil)
        do {
            let reply: PlanFromPlanResponse = try await api.request(PlansEndpoints.inviteFromPlan(planId: planId, body))
            done = reply.text ?? ""
            onSent(reply.list)
        } catch {
            if case let .clientError(status, body) = error as? APIError, status == 409,
               PlanErrors.code(in: body) == "confirm_shares_address" {
                asksAboutAddress = true
            } else {
                self.error = PlanErrors.sentence(for: error)
            }
        }
    }

    func agreeToShareAddress(onSent: (PlanInviteListDTO) -> Void) async {
        addressAgreed = true
        await send(onSent: onSent)
    }
}

/// The row in the invite sheet. Shows only when the host has a past plan to offer.
struct PlanPastPeopleEntry: View {
    @Bindable var model: PlanPastPeopleModel
    let onSent: (PlanInviteListDTO) -> Void

    var body: some View {
        Group {
            if !model.plans.isEmpty {
                Button { model.open() } label: {
                    PlanCardBox(padding: 14) {
                        HStack(spacing: Spacing.s3) {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(Theme.Color.primary100)
                                .frame(width: 40, height: 40)
                                .overlay(Icon(.users, size: 20, color: Theme.Color.primary700))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 0) {
                                Text("People from a past plan").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                                Text("Invite everyone who came to one of your plans, in one tap.")
                                    .planFont(.small)
                                    .foregroundStyle(Theme.Color.appTextSecondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Icon(.chevronRight, size: 18, color: Theme.Color.appTextMuted)
                                .accessibilityHidden(true)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
                .accessibilityIdentifier("planInvitePastPlan")
            }
        }
        .sheet(isPresented: $model.isOpen) {
            PlanPastPeopleScreen(model: model, onSent: onSent)
        }
    }
}

/// Board 30: the host's past plans, then one plan's names with a check each.
struct PlanPastPeopleScreen: View {
    @Bindable var model: PlanPastPeopleModel
    let onSent: (PlanInviteListDTO) -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: model.chosenPlan?.title ?? "People from a past plan", leading: .back) { model.back() }
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s4) {
                    if let plan = model.chosenPlan {
                        PlanPastNames(model: model, plan: plan)
                    } else {
                        plansList
                    }
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s2)
                .padding(.bottom, Spacing.s6)
            }
            if model.chosenPlan != nil, model.namesPhase == .loaded { sendBar }
        }
        .background(Theme.Color.appSurfaceMuted.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .alert("Share your address?", isPresented: $model.asksAboutAddress) {
            Button("Invite") { Task { await model.agreeToShareAddress(onSent: onSent) } }
            Button("Not now", role: .cancel) {}
        } message: {
            Text("This plan is at your place. People you invite see your address once they say they're in.")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planPastPeople")
    }

    private var plansList: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            Text("Invite everyone who came to one of your plans, in one tap.")
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
            PlanCardBox(padding: 14) {
                VStack(spacing: 0) {
                    ForEach(Array(model.plans.enumerated()), id: \.element.id) { index, plan in
                        if index > 0 { Divider().overlay(Theme.Color.appBorder) }
                        planRow(plan)
                    }
                }
            }
            HStack(alignment: .top, spacing: Spacing.s2) {
                Icon(.info, size: 16, color: Theme.Color.appTextSecondary).accessibilityHidden(true)
                Text("Each person is invited the way they were last time: on Pantopus or by email. You can take anyone out before it goes.")
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func planRow(_ plan: PlanPastPlanDTO) -> some View {
        // At the accessibility text sizes the button goes under the words, so the title keeps its width.
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.s2))
            : AnyLayout(HStackLayout(spacing: Spacing.s3))
        return layout {
            HStack(spacing: Spacing.s3) {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(plan.kind?.tint ?? Theme.Color.appSurfaceSunken)
                    .frame(width: 40, height: 40)
                    .overlay(Icon(plan.kind?.icon ?? .users, size: 20, color: plan.kind?.color ?? Theme.Color.appTextSecondary))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(plan.title)
                        .planFont(.bodyStrong)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(PlanPastLines.planLine(plan)).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
            Button("Invite all") { model.choose(plan) }
                .planButton(.secondary, size: .small)
                .fixedSize()
                .accessibilityLabel("Invite all from \(plan.title)")
                .accessibilityIdentifier("planPastInviteAll")
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planPastPlanRow")
    }

    private var sendBar: some View {
        VStack(spacing: Spacing.s2) {
            if let error = model.error {
                Text(error)
                    .planFont(.footnote)
                    .foregroundStyle(Theme.Color.error)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("planPastError")
            }
            if model.done != nil {
                Button("Done") { model.isOpen = false }
                    .planButton(.primary)
                    .accessibilityIdentifier("planPastDone")
            } else {
                Button { Task { await model.send(onSent: onSent) } } label: {
                    PlanButtonLabel(title: PlanPastLines.sendTitle(model.chosenCount), isLoading: model.isSending)
                }
                .planButton(.primary)
                .disabled(model.chosenCount == 0 || model.isSending)
                .accessibilityIdentifier("planPastSend")
            }
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.top, Spacing.s3)
        .padding(.bottom, Spacing.s2)
        .background(Theme.Color.appSurface.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
    }
}

/// One past plan's people, a check each; greyed and unchecked for someone who can only be reached by text.
private struct PlanPastNames: View {
    @Bindable var model: PlanPastPeopleModel
    let plan: PlanPastPlanDTO

    var body: some View {
        if let done = model.done {
            PlanCardBox(padding: 14) {
                HStack(alignment: .top, spacing: Spacing.s3) {
                    Icon(.checkCircle, size: 20, color: Theme.Color.success).accessibilityHidden(true)
                    Text(done)
                        .planFont(.bodyStrong)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("planPastDoneText")
        } else {
            switch model.namesPhase {
            case .loading:
                VStack(spacing: Spacing.s3) {
                    ForEach(0..<3, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                            .fill(Theme.Color.appSurfaceSunken)
                            .frame(height: 52)
                    }
                }
                .accessibilityLabel("Loading")
            case let .error(message):
                VStack(alignment: .leading, spacing: Spacing.s2) {
                    Text("Couldn't load the people").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    Text(message).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                    Button("Try again") { model.choose(plan) }
                        .planButton(.secondary, size: .small)
                        .accessibilityIdentifier("planPastRetry")
                }
            case .loaded:
                names
            }
        }
    }

    private var names: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Text(PlanPastLines.planLine(plan))
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
            PlanCardBox(padding: 14) {
                VStack(spacing: 0) {
                    ForEach(Array(model.people.enumerated()), id: \.element.id) { index, person in
                        if index > 0 { Divider().overlay(Theme.Color.appBorder) }
                        personRow(person)
                    }
                }
            }
            Text("Each person is invited the way they were last time: on Pantopus or by email. You can take anyone out before it goes.")
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func personRow(_ person: PlanPastPersonDTO) -> some View {
        Button { model.toggle(person) } label: {
            HStack(spacing: Spacing.s3) {
                PlanAvatar(name: person.name, url: person.avatarUrl)
                VStack(alignment: .leading, spacing: 0) {
                    Text(person.name).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    Text(PlanPastLines.via(person.via))
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                PlanCheckbox(isOn: model.isChosen(person))
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
            .opacity(person.canInvite ? 1 : 0.5)
        }
        .buttonStyle(.plain)
        .disabled(!person.canInvite)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(model.isChosen(person) ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("planPastPerson")
    }
}

enum PlanPastLines {
    /// "Nov 21 · 12 people".
    static func planLine(_ plan: PlanPastPlanDTO) -> String {
        let people = plan.count == 1 ? "1 person" : "\(plan.count) people"
        return plan.dateText.isEmpty ? people : "\(plan.dateText) · \(people)"
    }

    static func via(_ via: PlanPastVia) -> String {
        switch via {
        case .pantopus: "On Pantopus"
        case .email: "By email"
        case .text: "Can only be reached by text"
        }
    }

    static func sendTitle(_ count: Int) -> String {
        count == 1 ? "Invite 1 person" : "Invite \(count) people"
    }
}
