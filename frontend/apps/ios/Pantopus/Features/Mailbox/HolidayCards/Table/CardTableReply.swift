//
//  CardTableReply.swift
//  Pantopus
//
//  Write back (experience plan Part 3; the memories plan's steps 5 and 6). The card's reader writes on a cream sheet
//  the size of the card's back, lying on the card's own cloth: the back's own drawing with "Dear {first name}," as its
//  faint first line, the pen at Part 1's sizes, and FROM with their saved signature. "Send with the morning mail"
//  slides the sheet up off the table, with no envelope. The joined card shows the card they sent, picture side up,
//  with the reply sheet lying over its lower part, turned 2°: a tap on either brings it to the front.
//

import SwiftUI

/// What the joined card shows: the card and the reply, as the exchange read gives them.
struct CardReplyPair: Identifiable, Equatable {
    let card: HolidayCardExchange.Page
    let reply: HolidayCardExchange.Page

    var id: String {
        reply.id
    }

    init?(_ exchange: HolidayCardExchange) {
        guard let card = exchange.original, card.card != nil, let reply = exchange.reply, reply.cardReply != nil else {
            return nil
        }
        self.card = card
        self.reply = reply
    }
}

enum CardReplyWords {
    /// "Write back to Juniper".
    static func writeBack(_ firstName: String) -> String {
        "Write back to \(firstName)"
    }

    /// "You wrote back · Tue, Nov 17".
    static func wroteBack(on day: String?) -> String {
        let shown = HolidayCardWords.shortDay(day)
        return shown.isEmpty ? "You wrote back" : "You wrote back · \(shown)"
    }

    /// The slip across a reply's row in the Mailbox: "Nora wrote back".
    static func slip(_ name: String) -> String {
        "\(HolidayCardWords.firstName(name)) wrote back"
    }
}

// MARK: - Writing it

/// The cream sheet to write back on, over the table.
struct CardTableReplySheet: View {
    /// The card being answered (the reply goes to the person who sent it).
    let cardId: String
    let content: CardTableContent
    /// Back to the card; `sent` true once the reply has gone (the card's page reads the exchange again).
    let onClose: (_ sent: Bool) -> Void

    @State private var text = ""
    /// One per draft, the same on every retry.
    @State private var requestId = UUID().uuidString.lowercased()
    @State private var signature: CardSignature?
    @State private var sending = false
    @State private var refusal: String?
    @State private var sent: CardReplyAnswer.Summary?
    /// The sheet has slid up off the table.
    @State private var gone = false
    @State private var takingBack = false
    @State private var sounds = CardTableSounds()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .subheadline) private var lineSize: CGFloat = 15
    @ScaledMetric(relativeTo: .title3) private var wordsSize: CGFloat = 18

    static let limit = 300

    /// The person it goes to, by first name.
    private var first: String {
        content.firstName
    }

    var body: some View {
        ZStack(alignment: .top) {
            HolidayCardTableCloth(table: content.table)
            ScrollView {
                VStack(spacing: Spacing.s3) {
                    sheet
                        .offset(y: gone && !reduceMotion ? -1400 : 0)
                        .opacity(gone ? 0 : 1)
                        .accessibilityHidden(gone)
                    if sent == nil {
                        writing
                    }
                }
                .frame(maxWidth: 460)
                .padding(.horizontal, Spacing.s4)
                .padding(.top, 64)
                .padding(.bottom, Spacing.s8)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
            .scrollDisabled(gone)
            // Once it's gone: the words at the top, Done and Take it back at the bottom, on the empty table.
            if gone, let sent {
                VStack(spacing: 0) {
                    goneWords(sent)
                    Spacer(minLength: Spacing.s4)
                    goneButtons
                }
                .frame(maxWidth: 460)
                .padding(.horizontal, Spacing.s4)
                .padding(.top, 64)
                .padding(.bottom, Spacing.s4)
                .transition(.opacity)
            }
            HStack {
                CardTableRoundButton(
                    icon: .x,
                    label: sent == nil ? "Back to the card" : "Done",
                    identifier: "cardReplyClose"
                ) { onClose(sent != nil) }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
        }
        .environment(\.colorScheme, .dark)
        .task { await readSignature() }
        .onAppear { sounds.preload() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("cardReplySheet")
    }

    /// The back's drawing: ruled lines, the pen, FROM and the signature, with "Dear {first name}," faint on the first
    /// line until the writing starts.
    private var sheet: some View {
        HolidayCardBack(paper: content.paper, fromName: content.toName, year: content.year, signature: signature, noteText: text) { width in
            HolidayCardNoteText(
                text: $text,
                cardWidth: width,
                placeholder: "Dear \(first),",
                isEditable: sent == nil,
                limit: Self.limit
            )
        }
        .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
        .shadow(color: .black.opacity(0.42), radius: 10, x: 0, y: 8)
        .rotationEffect(.degrees(-0.6))
    }

    private var writing: some View {
        let count = HolidayCardNote.letters(text)
        let empty = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return VStack(spacing: Spacing.s2) {
            HStack(alignment: .firstTextBaseline) {
                Text("Only you and \(first) can see this.")
                    .font(.system(size: lineSize))
                    .foregroundStyle(MailPaper.tableCreamSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("cardReplyPrivate")
                Spacer(minLength: Spacing.s2)
                Text("\(count) of \(Self.limit) letters")
                    .font(.system(size: 13, weight: count >= Self.limit ? .semibold : .regular))
                    .foregroundStyle(count >= Self.limit ? MailPaper.tableCream : MailPaper.tableCreamSoft)
                    .accessibilityIdentifier("cardReplyCount")
            }
            if let refusal {
                Text(refusal)
                    .font(.system(size: lineSize, weight: .medium))
                    .foregroundStyle(MailPaper.tableCream)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("cardReplyRefusal")
            }
            HolidayCardWaxButton(title: "Send with the morning mail", isLoading: sending, isEnabled: !empty) {
                Task { await send() }
            }
            .accessibilityIdentifier("cardReplySend")
            .padding(.top, Spacing.s1)
        }
    }

    /// "On its way to {first name}." and when it comes.
    private func goneWords(_ sent: CardReplyAnswer.Summary) -> some View {
        let day = HolidayCardWords.shortDay(sent.arrivesOn ?? sent.arrivesAt)
        let lines = ["On its way to \(first).", day.isEmpty ? nil : "\(content.fromName) gets it with their 7 a.m. mail on \(day)."]
        return Text(lines.compactMap(\.self).joined(separator: "\n"))
            .font(.system(size: wordsSize, design: .serif).italic())
            .lineSpacing(wordsSize * 0.15)
            .multilineTextAlignment(.center)
            .foregroundStyle(MailPaper.tableCreamSoft)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
            .padding(.top, Spacing.s5)
            .accessibilityIdentifier("cardReplyGone")
    }

    private var goneButtons: some View {
        VStack(spacing: Spacing.s2) {
            CardTableAct(title: "Done", hint: "", primarySize: lineSize, hintSize: lineSize) { onClose(true) }
            if sent?.canTakeBack != false {
                Button {
                    Task { await takeBack() }
                } label: {
                    Text("Take it back")
                        .font(.system(size: lineSize, weight: .medium))
                        .foregroundStyle(MailPaper.tableCream)
                        .underline(color: MailPaper.tableCream.opacity(0.4))
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(takingBack)
                .accessibilityIdentifier("cardReplyTakeBack")
            }
            if let refusal {
                Text(refusal)
                    .font(.system(size: lineSize))
                    .foregroundStyle(MailPaper.tableCream)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: The server

    /// The account's saved signature signs the reply, as it signs a card; without one, the typed first name.
    private func readSignature() async {
        let cards: HolidayCardsResponse? = try? await APIClient.shared.request(HolidayCardEndpoints.cards())
        if let saved = cards?.signature?.saved { signature = saved }
    }

    private func send() async {
        guard !sending else { return }
        sending = true
        refusal = nil
        defer { sending = false }
        Keyboard.close()
        let body = CardReplyBody(
            message: text.trimmingCharacters(in: .whitespacesAndNewlines),
            requestId: requestId,
            signature: signature
        )
        do {
            let answer: CardReplyAnswer = try await APIClient.shared.request(HolidayCardEndpoints.reply(cardId: cardId, body))
            sent = answer.reply
            // No envelope: the sheet slides up off the table with the paper sound.
            sounds.play(.slide)
            withAnimation(reduceMotion ? nil : .easeIn(duration: 0.55)) { gone = true }
        } catch {
            if HolidayCardFlowViewModel.refusalCode(error) == "CARD_REQUEST_SENT" {
                // Sent by an earlier try whose answer was lost.
                onClose(true)
                return
            }
            refusal = HolidayCardFlowViewModel.refusal(error, fallback: "Couldn’t send your reply just now. Try again in a moment.")
        }
    }

    private func takeBack() async {
        guard !takingBack else { return }
        takingBack = true
        refusal = nil
        defer { takingBack = false }
        do {
            let _: CardReplyTakeBack = try await APIClient.shared.request(HolidayCardEndpoints.takeBackReply(cardId: cardId))
            onClose(true)
        } catch {
            refusal = HolidayCardFlowViewModel.refusal(error, fallback: "Couldn’t take your reply back just now. Try again in a moment.")
        }
    }
}
