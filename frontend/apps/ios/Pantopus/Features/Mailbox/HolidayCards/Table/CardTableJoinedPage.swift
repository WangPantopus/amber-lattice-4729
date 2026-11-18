//
//  CardTableJoinedPage.swift
//  Pantopus
//
//  The joined card (experience plan Part 3): the card they sent, picture side up, with the reply sheet lying over its
//  lower part, turned 2°; a tap on either brings it to the front. On the iPhone Duo open like a book, the card lies on
//  the left page and the reply on the right. Opened from the reader's table, a reply in the Mailbox, and both Sent pages.
//

import SwiftUI

/// The card they sent, picture side up, with the reply sheet lying over its lower part. The sheet lands with the
/// set-down sound and one tap you can feel.
struct CardTableJoinedPage: View {
    let pair: CardReplyPair
    /// What ✕ says it does.
    var closeLabel = "Back to the Mailbox"
    /// The ⋯ menu: the Vault, Shred, Report and Block on a reply received (none on your own).
    var menuItems: [CardTableMenuItem] = []
    /// A line over the table for a moment ("Report sent.").
    var toast: String?
    let onClose: () -> Void

    /// Where the reply sheet's top lies, as a share of the card's height: under the picture (which ends at 87%), over
    /// the printed strip, so the card's whole picture shows (founder, November 17).
    private static let sheetTop: CGFloat = 0.86
    /// The pair's height in card widths: the card down to the sheet, then the whole sheet.
    private static let tallness: CGFloat = 1.2 * (sheetTop + 1)

    @State private var replyInFront = true
    @State private var menuOpen = false
    @State private var landed = false
    @State private var readsInPrint = false
    @State private var sounds = CardTableSounds()
    @State private var haptics = CardTableHaptics()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .subheadline) private var linkSize: CGFloat = 15

    private var card: MailCard? {
        pair.card.card
    }

    private var reply: CardReplyCard? {
        pair.reply.cardReply
    }

    var body: some View {
        GeometryReader { geo in
            let room = CGSize(width: geo.size.width, height: geo.size.height - 56 - 80)
            // The card and the sheet, which lies over only the card's printed strip, so the whole picture shows.
            let width = max(120, min(room.width - 40, room.height / Self.tallness, 420))
            ZStack(alignment: .top) {
                HolidayCardTableCloth(table: card?.table)
                // The Duo open like a book: the card on the left page, the reply on the right (as the table's pages).
                if case let .sideways(hingeX, true) = CardTableFoldReader.fold(geo, insets: EdgeInsets()) {
                    bookView(hingeX: hingeX, room: room)
                        .padding(.top, 56)
                } else {
                    pairView(width: width)
                        .padding(.top, 56 + max(0, (room.height - width * Self.tallness) / 2))
                }
                VStack {
                    HStack {
                        CardTableRoundButton(icon: .x, label: closeLabel, identifier: "cardJoinedClose", action: onClose)
                        Spacer(minLength: 0)
                        if !menuItems.isEmpty {
                            CardTableRoundButton(icon: .moreHorizontal, label: "More", identifier: "cardJoinedMore") { menuOpen.toggle() }
                        }
                    }
                    if let toast {
                        Text(toast)
                            .font(.system(size: 13.5))
                            .multilineTextAlignment(.center)
                            .foregroundStyle(MailPaper.tableCream)
                            .padding(.vertical, 9)
                            .padding(.horizontal, 15)
                            .background(MailPaper.tableToast, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .accessibilityIdentifier("cardJoinedToast")
                    }
                    Spacer(minLength: 0)
                    Button { readsInPrint = true } label: {
                        Text(CardTableBookmark.print.title)
                            .font(.system(size: linkSize))
                            .foregroundStyle(MailPaper.tableCream)
                            .underline(color: MailPaper.tableCream.opacity(0.45))
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("cardJoinedReadInPrint")
                    .padding(.bottom, Spacing.s4)
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)
                if menuOpen {
                    menu
                        .padding(.top, 56)
                        .padding(.trailing, 12)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .zIndex(30)
                }
                if readsInPrint {
                    CardTableVerseBookmark(
                        words: .print(note: pair.reply.note ?? "", from: HolidayCardWords.firstName(pair.reply.fromName), mailedOn: day),
                        bottomInset: geo.safeAreaInsets.bottom
                    ) { readsInPrint = false }
                        .transition(.opacity)
                        .zIndex(40)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: readsInPrint)
        }
        .environment(\.colorScheme, .dark)
        .onAppear(perform: land)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("cardJoined")
    }

    /// The ⋯ menu's lines, as on a card's table.
    private var menu: some View {
        VStack(spacing: 0) {
            ForEach(menuItems) { item in
                Button {
                    menuOpen = false
                    item.action()
                } label: {
                    Text(item.title)
                        .font(.system(size: linkSize))
                        .foregroundStyle(MailPaper.tableCream)
                        .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
                        .padding(.horizontal, 12)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier(item.identifier)
            }
        }
        .padding(6)
        .frame(width: 240)
        .background(MailPaper.tableMenu, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(MailPaper.tableGlassLine, lineWidth: 0.5))
        .shadow(color: .black.opacity(0.5), radius: 17, x: 0, y: 12)
        .accessibilityIdentifier("cardJoinedMenu")
    }

    /// "NOV 17": the day the reply was written, for the print's first line.
    private var day: String? {
        pair.reply.sentOn.flatMap(MailDates.parseDay).map { MailDates.postmarkDay($0, calendar: .current) }
    }

    private func pairView(width: CGFloat) -> some View {
        ZStack(alignment: .top) {
            if let card {
                Button { replyInFront = false } label: {
                    CardTableFrontPage(design: card.design, caption: card.caption, paper: card.paper, year: card.year, mailedOn: day)
                        .frame(width: width, height: width * 1.2)
                        .shadow(color: .black.opacity(0.42), radius: 8, x: 2, y: 6)
                }
                .buttonStyle(.plain)
                .zIndex(replyInFront ? 0 : 1)
                .accessibilityLabel(
                    "Card from \(HolidayCardWords.firstName(pair.card.fromName)): \(HolidayCardWords.captionSentence(card.caption))"
                )
                .accessibilityHint("Brings the card to the front")
                .accessibilityIdentifier("cardJoinedCard")
            }
            Button { replyInFront = true } label: {
                CardTableBack(
                    paperGrain: CardTableSmallArt.shared.paperGrain,
                    paper: reply?.paper,
                    note: pair.reply.note ?? "",
                    fromName: HolidayCardWords.firstName(pair.reply.fromName),
                    year: reply?.year ?? card?.year ?? 2026,
                    number: reply?.number,
                    signature: reply?.signature,
                    grainOpacity: 0.7
                )
                .frame(width: width, height: width * 1.2)
                .shadow(color: .black.opacity(0.45), radius: 10, x: 3, y: 8)
            }
            .buttonStyle(.plain)
            .rotationEffect(.degrees(2))
            .offset(y: width * 1.2 * Self.sheetTop + (landed || reduceMotion ? 0 : -900))
            .zIndex(replyInFront ? 1 : 0)
            .accessibilityLabel("\(HolidayCardWords.firstName(pair.reply.fromName)) wrote back: \(pair.reply.note ?? "")")
            .accessibilityHint("Brings the reply to the front")
            .accessibilityIdentifier("cardJoinedReply")
        }
        .frame(height: width * Self.tallness, alignment: .top)
        .animation(.easeOut(duration: 0.25), value: replyInFront)
    }

    /// The card on the left page and the reply on the right, each centred on its page.
    private func bookView(hingeX: CGFloat, room: CGSize) -> some View {
        let page = max(0, min(hingeX, room.width - hingeX))
        let width = max(120, min(page - 32, room.height / 1.2, 420))
        return HStack(spacing: 0) {
            Group {
                if let card {
                    CardTableFrontPage(design: card.design, caption: card.caption, paper: card.paper, year: card.year, mailedOn: day)
                        .frame(width: width, height: width * 1.2)
                        .shadow(color: .black.opacity(0.42), radius: 8, x: 2, y: 6)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(
                            "Card from \(HolidayCardWords.firstName(pair.card.fromName)): \(HolidayCardWords.captionSentence(card.caption))"
                        )
                        .accessibilityIdentifier("cardJoinedCard")
                }
            }
            .frame(width: hingeX)
            CardTableBack(
                paperGrain: CardTableSmallArt.shared.paperGrain,
                paper: reply?.paper,
                note: pair.reply.note ?? "",
                fromName: HolidayCardWords.firstName(pair.reply.fromName),
                year: reply?.year ?? card?.year ?? 2026,
                number: reply?.number,
                signature: reply?.signature,
                grainOpacity: 0.7
            )
            .frame(width: width, height: width * 1.2)
            .shadow(color: .black.opacity(0.45), radius: 10, x: 3, y: 8)
            .rotationEffect(.degrees(2))
            .offset(y: landed || reduceMotion ? 0 : -900)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(HolidayCardWords.firstName(pair.reply.fromName)) wrote back: \(pair.reply.note ?? "")")
            .accessibilityIdentifier("cardJoinedReply")
        }
        .frame(height: room.height)
    }

    /// The reply sheet comes down onto the card, with the set-down sound and one tap.
    private func land() {
        sounds.preload()
        guard !landed else { return }
        withAnimation(reduceMotion ? nil : .spring(duration: 0.55, bounce: 0.08)) { landed = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: reduceMotion ? 0 : 450_000_000)
            sounds.play(.down)
            haptics.tap(.soft)
        }
    }
}
