//
//  CardMediaBeside.swift
//  Pantopus
//
//  The card's own photo and voice greeting beside the card, a little over its foot, where the sender looks at their own
//  card: Look it over and Sent's detail (memories plan steps 4 and 7, `holiday_card_memories`; wave 4 drawing 2): the
//  print on the left, the greeting on the right. Never covered there: they're the sender's own. A nostalgia card's print
//  carries the orange date (the card's own day); a Christmas with Jesus Christ card's greeting is a gift tag.
//

import SwiftUI

struct CardMediaBeside: View {
    let photo: CardPhoto?
    let voice: CardVoice?
    /// Whose route their bytes come from: the uploader's own (Look it over) or Sent's.
    let from: CardMediaFrom
    /// The card's picture number, for its mood.
    let number: Int?
    /// The card's own day (its postmark, or when it was sent), printed in orange on a nostalgia card.
    var day: String?
    var fromName = ""
    /// Who the greeting is for ("For Maya").
    var forName = ""

    @State private var opened: CardPhotoOpened?

    var body: some View {
        let mood = CardTableMood(number: number)
        HStack(alignment: .top, spacing: Spacing.s3) {
            if let photo {
                CardPrintView(
                    source: from.source(photo.fileId),
                    aspect: photo.aspect,
                    alt: photo.alt,
                    datedOn: mood == .nostalgia ? day : nil,
                    fromName: fromName,
                    live: photo.live != nil
                ) {
                    // Their own photo: "yours" to a screen reader.
                    opened = CardPhotoOpened(
                        source: from.source(photo.fileId),
                        aspect: photo.aspect,
                        alt: photo.alt,
                        live: photo.live.map { from.source($0.fileId) },
                        liveType: photo.live?.mimeType
                    )
                }
                .frame(maxWidth: 190)
            }
            Spacer(minLength: 0)
            if let voice {
                CardGreetingButton(
                    source: from.source(voice.fileId),
                    durationMs: voice.durationMs,
                    forName: forName,
                    fromName: fromName,
                    gift: mood == .reverence
                )
                .frame(maxWidth: 170)
                .padding(.top, Spacing.s5)
            }
        }
        .padding(.horizontal, Spacing.s3)
        .cardPhotoCover($opened)
    }
}

extension View {
    /// A card's photo over the whole screen, where no card table is under it: it fades in by itself, with none of the
    /// system's sliding.
    func cardPhotoCover(_ opened: Binding<CardPhotoOpened?>) -> some View {
        fullScreenCover(isPresented: Binding(
            get: { opened.wrappedValue != nil },
            set: { if !$0 { opened.wrappedValue = nil } }
        )) {
            if let photo = opened.wrappedValue {
                CardPhotoViewer(photo: photo) {
                    var quiet = Transaction()
                    quiet.disablesAnimations = true
                    withTransaction(quiet) { opened.wrappedValue = nil }
                }
                .presentationBackground(.clear)
            }
        }
        .transaction(value: opened.wrappedValue != nil) { $0.disablesAnimations = true }
    }
}
