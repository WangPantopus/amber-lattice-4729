//
//  PlanRepeatsScreen.swift
//  Pantopus
//
//  Boards Repeats (every week) and Monthly (every month), Plans step 2: how
//  often, on which days, when it ends, and a summary of the dates worked out
//  on the phone ("First on Tue, Nov 17. Last on Thu, Feb 4. 24 walks.").
//  Pushed from the Repeats row of the host's Details form and of the Change
//  screen; "Done" goes back to it.
//

import SwiftUI

struct PlanRepeatsScreen: View {
    let draft: PlanRepeatDraft
    /// The plan's start and end: the summary's times, and the day the pattern has to include.
    let start: Date
    let end: Date
    let noun: PlanRepeatCopy.Noun
    let onDone: () -> Void

    @State private var addsDay = false

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: "Repeats", leading: .back, onLeading: onDone)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: Spacing.s5) {
                        howOften
                        switch draft.choice {
                        case .weekly, .biweekly: PlanRepeatDaysField(draft: draft)
                        case .monthly: PlanRepeatMonthField(draft: draft) { addsDay = true }
                        case .none: EmptyView()
                        }
                        if draft.isOn {
                            PlanRepeatEndsField(draft: draft) { picker in reveal(picker, with: proxy) }
                            summary
                            VStack(alignment: .leading, spacing: 10) {
                                PlanScopeLine(text: PlanRepeatCopy.eachDateLine, icon: .arrowsRepeat)
                                PlanScopeLine(text: PlanRepeatCopy.askedLine, icon: .users)
                            }
                        }
                    }
                    .padding(.horizontal, Spacing.s4)
                    .padding(.top, Spacing.s1)
                    .padding(.bottom, Spacing.s6)
                }
            }
            Button("Done", action: onDone)
                .planButton(.primary)
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
                .background(Theme.Color.appSurface)
                .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
                .accessibilityIdentifier("planRepeatDone")
        }
        .background(Theme.Color.appBg)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { draft.follow(start: start) }
        .onChange(of: start) { _, new in draft.follow(start: new) }
        .sheet(isPresented: $addsDay) {
            PlanRepeatAddDaySheet(draft: draft) { addsDay = false }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planRepeatsScreen")
    }

    /// The calendar (with its month and year wheels) or the stepper opened under its row, or the calendar was
    /// tapped: bring all of it above Done once it has its size. Already in view, nothing moves.
    private func reveal(_ picker: String, with proxy: ScrollViewProxy) {
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(200))
            withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(picker) }
        }
    }

    // MARK: - How often

    private var howOften: some View {
        PlanFormCard {
            ForEach(Array(PlanRepeatDraft.Choice.allCases.enumerated()), id: \.element) { index, choice in
                if index > 0 { Divider().overlay(Theme.Color.appBorder) }
                optionRow(choice)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("How often")
    }

    private func optionRow(_ choice: PlanRepeatDraft.Choice) -> some View {
        let isOn = draft.choice == choice
        let words = Self.words(choice)
        return Button { draft.choose(choice) } label: {
            HStack(spacing: Spacing.s3) {
                PlanRadio(isOn: isOn)
                Text(words.title)
                    .planFont(.bodyStrong)
                    .foregroundStyle(Theme.Color.appText)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 10)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier(words.identifier)
    }

    static func words(_ choice: PlanRepeatDraft.Choice) -> (title: String, identifier: String) {
        switch choice {
        case .none: ("Doesn't repeat", "planRepeatNone")
        case .weekly: ("Every week", "planRepeatWeekly")
        case .biweekly: ("Every 2 weeks", "planRepeatBiweekly")
        case .monthly: ("Every month", "planRepeatMonthly")
        }
    }

    // MARK: - Summary

    @ViewBuilder private var summary: some View {
        if let title = draft.summaryTitle(end: end), let line = draft.summaryLine(noun: noun) {
            VStack(alignment: .leading, spacing: Spacing.s1) {
                Text(title)
                    .planFont(.bodyStrong)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
                Text(line)
                    .planFont(.small)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, Spacing.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.Color.appSurfaceSunken))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("planRepeatSummary")
        }
    }
}

/// Board Repeats: "On these days", seven round day buttons; the start's own day is on and stays.
struct PlanRepeatDaysField: View {
    let draft: PlanRepeatDraft

    var body: some View {
        PlanFormField(label: "On these days") {
            PlanRepeatDayButtons(
                isOn: { draft.weekdays.contains($0) },
                isLocked: { $0 == draft.lockedWeekday },
                identifier: { "planRepeatDay.\($0)" },
                onTap: { draft.toggle(weekday: $0) }
            )
            Text("Pick one day or several. All seven makes it daily.")
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// M T W T F S S, round, sky when on (more.css `.days`), with the days' full names for VoiceOver.
struct PlanRepeatDayButtons: View {
    let isOn: (Int) -> Bool
    var isLocked: (Int) -> Bool = { _ in false }
    let identifier: (Int) -> String
    let onTap: (Int) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(1...7, id: \.self) { weekday in
                let on = isOn(weekday)
                Button { onTap(weekday) } label: {
                    Text(PlanRepeatRules.letters[weekday - 1])
                        .planFont(.smallStrong)
                        .foregroundStyle(on ? Theme.Color.appTextInverse : Theme.Color.appText)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .background(Capsule().fill(on ? Theme.Color.primary600 : Color.clear))
                        .overlay(Capsule().strokeBorder(on ? Theme.Color.primary600 : Theme.Color.appTextSecondary, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(PlanRepeatRules.weekdayNames[weekday - 1])
                .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                .accessibilityHint(isLocked(weekday) ? "Your plan's own day. It stays on." : "")
                .accessibilityIdentifier(identifier(weekday))
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Days of the week")
    }
}
