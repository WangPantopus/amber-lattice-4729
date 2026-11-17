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
//  app) gets smaller until it fits, and tighter, as it always has.
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
    /// How many lines it takes at this size.
    let lineCount: Int
    /// The pen and the rules it's written on: the back draws its rules from this.
    let fit: Fit

    init(text: String, seed: Int?, u: CGFloat) {
        let fit = Self.fit(text, u: u)
        var size = fit.size
        var lines = Self.lines(text, font: CardTableType.pen(size * u), width: Self.width * u)
        while lines.count > Self.ruleCount, size > Self.smallest {
            size -= 0.2
            lines = Self.lines(text, font: CardTableType.pen(size * u), width: Self.width * u)
        }
        let pitch = lines.count > fit.rules ? Self.pitch * CGFloat(Self.ruleCount) / CGFloat(lines.count) : fit.pitch
        let font = CardTableType.pen(size * u)
        self.font = font
        self.fit = fit
        lineCount = lines.count
        var random = CardTableRandom(seed: (seed ?? 1) * 7 + 3)
        let lineHeight = pitch * u
        let baselineInLine = CardTableType.baseline(font, lineHeight: lineHeight)
        let em = size * u
        var placed: [Word] = []
        for (index, line) in lines.enumerated() {
            let lineTop = (Self.top * u) + CGFloat(index) * lineHeight
            for word in line {
                let shift = (random.next() - 0.5) * 0.34 * em
                let turn = (random.next() - 0.5) * 1.5
                // A little stronger than before (plan Part 1): 93–100%.
                let opacity = 0.93 + random.next() * 0.07
                guard !word.text.isEmpty else { continue }
                placed.append(Word(
                    text: word.text,
                    center: CGPoint(x: Self.left * u + word.x + word.width / 2, y: lineTop + lineHeight / 2),
                    baseline: lineTop + baselineInLine,
                    width: word.width,
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

    // MARK: Wrapping

    private struct LaidWord {
        let text: String
        let x: CGFloat
        let width: CGFloat
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
            func place(_ word: String, _ wordWidth: CGFloat) {
                if !line.isEmpty, x + wordWidth > width {
                    result.append(line)
                    line = []
                    x = 0
                }
                line.append(LaidWord(text: word, x: x, width: wordWidth))
                x += wordWidth + space
            }
            for word in paragraph.components(separatedBy: " ") {
                let wordWidth = measure(word)
                if wordWidth <= width {
                    place(word, wordWidth)
                    continue
                }
                var piece = ""
                for character in word {
                    if measure(piece + String(character)) > width, !piece.isEmpty {
                        place(piece, measure(piece))
                        piece = ""
                    }
                    piece.append(character)
                }
                if !piece.isEmpty { place(piece, measure(piece)) }
            }
            result.append(line)
        }
        return result
    }
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
