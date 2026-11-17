//
//  PlanPickDateScreen.swift
//  Pantopus
//
//  Plans for the holidays, find a date: board 25, "Pick a date", from the host's plan page while guests tick. "{9}
//  of {14} have answered"; a row a time, the favorite first with "Most", "{6} can · {names}", one chosen; the
//  server's note on what picking does, in numbers; "Remind the {5} who haven't answered" (the shipped Remind); and
//  "Pick {Sunday, Nov 22 · 4:00 PM}". Picking sets the plan's time and settles everyone once, on the server.
//

import SwiftUI

@Observable
@MainActor
final class PlanPickDateModel {
    let planId: String
    private(set) var card: PlanCardDTO?
    private(set) var remind: PlanRemindDTO?
    private(set) var loadError: String?
    private(set) var isWorking = false
    var chosen: String?
    var error: String?
    var toast: String?

    private let api: APIClient

    init(planId: String, api: APIClient = .shared) {
        self.planId = planId
        self.api = api
    }

    var dates: PlanDatesDTO? {
        card?.extrasPart.dates
    }

    var chosenOption: PlanDateOptionDTO? {
        dates?.options.first { $0.id == chosen }
    }

    func load() async {
        do {
            async let detail = PlansStoreReads.detail(id: planId)
            async let invites: PlanInviteListDTO = api.request(PlansEndpoints.invites(planId: planId))
            let (plan, list) = try await (detail, invites)
            card = plan.card
            remind = list.remind
            // The favorite starts chosen (the server lists it first).
            if chosen == nil || !(dates?.options.contains { $0.id == chosen } ?? false) {
                chosen = dates?.options.first(where: \.most)?.id ?? dates?.options.first?.id
            }
            loadError = nil
        } catch is CancellationError {
            return
        } catch {
            if card == nil { loadError = PlanErrors.sentence(for: error) }
        }
    }

    /// The shipped Remind: one reminder each, the way they were invited.
    func remindEveryone() async {
        guard !isWorking else { return }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            let reply: PlanRemindResponse = try await api.request(PlansEndpoints.remind(planId: planId))
            toast = "Reminded \(reply.reminded == 1 ? "1 person" : "\(reply.reminded) people")."
            PlansStoreReads.changed(planId: planId)
            await load()
        } catch {
            self.error = PlanErrors.sentence(for: error)
        }
    }

    /// `POST …/dates/pick`. True when it went through.
    func pick() async -> Bool {
        guard let chosen, !isWorking else { return false }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            _ = try await api.request(PlansEndpoints.pickDate(planId: planId, optionId: chosen), as: EmptyResponse.self)
            PlansStoreReads.changed(planId: planId)
            return true
        } catch {
            self.error = PlanErrors.sentence(for: error)
            await load()
            return false
        }
    }
}

struct PlanPickDateScreen: View {
    let onBack: () -> Void

    @State private var model: PlanPickDateModel

    init(planId: String, onBack: @escaping () -> Void) {
        self.onBack = onBack
        _model = State(initialValue: PlanPickDateModel(planId: planId))
    }

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: "Pick a date", leading: .back, onLeading: onBack)
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s4) {
                    if let card = model.card, let dates = model.dates {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(card.title).planFont(.h3).foregroundStyle(Theme.Color.appText).accessibilityAddTraits(.isHeader)
                            Text(dates.answeredText).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                        }
                        options(dates)
                        if let note = model.chosenOption?.pickNote, !note.isEmpty { noteCard(note) }
                        remindButton
                    } else if let problem = model.loadError {
                        Text(problem).planFont(.body).foregroundStyle(Theme.Color.appTextSecondary)
                    } else if model.card != nil {
                        // Picked already (here or on another phone): the plan is an ordinary plan again.
                        Text("A date is picked. You can change it from the plan.")
                            .planFont(.body)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                    } else {
                        Shimmer(width: nil, height: 160, cornerRadius: Radii.xl)
                    }
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s2)
                .padding(.bottom, Spacing.s6)
            }
            .refreshable { await model.load() }
            if let option = model.chosenOption { footer(option) }
        }
        .background(Theme.Color.appBg)
        .toolbar(.hidden, for: .navigationBar)
        .task { await model.load() }
        .overlay(alignment: .bottom) {
            if let toast = model.toast {
                ToastView(message: ToastMessage(text: toast))
                    .padding(.bottom, 120)
                    .dismissToast(after: toast, minimum: 2.5) { model.toast = nil }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planPickDate")
    }

    private func options(_ dates: PlanDatesDTO) -> some View {
        PlanCardBox(padding: 14) {
            VStack(spacing: 0) {
                ForEach(Array(dates.options.enumerated()), id: \.element.id) { index, option in
                    if index > 0 { Divider().overlay(Theme.Color.appBorder) }
                    Button { model.chosen = option.id } label: {
                        HStack(spacing: Spacing.s3) {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: Spacing.s2) {
                                    Text(option.text).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                                    if option.most { mostTag }
                                }
                                Text(PlanPickDateLines.who(option))
                                    .planFont(.small)
                                    .foregroundStyle(Theme.Color.appTextSecondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            radio(on: model.chosen == option.id)
                        }
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(model.chosen == option.id ? [.isButton, .isSelected] : .isButton)
                    .accessibilityIdentifier("planPickOption")
                }
            }
        }
    }

    private var mostTag: some View {
        Text("Most")
            .planFont(.smallStrong)
            .foregroundStyle(Theme.Color.success)
            .padding(.horizontal, Spacing.s2)
            .padding(.vertical, 2)
            .background(Capsule().fill(Theme.Color.successLight))
    }

    private func radio(on: Bool) -> some View {
        Circle()
            .stroke(on ? Theme.Color.primary600 : Theme.Color.appTextSecondary, lineWidth: 2)
            .frame(width: 22, height: 22)
            .overlay { if on { Circle().fill(Theme.Color.primary600).frame(width: 12, height: 12) } }
            .accessibilityHidden(true)
    }

    private func noteCard(_ note: String) -> some View {
        HStack(alignment: .top, spacing: Spacing.s2) {
            Icon(.info, size: 16, color: Theme.Color.primary700).accessibilityHidden(true)
            Text(note).planFont(.small).foregroundStyle(Theme.Color.appText).fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).fill(Theme.Color.infoBg))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("planPickNote")
    }

    @ViewBuilder private var remindButton: some View {
        if let remind = model.remind, remind.count > 0, !remind.remindedToday {
            Button("Remind the \(remind.count) who \(remind.count == 1 ? "hasn't" : "haven't") answered") {
                Task { await model.remindEveryone() }
            }
            .planButton(.text, size: .small)
            .disabled(model.isWorking)
            .accessibilityIdentifier("planPickRemind")
        }
    }

    private func footer(_ option: PlanDateOptionDTO) -> some View {
        VStack(spacing: Spacing.s2) {
            if let error = model.error {
                Text(error)
                    .planFont(.footnote)
                    .foregroundStyle(Theme.Color.error)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("planPickError")
            }
            Button { Task { if await model.pick() { onBack() } } } label: {
                PlanButtonLabel(title: option.pickText ?? "Pick this time", kind: .primary, isLoading: model.isWorking)
            }
            .planButton(.primary)
            .disabled(model.isWorking)
            .accessibilityIdentifier("planPickConfirm")
            Text("You can still change the date afterwards")
                .planFont(.caption)
                .foregroundStyle(Theme.Color.appTextSecondary)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.top, Spacing.s3)
        .padding(.bottom, Spacing.s2)
        .background(Theme.Color.appSurface.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
    }
}

enum PlanPickDateLines {
    /// "6 can · Dana, Sam, Priya and 3 more"; "0 can" when nobody ticked it.
    static func who(_ option: PlanDateOptionDTO) -> String {
        let names = option.who
        guard !names.isEmpty else { return "\(option.can) can" }
        let shown = names.prefix(3).joined(separator: ", ")
        let more = names.count - 3
        return "\(option.can) can · \(shown)\(more > 0 ? " and \(more) more" : "")"
    }
}
