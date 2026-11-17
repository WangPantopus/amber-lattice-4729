//
//  CardTableMediaLayer.swift
//  Pantopus
//
//  The card's own photo and voice greeting on the table (memories plan step 4, `holiday_card_memories`; wave 4
//  drawings 3, 4 and 5), as web's #3883 and #3890 lay them: once the card is turned over they lie on the table, not on
//  the card, so they stay put while the card moves. Beside the card where the table has room on each side; under it on
//  a phone, in the room the card leaves as it moves up on being turned over, so nothing printed on the card is ever
//  under them. They come as the card arrives at its place and go as it leaves. A tap on the print opens the photo over
//  the whole screen. A photo from someone who isn't the reader's connection is covered ("Photo from {name}. Tap to
//  show.") and nothing is fetched until the tap. It's a layer of its own, so screen readers reach the print's
//  description and the cover's button.
//

import SwiftUI

struct CardTableMediaLayer: View {
    let model: CardTableModel
    let layout: CardTableLayout
    @State private var uncovered = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The print and the greeting lie under the turned-over card, so the layout keeps them room there: not without
    /// them, on a sealed card or a letter, beside a wide card, or on the open Duo's pages.
    static func liesUnderCard(_ content: CardTableContent, screen: CGSize, strip: CGFloat, fold: CardTableFold) -> Bool {
        guard content.photo != nil || content.voice != nil, !content.isLetter, !content.sealed, !fold.isSpread else { return false }
        return !isWide(width: screen.width - strip)
    }

    /// At least 176 pt of table at each side of the card: the print lies beside it.
    private static func isWide(width: CGFloat) -> Bool {
        (width - CardTableLayout.cardCap(width: width)) / 2 >= 176
    }

    var body: some View {
        let reveal = reveal
        // Off the table entirely while hidden, so a screen reader never reaches a print that isn't there.
        ZStack(alignment: .topLeading) {
            if reveal > 0.01, let photo = model.content.photo, let from = model.content.mediaFrom {
                let frame = printFrame(photo)
                let covered = photo.covered && !uncovered
                CardPrintView(
                    source: from.source(photo.fileId),
                    aspect: photo.aspect,
                    alt: photo.alt,
                    datedOn: CardTableMood(number: model.content.number) == .nostalgia ? mailedDay : nil,
                    covered: covered,
                    fromName: model.content.fromName,
                    onUncover: uncover,
                    tilt: Self.printTilt
                ) {
                    open(photo, from: from, print: frame)
                }
                .frame(width: frame.width)
                .position(x: frame.midX, y: frame.minY + frame.width * printK(photo) / 2)
                .offset(y: reduceMotion ? 0 : (1 - reveal) * frame.width * 0.05)
                .accessibilityIdentifier("cardTablePrint")
            }
            if reveal > 0.01, let voice = model.content.voice, let from = model.content.mediaFrom {
                let frame = greetingFrame()
                CardGreetingButton(
                    source: from.source(voice.fileId),
                    durationMs: voice.durationMs,
                    forName: model.content.toName,
                    fromName: model.content.fromName,
                    gift: CardTableMood(number: model.content.number) == .reverence,
                    tilt: 3
                )
                .frame(width: frame.width)
                .fixedSize(horizontal: false, vertical: true)
                .position(x: frame.midX, y: frame.minY + frame.height / 2)
                .offset(y: reduceMotion ? 0 : (1 - reveal) * frame.width * 0.05)
            }
        }
        .opacity(reveal)
        // Nothing half-shown takes a tap.
        .allowsHitTesting(reveal > 0.9)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: model.isZoomed)
    }

    private static let printTilt: Double = -3

    private func uncover() {
        uncovered = true
    }

    /// How much of them shows, 0 to 1: once the card is out and nearly turned over (they follow the card's own turn,
    /// so a finger turning it brings them and takes them away), not while it's enlarged or being sealed.
    private var reveal: Double {
        guard model.step == .out, model.sending == nil, !model.isZoomed, !model.content.sealed else { return 0 }
        if model.fold.isSpread { return cardTableEase(0.7, 1, model.springs.spread.x) }
        return cardTableEase(0.72, 1, model.cardTurned)
    }

    /// Opens the photo over the whole screen, growing from where its print lies.
    private func open(_ photo: CardPhoto, from: CardMediaFrom, print: CGRect) {
        let border = print.width * 0.06
        let across = print.width - border * 2
        model.openedPhoto = CardPhotoOpened(
            source: from.source(photo.fileId),
            aspect: photo.aspect,
            alt: photo.alt,
            fromName: model.content.fromName,
            origin: CGRect(x: print.minX + border, y: print.minY + border, width: across, height: across / max(photo.aspect, 0.2)),
            originTilt: Self.printTilt
        )
    }

    /// The print's height for its width, border included.
    private func printK(_ photo: CardPhoto) -> CGFloat {
        0.88 / max(photo.aspect, 0.2) + 0.2
    }

    /// Where the print lies (its top edge and width).
    private func printFrame(_ photo: CardPhoto) -> CGRect {
        let k = printK(photo)
        if model.fold.isSpread, let pages = model.fold.pages(
            screen: layout.screen,
            bottomRoom: model.pagesBottomRoom(layout)
        ) {
            // The open Duo: over the note page's lower right corner, clear of FROM and the caption, hanging a little
            // below the page.
            let page = pages.noteFrame
            let width = min(page.width * 0.42, page.height * 0.46 / k)
            let top = page.maxY - width * k * 0.88
            return CGRect(x: page.maxX - width - page.width * 0.05, y: top, width: width, height: width * k)
        }
        if Self.isWide(width: layout.width) {
            let width = min(240, layout.cardX - 24)
            let top = layout.cardTopBack + layout.cardHeight * 0.5
            return CGRect(x: layout.cardX + 20 - width, y: top, width: width, height: width * k)
        }
        // Under the card, in the room the layout keeps: its top edge at the card's foot, where its small turn lifts
        // a corner a few points onto the card's blank margin and no further.
        let room = layout.mediaRoom
        let width = min(layout.cardWidth * 0.47, room / k)
        return CGRect(x: layout.cardX + layout.cardWidth * 0.02, y: underCard, width: width, height: width * k)
    }

    /// Where the things under a phone's card start: the foot of the turned-over card.
    private var underCard: CGFloat {
        layout.cardTopBack + layout.cardHeight - layout.cardWidth * 0.004
    }

    /// Where the greeting lies: right of the print under a phone's card (alone, centred), right of a wide card, or on
    /// the open Duo's picture page.
    private func greetingFrame() -> CGRect {
        // A cassette and its pill: about 0.62 of its width tall plus the pill; a gift tag about 0.53.
        let tall: (CGFloat) -> CGFloat = { width in width * 0.62 + 30 }
        if model.fold.isSpread, let pages = model.fold.pages(screen: layout.screen, bottomRoom: model.pagesBottomRoom(layout)) {
            let page = pages.pictureFrame
            let width = min(page.width * 0.38, 170)
            return CGRect(x: page.minX + page.width * 0.05, y: page.minY + page.height * 0.05, width: width, height: tall(width))
        }
        if Self.isWide(width: layout.width) {
            let width = min(224, layout.cardX - 24)
            return CGRect(
                x: layout.cardX + layout.cardWidth - 16,
                y: layout.cardTopBack + layout.cardHeight * 0.58,
                width: width,
                height: tall(width)
            )
        }
        // A little lower than the print, as things put down by hand lie, and within the room kept for them.
        let room = layout.mediaRoom
        let width = min(layout.cardWidth * 0.45, max(80, (room * 0.95 - 30) / 0.62))
        let top = underCard + room * 0.04
        guard model.content.photo != nil else {
            return CGRect(x: layout.cardX + (layout.cardWidth - width) / 2, y: top, width: width, height: tall(width))
        }
        return CGRect(x: layout.cardX + layout.cardWidth * 0.98 - width, y: top, width: width, height: tall(width))
    }

    /// The day it was mailed ("NOV 10" on the postmark), as a date for the print's orange numbers.
    private var mailedDay: String? {
        guard let postmark = model.content.mailedOn else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "MMM d yyyy"
        guard let day = formatter.date(from: "\(postmark.capitalized) \(model.content.year)") else { return nil }
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: day)
    }
}
