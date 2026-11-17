//
//  PlanFindDateForm.swift
//  Pantopus
//
//  Plans for the holidays, find a date on the host form (08-extras section 2, board 26): "Let guests pick the date"
//  under "Add to this plan". On, the form's "When" card gives way to two to five times the host offers, each with
//  "Remove", and "Add a time" (up to 5). Everyone invited ticks the ones that work; the host picks one later. Off
//  (`plans_find_date`, a playdate, or a plan that repeats): the row isn't drawn and the plan has one time as today.
//

import SwiftUI

/// One offered time, as the host set it.
struct PlanDateOptionDraft: Identifiable, Equatable {
    let id = UUID()
    var start: Date
    var end: Date

    /// The most times a host offers.
    static let most = 5
    static let tooFew = "Add at least two times for guests to pick from, or switch off \u{201C}Let guests pick the date\u{201D}."
}

/// Board 26's card: the switch, the times with "Remove", and "Add a time" with "Up to 5".
struct PlanFindDateFormCard: View {
    @Bindable var model: PlanComposerModel
    @State private var adding = false

    var body: some View {
        PlanFormCard {
            PlanExtraSwitchRow(
                icon: .calendarCheck,
                title: "Let guests pick the date",
                subtitle: "They tick what works; you choose",
                isOn: Binding(get: { model.privacy.dateOptions != nil }, set: { on in
                    // The time already on the form is the first one offered.
                    model.privacy.dateOptions = on ? (model.privacy.dateOptions ?? [PlanDateOptionDraft(start: model.start, end: model.end)]) : nil
                })
            )
            .accessibilityIdentifier("planFindDate")
            if let options = model.privacy.dateOptions {
                ForEach(options) { option in
                    Divider().overlay(Theme.Color.appBorder)
                    HStack(spacing: Spacing.s3) {
                        Text(PlanFormat.when(start: option.start, end: option.end))
                            .planFont(.body)
                            .foregroundStyle(Theme.Color.appText)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Button("Remove") { model.privacy.dateOptions?.removeAll { $0.id == option.id } }
                            .planButton(.text, size: .small)
                            .fixedSize()
                            .accessibilityLabel("Remove \(PlanFormat.when(start: option.start, end: option.end))")
                            .accessibilityIdentifier("planFindDateRemove")
                    }
                    .padding(.vertical, Spacing.s2)
                    .frame(minHeight: 52)
                }
                Divider().overlay(Theme.Color.appBorder)
                HStack(spacing: Spacing.s3) {
                    Button { adding = true } label: {
                        HStack(spacing: Spacing.s2) {
                            Icon(.plus, size: 18, color: Theme.Color.primary600)
                            Text("Add a time").planFont(.bodyStrong).foregroundStyle(Theme.Color.primary600)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(options.count >= PlanDateOptionDraft.most)
                    .opacity(options.count >= PlanDateOptionDraft.most ? 0.5 : 1)
                    .accessibilityIdentifier("planFindDateAdd")
                    Text("Up to 5").planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                }
                .padding(.vertical, Spacing.s2)
                .frame(minHeight: 52)
            }
        }
        .sheet(isPresented: $adding) {
            PlanAddTimeSheet(model: model, last: model.privacy.dateOptions?.last) { option in
                model.privacy.dateOptions?.append(option)
                adding = false
            }
        }
    }
}

/// "Add a time": when it starts and ends, within a private plan's limits (up to 60 days ahead, 15 minutes to
/// 8 hours long).
private struct PlanAddTimeSheet: View {
    let model: PlanComposerModel
    let onAdd: (PlanDateOptionDraft) -> Void

    @State private var start: Date
    @State private var end: Date
    @Environment(\.dismiss) private var dismiss

    init(model: PlanComposerModel, last: PlanDateOptionDraft?, onAdd: @escaping (PlanDateOptionDraft) -> Void) {
        self.model = model
        self.onAdd = onAdd
        // The day after the last time offered, as long as it.
        let base = last ?? PlanDateOptionDraft(start: model.start, end: model.end)
        _start = State(initialValue: base.start.addingTimeInterval(86400))
        _end = State(initialValue: base.end.addingTimeInterval(86400))
    }

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: "Add a time", leading: .close) { dismiss() }
            ScrollView {
                PlanFormCard {
                    PlanDateRow(
                        label: "Starts",
                        date: $start,
                        components: [.date, .hourAndMinute],
                        range: Date()...Date().addingTimeInterval(TimeInterval(model.daysAhead) * 86400)
                    )
                    Divider().overlay(Theme.Color.appBorder)
                    PlanDateRow(
                        label: "Ends",
                        date: $end,
                        components: [.hourAndMinute],
                        range: start.addingTimeInterval(15 * 60)...start.addingTimeInterval(8 * 3600)
                    )
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s2)
            }
            Button("Add this time") { onAdd(PlanDateOptionDraft(start: start, end: end)) }
                .planButton(.primary)
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
                .accessibilityIdentifier("planFindDateAddThis")
        }
        .background(Theme.Color.appBg)
        .presentationDetents([.medium])
        .onChange(of: start) { old, new in end = end.addingTimeInterval(new.timeIntervalSince(old)) }
    }
}
