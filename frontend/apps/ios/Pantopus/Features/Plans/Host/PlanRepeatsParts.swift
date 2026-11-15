//
//  PlanRepeatsParts.swift
//  Pantopus
//
//  The Repeats screen's parts (boards Repeats and Monthly): the month's days
//  with "Add another day" and its sheet (a day of the week with which week,
//  or a date; up to 4), and "Ends" (on a date, or after a number of times).
//

import SwiftUI

/// Board Monthly: "On", the month's days ("The 1st Saturday") with a remove button (none on the day the plan
/// itself falls on while it is the only one), and "Add another day".
struct PlanRepeatMonthField: View {
    let draft: PlanRepeatDraft
    let onAdd: () -> Void

    var body: some View {
        PlanFormField(label: "On") {
            PlanFormCard {
                ForEach(Array(draft.monthDays.enumerated()), id: \.element) { index, rule in
                    if index > 0 { Divider().overlay(Theme.Color.appBorder) }
                    row(rule)
                }
                if draft.canAddMonthDay {
                    Divider().overlay(Theme.Color.appBorder)
                    Button(action: onAdd) {
                        HStack(spacing: Spacing.s3) {
                            Icon(.plus, size: 18, color: Theme.Color.primaryInk)
                            Text("Add another day")
                                .planFont(.bodyStrong)
                                .foregroundStyle(Theme.Color.primaryInk)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.vertical, 10)
                        .frame(minHeight: 52)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("planRepeatAddDay")
                }
            }
            .accessibilityElement(children: .contain)
            Text("A day of the week (\u{201C}the 1st Saturday\u{201D}) or a date (\u{201C}the 15th\u{201D}).")
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func row(_ rule: PlanMonthDay) -> some View {
        let title = PlanRepeatRules.rowTitle(rule)
        return HStack(spacing: Spacing.s3) {
            Text(title)
                .planFont(.bodyStrong)
                .foregroundStyle(Theme.Color.appText)
                .frame(maxWidth: .infinity, alignment: .leading)
            if draft.canRemove(rule) {
                Button { draft.remove(rule) } label: {
                    Icon(.x, size: 16, color: Theme.Color.appTextSecondary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.vertical, -6)
                .padding(.trailing, -10)
                .accessibilityLabel("Remove \(title.prefix(1).lowercased() + title.dropFirst())")
            }
        }
        .padding(.vertical, 10)
        .frame(minHeight: 52)
        .accessibilityElement(children: .contain)
    }
}

/// "Ends": on a date (12 weeks after the start until one is picked, at most a year) or after a number of times.
/// Tapping the chosen row opens its picker under it.
struct PlanRepeatEndsField: View {
    @Bindable var draft: PlanRepeatDraft
    @State private var editing: PlanRepeatDraft.Ends?

    var body: some View {
        PlanFormField(label: "Ends") {
            PlanFormCard {
                row(
                    .onDate,
                    title: "On a date",
                    value: PlanRepeatRules.dayName(draft.until, draft.calendar),
                    identifier: "planRepeatEndsDate"
                )
                if draft.ends == .onDate, editing == .onDate {
                    DatePicker("Ends on", selection: $draft.until, in: draft.untilRange, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .tint(Theme.Color.primary700)
                        .environment(\.timeZone, draft.calendar.timeZone)
                        .accessibilityIdentifier("planRepeatUntilPicker")
                }
                Divider().overlay(Theme.Color.appBorder)
                row(
                    .afterCount,
                    title: "After a number of times",
                    value: "\(draft.count) \(draft.count == 1 ? "time" : "times")",
                    identifier: "planRepeatEndsCount"
                )
                if draft.ends == .afterCount, editing == .afterCount {
                    HStack {
                        Text("Times").planFont(.body).foregroundStyle(Theme.Color.appText)
                        Spacer()
                        PlanStepper(value: $draft.count, range: draft.countRange, label: "Times")
                    }
                    .padding(.vertical, Spacing.s2)
                    .accessibilityIdentifier("planRepeatCountStepper")
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Ends")
        }
    }

    private func row(_ ends: PlanRepeatDraft.Ends, title: String, value: String, identifier: String) -> some View {
        let isOn = draft.ends == ends
        return Button {
            if isOn {
                editing = editing == ends ? nil : ends
            } else {
                draft.ends = ends
                editing = ends
            }
        } label: {
            HStack(spacing: Spacing.s3) {
                PlanRadio(isOn: isOn)
                Text(title)
                    .planFont(.bodyStrong)
                    .foregroundStyle(Theme.Color.appText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if isOn {
                    Text(value).planFont(.bodyStrong).monospacedDigit().foregroundStyle(Theme.Color.appText)
                    Icon(editing == ends ? .chevronDown : .chevronRight, size: 16, color: Theme.Color.appTextMuted)
                }
            }
            .padding(.vertical, 10)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier(identifier)
    }
}

/// "Add another day": a day of the week with which week ("the 1st Saturday", "the last Friday"), or a date
/// ("the 15th").
struct PlanRepeatAddDaySheet: View {
    let draft: PlanRepeatDraft
    let onClose: () -> Void

    @State private var byDate = false
    @State private var week = 1
    @State private var weekday: Int
    @State private var date: Int

    init(draft: PlanRepeatDraft, onClose: @escaping () -> Void) {
        self.draft = draft
        self.onClose = onClose
        _weekday = State(initialValue: draft.lockedWeekday)
        _date = State(initialValue: draft.calendar.component(.day, from: draft.start))
    }

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: "Add another day", leading: .close, onLeading: onClose)
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s5) {
                    PlanSegmented(
                        options: [(false, "A day of the week"), (true, "A date")],
                        selection: $byDate,
                        label: "Kind of day",
                        identifiers: ["planRepeatAddWeekday", "planRepeatAddDate"]
                    )
                    if byDate { dates } else { weekdays }
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s2)
                .padding(.bottom, Spacing.s6)
            }
            VStack(spacing: Spacing.s2) {
                if isChosen {
                    Text("Already one of its days.").planFont(.caption).foregroundStyle(Theme.Color.appTextSecondary)
                }
                Button("Add \(PlanRepeatRules.rowTitle(rule).prefix(1).lowercased() + PlanRepeatRules.rowTitle(rule).dropFirst())") {
                    draft.add(rule)
                    onClose()
                }
                .planButton(.primary)
                .disabled(isChosen)
                .accessibilityIdentifier("planRepeatAddConfirm")
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.vertical, Spacing.s3)
            .background(Theme.Color.appSurface)
            .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
        }
        .background(Theme.Color.appBg)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planRepeatAddDaySheet")
    }

    private var rule: PlanMonthDay {
        byDate ? .date(date) : .weekday(week: week, weekday: weekday)
    }

    private var isChosen: Bool {
        draft.monthDays.contains(rule)
    }

    private var weekdays: some View {
        VStack(alignment: .leading, spacing: Spacing.s5) {
            PlanFormField(label: "Which week") {
                PlanSegmented(
                    options: [(1, "1st"), (2, "2nd"), (3, "3rd"), (4, "4th"), (-1, "Last")],
                    selection: $week,
                    label: "Which week"
                )
            }
            PlanFormField(label: "Day") {
                PlanRepeatDayButtons(
                    isOn: { $0 == weekday },
                    identifier: { "planRepeatAddWeekday.\($0)" },
                    onTap: { weekday = $0 }
                )
            }
        }
    }

    private var dates: some View {
        PlanFormField(label: "Date") {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 6) {
                ForEach(1...31, id: \.self) { day in
                    let isOn = day == date
                    Button { date = day } label: {
                        Text("\(day)")
                            .planFont(.smallStrong)
                            .monospacedDigit()
                            .foregroundStyle(isOn ? Theme.Color.appTextInverse : Theme.Color.appText)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(Circle().fill(isOn ? Theme.Color.primary600 : Color.clear))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("The \(PlanRepeatRules.nth(day))")
                    .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
                    .accessibilityIdentifier("planRepeatAddDate.\(day)")
                }
            }
            if date > 28 {
                Text("Months without the \(PlanRepeatRules.nth(date)) are passed over.")
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// The Repeats row on the host's Change screen (board H11, Plans step 2), under Ends: the plan's pattern from
/// this date on, sent with Save when it changed.
struct PlanChangeRepeatsRow: View {
    let draft: PlanRepeatDraft
    let card: PlanCardDTO
    let start: Date
    let end: Date

    @State private var showsRepeats = false

    var body: some View {
        PlanRepeatsRow(value: draft.rowValue) { showsRepeats = true }
            .onChange(of: start) { _, new in draft.follow(start: new) }
            .navigationDestination(isPresented: $showsRepeats) {
                PlanRepeatsScreen(
                    draft: draft,
                    start: start,
                    end: end,
                    noun: PlanRepeatCopy.noun(kind: card.kind, walkKind: card.details?.walkKind)
                ) { showsRepeats = false }
                    .readableColumn()
            }
    }
}
