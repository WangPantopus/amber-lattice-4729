//
//  PlanRepeatHost.swift
//  Pantopus
//
//  Board Regulars (Plans step 2): the host's repeating plan, on its plan
//  page and as its card under Your plans. "Next: Thu, Nov 19 · 3 in", "2 of
//  24 · ends Thu, Feb 4", "Skip Thursday" (cancels this date with
//  `repeat: "keep"`; the server posts the next one and the app opens it),
//  "Change" (the Change screen, with its Repeats row) and "Stop repeating"
//  (`PATCH repeat: null`: this date stays, none follows). Each asks first in
//  an alert with its own Cancel button.
//

import SwiftUI

struct PlanSeriesHostCard: View {
    let card: PlanCardDTO
    /// Your plans draws the kind tile, the title, "Every Tue and Thu · 6:30 AM" and the Private chip; the plan
    /// page already shows the title and the repeat line over the card.
    var showsTitle = false
    var isWorking = false
    var onOpen: () -> Void = {}
    let onSkip: () -> Void
    let onStop: () -> Void
    let onChange: () -> Void

    /// A hosted date of a repeating plan that is still to come (or happening): it can be skipped, changed or stopped.
    static func shows(_ card: PlanCardDTO) -> Bool {
        card.viewer?.isHost == true && card.isRepeating && !card.isBusiness && (card.state == .upcoming || card.state == .live)
    }

    var body: some View {
        PlanCardBox {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                if showsTitle { titleRow }
                well
                HStack(spacing: 10) {
                    // The series' last date has nothing after it to post: no Skip there.
                    if card.seriesGoesOn {
                        Button(PlanRepeatCopy.skipTitle(card), action: onSkip)
                            .planButton(.secondary, size: .small)
                            .accessibilityIdentifier("planSkipDate")
                    }
                    Button("Change", action: onChange)
                        .planButton(.secondary, size: .small)
                        .accessibilityIdentifier("planSeriesChange")
                }
                Button("Stop repeating", action: onStop)
                    .planButton(.textDanger, size: .small)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("planStopRepeating")
            }
            .disabled(isWorking)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planSeriesCard.\(card.id)")
    }

    private var titleRow: some View {
        Button(action: onOpen) {
            HStack(spacing: Spacing.s3) {
                PlanKindTile(kind: card.kind)
                VStack(alignment: .leading, spacing: 0) {
                    Text(card.title)
                        .planFont(.bodyStrong)
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                    // A long monthly pattern takes a second line rather than being cut.
                    Text(PlanRepeatCopy.hostLine(card))
                        .planFont(.small)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityLabel(PlanRepeatCopy.hostSpoken(card))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if card.isPrivate { PlanPrivateChip() }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Opens the plan")
        .accessibilityIdentifier("planRow.\(card.id)")
    }

    private var well: some View {
        let words = PlanRepeatCopy.well(card)
        return VStack(alignment: .leading, spacing: Spacing.s1) {
            HStack(alignment: .firstTextBaseline) {
                Text(words.next).planFont(.smallStrong).monospacedDigit().foregroundStyle(Theme.Color.appText)
                Spacer(minLength: Spacing.s2)
                Text("\(card.goingCount) in").planFont(.smallStrong).monospacedDigit().foregroundStyle(Theme.Color.success)
            }
            if let progress = words.progress {
                Text(progress).planFont(.small).monospacedDigit().foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.Color.appSurfaceSunken))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("planSeriesWell")
    }
}

/// The host's repeating plan under Your plans (board Regulars): the card, its confirmations, and the server's
/// sentence under it when Skip or Stop repeating is refused.
struct PlanSeriesListCard: View {
    enum Ask: Identifiable {
        case skip, stop

        var id: Self {
            self
        }
    }

    let card: PlanCardDTO
    let onOpen: () -> Void
    let onChange: () -> Void
    /// The date posted in place of a skipped one.
    let onOpenNext: (String) -> Void

    @State private var asking: Ask?
    @State private var isWorking = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            PlanSeriesHostCard(
                card: card,
                showsTitle: true,
                isWorking: isWorking,
                onOpen: onOpen,
                onSkip: { asking = .skip },
                onStop: { asking = .stop },
                onChange: onChange
            )
            if let error {
                Text(error)
                    .planFont(.footnote)
                    .foregroundStyle(Theme.Color.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("planSeriesError")
            }
        }
        .alert(
            asking.map { question($0).title } ?? "",
            isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }),
            presenting: asking
        ) { ask in
            Button(question(ask).label, role: .destructive) { Task { await run(ask) } }
            Button("Not now", role: .cancel) {}
        } message: { ask in
            Text(question(ask).message)
        }
    }

    /// What the alert asks, and its button.
    private struct Question {
        let title: String
        let message: String
        let label: String
    }

    private func question(_ ask: Ask) -> Question {
        switch ask {
        case .skip:
            let words = PlanRepeatCopy.skipQuestion(card)
            return Question(title: words.title, message: words.message, label: PlanRepeatCopy.skipTitle(card))
        case .stop:
            return Question(title: "Stop repeating?", message: PlanRepeatCopy.stopMessage, label: "Stop repeating")
        }
    }

    private func run(_ ask: Ask) async {
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            switch ask {
            case .skip:
                let reply: PlanCancelResponse = try await APIClient.shared.request(
                    PlansEndpoints.cancel(id: card.id, note: nil, keepRepeating: true)
                )
                PlansStoreReads.changed(planId: card.id)
                if let next = reply.nextPlanId {
                    // Said on the next date's screen, which opens at once.
                    PlansNavigator.shared.toast = PlanRepeatCopy.skippedToast
                    onOpenNext(next)
                }
            case .stop:
                var body = UpdatePlanBody()
                body.repeatChange = .stop
                let _: PlanDetailDTO = try await APIClient.shared.request(PlansEndpoints.update(id: card.id, body))
                PlansStoreReads.changed(planId: card.id)
            }
        } catch {
            self.error = PlanErrors.sentence(for: error)
        }
    }
}

extension PlanScreenViewModel {
    /// "Skip Thursday": this date is cancelled and the next one posted now; the screen opens it. The toast is
    /// `cancelPlan`'s own, so nothing comes back for the confirmation to show.
    func skipDate() async -> String? {
        _ = await cancelPlan(note: nil, keepRepeating: true)
        return nil
    }

    /// "Stop repeating": this date stays, no more are posted after it.
    func stopRepeating() async -> Bool {
        var body = UpdatePlanBody()
        body.repeatChange = .stop
        return await update(body)
    }
}

extension PlanCardDTO {
    /// A date of a repeating plan whose next date has been or will be posted: one before the series' last date.
    /// "Host again" isn't offered on it (the series carries on by itself); it is on the last date, and on a date
    /// whose series was stopped (the card no longer says it repeats).
    var seriesGoesOn: Bool {
        guard let repeats else { return false }
        if let total = repeats.total, repeats.index >= total { return false }
        guard let lastOn = repeats.lastOn else { return true }
        let calendar = PlanRepeatRules.calendar(PlanFormat.calendar(for: timezone))
        let day = startsOn ?? startsAtDate.map { PlanRepeatRules.iso($0, calendar) }
        guard let day else { return true }
        return day < lastOn
    }
}
