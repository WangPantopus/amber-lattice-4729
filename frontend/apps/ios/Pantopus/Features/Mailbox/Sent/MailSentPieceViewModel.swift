//
//  MailSentPieceViewModel.swift
//  Pantopus
//
//  One sent card's page in Sent (launch key `mailbox`): the card with the
//  sender's own note (also while it's sealed for them) and its trail, and
//  taking it back while it can be; a card by email whose email didn't go
//  out can be emailed again. `GET /api/mailbox/sent/:id` (404 for anyone
//  but its sender), `POST /api/mailbox/cards/:id/take-back` and
//  `POST /api/mailbox/cards/:id/email-again`.
//

import Foundation
import Observation

enum MailSentPieceState {
    case loading
    case loaded(MailSentPiece)
    case error(message: String)
    /// Taken back (here or elsewhere) or never theirs: the server's sentence.
    case gone(message: String)
}

@Observable
@MainActor
final class MailSentPieceViewModel {
    let id: String
    private(set) var state: MailSentPieceState = .loading
    private(set) var takingBack = false
    private(set) var takeBackError: String?
    /// Asks "Take your card back?" first.
    var confirmsTakeBack = false
    /// "Email it again" on a card by email whose email didn't go out, and
    /// the server's sentence when it still didn't.
    private(set) var emailingAgain = false
    private(set) var emailAgainError: String?
    /// "We emailed them." once it went.
    var toast: ToastMessage?
    /// Whether cards cost digital stamps for this person: a card whose email
    /// was given up on says its stamp comes back when it's taken back.
    private(set) var postage: Bool
    private var didReadPostage = false

    private let api: APIClient

    init(id: String, api: APIClient = .shared) {
        self.id = id
        self.api = api
        postage = HolidayCardWords.postageOn
    }

    var piece: MailSentPiece? {
        if case let .loaded(piece) = state { return piece }
        return nil
    }

    func load() async {
        if piece == nil { state = .loading }
        await fetch()
    }

    func retry() async {
        state = .loading
        await fetch()
    }

    private func fetch() async {
        do {
            let detail: MailSentDetail = try await HolidayCardFlowViewModel.answer(MailSentEndpoints.piece(id: id), api: api)
            state = .loaded(detail.item)
            if detail.item.emailStatus == .failed { await readPostageOnce() }
        } catch {
            let sentence = HolidayCardFlowViewModel.refusal(
                error,
                fallback: "Pantopus is having trouble just now. Try again in a moment."
            )
            if HolidayCardFlowViewModel.refusalCode(error) == "SENT_NOT_FOUND" {
                state = .gone(message: sentence)
                return
            }
            // A refresh that fails keeps the card on screen.
            guard piece == nil else { return }
            state = .error(message: sentence)
        }
    }

    /// After "Take your card back?". True when it's gone; too late, the
    /// server's sentence shows and the card stays, read again.
    func takeBack() async -> Bool {
        confirmsTakeBack = false
        guard !takingBack else { return false }
        takingBack = true
        takeBackError = nil
        defer { takingBack = false }
        do {
            let _: TakeBackHolidayCardResponse = try await HolidayCardFlowViewModel.answer(
                HolidayCardEndpoints.takeBack(cardId: id),
                api: api
            )
            return true
        } catch {
            takeBackError = HolidayCardFlowViewModel.refusal(
                error,
                fallback: "Couldn’t take your card back just now. Try again in a moment."
            )
            await fetch()
            return false
        }
    }

    /// "Email it again". True once it went: "We emailed them." and the card
    /// read again. Otherwise the server's sentence shows under its box, and
    /// the card is read again (it may have gone meanwhile, or been taken back).
    func emailAgain() async -> Bool {
        guard !emailingAgain else { return false }
        emailingAgain = true
        emailAgainError = nil
        defer { emailingAgain = false }
        do {
            let _: EmailAgainHolidayCardResponse = try await HolidayCardFlowViewModel.answer(
                HolidayCardEndpoints.emailAgain(cardId: id),
                api: api
            )
            toast = ToastMessage(text: "We emailed them.", kind: .success)
            await fetch()
            return true
        } catch {
            emailAgainError = HolidayCardFlowViewModel.refusal(
                error,
                fallback: "Couldn’t email them just now. Try again in a moment."
            )
            await fetch()
            return false
        }
    }

    /// Digital stamps, read once for a card whose email was given up on:
    /// a notice can open this page before the Mailbox has read the cards.
    private func readPostageOnce() async {
        guard !didReadPostage else { return }
        didReadPostage = true
        let cards: HolidayCardsResponse? = try? await api.request(HolidayCardEndpoints.cards())
        guard let cards else { return }
        HolidayCardWords.postageOn = cards.postageEnabled
        postage = cards.postageEnabled
    }
}
