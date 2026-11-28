//
//  MomentsStudioSuggest.swift
//  Pantopus
//
//  Illuminate's suggestion ("Pulse, reinvented" phase 2, PHASE-2 piece 9; CONTRACT 7i): at most one playable kind for
//  what the person is making, worked out on the phone from what the Studio already holds, by the one table all three
//  apps use. No request, no model call: the unposted words never leave the phone, and the server never learns that a
//  suggestion was shown, taken or dropped. Only while the person's Pantopus AI is on. A tap opens that kind's own form
//  filled only with what the caption already says; nothing is added until the person finishes it; ✕ drops it for this
//  post until the Studio opens again.
//

import Observation
import SwiftUI

/// What the table suggests.
enum MomentsStudioSuggestion: Equatable {
    case deck
    case beforeAfter
    case guess
    case poll([String])
    case question
    case swatch

    /// The chip's words (CONTRACT 7i).
    var words: String {
        switch self {
        case .deck: "Post these as steps?"
        case .beforeAfter: "Show before and after?"
        case .guess: "Let people guess?"
        case .poll: "Make it a poll?"
        case .question: "Ask with a question box?"
        case .swatch: "Try the colours on?"
        }
    }
}

/// The table (CONTRACT 7i), first match wins. Pure: the same words give the same answer on every app.
enum MomentsSuggestRules {
    struct Input {
        var caption: String
        /// Photos and videos picked together (0 or 1 for one alone).
        var picked: Int
        var mayDeck: Bool
        var mayBeforeAfter: Bool
        /// A playable item may go on this post at all.
        var mayPlay: Bool
        var mayPhotoOnly: Bool
    }

    static let howWords = "how many|how much|how far|how long|how tall|how old|how deep|how high|how big|what year"
        .split(separator: "|").map(String.init)
    static let colourWords = Set("""
    red orange yellow green blue purple violet pink brown black white gray grey gold silver teal navy beige cream maroon
    turquoise lavender olive mint coral peach rust burgundy ivory charcoal emerald crimson amber tan sage paint colour
    color colours colors swatch
    """.split { $0 == " " || $0 == "\n" }.map(String.init))

    static func suggest(_ input: Input) -> MomentsStudioSuggestion? {
        let caption = input.caption.trimmingCharacters(in: .whitespacesAndNewlines)
        if (3...4).contains(input.picked), input.mayDeck { return .deck }
        if input.picked == 2, input.mayBeforeAfter { return .beforeAfter }
        guard input.mayPlay, !caption.isEmpty else { return nil }
        let lower = caption.lowercased()
        let question = caption.contains("?") || caption.contains("？")
        if question {
            if lower.range(of: "[0-9]", options: .regularExpression) != nil || howWords.contains(where: { has(lower, $0) }) {
                return .guess
            }
            if has(lower, "or"), let choices = choices(in: caption) { return .poll(choices) }
            return .question
        }
        if input.mayPhotoOnly, words(of: lower).contains(where: colourWords.contains) { return .swatch }
        return nil
    }

    /// A poll's choices (rule 4): without its "?", what follows its last ":", split on commas and the whole word "or".
    static func choices(in caption: String) -> [String]? {
        var text = caption.replacingOccurrences(of: "?", with: "").replacingOccurrences(of: "？", with: "")
        if let colon = text.range(of: ":", options: .backwards) { text = String(text[colon.upperBound...]) }
        let parts = text.replacingOccurrences(of: "\\bor\\b", with: ",", options: [.regularExpression, .caseInsensitive])
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard (2...4).contains(parts.count), parts.allSatisfy({ (1...40).contains($0.count) }) else { return nil }
        return parts
    }

    /// The phrase as whole words ("door" is not "or", "redwood" is not "red").
    private static func has(_ lower: String, _ phrase: String) -> Bool {
        lower.range(of: "\\b\(NSRegularExpression.escapedPattern(for: phrase))\\b", options: .regularExpression) != nil
    }

    private static func words(of lower: String) -> [String] {
        lower.split { !$0.isLetter }.map(String.init)
    }
}

/// The suggestion's state for the composer open now (one at a time): which post it was dropped on, and a form to open
/// filled.
@Observable
@MainActor
final class MomentsStudioSuggestState {
    static let shared = MomentsStudioSuggestState()

    @ObservationIgnored private weak var owner: MomentsComposerModel?
    private var droppedOn: Set<Int> = []
    struct Fill {
        let kind: MomentsStudioPlayMaker.Making
        let prompt: String
        let options: [String]
    }

    /// The Play maker opens on this kind, filled, the next time it shows.
    var prefill: Fill?

    private func claim(_ model: MomentsComposerModel) {
        guard owner !== model else { return }
        owner = model
        droppedOn = []
        prefill = nil
    }

    func dropped(_ model: MomentsComposerModel) -> Bool {
        // Read first, so the chip is told when it changes (even before this composer first dropped one).
        let dropped = droppedOn
        return owner === model && dropped.contains(model.pickedStep ?? 1)
    }

    func drop(_ model: MomentsComposerModel) {
        claim(model)
        droppedOn.insert(model.pickedStep ?? 1)
    }

    func fill(_ model: MomentsComposerModel, _ kind: MomentsStudioPlayMaker.Making, prompt: String, options: [String] = []) {
        claim(model)
        prefill = Fill(kind: kind, prompt: String(prompt.prefix(100)), options: options)
    }
}

extension MomentsComposerModel {
    /// The one suggestion for what's in the Studio now, or nil (CONTRACT 7i's "when it shows nothing").
    var studioSuggestion: MomentsStudioSuggestion? {
        guard PulseReinventedFlags.shared.isOn, MomentsStudioAI.shared.on == true, let draft else { return nil }
        guard (studioPlay ?? []).isEmpty, studioPair == nil, !MomentsStudioSuggestState.shared.dropped(self) else { return nil }
        let words = draft.kind == .text ? text : caption
        let alone = pickedTogether < 2
        if alone, words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return nil }
        let photo = draft.kind == .photo
        return MomentsSuggestRules.suggest(.init(
            caption: words,
            picked: pickedStep == 1 ? pickedTogether : 0,
            mayDeck: offersDeck && studioDeck == nil,
            mayBeforeAfter: offersBeforeAfter,
            mayPlay: offersMorePlay,
            mayPhotoOnly: photo && offersLooks
        ))
    }
}

/// The chip, over the bar: a tap opens the kind's form, ✕ drops it for this post.
struct MomentsStudioSuggestChip: View {
    let model: MomentsComposerModel
    let openDrawer: () -> Void
    let openTray: () -> Void

    var body: some View {
        // Always drawn (zero height without a chip), so the read below runs: a modifier on an empty view is dropped.
        VStack(spacing: 0) {
            Color.clear.frame(height: 0)
            if let suggestion = model.studioSuggestion {
                HStack(spacing: Spacing.s2) {
                    Button { open(suggestion) } label: {
                        HStack(spacing: Spacing.s2) {
                            Icon(.sparkles, size: 16, strokeWidth: 2.2, color: .white)
                            Text(suggestion.words)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Pantopus AI suggests this. Nothing is added until you finish it.")
                    .accessibilityIdentifier("moments.studio.suggest")
                    Button { MomentsStudioSuggestState.shared.drop(model) } label: {
                        Icon(.x, size: 14, strokeWidth: 2.4, color: .white)
                            .frame(width: 28, height: 28)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Drop the suggestion")
                    .accessibilityIdentifier("moments.studio.suggest.drop")
                }
                .padding(.leading, Spacing.s3)
                .padding(.trailing, Spacing.s1)
                .padding(.vertical, 4)
                .background(Capsule().fill(Color.black.opacity(0.55)))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Spacing.s4)
                .padding(.bottom, Spacing.s3)
            }
        }
        // The person's Pantopus AI choice, read once a run while the switch is on (nothing is sent with it off).
        .task { await MomentsStudioAI.shared.read() }
    }

    /// The deck: the drawer, at its own choice (unticked). Before and after: the tray, at its row. The rest: the Play
    /// maker, on that kind, filled with what the caption says.
    private func open(_ suggestion: MomentsStudioSuggestion) {
        let state = MomentsStudioSuggestState.shared
        let words = model.draft?.kind == .text ? model.text : model.caption
        let prompt = words.trimmingCharacters(in: .whitespacesAndNewlines)
        switch suggestion {
        case .deck: return openDrawer()
        case .beforeAfter: return openTray()
        case .guess: state.fill(model, .guess, prompt: prompt)
        case let .poll(choices): state.fill(model, .poll, prompt: prompt, options: choices)
        case .question: state.fill(model, .question, prompt: prompt)
        case .swatch: state.fill(model, .swatch, prompt: "")
        }
        openTray()
    }
}
