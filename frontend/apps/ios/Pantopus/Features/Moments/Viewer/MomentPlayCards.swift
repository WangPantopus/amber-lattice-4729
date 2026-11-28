//
//  MomentPlayCards.swift
//  Pantopus
//
//  The playable items' cards in the viewer (CONTRACT 7b, 7g): a poll, a slider (or the spectrum dial's faces), the
//  question box, guess and reveal, a countdown and a lifted quote. Each answers through `MomentPlayStore`; what the
//  results show is what the server sent this reader.
//

import SwiftUI

@MainActor
private func isMine(_ moment: MomentDTO) -> Bool {
    guard case let .signedIn(user) = AuthManager.shared.state else { return false }
    return user.id == moment.author.id
}

private func percent(_ part: Int, _ total: Int) -> Int {
    total > 0 ? Int((Double(part) / Double(total) * 100).rounded()) : 0
}

/// A poll: tap an option; after answering (and for the author), each option's share.
struct MomentPollCard: View {
    let moment: MomentDTO
    let item: MomentPlayItem
    @State private var problem: String?
    @State private var sending = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            MomentPlayTitle(words: item.question ?? "")
            let counts = item.results?.counts
            ForEach(Array((item.options ?? []).enumerated()), id: \.offset) { index, option in
                Button {
                    Task { await choose(index) }
                } label: {
                    ZStack(alignment: .leading) {
                        if let counts, let total = item.results?.total {
                            GeometryReader { geo in
                                Capsule()
                                    .fill(Color.white.opacity(item.mine?.choice == index ? 0.42 : 0.22))
                                    .frame(width: geo.size.width * CGFloat(percent(counts[safe: index] ?? 0, total)) / 100)
                            }
                        }
                        HStack {
                            Text(option).font(.system(size: 14.5, weight: .semibold)).foregroundStyle(.white)
                            Spacer(minLength: 4)
                            if let counts, let total = item.results?.total {
                                Text("\(percent(counts[safe: index] ?? 0, total))%")
                                    .font(.system(size: 13.5, weight: .bold))
                                    .foregroundStyle(.white)
                            }
                        }
                        .padding(.horizontal, 12)
                    }
                    .frame(height: 38)
                    .background(Capsule().fill(Color.white.opacity(0.12)))
                    .clipShape(Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!item.open || sending)
                .accessibilityLabel(option)
                .accessibilityAddTraits(item.mine?.choice == index ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("moments.play.poll.option.\(index)")
            }
            if let total = item.results?.total {
                MomentPlayNote(words: "\(total) \(total == 1 ? "answer" : "answers")")
            }
            if let problem { MomentPlayNote(words: problem) }
        }
    }

    private func choose(_ index: Int) async {
        sending = true
        defer { sending = false }
        problem = await MomentPlayStore.shared.answer(MomentPlayAnswerBody(choice: index), item: item, on: moment.id)
    }
}

/// A slider: drag between its two words and let go; after, the average. The dial draws everyone's faces along it.
struct MomentSliderCard: View {
    let moment: MomentDTO
    let item: MomentPlayItem
    @State private var value: Double?
    @State private var problem: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            MomentPlayTitle(words: item.question ?? "")
            GeometryReader { geo in
                let width = geo.size.width
                let shown = value ?? item.mine?.value ?? 0.5
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.22)).frame(height: 6)
                    if let faces = item.results?.faces, item.look == "dial" {
                        ForEach(Array(faces.enumerated()), id: \.offset) { _, face in
                            MomentPlayFace(person: face.person, mine: face.mine, size: 22)
                                .position(x: CGFloat(face.x) * width, y: 19)
                        }
                    }
                    if let average = item.results?.average {
                        Rectangle().fill(Color.white).frame(width: 2, height: 22).position(x: CGFloat(average) * width, y: 19)
                    }
                    Text(item.look == "dial" ? "" : (item.emoji ?? "●"))
                        .font(.system(size: 26))
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(item.look == "dial" ? Color.white : Color.clear))
                        .position(x: CGFloat(shown) * width, y: 19)
                }
                .frame(height: 38)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { drag in if item.open { value = min(max(drag.location.x / max(width, 1), 0), 1) } }
                        .onEnded { _ in Task { await send() } }
                )
            }
            .frame(height: 38)
            .accessibilityElement()
            .accessibilityLabel(item.question ?? "Slider")
            .accessibilityValue("\(Int(((value ?? item.mine?.value ?? 0.5) * 100).rounded())) percent toward \(item.right ?? "")")
            .accessibilityAdjustableAction { direction in
                guard item.open else { return }
                value = min(max((value ?? item.mine?.value ?? 0.5) + (direction == .increment ? 0.1 : -0.1), 0), 1)
                Task { await send() }
            }
            .accessibilityIdentifier("moments.play.slider.track")
            HStack {
                Text(item.left ?? "").font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Color.white.opacity(0.85))
                Spacer()
                Text(item.right ?? "").font(.system(size: 12.5, weight: .semibold)).foregroundStyle(Color.white.opacity(0.85))
            }
            if let count = item.results?.count {
                MomentPlayNote(
                    words: "\(count) \(count == 1 ? "answer" : "answers")" +
                        (item.results?.average != nil ? " · the line is the average" : "")
                )
            }
            if let problem { MomentPlayNote(words: problem) }
        }
    }

    private func send() async {
        guard let value, item.open else { return }
        problem = await MomentPlayStore.shared.answer(MomentPlayAnswerBody(value: (value * 100).rounded() / 100), item: item, on: moment.id)
        if problem == nil { self.value = nil }
    }
}

/// The question box: readers send words to the author alone; the author opens the answers.
struct MomentQuestionCard: View {
    let moment: MomentDTO
    let item: MomentPlayItem
    @State private var text = ""
    @State private var problem: String?
    @State private var writing = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            MomentPlayTitle(words: item.prompt ?? "")
            if isMine(moment) {
                let count = item.results?.count ?? 0
                Button { MomentPlayStore.shared.answersOf = (moment.id, item) } label: {
                    Text("\(count) \(count == 1 ? "answer" : "answers") · See them")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .underline()
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("moments.play.question.answers")
            } else if let mine = item.mine?.text {
                MomentPlayNote(words: "You said: \(mine). Only \(moment.author.shortName) sees answers.")
            } else if item.open {
                // The answer is written in a sheet of its own, above the keyboard.
                MomentPlayWriteField(words: text, placeholder: "Your answer", id: "moments.play.question.field") { writing = true }
                    .onChange(of: writing) { _, open in MomentPlayStore.shared.writingOn = open ? moment.id : nil }
                    .sheet(isPresented: $writing) {
                        MomentPlayWriteSheet(
                            title: item.prompt ?? "",
                            placeholder: "Your answer",
                            limit: 200,
                            text: $text,
                            sendWords: "Send",
                            send: send
                        ) { writing = false }
                    }
                MomentPlayNote(words: "Only \(moment.author.shortName) sees answers.")
            }
            if let problem { MomentPlayNote(words: problem) }
        }
    }

    private func send() async -> String? {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        problem = await MomentPlayStore.shared.answer(MomentPlayAnswerBody(text: words), item: item, on: moment.id)
        if problem == nil { text = "" }
        return problem
    }
}

/// Guess and reveal: one try at the options, or a number in the range; then the answer and how everyone did.
struct MomentGuessRevealCard: View {
    let moment: MomentDTO
    let item: MomentPlayItem
    @State private var value: Double?
    @State private var problem: String?
    @State private var sending = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            MomentPlayTitle(words: item.prompt ?? "")
            if let options = item.options {
                ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                    Button { Task { await send(MomentPlayAnswerBody(choice: index)) } } label: {
                        HStack {
                            Text(option).font(.system(size: 14.5, weight: .semibold)).foregroundStyle(.white)
                            Spacer(minLength: 4)
                            if item.answer.map({ Int($0) }) == index { Icon(.check, size: 14, strokeWidth: 2.6, color: .white) }
                        }
                        .padding(.horizontal, 12)
                        .frame(height: 38)
                        .background(Capsule().fill(Color.white.opacity(item.mine?.choice == index ? 0.36 : 0.14)))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(item.mine != nil || !item.open || sending)
                    .accessibilityIdentifier("moments.play.guess.option.\(index)")
                }
            } else if let range = item.range {
                rangeGuess(range)
            }
            if let line = outcome { MomentPlayNote(words: line) }
            if let problem { MomentPlayNote(words: problem) }
        }
    }

    @ViewBuilder
    private func rangeGuess(_ range: MomentPlayItem.Range) -> some View {
        let unit = range.unit.map { " \($0)" } ?? ""
        let shown = value ?? item.mine?.value ?? (range.min + range.max) / 2
        if item.mine == nil, item.open {
            Slider(value: Binding(get: { shown }, set: { value = $0 }), in: range.min...range.max)
                .tint(.white)
                .accessibilityIdentifier("moments.play.guess.range")
            HStack {
                Text("\(Self.number(shown))\(unit)").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                Spacer()
                Button("Guess") { Task { await send(MomentPlayAnswerBody(value: (shown * 100).rounded() / 100)) } }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .disabled(sending)
                    .accessibilityIdentifier("moments.play.guess.send")
            }
        } else if let answer = item.answer {
            MomentPlayTitle(words: "It's \(Self.number(answer))\(unit)")
        }
    }

    /// After the reader's try (or for the author): right or not, how far off, and how everyone did.
    private var outcome: String? {
        var words: [String] = []
        if let right = item.mine?.right { words.append(right ? "You got it." : "Not this time.") }
        if let off = item.mine?.offBy { words.append("You were \(Self.number(off))\(item.range?.unit.map { " \($0)" } ?? "") off.") }
        if let total = item.results?.total, let counts = item.results?.counts, let answer = item.answer {
            words.append("\(percent(counts[safe: Int(answer)] ?? 0, total))% of \(total) got it.")
        } else if let count = item.results?.count, let average = item.results?.average {
            words.append("\(count) guessed; the average is \(Self.number(average)).")
        }
        return words.isEmpty ? nil : words.joined(separator: " ")
    }

    static func number(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private func send(_ body: MomentPlayAnswerBody) async {
        sending = true
        defer { sending = false }
        problem = await MomentPlayStore.shared.answer(body, item: item, on: moment.id)
    }
}

/// A countdown to its time, counted on the phone.
struct MomentCountdownCard: View {
    let item: MomentPlayItem

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            MomentPlayTitle(words: item.title ?? "")
            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(Self.left(until: item.endsAt.flatMap(MomentTime.parse), now: context.date))
                    .font(.system(size: 24, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(.white)
            }
        }
    }

    static func left(until end: Date?, now: Date) -> String {
        guard let end else { return "" }
        let seconds = Int(end.timeIntervalSince(now))
        guard seconds > 0 else { return "It's time" }
        let (days, hours, minutes, rest) = (seconds / 86400, seconds % 86400 / 3600, seconds % 3600 / 60, seconds % 60)
        if days > 0 { return "\(days)d \(hours)h \(minutes)m" }
        return hours > 0 ? "\(hours)h \(minutes)m \(rest)s" : "\(minutes)m \(rest)s"
    }
}

/// Words lifted from a page, a sign or a whiteboard, with where they came from.
struct MomentQuoteCard: View {
    let item: MomentPlayItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("“\(item.text ?? "")”")
                .font(.system(size: 17, weight: .semibold, design: .serif))
                .italic()
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
            if let source = item.source, !source.isEmpty {
                MomentPlayNote(words: "— \(source)")
            }
        }
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
