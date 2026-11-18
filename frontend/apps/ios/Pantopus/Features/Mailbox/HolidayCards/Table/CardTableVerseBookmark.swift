//
//  CardTableVerseBookmark.swift
//  Pantopus
//
//  "Read the verse" (launch key `card_table`, plan 6.2): a cream bookmark with a red ribbon slides up over the table
//  with a Christmas with Jesus Christ card's whole verse in the serif at 19 pt and its reference under it. A tap
//  anywhere, Close, Escape, or the screen reader's escape puts it away. "Read it in print" (plan Part 2) brings up the
//  same bookmark with the note: who it's from and the day it was mailed in small capitals, then the note in the
//  serif at 19 pt, its line breaks kept. Both follow the phone's text size.
//

import SwiftUI

/// What the bookmark over the table holds.
enum CardTableBookmark: Equatable {
    /// A Christmas with Jesus Christ card's verse (plan 6.2).
    case verse
    /// The note in plain type (plan Part 2).
    case print

    /// The hint's link that opens it.
    var title: String {
        switch self {
        case .verse: "Read the verse"
        case .print: "Read it in print"
        }
    }

    /// The link's (or the button's) identifier.
    var identifier: String {
        switch self {
        case .verse: "cardTableReadVerse"
        case .print: "cardTableReadInPrint"
        }
    }
}

struct CardTableVerseBookmark: View {
    enum Words {
        /// The verse, and the card's caption, which for these cards is its reference ("Luke 2:7 (KJV)").
        case verse(String, reference: String)
        /// The note, from whom ("Maya") and the day it was mailed ("OCT 30"; none before it's mailed).
        case print(note: String, from: String, mailedOn: String?)
    }

    let words: Words

    init(words: Words, bottomInset: CGFloat, onClose: @escaping () -> Void) {
        // A card not yet postmarked carries an empty day: it reads as none.
        if case let .print(note, from, day) = words, day?.trimmingCharacters(in: .whitespaces).isEmpty == true {
            self.words = .print(note: note, from: from, mailedOn: nil)
        } else {
            self.words = words
        }
        self.bottomInset = bottomInset
        self.onClose = onClose
    }

    /// The home indicator's room (the table draws under the safe area).
    let bottomInset: CGFloat
    let onClose: () -> Void

    @State private var shown = false
    @State private var wordsHeight: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .title3) private var verseSize: CGFloat = 19
    @ScaledMetric(relativeTo: .subheadline) private var referenceSize: CGFloat = 15
    @ScaledMetric(relativeTo: .footnote) private var fromSize: CGFloat = 12.5
    @ScaledMetric(relativeTo: .subheadline) private var closeSize: CGFloat = 15

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                Color.black.opacity(0.4)
                    .ignoresSafeArea()
                    .onTapGesture(perform: onClose)
                    .accessibilityHidden(true)
                bookmark(maxHeight: geo.size.height * 0.78)
                    .offset(y: shown || reduceMotion ? 0 : geo.size.height * 0.6)
            }
        }
        .onAppear {
            withAnimation(reduceMotion ? nil : .spring(duration: 0.45, bounce: 0.12)) { shown = true }
        }
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, onClose)
        .accessibilityIdentifier(isPrint ? "cardTablePrint" : "cardTableVerse")
    }

    private var isPrint: Bool {
        if case .print = words { return true }
        return false
    }

    private func bookmark(maxHeight: CGFloat) -> some View {
        VStack(spacing: 18) {
            // As tall as the verse, up to the room there is; longer (the largest text sizes), it scrolls.
            ScrollView {
                wordsView
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { wordsHeight = $0 }
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(height: min(max(wordsHeight, 1), max(120, maxHeight - 126 - bottomInset)))
            Button(action: onClose) {
                Text("Close")
                    .font(.system(size: closeSize, weight: .medium))
                    .foregroundStyle(MailPaper.tableSlipInk)
                    .underline(color: MailPaper.tableSlipLine.opacity(0.5))
                    .frame(minWidth: 88, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // A keyboard's Escape closes it too.
            .keyboardShortcut(.cancelAction)
            .accessibilityIdentifier(isPrint ? "cardTablePrintClose" : "cardTableVerseClose")
        }
        .padding(.top, 48)
        .padding(.horizontal, 28)
        .padding(.bottom, 16 + bottomInset)
        .frame(maxWidth: 560)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 6, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 6)
                .fill(MailPaper.tableSlip)
                .shadow(color: .black.opacity(0.45), radius: 18, x: 0, y: -4)
                .ignoresSafeArea(edges: .bottom)
        }
        .overlay(alignment: .topTrailing) {
            CardTableRibbon()
                .fill(MailPaper.tableWax)
                .frame(width: 20, height: 46)
                .shadow(color: .black.opacity(0.25), radius: 2, x: 0, y: 1)
                .offset(y: -8)
                .padding(.trailing, 30)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 12)
    }

    @ViewBuilder
    private var wordsView: some View {
        switch words {
        case let .verse(verse, reference):
            VStack(spacing: 12) {
                Text(verse)
                    .font(.system(size: verseSize, design: .serif))
                    .lineSpacing(verseSize * 0.28)
                    .foregroundStyle(MailPaper.tableSlipInk)
                Text(reference)
                    .font(.system(size: referenceSize, design: .serif).italic())
                    .foregroundStyle(MailPaper.tableFoot)
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("cardTableVerseWords")
        case let .print(note, from, mailedOn):
            VStack(alignment: .leading, spacing: 14) {
                Text((["From \(from)"] + [mailedOn.map(Self.longDay)].compactMap { $0 }).joined(separator: " · ").uppercased())
                    .font(.system(size: fromSize, weight: .medium, design: .serif))
                    .tracking(fromSize * 0.18)
                    .foregroundStyle(MailPaper.tableFoot)
                    .accessibilityLabel((["From \(from)"] + [mailedOn.map { Self.longDay($0).capitalized }].compactMap { $0 })
                        .joined(separator: ", "))
                    .accessibilityIdentifier("cardTablePrintFrom")
                Text(note)
                    .font(.system(size: verseSize, design: .serif))
                    .lineSpacing(verseSize * 0.28)
                    .foregroundStyle(MailPaper.tableSlipInk)
                    .accessibilityIdentifier("cardTablePrintNote")
            }
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("cardTablePrintWords")
        }
    }

    /// The postmark's "NOV 17" as "NOVEMBER 17", as Android and the web write it.
    private static func longDay(_ day: String) -> String {
        let months = [
            "JAN": "JANUARY", "FEB": "FEBRUARY", "MAR": "MARCH", "APR": "APRIL", "MAY": "MAY", "JUN": "JUNE",
            "JUL": "JULY", "AUG": "AUGUST", "SEP": "SEPTEMBER", "OCT": "OCTOBER", "NOV": "NOVEMBER", "DEC": "DECEMBER"
        ]
        let parts = day.uppercased().split(separator: " ", maxSplits: 1).map(String.init)
        guard let month = parts.first, let long = months[month] else { return day }
        return ([long] + parts.dropFirst()).joined(separator: " ")
    }
}

/// A ribbon hanging from the bookmark's top edge, cut in a V at its end.
private struct CardTableRibbon: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY - rect.width * 0.45))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.closeSubpath()
        }
    }
}
