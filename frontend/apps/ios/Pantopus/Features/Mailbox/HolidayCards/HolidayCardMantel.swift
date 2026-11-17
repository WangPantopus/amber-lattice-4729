//
//  HolidayCardMantel.swift
//  Pantopus
//
//  The mantel (experience plan Part 7, approved by the founder on November 17): this season's opened Christmas cards
//  stand on a wooden shelf at the top of the Mailbox's personal list, as cards stand on a mantel at home. Each is the
//  card's own small face, tipped back a little and turned the same way every time, with its shadow on the wall. The
//  shelf stays still while the cards scroll sideways; a tap opens the card on its table. Nothing moves by itself.
//

import SwiftUI

struct HolidayCardMantel: View {
    /// One opened card on the shelf.
    struct Card: Identifiable, Equatable {
        /// The mail piece, which a tap opens.
        let id: String
        let design: String
        let number: Int?
        let caption: String
        let paper: String?
        let year: Int
        let mailedOn: String?
        let fromFirstName: String
    }

    let cards: [Card]
    let onOpen: (String) -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var shelf: UIImage?
    @State private var sprig: UIImage?

    private static let height: CGFloat = 182
    private static let cardWidth: CGFloat = 88
    private static let cardHeight: CGFloat = 105.6
    /// The cards' lower edge, from the strip's top: 38 above its bottom, on the shelf's top surface.
    private static let cardBottom: CGFloat = 182 - 38

    var body: some View {
        // Only the strip takes room in the list; the light, the shelf (1200 wide, running off the edge) and the cards
        // are drawn over it and clipped to it.
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: Self.height)
            .overlay { light }
            .overlay(alignment: .topLeading) { shelfArt }
            .overlay(alignment: .topLeading) { row }
            .clipped()
            .task(id: scheme) {
                shelf = CardTableArt.file(scheme == .dark ? "mantel-shelf-dark" : "mantel-shelf-light", scale: 3)
                sprig = CardTableArt.file("mantel-sprig", scale: 3)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Your Christmas cards, \(cards.count)")
            .accessibilityIdentifier("mailMantel")
    }

    /// A warm pool behind the cards: centred 46% across and 62% down, 62% of the strip wide and 70% tall (the sample
    /// lights 30 pt above the strip too), to nothing at 72%.
    private var light: some View {
        GeometryReader { geo in
            let tall = Self.height + 30
            EllipticalGradient(
                stops: [
                    .init(color: scheme == .dark ? MailPaper.mantelGlowDark : MailPaper.mantelGlowLight, location: 0),
                    .init(color: .clear, location: 0.72)
                ],
                center: .center,
                startRadiusFraction: 0,
                endRadiusFraction: 0.5
            )
            .frame(width: geo.size.width * 0.62 * 2, height: tall * 0.7 * 2)
            .position(x: geo.size.width * 0.46, y: -30 + tall * 0.62)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// The shelf: its left end 12 in, its top 143 down, running off the right edge; it doesn't move with the cards.
    private var shelfArt: some View {
        Group {
            if let shelf {
                Image(uiImage: shelf)
                    .resizable()
                    .frame(width: shelf.size.width, height: shelf.size.height)
            }
        }
        .offset(x: 12, y: 143)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// The cards, newest opened at the left, scrolling sideways; the fir sprig at the strip's left edge scrolls with
    /// them, in front of the shelf.
    private var row: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            ZStack(alignment: .topLeading) {
                HStack(alignment: .bottom, spacing: 13) {
                    ForEach(cards) { card in
                        standing(card)
                    }
                }
                .padding(.leading, 74)
                .padding(.trailing, 16)
                .frame(height: Self.cardBottom, alignment: .bottom)
                if let sprig {
                    Image(uiImage: sprig)
                        .resizable()
                        .frame(width: sprig.size.width, height: sprig.size.height)
                        .offset(y: 90)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
            .frame(height: Self.height, alignment: .topLeading)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .accessibilityElement(children: .contain)
    }

    private func standing(_ card: Card) -> some View {
        let wall = scheme == .dark ? MailPaper.mantelWallShadowDark : MailPaper.mantelWallShadowLight
        return Button { onOpen(card.id) } label: {
            CardTableFrontPage(design: card.design, caption: card.caption, paper: card.paper, year: card.year, mailedOn: card.mailedOn)
                .frame(width: Self.cardWidth, height: Self.cardHeight)
                // Tipped back 11° about its lower edge (a perspective of 520), and turned by its own number.
                .rotation3DEffect(
                    .degrees(11),
                    axis: (x: 1, y: 0, z: 0),
                    anchor: .bottom,
                    perspective: Self.cardHeight / 520
                )
                .rotationEffect(.degrees(Self.turn(card.number)), anchor: .bottom)
                .shadow(color: wall, radius: 2.5, x: 7, y: 2)
                .shadow(color: .black.opacity(0.25), radius: 0.5, x: 0, y: 1)
                .background(alignment: .bottom) {
                    // Its shadow on the shelf: an ellipse under the card, dark at its middle.
                    EllipticalGradient(
                        colors: [.black.opacity(0.38), .clear],
                        center: .center,
                        startRadiusFraction: 0,
                        endRadiusFraction: 0.5
                    )
                    .frame(width: Self.cardWidth, height: 7)
                    .offset(y: 4.5)
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Card from \(card.fromFirstName): \(card.caption)")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("mailMantelCard")
    }

    /// Between −2.4° and +2.4°, from the card's number with the seeded numbers the note's words use.
    static func turn(_ number: Int?) -> Double {
        var random = CardTableRandom(seed: (number ?? 1) * 7 + 3)
        return Double((random.next() - 0.5) * 4.8)
    }
}

extension HolidayCardMantel {
    /// This season's opened Christmas cards in a personal list, newest opened first, 30 at most; none after January 6
    /// by this phone's clock. Received cards only: replies, sealed, unopened and sent cards stay in their rows.
    static func cards(
        in mail: [DrawerItemsResponse.DrawerMail],
        viewed: Set<String>,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [Card] {
        let today = calendar.dateComponents([.year, .month, .day], from: now)
        guard let year = today.year, let month = today.month, let day = today.day else { return [] }
        if month == 1, day > 6 { return [] }
        let season = month == 1 ? year - 1 : year
        let opened = mail.filter { item in
            guard let card = item.item.card, !card.sealed, card.year == season,
                  item.item.category != "holiday_card_reply" else { return false }
            return item.item.viewed || viewed.contains(item.id)
        }
        let when = { (item: DrawerItemsResponse.DrawerMail) -> Date in
            MailDates.parse(item.item.openedAt) ?? MailDates.parse(item.item.viewedAt)
                ?? MailDates.parse(item.item.deliveredAt) ?? now
        }
        return opened.sorted { when($0) > when($1) }.prefix(30).compactMap { item in
            guard let card = item.item.card else { return nil }
            let mailedOn = (MailDates.parse(item.item.postmark?.date) ?? MailDates.parse(item.item.deliveredAt))
                .map { MailDates.postmarkDay($0, calendar: calendar) }
            return Card(
                id: item.id,
                design: card.design,
                number: card.number,
                caption: card.caption ?? "",
                paper: card.paper,
                year: card.year,
                mailedOn: mailedOn,
                fromFirstName: HolidayCardWords.firstName(item.senderDisplay)
            )
        }
    }
}
