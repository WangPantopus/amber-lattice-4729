//
//  MailSentEmailBox.swift
//  Pantopus
//
//  A card by email whose email didn't go out, on its page in Sent (launch
//  key `mailbox`): under the title and status line, in the cream paper of
//  "Changed your mind?", what happened with the address they typed, and
//  Email it again. The server keeps trying for about an hour (`retrying`),
//  then gives up (`failed`).
//

import SwiftUI

/// The box while the card's email hasn't gone out; once it's gone (or the
/// card went meanwhile), only why Email it again didn't work, if it didn't.
struct MailSentEmailBox: View {
    let piece: MailSentPiece
    let viewModel: MailSentPieceViewModel

    var body: some View {
        if let trouble = piece.emailStatus {
            box(trouble)
        } else if let error = viewModel.emailAgainError {
            errorLine(error)
        }
    }

    private func box(_ trouble: MailSentPiece.EmailStatus) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            HStack(alignment: .top, spacing: Spacing.s3) {
                Icon(.mail, size: 20, color: MailPaper.cardLink)
                    .padding(.top, 1)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: MailSentWords.emailTroubleTitle(trouble))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(MailPaper.cardText)
                    Text(verbatim: MailSentWords.emailTroubleBody(piece, trouble: trouble, postage: viewModel.postage))
                        .font(.system(size: 13))
                        .foregroundStyle(MailPaper.cardTextMuted)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("mailSentEmailTrouble")
            HolidayCardWaxButton(title: "Email it again", isLoading: viewModel.emailingAgain, fullWidth: false) {
                Task {
                    guard await viewModel.emailAgain() else { return }
                    // Sent reads its rows again: the card's line says where it is now.
                    NotificationCenter.default.post(name: .mailboxSentChanged, object: nil)
                }
            }
            // Under the words, clear of the icon.
            .padding(.leading, 20 + Spacing.s3)
            .accessibilityIdentifier("mailSentEmailAgain")
            if let error = viewModel.emailAgainError {
                errorLine(error)
            }
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MailPaper.cardNote, in: RoundedRectangle(cornerRadius: Radii.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).strokeBorder(MailPaper.cardRowLine, lineWidth: 1))
        .accessibilityElement(children: .contain)
    }

    /// The server's sentence, as a take-back that didn't work shows it.
    private func errorLine(_ text: String) -> some View {
        Text(verbatim: text)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(Theme.Color.error)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("mailSentEmailAgainError")
    }
}

extension View {
    /// "We emailed them." at the foot of a sent card's page, for a moment.
    func mailSentToast(_ toast: Binding<ToastMessage?>) -> some View {
        overlay(alignment: .bottom) {
            if let message = toast.wrappedValue {
                ToastView(message: message)
                    .padding(.bottom, Spacing.s10)
                    .dismissToast(after: message) { toast.wrappedValue = nil }
            }
        }
    }
}
