//
//  MomentFieldCard.swift
//  Pantopus
//
//  A thing's field card in the viewer ("Pulse, reinvented" phase 2, board B3; CONTRACT 7d and 7f). The first tap on a
//  thing anyone makes is one Pantopus AI call on the server; the card is kept with the post, so every later tap reads
//  it for free. It always says "likely", gives one line of why and a source a reader can open, never says a plant or a
//  mushroom is safe to eat, and lets people say it's wrong. "Collect" keeps it in the reader's field guide. "Not
//  right?" opens its own small sheet, so the keyboard never covers the card's fields on the photo.
//

import SwiftUI

struct MomentFieldCardView: View {
    let moment: MomentDTO
    let dot: MomentDotDTO
    @Environment(\.openURL) private var openURL
    @State private var card: MomentFieldCardDTO?
    @State private var busy = false
    @State private var problem: String?
    @State private var fixing = false
    @State private var name = ""
    @State private var note = ""
    @FocusState private var typing: Bool
    /// The reader's field guide over the viewer, from this card (a sheet hung on the dots' layer kept being shown
    /// again, about once a second).
    @State private var guiding = false
    private let prompt = MomentDotPrompt.shared

    init(moment: MomentDTO, dot: MomentDotDTO) {
        self.moment = moment
        self.dot = dot
        _card = State(initialValue: dot.card)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            if let card {
                named(card)
            } else {
                Text(dot.label.map { "Maybe \($0)" } ?? "Something in the photo")
                    .font(.system(size: 15.5, weight: .bold))
                    .foregroundStyle(.white)
                Text(problem ?? (busy ? "Naming it…" : ""))
                    .font(.system(size: 13))
                    .foregroundStyle(Color.white.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
                if problem != nil, !busy, !(problem ?? "").contains("off for") {
                    button("Try again") { Task { await run { try await open() } } }
                }
            }
        }
        // Opening reads the card: a kept one shows at once and is read again (no model call) for this reader's own
        // Collect and correction; without one, this first tap makes it.
        .task { await run { try await open() } }
    }

    @ViewBuilder
    private func named(_ card: MomentFieldCardDTO) -> some View {
        if let name = card.name {
            (Text("Likely \(name)").bold() + Text(card.scientific.map { "  \($0)" } ?? "").italic())
                .font(.system(size: 15.5))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            Text("Not sure what this is")
                .font(.system(size: 15.5, weight: .bold))
                .foregroundStyle(.white)
        }
        Text(card.why)
            .font(.system(size: 14))
            .foregroundStyle(.white)
            .fixedSize(horizontal: false, vertical: true)
        if let caution = card.caution {
            Text(caution)
                .font(.system(size: 13.5, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 8).fill(Theme.Color.warningBg))
                // Dark words on the light warning colour, whatever the viewer's dark look.
                .environment(\.colorScheme, .light)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("moments.viewer.fieldCard.caution")
        }
        if let source = card.source, let url = MomentDotCard.openable(source.url) {
            Button { openURL(url) } label: {
                HStack(spacing: 6) {
                    Text(source.title)
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(.white)
                        .underline()
                        .lineLimit(2)
                    Icon(.externalLink, size: 13, strokeWidth: 2.2, color: .white)
                }
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens \(url.host() ?? "the source")")
            .accessibilityIdentifier("moments.viewer.fieldCard.source")
        }
        Text(madeBy(card))
            .font(.system(size: 12))
            .foregroundStyle(Color.white.opacity(0.72))
            .fixedSize(horizontal: false, vertical: true)
        actions(card)
            .sheet(isPresented: $fixing) { correctionSheet }
            .sheet(isPresented: $guiding) {
                MomentsFieldGuide { guiding = false }
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
        if let problem, !fixing {
            Text(problem)
                .font(.system(size: 13))
                .foregroundStyle(Color.white.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func madeBy(_ card: MomentFieldCardDTO) -> String {
        var words = "Named by \(card.namedBy). It can be wrong."
        if card.corrections > 0 {
            words += " \(card.corrections) \(card.corrections == 1 ? "person says" : "people say") it's something else."
        }
        return words
    }

    private func actions(_ card: MomentFieldCardDTO) -> some View {
        MomentsStudioTrayFlow(spacing: Spacing.s2) {
            if card.name != nil {
                button(card.collected == true ? "In your field guide" : "Collect", icon: card.collected == true ? .check : .plus) {
                    Task { await run { try await collect(!(card.collected ?? false)) } }
                }
                .accessibilityIdentifier("moments.viewer.fieldCard.collect")
            }
            if card.collected == true {
                button("Open the guide") { guiding = true }
                    .accessibilityIdentifier("moments.viewer.fieldCard.guide")
            }
            button(card.myCorrection.map { "You said: \($0.name)" } ?? "Not right?") {
                name = card.myCorrection?.name ?? ""
                note = card.myCorrection?.note ?? ""
                fixing = true
            }
            .accessibilityIdentifier("moments.viewer.fieldCard.correct")
        }
    }

    /// "Not right?": what it is and how they know, in a sheet of its own over the viewer.
    private var correctionSheet: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Text("Not right?")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            Text("Say what you think it is. The card stays as it is; its author sees what people say.")
                .font(.system(size: 13.5))
                .foregroundStyle(Color.white.opacity(0.75))
                .fixedSize(horizontal: false, vertical: true)
            correctionForm
            if let problem {
                Text(problem)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.white.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(white: 0.11).ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear { typing = true }
    }

    private var correctionForm: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            input("What it is", text: $name, limit: 60, id: "name")
                .focused($typing)
            input("How you know (optional)", text: $note, limit: 140, id: "note")
            HStack(spacing: Spacing.s2) {
                button("Cancel") { fixing = false }
                button("Send") {
                    let named = name.trimmingCharacters(in: .whitespacesAndNewlines)
                    let how = note.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !named.isEmpty else { return }
                    Task {
                        await run {
                            try await StudioPlayAPI.send(
                                StudioPlayEndpoints.correctCard(postId: moment.id, dot: dot.id, name: named, note: how.isEmpty ? nil : how),
                                as: FieldCardEnvelope.self
                            ).card
                        }
                        if problem == nil { fixing = false }
                    }
                }
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityIdentifier("moments.viewer.fieldCard.send")
            }
        }
    }

    private func input(_ placeholder: String, text: Binding<String>, limit: Int, id: String) -> some View {
        TextField("", text: text, prompt: Text(placeholder).foregroundColor(Color.white.opacity(0.6)))
            .font(.system(size: 14.5))
            .foregroundStyle(.white)
            .tint(.white)
            .padding(.horizontal, 12)
            .frame(height: 40)
            .typesInFieldOnTap()
            .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.14)))
            .onChange(of: text.wrappedValue) { _, typed in
                if typed.count > limit { text.wrappedValue = String(typed.prefix(limit)) }
            }
            .accessibilityLabel(placeholder)
            .accessibilityIdentifier("moments.viewer.fieldCard.\(id)")
    }

    private func button(_ words: String, icon: PantopusIcon? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let icon { Icon(icon, size: 13, strokeWidth: 2.4, color: .white) }
                Text(words)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
            .padding(.horizontal, 11)
            .frame(height: 32)
            .background(Capsule().fill(Color.white.opacity(0.18)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    // MARK: - Requests

    private func open() async throws -> MomentFieldCardDTO {
        try await StudioPlayAPI.send(StudioPlayEndpoints.fieldCard(postId: moment.id, dot: dot.id), as: FieldCardEnvelope.self).card
    }

    private func collect(_ keep: Bool) async throws -> MomentFieldCardDTO? {
        let endpoint = StudioPlayEndpoints.collect(postId: moment.id, dot: dot.id, keep: keep)
        if keep { return try await StudioPlayAPI.send(endpoint, as: FieldCardEnvelope.self).card }
        try await StudioPlayAPI.send(endpoint)
        return try await open()
    }

    private func run(_ work: () async throws -> MomentFieldCardDTO?) async {
        guard !busy else { return }
        busy = true
        problem = nil
        defer { busy = false }
        do {
            if let answer = try await work() { card = answer }
        } catch let failure as StudioPlayFailure {
            problem = Self.refusal(failure.code) ?? failure.message("Couldn't do that. Try again.")
        } catch {
            problem = "Couldn't do that. Try again."
        }
    }

    /// The words for a card the server won't make (CONTRACT 7d's codes).
    static func refusal(_ code: String?) -> String? {
        switch code {
        case "PANTOPUS_AI_OFF": "Pantopus AI is off for you. Turn it on in Settings."
        case "FIELD_CARD_OFF": "The author keeps Pantopus AI off for their photos."
        case "AI_DISABLED": "Naming things isn't available right now."
        case "AI_BUDGET": "That's all the new cards for today. Try again tomorrow."
        case "FIELD_CARD_FAILED", "PANTOPUS_AI_UNAVAILABLE": "Couldn't name it this time. Try again."
        default: nil
        }
    }
}
