//
//  MomentsStudioMovingWords.swift
//  Pantopus
//
//  "Pulse, reinvented", moving words (CONTRACT 7k; DESIGN row 2, "moving text" under Aa): the author's own short words
//  over the photo, in one of the Studio's letterings, moving in one of four ways (drift, pulse, wave, type). One more
//  playable kind, drawn and never answered; the photo is stored as today and the words are never drawn into it. With
//  the system's Reduce Motion on, the words stand still. Only the lettering's shared id crosses apps.
//

import SwiftUI

enum MomentsMovingWords {
    static let most = 2
    static let longest = 60

    /// The ten shared lettering ids, in the Studio's own letters (`classic` is the Studio's standard bold).
    static let letterings: [(id: String, face: MomentMarks.Typeface)] = [
        ("classic", .standard), ("serif", .serif), ("typewriter", .typewriter), ("marker", .marker),
        ("handwritten", .handwritten), ("rounded", .rounded), ("tall", .tall), ("script", .script),
        ("mono", .mono), ("elegant", .elegant)
    ]

    static let motions: [(id: String, name: String)] = [
        ("drift", "Drift"), ("pulse", "Pulse"), ("wave", "Wave"), ("type", "Type")
    ]

    /// White, warm yellow, black and sky.
    static let colors = ["#FFFFFF", "#FDE68A", "#111827", "#38BDF8"]

    static func face(_ id: String?) -> MomentMarks.Typeface {
        letterings.first { $0.id == id }?.face ?? .standard
    }
}

/// The words, moving as their author chose; `unit` scales them with the picture.
struct MomentMovingWordsView: View {
    let item: MomentPlayItem
    var unit: CGFloat = 1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var words: String {
        (item.text ?? "").replacingOccurrences(of: "\n", with: " ")
    }

    private var color: Color {
        MomentSwatchLayer.color(item.color ?? "#FFFFFF") ?? .white
    }

    private var font: Font {
        MomentsMovingWords.face(item.lettering).font(28 * unit * CGFloat(item.scale))
    }

    var body: some View {
        Group {
            if reduceMotion {
                letters(String(words), phase: 0, shown: words.count)
            } else {
                TimelineView(.animation) { timeline in
                    let time = timeline.date.timeIntervalSinceReferenceDate
                    moving(at: time)
                }
            }
        }
        .rotationEffect(.degrees(item.rotation))
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(words)
    }

    @ViewBuilder
    private func moving(at time: TimeInterval) -> some View {
        switch item.motion {
        case "pulse":
            letters(words, phase: 0, shown: words.count)
                .scaleEffect(1 + 0.06 * sin(time * 2.4))
        case "wave":
            letters(words, phase: time, shown: words.count)
        case "type":
            // One letter every 0.09 s, a 1.6 s hold, then again.
            let cycle = Double(words.count) * 0.09 + 1.6
            let shown = min(words.count, Int(time.truncatingRemainder(dividingBy: cycle) / 0.09))
            letters(words, phase: 0, shown: shown)
        default:
            letters(words, phase: 0, shown: words.count)
                .offset(y: 6 * unit * sin(time * 1.3))
        }
    }

    /// The letters; with `phase` they rise one after another (the wave), and only the first `shown` are seen.
    private func letters(_ text: String, phase: TimeInterval, shown: Int) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(text.enumerated()), id: \.offset) { index, letter in
                Text(String(letter))
                    .font(font)
                    .foregroundStyle(color)
                    .opacity(index < shown ? 1 : 0)
                    .offset(y: phase == 0 ? 0 : -7 * unit * max(0, sin(phase * 3 - Double(index) * 0.45)))
            }
        }
        .shadow(color: .black.opacity(color == .white || item.color == "#FFFFFF" ? 0.45 : 0.2), radius: 2, y: 1)
        .fixedSize()
    }
}

/// The Studio's form for moving words: the words, a lettering, a motion and a colour.
struct MomentsStudioMovingWordsForm: View {
    @Binding var words: String
    @Binding var lettering: String
    @Binding var motion: String
    @Binding var color: String

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            TextField("Your words, one line", text: $words)
                .textFieldStyle(.roundedBorder)
                .onChange(of: words) { _, next in
                    let line = next.replacingOccurrences(of: "\n", with: " ")
                    if line.count > MomentsMovingWords.longest || line != next {
                        words = String(line.prefix(MomentsMovingWords.longest))
                    }
                }
                .accessibilityIdentifier("moments.studio.play.movingWords.text")
            chips(MomentsMovingWords.letterings.map { ($0.id, $0.face.name) }, selection: $lettering) { id in
                MomentsMovingWords.face(id).font(15)
            }
            chips(MomentsMovingWords.motions.map { ($0.id, $0.name) }, selection: $motion) { _ in .system(size: 14, weight: .semibold) }
            HStack(spacing: Spacing.s2) {
                ForEach(MomentsMovingWords.colors, id: \.self) { hex in
                    Button { color = hex } label: {
                        Circle()
                            .fill(MomentSwatchLayer.color(hex) ?? .white)
                            .frame(width: 30, height: 30)
                            .overlay(Circle().stroke(Theme.Color.appText, lineWidth: color == hex ? 3 : 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Colour \(hex)")
                    .accessibilityAddTraits(color == hex ? [.isButton, .isSelected] : .isButton)
                }
            }
        }
    }

    private func chips(_ all: [(String, String)], selection: Binding<String>, font: @escaping (String) -> Font) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.s2) {
                ForEach(all, id: \.0) { id, name in
                    let on = selection.wrappedValue == id
                    Button { selection.wrappedValue = id } label: {
                        Text(name)
                            .font(font(id))
                            .foregroundStyle(on ? Color.white : Theme.Color.appText)
                            .padding(.horizontal, 12)
                            .frame(height: 32)
                            .background(Capsule().fill(on ? Theme.Color.primarySolid : Theme.Color.appSurface))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                }
            }
        }
    }
}
