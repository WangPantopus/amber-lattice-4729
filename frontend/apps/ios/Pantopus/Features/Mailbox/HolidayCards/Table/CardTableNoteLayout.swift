//
//  CardTableNoteLayout.swift
//  Pantopus
//
//  Where the words of a note go on the back of the card (launch key
//  `card_table`): the pen as large as the note allows (plan Part 1), each word
//  with a small shift and turn so the writing isn't machine-straight. The turns
//  come from the card's number, so it looks the same every time. Latin letters
//  are in the pen; the system's fonts take over for other scripts. A short
//  note gets 9 or 10 rules and a larger pen; a note of up to 11 lines gets
//  today's 6u pen on 7.6u lines; one longer than that (written on an older
//  app) gets smaller until it fits, and tighter, as it always has. On a table a
//  note too long for the two larger pens runs onto a second leaf (plan Part 9).
//

import SwiftUI
import UIKit

struct CardTableNoteLayout {
    /// The note's box and its lines, in u.
    static let left: CGFloat = 8
    static let top: CGFloat = 9
    static let width: CGFloat = 85
    static let pitch: CGFloat = 7.6
    static let size: CGFloat = 6
    static let ruleCount = 11
    /// The rules' whole height: `pitch` times `ruleCount`, whichever pen size is used.
    static let boxHeight: CGFloat = 83.6
    private static let smallest: CGFloat = 4.2

    /// One of the pen's sizes and its ruled lines, in u.
    struct Fit: Equatable {
        let size: CGFloat
        let rules: Int

        /// The line height: the rules always fill `boxHeight`.
        var pitch: CGFloat {
            CardTableNoteLayout.boxHeight / CGFloat(rules)
        }

        /// 30, 27 and 23 pt on an iPhone 17 (plan Part 1, D7).
        static let large = Fit(size: 7.8, rules: 9)
        static let middle = Fit(size: 7.0, rules: 10)
        static let today = Fit(size: CardTableNoteLayout.size, rules: CardTableNoteLayout.ruleCount)
        /// Largest first.
        static let all = [large, middle, today]
    }

    /// The one rule every place that draws or writes the back uses: the largest pen at which the note's words fit its
    /// rules, or today's for a note that doesn't fit even those (it shrinks further as it is laid out).
    static func fit(_ text: String, u: CGFloat) -> Fit {
        let wide = width * u
        return Fit.all.first { lines(text, font: CardTableType.pen($0.size * u), width: wide).count <= $0.rules } ?? .today
    }

    /// One word on the card, in points.
    struct Word {
        let text: String
        /// The middle of its box.
        let center: CGPoint
        let baseline: CGFloat
        let width: CGFloat
        let shift: CGFloat
        let turn: Double
        let opacity: Double
    }

    let words: [Word]
    let font: UIFont
    /// How many lines it takes at this size (on this leaf).
    let lineCount: Int
    /// The pen and the rules it's written on: the back draws its rules from this.
    let fit: Fit
    /// The part of the note laid out: `.whole` for a note on one side, whatever was asked.
    let leaf: CardTableLeaf

    /// - Parameter leaf: on a table, a long note's first or second leaf (plan Part 9); everywhere else the whole note.
    init(text: String, seed: Int?, u: CGFloat, leaf: CardTableLeaf = .whole) {
        let leaves = leaf == .whole ? nil : Self.leaves(text)
        var fit = Self.fit(text, u: u)
        var size = fit.size
        var lines: [[LaidWord]]
        var pitch: CGFloat
        var shown: Range<Int>
        // The leaves are measured at one card width (`leafU`) so every place agrees where they break; drawn at this one.
        var scale: CGFloat = 1
        if let leaves {
            fit = leaves.fit
            size = fit.size
            lines = Self.lines(text, font: CardTableType.pen(size * Self.leafU), width: Self.width * Self.leafU)
            pitch = fit.pitch
            shown = leaf == .first ? 0..<leaves.firstCount : min(leaves.secondStart, lines.count)..<lines.count
            scale = u / Self.leafU
        } else {
            lines = Self.lines(text, font: CardTableType.pen(size * u), width: Self.width * u)
            while lines.count > Self.ruleCount, size > Self.smallest {
                size -= 0.2
                lines = Self.lines(text, font: CardTableType.pen(size * u), width: Self.width * u)
            }
            pitch = lines.count > fit.rules ? Self.pitch * CGFloat(Self.ruleCount) / CGFloat(lines.count) : fit.pitch
            shown = 0..<lines.count
        }
        let font = CardTableType.pen(size * u)
        self.font = font
        self.fit = fit
        self.leaf = leaves == nil ? .whole : leaf
        lineCount = shown.count
        var random = CardTableRandom(seed: (seed ?? 1) * 7 + 3)
        let lineHeight = pitch * u
        let baselineInLine = CardTableType.baseline(font, lineHeight: lineHeight)
        let em = size * u
        var placed: [Word] = []
        for (index, line) in lines.enumerated() {
            let lineTop = (Self.top * u) + CGFloat(index - shown.lowerBound) * lineHeight
            for word in line {
                // Every word takes its numbers in order, on whichever leaf it lies, so it looks as it would on one side.
                let shift = (random.next() - 0.5) * 0.34 * em
                let turn = (random.next() - 0.5) * 1.5
                // A little stronger than before (plan Part 1): 93–100%.
                let opacity = 0.93 + random.next() * 0.07
                guard !word.text.isEmpty, shown.contains(index) else { continue }
                let x = word.x * scale
                let width = word.width * scale
                placed.append(Word(
                    text: word.text,
                    center: CGPoint(x: Self.left * u + x + width / 2, y: lineTop + lineHeight / 2),
                    baseline: lineTop + baselineInLine,
                    width: width,
                    shift: shift,
                    turn: turn,
                    opacity: opacity
                ))
            }
        }
        words = placed
    }

    /// Draws the note, in ink that sinks into the paper.
    func draw(in context: GraphicsContext) {
        var ink = context
        ink.blendMode = .multiply
        let swiftUIFont = Font(font)
        for word in words {
            var layer = ink
            layer.opacity = word.opacity
            layer.translateBy(x: word.center.x, y: word.center.y + word.shift)
            layer.rotate(by: .degrees(word.turn))
            layer.drawText(
                Text(word.text).font(swiftUIFont).foregroundColor(MailPaper.tablePenInk),
                x: -word.width / 2,
                baseline: word.baseline - word.center.y
            )
        }
    }

    // MARK: Two leaves (plan Part 9)

    /// A note too long for one side in the two larger pens: the pen it's written in over two leaves, and where it breaks.
    struct Leaves: Equatable {
        let fit: Fit
        /// The lines on the first leaf: as many as its rules hold, leaving the second at least two.
        let firstCount: Int
        /// The line the second leaf starts at: one past `firstCount` when that line is blank, which is left out.
        let secondStart: Int
    }

    /// The card width (in points per u) every place measures the leaves at, so the table, its button and the writing
    /// step agree where a note breaks.
    static let leafU: CGFloat = 4

    /// Nil when the note is on one side: it fits 9 lines in the 7.8u pen or 10 in the 7.0u pen, or (very many short
    /// lines, or one word taller than a leaf) no pen holds it on two. Otherwise two leaves, in the first pen that does.
    /// A word is never split between the leaves (the design session's review, Nov 17): one with no space that wraps
    /// over several lines counts on each, and if it would cross the break the first leaf ends before it.
    static func leaves(_ text: String) -> Leaves? {
        func laid(_ fit: Fit) -> [[LaidWord]] {
            lines(text, font: CardTableType.pen(fit.size * leafU), width: width * leafU)
        }
        let large = laid(.large)
        guard large.count > Fit.large.rules else { return nil }
        let middle = laid(.middle)
        guard middle.count > Fit.middle.rules else { return nil }
        for (fit, lines) in [(Fit.large, large), (Fit.middle, middle), (Fit.today, laid(.today))] where lines.count > fit.rules {
            var first = min(fit.rules, lines.count - 2)
            while first > 0, lines[first].first?.continues == true {
                first -= 1
            }
            guard first > 0 else { continue }
            let second = lines[first].allSatisfy(\.text.isEmpty) ? first + 1 : first
            // Too many lines left for the second leaf: the next pen.
            guard lines.count - second <= fit.rules else { continue }
            return Leaves(fit: fit, firstCount: first, secondStart: second)
        }
        return nil
    }

    // MARK: Wrapping

    private struct LaidWord {
        let text: String
        let x: CGFloat
        let width: CGFloat
        /// The rest of a word wider than a line, carried on from the line above.
        var continues = false
    }

    /// Breaks the note into lines of words: a new line where the writer started one, and wherever the next word
    /// doesn't fit. A word wider than a line (no spaces in it, as in some scripts) breaks between its letters.
    private static func lines(_ text: String, font: UIFont, width: CGFloat) -> [[LaidWord]] {
        let attributes: [NSAttributedString.Key: Any] = [.font: font]
        func measure(_ string: String) -> CGFloat {
            (string as NSString).size(withAttributes: attributes).width
        }
        let space = measure(" ")
        var result: [[LaidWord]] = []
        for paragraph in text.components(separatedBy: "\n") {
            var line: [LaidWord] = []
            var x: CGFloat = 0
            func place(_ word: String, _ wordWidth: CGFloat, continues: Bool = false) {
                if !line.isEmpty, x + wordWidth > width {
                    result.append(line)
                    line = []
                    x = 0
                }
                line.append(LaidWord(text: word, x: x, width: wordWidth, continues: continues))
                x += wordWidth + space
            }
            for word in paragraph.components(separatedBy: " ") {
                let wordWidth = measure(word)
                if wordWidth <= width {
                    place(word, wordWidth)
                    continue
                }
                var piece = ""
                var pieces = 0
                for character in word {
                    if measure(piece + String(character)) > width, !piece.isEmpty {
                        place(piece, measure(piece), continues: pieces > 0)
                        pieces += 1
                        piece = ""
                    }
                    piece.append(character)
                }
                if !piece.isEmpty { place(piece, measure(piece), continues: pieces > 0) }
            }
            result.append(line)
        }
        return result
    }
}

/// Which part of a note a back draws (plan Part 9).
enum CardTableLeaf: Equatable {
    /// The whole note on one side, fitted as Part 1 does: every still drawing, the reply's sheet, the writing step, a
    /// note that fits one side, and a card being sealed (its back can't be turned there).
    case whole
    /// A long note's first leaf, lying on the card's back on a table: no FROM, signature or foot, "over" at its foot.
    case first
    /// The card's own back under it: the rest of the note, FROM, the signature and the foot.
    case second
}

/// The seeded numbers each word's shift and turn come from, the same on every app.
struct CardTableRandom {
    private var state: UInt32

    init(seed: Int) {
        state = UInt32(truncatingIfNeeded: seed)
    }

    mutating func next() -> CGFloat {
        state = state &* 1_664_525 &+ 1_013_904_223
        return CGFloat(state) / 4_294_967_296
    }
}
