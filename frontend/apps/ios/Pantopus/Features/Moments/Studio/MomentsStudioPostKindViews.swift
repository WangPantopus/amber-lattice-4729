//
//  MomentsStudioPostKindViews.swift
//  Pantopus
//
//  "+ Ask / Kind" on the Studio's picture, under the caption, and each kind's own details in the drawer
//  ("Pulse, reinvented" phase 1; CONTRACT 6d). The details are today's composer's: what a Heads-up is about, lost or
//  found and how to reach the author, an event's times and where it is.
//

import SwiftUI

/// Under the caption: "+ Ask / Kind" (a menu of the kinds), "Keep until answered?" when the words ask something, or
/// the kind picked, with an x that makes it a Moment again.
struct MomentsStudioKindRow: View {
    let model: MomentsComposerModel

    var body: some View {
        if model.offersStudioKinds {
            HStack(spacing: Spacing.s2) {
                if let kind = model.studioPostKind {
                    picked(kind)
                    Text(kind.hint)
                        .font(.system(size: 13))
                        .foregroundStyle(Color.white.opacity(0.8))
                        .lineLimit(2)
                        .shadow(color: .black.opacity(0.45), radius: 4, x: 0, y: 1)
                } else {
                    menu
                    if model.offersKeepUntilAnswered { keepUntilAnswered }
                }
                Spacer(minLength: 0)
            }
            .disabled(model.isPosting)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("moments.studio.kindRow")
        }
    }

    private var menu: some View {
        Menu {
            ForEach(model.studioKindChoices) { kind in
                Button(kind.name) { model.pickStudioKind(kind) }
                    .accessibilityIdentifier("moments.studio.kind.\(kind.rawValue)")
            }
        } label: {
            HStack(spacing: 6) {
                Icon(.plus, size: 15, strokeWidth: 2.4, color: .white)
                Text("Ask / Kind")
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 12)
            .frame(height: 36)
            .background(Capsule().fill(Color.black.opacity(0.42)))
            .overlay(Capsule().stroke(Color.white.opacity(0.28), lineWidth: 1))
            .contentShape(Capsule())
        }
        .accessibilityLabel("Ask or kind")
        .accessibilityHint("Makes this one of the kinds of Pulse posts instead of a Moment")
        .accessibilityIdentifier("moments.studio.kind")
    }

    private func picked(_ kind: StudioPostKind) -> some View {
        HStack(spacing: 6) {
            Text(kind.name)
                .font(.system(size: 14.5, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
            Button { model.clearStudioKind() } label: {
                Icon(.x, size: 14, strokeWidth: 2.6, color: Theme.Color.appText)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Keep it a Moment instead")
            .accessibilityIdentifier("moments.studio.kind.clear")
        }
        .padding(.leading, 12)
        .padding(.trailing, 4)
        .frame(height: 36)
        .background(Capsule().fill(Color.white))
        .environment(\.colorScheme, .light)
        .accessibilityIdentifier("moments.studio.kind.picked")
    }

    /// The app's own chip (CONTRACT 6d): yes makes the post a Question.
    private var keepUntilAnswered: some View {
        HStack(spacing: 2) {
            Button { model.pickStudioKind(.askLocal) } label: {
                Text("Keep until answered?")
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.leading, 12)
                    .frame(height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Makes this a question that stays until it's answered")
            .accessibilityIdentifier("moments.studio.askOffer")
            Button { model.studioPost.askDeclined = true } label: {
                Icon(.x, size: 13, strokeWidth: 2.6, color: Color.white.opacity(0.85))
                    .frame(width: 30, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("No, keep it a Moment")
            .accessibilityIdentifier("moments.studio.askOffer.no")
        }
        .background(Capsule().fill(Theme.Color.primarySolid.opacity(0.9)))
    }
}

/// The drawer's first part while a kind is picked: the kind's own details.
struct MomentsStudioKindDetails: View {
    let model: MomentsComposerModel
    let kind: StudioPostKind

    var body: some View {
        // The drawer's title already names the kind.
        VStack(alignment: .leading, spacing: Spacing.s2) {
            switch kind {
            case .alert: alertKinds
            case .lostFound: lostFound
            case .event: event
            case .askLocal, .recommendation, .localUpdate, .localWin:
                Text("\(kind.hint).")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
        .padding(.horizontal, Spacing.s1)
        .padding(.top, Spacing.s3)
        // What stopped Post (a time, a phone number) goes once it's put right.
        .onChange(of: model.studioPost) { _, _ in
            if model.studioKindBlocker == nil, model.error != nil { model.error = nil }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.studio.kindDetails")
    }

    // MARK: Heads-up

    private var alertKinds: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("What it's about")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.Color.appText)
            FlowChips(
                items: PulseSafetyAlertKind.allCases.map { ($0.rawValue, $0.label) },
                selected: model.studioPost.alertKind.rawValue
            ) { raw in
                if let picked = PulseSafetyAlertKind(rawValue: raw) { model.studioPost.alertKind = picked }
            }
        }
    }

    // MARK: Lost and found

    private var lostFound: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            FlowChips(items: [("lost", "Lost"), ("found", "Found")], selected: model.studioPost.found ? "found" : "lost") { raw in
                model.studioPost.found = raw == "found"
            }
            Text("How to reach you")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.Color.appText)
                .padding(.top, Spacing.s1)
            FlowChips(
                items: [("dm", "Direct message"), ("comment", "Comments"), ("phone", "Phone")],
                selected: model.studioPost.contact
            ) { raw in model.studioPost.contact = raw }
            if model.studioPost.contact == "phone" {
                TextField("Phone number", text: Binding(get: { model.studioPost.phone }, set: { model.studioPost.phone = $0 }))
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .padding(.horizontal, Spacing.s3)
                    .frame(height: 44)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
                    .accessibilityIdentifier("moments.studio.kind.phone")
            }
        }
    }

    // MARK: Event

    private var event: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            DatePicker(
                "Starts",
                selection: Binding(get: { model.studioPost.eventStart ?? Self.nextHour }, set: { model.studioPost.eventStart = $0 }),
                in: Date()...,
                displayedComponents: [.date, .hourAndMinute]
            )
            .font(.system(size: 15, weight: .medium))
            .accessibilityIdentifier("moments.studio.kind.eventStart")
            // A start shown but never touched is still the one posted: the next hour.
            .onAppear { if model.studioPost.eventStart == nil { model.studioPost.eventStart = Self.nextHour } }
            Toggle(isOn: Binding(
                get: { model.studioPost.eventEnd != nil },
                set: { on in
                    let start = model.studioPost.eventStart ?? Self.nextHour
                    model.studioPost.eventEnd = on ? start.addingTimeInterval(2 * 3600) : nil
                }
            )) {
                Text("Add an end time")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Color.appText)
            }
            .tint(Theme.Color.primarySolid)
            .accessibilityIdentifier("moments.studio.kind.eventEndOn")
            if let end = model.studioPost.eventEnd {
                DatePicker(
                    "Ends",
                    selection: Binding(get: { end }, set: { model.studioPost.eventEnd = $0 }),
                    displayedComponents: [.date, .hourAndMinute]
                )
                .font(.system(size: 15, weight: .medium))
                .accessibilityIdentifier("moments.studio.kind.eventEnd")
            }
            TextField(
                "Where (optional)",
                text: Binding(get: { model.studioPost.venue }, set: { model.studioPost.venue = String($0.prefix(200)) })
            )
            .padding(.horizontal, Spacing.s3)
            .frame(height: 44)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
            .accessibilityIdentifier("moments.studio.kind.venue")
        }
    }

    /// The top of the next hour.
    private static var nextHour: Date {
        let calendar = Calendar.current
        let now = Date()
        let hour = calendar.dateInterval(of: .hour, for: now)?.start ?? now
        return hour.addingTimeInterval(3600)
    }
}

/// Chips that wrap onto as many lines as they need, one of them picked.
private struct FlowChips: View {
    let items: [(String, String)]
    let selected: String
    let pick: (String) -> Void

    var body: some View {
        MomentsStudioChipFlow(spacing: Spacing.s2) {
            ForEach(items, id: \.0) { raw, label in
                let on = raw == selected
                Button { pick(raw) } label: {
                    Text(label)
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(on ? Color.white : Theme.Color.appText)
                        .padding(.horizontal, 12)
                        .frame(height: 36)
                        .background(Capsule().fill(on ? Theme.Color.primarySolid : Theme.Color.appSurfaceRaised))
                        .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: on ? 0 : 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("moments.studio.kind.chip.\(raw)")
            }
        }
    }
}

/// Lays chips out in rows, wrapping to the next row when one doesn't fit.
private struct MomentsStudioChipFlow: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.last.map { $0.y + $0.height } ?? 0
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.items {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
        }
    }

    private struct Row {
        var items: [Int] = []
        var y: CGFloat = 0
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            if !rows[rows.count - 1].items.isEmpty, rows[rows.count - 1].width + spacing + size.width > width {
                let last = rows[rows.count - 1]
                rows.append(Row(y: last.y + last.height + spacing))
            }
            var row = rows[rows.count - 1]
            row.width += (row.items.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.items.append(index)
            rows[rows.count - 1] = row
        }
        return rows
    }
}

extension MomentsComposerModel {
    /// The caption field's words while a kind is picked: the post's, up to 500 characters.
    var studioPostWordsBinding: Binding<String> {
        Binding(
            get: { self.studioPost.words },
            set: { self.studioPost.words = String($0.prefix(MomentsStudioPostDraft.wordsLimit)) }
        )
    }
}

extension StudioPostKind {
    /// The caption field's prompt while this kind is picked.
    var wordsPrompt: String {
        self == .askLocal ? "Ask something" : "Say what it's about"
    }
}
