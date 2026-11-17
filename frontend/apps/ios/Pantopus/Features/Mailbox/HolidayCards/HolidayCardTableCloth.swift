//
//  HolidayCardTableCloth.swift
//  Pantopus
//
//  From Write on the back onward you are at the table (launch key
//  `card_table`, plan Part 9): Write on the back, Seal it for the day and Look
//  it over lie on the chosen card's cloth under the table's window light, as
//  the card itself does. Steps, order and words are unchanged.
//

import SwiftUI

/// The chosen card's cloth under the window light, behind the send flow's middle steps.
struct HolidayCardTableCloth: View {
    /// The cloth's colour from the design (hex); slate when it's missing.
    let table: String?
    @State private var art: CardTableArt?

    var body: some View {
        GeometryReader { geo in
            let tint = MailPaper.tableTint(table)
            ZStack(alignment: .topLeading) {
                MailPaper.tableNight
                if let art {
                    Image(uiImage: art.cloth)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                        .colorMultiply(tint)
                    Image(uiImage: art.light)
                        .resizable()
                        .frame(width: geo.size.width + 80, height: geo.size.height + 80)
                        .offset(x: -40, y: -40)
                        .opacity(0.88)
                        .blendMode(.softLight)
                } else {
                    tint
                }
            }
            // The light is 40 pt larger than the cloth all round, which makes the stack larger: pinned to its top-left
            // corner the cloth covers the screen (centred, it stopped 40 pt short of the right and bottom edges).
            .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
            .clipped()
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
        .task { art = await CardTableArt.load() }
    }
}

extension View {
    /// A pinned bar's background: the desk with its line on top; at the table (plan Part 9) the cloth shows through,
    /// darkening toward the bottom so the words and buttons on it read.
    @ViewBuilder
    func holidayCardBarBackground(_ scheme: ColorScheme, atTable: Bool) -> some View {
        if atTable {
            background(
                LinearGradient(
                    colors: [MailPaper.tableNight.opacity(0), MailPaper.tableNight.opacity(0.85)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea(edges: .bottom)
            )
        } else {
            background(HolidayCardDesk.background(scheme).ignoresSafeArea(edges: .bottom))
                .overlay(alignment: .top) {
                    Rectangle().fill(MailPaper.cardRowLine).frame(height: 1)
                }
        }
    }

    /// A pinned button's background (experience plan 5.2): no panel, only a soft fade into the page's colour, so what
    /// scrolls under it shows until it reaches the button.
    func holidayCardButtonFade(_ scheme: ColorScheme, atTable: Bool) -> some View {
        let base = atTable ? MailPaper.tableNight : HolidayCardDesk.background(scheme)
        return background(
            LinearGradient(
                stops: [
                    .init(color: base.opacity(0), location: 0),
                    .init(color: base.opacity(atTable ? 0.7 : 0.92), location: 0.45),
                    .init(color: base.opacity(atTable ? 0.85 : 1), location: 1)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea(edges: .bottom)
            .allowsHitTesting(false)
        )
    }
}
