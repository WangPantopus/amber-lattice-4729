//
//  HolidayCardNote.swift
//  Pantopus
//
//  The note on the back of a Christmas card, set by TextKit so each line
//  sits on one of the back's rules: fountain-pen blue italic serif, its size
//  and line pitch a share of the card's width (4.7% and 7.6%, as on the
//  web). The same view writes the note (no scrolling: a card holds what fits
//  on it, up to the letter limit) and reads it on the card page. On the card
//  table the pen starts large and steps down as the note grows (plan Part 1).
//

import SwiftUI
import UIKit

enum HolidayCardNote {
    /// The note's type size and line pitch, as shares of the card's width. The pen on the table's card is larger.
    static var size: CGFloat {
        LaunchFeatures.cardTable ? 0.06 : 0.047
    }

    static let pitch: CGFloat = 0.076

    /// Letters as the server counts them (code points).
    static func letters(_ text: String) -> Int {
        text.unicodeScalars.count
    }

    static func font(size: CGFloat) -> UIFont {
        if LaunchFeatures.cardTable { return CardTableType.pen(size) }
        let base = UIFont.systemFont(ofSize: size)
        let serif = base.fontDescriptor.withDesign(.serif) ?? base.fontDescriptor
        let italic = serif.withSymbolicTraits(.traitItalic) ?? serif
        return UIFont(descriptor: italic, size: size)
    }

    /// The note's type; on the card table, at one of the pen's sizes (`fit`, today's 6u pen by default).
    static func attributes(
        cardWidth: CGFloat,
        color: UIColor,
        fit: CardTableNoteLayout.Fit = .today
    ) -> [NSAttributedString.Key: Any] {
        let table = LaunchFeatures.cardTable
        let lineHeight = cardWidth * (table ? fit.pitch / 100 : pitch)
        let style = NSMutableParagraphStyle()
        style.minimumLineHeight = lineHeight
        style.maximumLineHeight = lineHeight
        style.lineBreakMode = .byWordWrapping
        let font = font(size: cardWidth * (table ? fit.size / 100 : size))
        guard table else {
            return [.font: font, .foregroundColor: color, .paragraphStyle: style]
        }
        // TextKit hangs a tall font's line from its descent; the card sets it in the middle of the line, as read.
        let middle = (lineHeight - (font.ascender - font.descender)) / 2
        return [.font: font, .foregroundColor: color, .paragraphStyle: style, .baselineOffset: middle]
    }
}

/// A note to read on the back of a card: in the pen with the key on, each word with its small shift and turn, as it
/// lies on the table.
struct HolidayCardReadNote: View {
    let text: String
    /// The card's number, for the writing's shifts and turns.
    var number: Int?
    let cardWidth: CGFloat

    var body: some View {
        if LaunchFeatures.cardTable {
            Canvas(rendersAsynchronously: false) { context, _ in
                let unit = cardWidth / 100
                var page = context
                page.translateBy(x: -CardTableNoteLayout.left * unit, y: -CardTableNoteLayout.top * unit)
                CardTableNoteLayout(text: text, seed: number, u: unit).draw(in: page)
            }
            .blendMode(.multiply)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        } else {
            HolidayCardNoteText(text: .constant(text), cardWidth: cardWidth)
        }
    }
}

/// The note on its rules: written while `isEditable`, read otherwise.
struct HolidayCardNoteText: UIViewRepresentable {
    @Binding var text: String
    /// The width of the whole card (the type scales with it).
    let cardWidth: CGFloat
    var placeholder = ""
    var isEditable = false
    var limit = Int.max

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> HolidayCardNoteView {
        let view = HolidayCardNoteView()
        view.editor.delegate = context.coordinator
        view.editor.isEditable = isEditable
        view.editor.isSelectable = isEditable
        view.isUserInteractionEnabled = isEditable
        if isEditable {
            view.editor.accessibilityLabel = "Your note on the back of the card"
            view.editor.accessibilityIdentifier = "sendCardNote"
        } else {
            view.accessibilityElementsHidden = true
        }
        return view
    }

    func updateUIView(_ view: HolidayCardNoteView, context: Context) {
        context.coordinator.parent = self
        view.setStyle(cardWidth: cardWidth)
        if view.editor.text != text {
            view.editor.attributedText = NSAttributedString(string: text, attributes: view.inkAttributes)
        }
        view.restyle()
        view.placeholderView.attributedText = NSAttributedString(string: placeholder, attributes: view.placeholderAttributes)
        view.placeholderView.isHidden = !text.isEmpty
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView _: HolidayCardNoteView, context _: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 0, height: proposal.height ?? 0)
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: HolidayCardNoteText

        init(_ parent: HolidayCardNoteText) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
            let view = textView.superview as? HolidayCardNoteView
            view?.restyle()
            view?.placeholderView.isHidden = !textView.text.isEmpty
        }

        /// Up to the letter limit (a paste is cut to what's left, as on the
        /// web), and no more than fits on the card.
        func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText: String) -> Bool {
            let current = textView.text ?? ""
            guard let swiftRange = Range(range, in: current) else { return false }
            let kept = HolidayCardNote.letters(current) - HolidayCardNote.letters(String(current[swiftRange]))
            let room = max(0, parent.limit - kept)
            var insert = replacementText
            if HolidayCardNote.letters(insert) > room {
                insert = String(String.UnicodeScalarView(insert.unicodeScalars.prefix(room)))
            }
            let next = current.replacingCharacters(in: swiftRange, with: insert)
            guard (textView.superview as? HolidayCardNoteView)?.fits(next) ?? true else { return false }
            guard insert != replacementText else { return true }
            // Cut to the limit: put in what's left by hand.
            textView.textStorage.replaceCharacters(
                in: range,
                with: NSAttributedString(string: insert, attributes: textView.typingAttributes)
            )
            let caret = range.location + (insert as NSString).length
            textView.selectedRange = NSRange(location: caret, length: 0)
            textViewDidChange(textView)
            return false
        }
    }
}

/// The text view and, under it, its placeholder set the same way, so "Dear
/// Maya," sits where the writing will start.
final class HolidayCardNoteView: UIView {
    let editor = UITextView()
    let placeholderView = UITextView()
    private(set) var inkAttributes: [NSAttributedString.Key: Any] = [:]
    private(set) var placeholderAttributes: [NSAttributedString.Key: Any] = [:]
    private var styledWidth: CGFloat = 0
    /// The pen the note is written with now; nil until the width is known.
    private var styledFit: CardTableNoteLayout.Fit?
    /// The card's room: the note at today's 6u pen on 11 rules.
    private var roomAttributes: [NSAttributedString.Key: Any] = [:]

    override init(frame: CGRect) {
        super.init(frame: frame)
        for view in [placeholderView, editor] {
            view.backgroundColor = .clear
            view.textContainerInset = .zero
            view.textContainer.lineFragmentPadding = 0
            view.isScrollEnabled = false
            view.autocorrectionType = .default
            view.frame = bounds
            view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(view)
        }
        placeholderView.isEditable = false
        placeholderView.isSelectable = false
        placeholderView.isUserInteractionEnabled = false
        placeholderView.isAccessibilityElement = false
        editor.tintColor = UIColor(MailPaper.cardInk)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// The type for this card width; re-sets the note when the width changes.
    func setStyle(cardWidth: CGFloat) {
        guard cardWidth > 0, abs(cardWidth - styledWidth) > 0.5 else { return }
        styledWidth = cardWidth
        roomAttributes = HolidayCardNote.attributes(cardWidth: cardWidth, color: UIColor(MailPaper.cardInk))
        styledFit = nil
        restyle()
    }

    /// Sets the note in the pen its words call for (plan Part 1): large while it's short, a size smaller when the
    /// next line wouldn't fit, and larger again as words are deleted. Waits while a word is being composed.
    func restyle() {
        guard styledWidth > 0, editor.markedTextRange == nil else { return }
        let fit = LaunchFeatures.cardTable ? penFit(editor.text ?? "") : .today
        guard fit != styledFit else { return }
        styledFit = fit
        let ink = UIColor(MailPaper.cardInk)
        inkAttributes = HolidayCardNote.attributes(cardWidth: styledWidth, color: ink, fit: fit)
        placeholderAttributes = HolidayCardNote.attributes(cardWidth: styledWidth, color: ink.withAlphaComponent(0.45), fit: fit)
        editor.typingAttributes = inkAttributes
        let selection = editor.selectedRange
        editor.textStorage.setAttributes(inkAttributes, range: NSRange(location: 0, length: editor.textStorage.length))
        editor.selectedRange = selection
        placeholderView.attributedText = NSAttributedString(string: placeholderView.text ?? "", attributes: placeholderAttributes)
    }

    /// Once the box has its size, TextKit can check the pen against it.
    override func layoutSubviews() {
        super.layoutSubviews()
        restyle()
    }

    /// Whether this note fits on the card's lines, at today's pen.
    func fits(_ text: String) -> Bool {
        guard bounds.height > 0, bounds.width > 0 else { return true }
        return height(text, roomAttributes) <= bounds.height + 1
    }

    /// The card's own rule (the one the back's rules and the reader use), a size smaller if TextKit's lines run past
    /// the box.
    private func penFit(_ text: String) -> CardTableNoteLayout.Fit {
        let start = CardTableNoteLayout.fit(text, u: styledWidth / 100)
        guard bounds.height > 0, bounds.width > 0 else { return start }
        let ink = UIColor(MailPaper.cardInk)
        return CardTableNoteLayout.Fit.all.drop { $0 != start }.first { fit in
            height(text, HolidayCardNote.attributes(cardWidth: styledWidth, color: ink, fit: fit)) <= bounds.height + 1
        } ?? .today
    }

    private func height(_ text: String, _ attributes: [NSAttributedString.Key: Any]) -> CGFloat {
        // A last empty line still takes a line.
        let measured = text.hasSuffix("\n") ? text + "x" : text
        return NSAttributedString(string: measured, attributes: attributes)
            .boundingRect(
                with: CGSize(width: bounds.width, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin],
                context: nil
            )
            .height
    }
}
