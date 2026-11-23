//
//  PlanAnswerSheet.swift
//  Pantopus
//
//  Plans for the holidays, board 18 (ImIn): the "I'm in" sheet for someone
//  invited to a private plan that takes answers: "Who's coming?", adults and
//  (with kids welcome) kids, a note for the host, then "I'm in", "Maybe" and
//  "Can't make it". Board 20's banners on the plan, "You're in" with the
//  numbers and "You said maybe", each open it again with "Change".
//

import SwiftUI

/// What the sheet starts from when someone changes their answer.
struct PlanAnswerPrefill: Equatable {
    let adults: Int
    let kids: Int
    let note: String?
}

struct PlanAnswerSheet: View {
    let card: PlanCardDTO
    let prefill: PlanAnswerPrefill?
    /// Each returns nil when it went through, else the server's sentence.
    let onIn: (AskToJoinBody) async -> String?
    let onMaybe: () async -> String?
    let onCantMakeIt: () async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var adults = 1
    @State private var kids = 0
    @State private var note = ""
    @State private var working: String?
    @State private var failed: String?
    @State private var contentHeight: CGFloat = 0
    @FocusState private var noteFocused: Bool

    private static let noteLimit = 280

    private var host: String {
        PlanCardLines.hostName(card)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                header
                steppers
                noteField
                if let failed {
                    Text(failed)
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("planAnswerError")
                }
                buttons
                Text("\(host) sees your answer")
                    .planFont(.caption)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s5)
            .padding(.bottom, Spacing.s6)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        }
        .scrollDismissesKeyboard(.interactively)
        .presentationDetents(contentHeight > 0 ? [.height(contentHeight), .large] : [.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(26)
        .presentationBackground(Theme.Color.appSurface)
        .onAppear {
            guard let prefill else { return }
            adults = min(max(prefill.adults, 1), 10)
            kids = min(max(prefill.kids, 0), 10)
            note = prefill.note ?? ""
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planAnswerSheet")
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Who's coming?")
                    .planFont(.h3)
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityAddTraits(.isHeader)
                if card.kidsWelcome {
                    Text("\(host) asked for adults and kids")
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            Spacer()
            Button { dismiss() } label: {
                Icon(.x, size: 16, color: Theme.Color.appText)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Theme.Color.appSurfaceSunken))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
    }

    private var steppers: some View {
        PlanFormCard {
            if card.kidsWelcome {
                stepperRow("Adults", subtitle: nil, value: $adults, range: 1...10, identifier: "planAnswerAdults")
                Divider().overlay(Theme.Color.appBorder)
                stepperRow("Kids", subtitle: nil, value: $kids, range: 0...10, identifier: "planAnswerKids")
            } else {
                stepperRow("People", subtitle: "Including you", value: $adults, range: 1...10, identifier: "planAnswerPeople")
            }
        }
    }

    private func stepperRow(
        _ title: String,
        subtitle: String?,
        value: Binding<Int>,
        range: ClosedRange<Int>,
        identifier: String
    ) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 0) {
                Text(title).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                if let subtitle { Text(subtitle).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary) }
            }
            Spacer()
            PlanStepper(value: value, range: range, label: title)
                .accessibilityIdentifier(identifier)
        }
        .padding(.vertical, Spacing.s2)
    }

    private var noteField: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text.planOverline("A note for \(host), if you like")
            TextField("Anything \(host) should know", text: $note, axis: .vertical)
                .planFont(.body)
                .lineLimit(1...4)
                .focused($noteFocused)
                .padding(.horizontal, 14)
                .padding(.vertical, Spacing.s3)
                .frame(minHeight: 48, alignment: .topLeading)
                .typesInFieldOnTap($noteFocused)
                .background(RoundedRectangle(cornerRadius: Radii.md, style: .continuous).fill(Theme.Color.appSurface))
                .overlay(RoundedRectangle(cornerRadius: Radii.md, style: .continuous).stroke(Theme.Color.appBorderStrong, lineWidth: 1))
                .onChange(of: note) { _, new in
                    if new.count > Self.noteLimit { note = String(new.prefix(Self.noteLimit)) }
                }
                .accessibilityLabel("A note for \(host), if you like")
                .accessibilityIdentifier("planAnswerNote")
        }
    }

    private var buttons: some View {
        VStack(spacing: 10) {
            Button { run("in") { await onIn(askBody) } } label: {
                PlanButtonLabel(
                    title: card.isFull && prefill == nil ? "Join the waitlist" : "I'm in",
                    kind: .primary,
                    isLoading: working == "in"
                )
            }
            .planButton(.primary)
            .accessibilityIdentifier("planAnswerIn")
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { maybeButton
                    cantButton
                }
                VStack(spacing: 10) { maybeButton
                    cantButton
                }
            }
        }
        .disabled(working != nil)
    }

    private var maybeButton: some View {
        Button { run("maybe") { await onMaybe() } } label: {
            PlanButtonLabel(title: "Maybe", kind: .secondary, isLoading: working == "maybe")
        }
        .planButton(.secondary)
        .accessibilityIdentifier("planAnswerMaybe")
    }

    private var cantButton: some View {
        Button { run("cant") { await onCantMakeIt() } } label: {
            PlanButtonLabel(title: "Can't make it", kind: .secondary, isLoading: working == "cant")
        }
        .planButton(.secondary)
        .accessibilityIdentifier("planAnswerCant")
    }

    /// Adults are the party and kids the kids, with kids welcome; otherwise the party is everyone.
    private var askBody: AskToJoinBody {
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        return AskToJoinBody(
            partySize: adults,
            note: trimmed.isEmpty ? nil : trimmed,
            kidsCount: card.kidsWelcome ? kids : nil
        )
    }

    private func run(_ key: String, _ action: @escaping () async -> String?) {
        Task {
            working = key
            failed = nil
            let failure = await action()
            working = nil
            if let failure { failed = failure } else { dismiss() }
        }
    }
}

/// Board 20: "You're in" with the numbers and "Change"; "You said maybe" with "Change", quieter.
struct PlanAnswerBanner: View {
    enum Kind { case isIn, maybe }

    let kind: Kind
    let line: String
    /// "See what to bring" under a hairline (JOURNEYS 2): things are still open and this person has claimed none.
    var bring: Int?
    let onChange: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            answer
            if kind == .isIn, let bring { PlanBringPointerRow(open: bring) }
        }
        .padding(.leading, 14)
        .padding(.trailing, Spacing.s2)
        .padding(.vertical, Spacing.s2)
        .background(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous)
            .fill(kind == .isIn ? Theme.Color.successBg : Theme.Color.appSurfaceSunken))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(kind == .isIn ? "planInBanner" : "planMaybeBanner")
    }

    private var answer: some View {
        Group {
            if typeSize.isAccessibilitySize {
                // The largest text: "Change" goes under the words instead of breaking beside them.
                VStack(alignment: .leading, spacing: Spacing.s1) {
                    HStack(spacing: Spacing.s3) { glyph
                        words
                    }
                    changeButton
                }
            } else {
                HStack(spacing: Spacing.s3) { glyph
                    words
                    changeButton
                }
            }
        }
    }

    private var glyph: some View {
        RoundedRectangle(cornerRadius: 11, style: .continuous)
            .fill(kind == .isIn ? Theme.Color.successSolid : Theme.Color.appSurface)
            .overlay {
                if kind == .maybe {
                    RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1)
                }
            }
            .frame(width: 34, height: 34)
            .overlay(Icon(
                kind == .isIn ? .check : .helpCircle,
                size: 18,
                strokeWidth: kind == .isIn ? 2.6 : 2,
                color: kind == .isIn ? Theme.Color.appTextInverse : Theme.Color.appTextStrong
            ))
            .accessibilityHidden(true)
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(kind == .isIn ? "You're in" : "You said maybe").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
            Text(line)
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var changeButton: some View {
        Button("Change", action: onChange)
            .planFont(.bodyStrong)
            .foregroundStyle(Theme.Color.primaryInk)
            .lineLimit(1)
            .fixedSize()
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityLabel("Change your answer")
            .accessibilityIdentifier("planAnswerChange")
    }
}

extension PlanCardDTO {
    /// Board 18's sheet and board 20's banners: a private plan that takes answers.
    var answersWithNumbers: Bool {
        takesGuestAnswers && isPrivate
    }

    /// "2 adults, 1 kid" with kids welcome; "Just you" or "3 people" otherwise (board 20's banner).
    func myNumbers(_ request: PlanMyRequestDTO?) -> String {
        let adults = request?.partySize ?? 1
        let kids = kidsWelcome ? request?.kidsCount ?? 0 : 0
        if !kidsWelcome { return adults == 1 ? "Just you" : "\(adults) people" }
        return PlanHeadcountCopy.adultsAndKids(adults: adults, kids: kids)
    }
}
