//
//  MomentPlayLayer.swift
//  Pantopus
//
//  Playable items over a Moment's picture in the viewer ("Pulse, reinvented" phase 2; CONTRACT 7b and 7g; boards B5,
//  B6 and B9), only while the switch is on for the person watching. Each sits where its author placed it, sized as a
//  share of the picture's width like a stamp. A reader answers (`PUT /api/reinvented/play/:id/:item`) and sees what the
//  server lets them see; the author sees the results instead of the controls. The viewer holds still while the reader
//  has an item left to answer, or a fog left to wipe. Taps on an item stay in it: they never step the viewer.
//

import Observation
import SwiftUI

/// Items as answered in this run (the Moment's own copy is what it was when it opened), and fogs wiped.
@Observable
@MainActor
final class MomentPlayStore {
    static let shared = MomentPlayStore()

    private var answered: [String: [String: MomentPlayItem]] = [:]
    var wiped: Set<String> = []
    /// The item whose author's answers list is open (a question box's answers, a board's notes).
    var answersOf: (moment: String, item: MomentPlayItem)?

    /// The Moment's items, each as last answered here.
    func items(_ moment: MomentDTO) -> [MomentPlayItem] {
        moment.layers.play.map { answered[moment.id]?[$0.id] ?? $0 }
    }

    func keep(_ item: MomentPlayItem, on momentId: String) {
        answered[momentId, default: [:]][item.id] = item
    }

    /// Answers (or changes the answer); the server's item replaces this one. Nil when it went through, else the words.
    func answer(_ body: MomentPlayAnswerBody, item: MomentPlayItem, on momentId: String) async -> String? {
        do {
            let answer = try await StudioPlayAPI.send(
                StudioPlayEndpoints.answer(postId: momentId, item: item.id, body: body),
                as: MomentPlayItemEnvelope.self
            )
            keep(answer.item, on: momentId)
            return nil
        } catch let failure as StudioPlayFailure {
            return failure.message("Couldn't send that. Try again.")
        } catch {
            return "Couldn't send that. Try again."
        }
    }

    /// Items a reader can still answer: open, not yet answered, and of a kind that takes an answer.
    func waiting(_ moment: MomentDTO) -> Bool {
        items(moment).contains { item in
            item.open && item.mine == nil && [.poll, .slider, .board, .question, .guess].contains(item.kind)
        }
    }
}

extension MomentsViewerModel {
    /// The viewer holds still while the reader has an item to answer or a fog to wipe (as the web's viewer does).
    var playItemsHold: Bool {
        guard PulseReinventedFlags.shared.isOn, let moment else { return false }
        let store = MomentPlayStore.shared
        if store.answersOf?.moment == moment.id { return true }
        let fogged = moment.layers.play.contains { $0.kind == .fog } && !store.wiped.contains(moment.id) && !isMine
        return fogged || store.waiting(moment)
    }
}

/// The items on the picture, each at its place, at its author's size.
struct MomentPlayOverlay: View {
    let moment: MomentDTO
    let picture: CGSize?
    private let store = MomentPlayStore.shared

    var body: some View {
        GeometryReader { geo in
            let frame = picture.map { MomentMarks.fill($0, in: geo.size) } ?? CGRect(origin: .zero, size: geo.size)
            let unit = min(frame.width, geo.size.width) / 402
            let items = store.items(moment)
            ZStack {
                if let fog = items.first(where: { $0.kind == .fog }), !store.wiped.contains(moment.id) {
                    MomentFogLayer(moment: moment, item: fog)
                }
                ForEach(items.filter { $0.kind == .swatch }) { swatch in
                    MomentSwatchLayer(item: swatch, frame: frame)
                }
                ForEach(items.filter { ![.fog, .swatch, .beforeAfter, .unknown].contains($0.kind) }) { item in
                    MomentPlayCard(moment: moment, item: item)
                        .frame(width: 268)
                        .scaleEffect(CGFloat(item.scale) * unit)
                        .rotationEffect(.degrees(item.rotation))
                        .position(
                            x: min(max(frame.minX + item.x * frame.width, 60), geo.size.width - 60),
                            y: frame.minY + item.y * frame.height
                        )
                }
            }
        }
        .sheet(isPresented: Binding(
            get: { store.answersOf?.moment == moment.id },
            set: { if !$0 { store.answersOf = nil } }
        )) {
            if let item = store.answersOf?.item {
                MomentPlayAnswersList(momentId: moment.id, item: item) { store.answersOf = nil }
                    .presentationDetents([.medium, .large])
            }
        }
    }
}

/// One item's card: a dark rounded panel holding the kind's own controls.
struct MomentPlayCard: View {
    /// Nil in the Studio, where the item is drawn as it will look, with nothing to press.
    let moment: MomentDTO?
    let item: MomentPlayItem
    var preview = false

    var body: some View {
        Group {
            if let moment, !preview {
                switch item.kind {
                case .poll: MomentPollCard(moment: moment, item: item)
                case .slider: MomentSliderCard(moment: moment, item: item)
                case .board: MomentBoardCard(moment: moment, item: item)
                case .question: MomentQuestionCard(moment: moment, item: item)
                case .guess: MomentGuessRevealCard(moment: moment, item: item)
                case .countdown: MomentCountdownCard(item: item)
                case .quote: MomentQuoteCard(item: item)
                case .fog, .swatch, .beforeAfter, .unknown: EmptyView()
                }
            } else {
                MomentPlayPreview(item: item)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.black.opacity(0.72)))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.white.opacity(0.16), lineWidth: 1))
        .allowsHitTesting(!preview)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.play.\(item.kind.rawValue)")
    }
}

/// Words on a dark card.
struct MomentPlayTitle: View {
    let words: String

    var body: some View {
        Text(words)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(.white)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A small line under a card's controls (a count, what the author sees, an error).
struct MomentPlayNote: View {
    let words: String

    var body: some View {
        Text(words)
            .font(.system(size: 12.5))
            .foregroundStyle(Color.white.opacity(0.75))
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The author's list of a question box's answers or a board's notes, newest first; each can be removed.
struct MomentPlayAnswersList: View {
    let momentId: String
    let item: MomentPlayItem
    let onClose: () -> Void
    @State private var rows: [MomentPlayAnswersPage.Row] = []
    @State private var next: String?
    @State private var loading = true

    var body: some View {
        NavigationStack {
            List {
                if !loading, rows.isEmpty {
                    Text("No answers yet.").foregroundStyle(Theme.Color.appTextSecondary)
                }
                ForEach(rows) { row in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.text ?? row.note ?? "")
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.Color.appText)
                        Text(row.person?.name ?? "Someone")
                            .font(.system(size: 12.5))
                            .foregroundStyle(Theme.Color.appTextSecondary)
                    }
                    .swipeActions {
                        Button("Remove", role: .destructive) { Task { await remove(row) } }
                    }
                }
                if next != nil {
                    Button("Show more") { Task { await load(reset: false) } }
                }
            }
            .navigationTitle(item.prompt ?? item.question ?? "Answers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done", action: onClose) } }
        }
        .task { await load(reset: true) }
        .accessibilityIdentifier("moments.play.answers")
    }

    private func load(reset: Bool) async {
        loading = true
        defer { loading = false }
        guard let page = try? await StudioPlayAPI.send(
            StudioPlayEndpoints.answers(postId: momentId, item: item.id, cursor: reset ? nil : next),
            as: MomentPlayAnswersPage.self
        ) else { return }
        rows = reset ? page.answers : rows + page.answers
        next = page.nextCursor
    }

    private func remove(_ row: MomentPlayAnswersPage.Row) async {
        guard await (try? StudioPlayAPI.send(StudioPlayEndpoints.removeAnswer(postId: momentId, item: item.id, answer: row.id))) != nil
        else { return }
        rows.removeAll { $0.id == row.id }
    }
}

/// An item as it will look, in the Studio: its words and choices, nothing to press.
struct MomentPlayPreview: View {
    let item: MomentPlayItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            switch item.kind {
            case .countdown: MomentCountdownCard(item: item)
            case .quote: MomentQuoteCard(item: item)
            default:
                MomentPlayTitle(words: item.question ?? item.prompt ?? item.title ?? "")
                ForEach(Array((item.options ?? []).enumerated()), id: \.offset) { _, option in
                    Text(option)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .frame(maxWidth: .infinity, minHeight: 34, alignment: .leading)
                        .background(Capsule().fill(Color.white.opacity(0.14)))
                }
                if let left = item.left ?? item.xAxis?.left, let right = item.right ?? item.xAxis?.right {
                    MomentPlayNote(words: "\(left) ↔ \(right)")
                }
                if let range = item.range {
                    MomentPlayNote(words: "A number from \(Int(range.min)) to \(Int(range.max))\(range.unit.map { " \($0)" } ?? "")")
                }
                if item.kind == .question { MomentPlayNote(words: "Answers come to you alone.") }
            }
        }
    }
}
