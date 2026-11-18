//
//  HomePostalOneTapViews.swift
//  Pantopus
//
//  Faster home verification (FASTVERIFY drawing M1, "Mail me a code"): one
//  tap mails the postcard to the Home's saved address, and a scanned card that
//  this account didn't ask for can be stopped ("This wasn't me"). Drawn only
//  while the server's verify-options answers (its switch on).
//

import SwiftUI

extension HomePostalVerificationView {
    var oneTapIntro: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("Mail me a code")
                .scaledFont(26, weight: .bold)
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("homePostalOneTapHeading")
            Text("We mail a postcard to this home. Scan it when it arrives and you're done.")
                .scaledFont(16)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Where the card goes, the three steps, and who the code works for.
    func oneTapMail(_ address: HomeResidencyAddressSnapshot) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            oneTapCard {
                VStack(alignment: .leading, spacing: Spacing.s1) {
                    Text("Mailing to", style: .overline)
                        .foregroundStyle(Theme.Color.appTextMuted)
                    Text([address.line1, address.line2].filter { !$0.isEmpty }.joined(separator: ", "))
                        .scaledFont(18, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(address.city), \(address.state) \(address.postalCode)")
                        .scaledFont(15)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                    Button { onAddressWrong() } label: {
                        Text("This address is wrong")
                            .scaledFont(15, weight: .medium)
                            .foregroundStyle(Theme.Color.appText)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("homePostalAddressWrong")
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("homePostalMailingTo")
            oneTapCard {
                VStack(alignment: .leading, spacing: Spacing.s3) {
                    oneTapStep(1, title: "Today", detail: "We print your card.")
                    oneTapStep(2, title: "In about a week", detail: "It arrives in your mailbox.")
                    oneTapStep(3, title: "You scan it", detail: "Verified by mail. Residency letters and home Mail open.")
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                Icon(.lock, size: 14, color: Theme.Color.appTextSecondary)
                    .accessibilityHidden(true)
                Text("The code works only from your account, for 30 days.")
                    .scaledFont(14)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// "Mail my postcard" and its note, under the page.
    var oneTapDock: some View {
        VStack(spacing: Spacing.s2) {
            PrimaryButton(title: "Mail my postcard", isEnabled: viewModel.offersOneTapMail) {
                await viewModel.requestMailInOneTap()
            }
            .accessibilityIdentifier("homePostalMailOneTap")
            Text("Free. One card at a time.")
                .scaledFont(13)
                .foregroundStyle(Theme.Color.appTextSecondary)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.top, Spacing.s3)
        .padding(.bottom, Spacing.s4)
        .background(Theme.Color.appSurface)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
        }
    }

    /// A scanned card this account has no card for: the web page's words, and the way to stop it.
    var scannedCardQuestion: some View {
        oneTapCard {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                if viewModel.report == .recorded {
                    Text("Thank you. We stopped this card and will look into it.")
                        .scaledFont(16)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("homePostalReportRecorded")
                } else {
                    Text("Did you ask for this card?")
                        .scaledFont(20, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .accessibilityAddTraits(.isHeader)
                    Text("Someone asked Pantopus to mail a code to this address.")
                        .scaledFont(16)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    PrimaryButton(title: "This wasn't me", isLoading: viewModel.report == .sending) {
                        await viewModel.reportScannedCard()
                    }
                    .accessibilityIdentifier("homePostalReportCard")
                    if viewModel.report == .failed {
                        Text("Couldn't send that. Try again.")
                            .scaledFont(14)
                            .foregroundStyle(Theme.Color.error)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("homePostalScannedCard")
    }

    private func oneTapStep(_ number: Int, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            Text("\(number)")
                .scaledFont(13, weight: .semibold)
                .foregroundStyle(Theme.Color.primary700)
                .frame(width: 26, height: 26)
                .background(Circle().fill(Theme.Color.infoBg))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .scaledFont(16, weight: .medium)
                    .foregroundStyle(Theme.Color.appText)
                Text(detail)
                    .scaledFont(14)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private func oneTapCard(@ViewBuilder _ content: () -> some View) -> some View {
        content()
            .padding(Spacing.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                    .strokeBorder(Theme.Color.appBorder, lineWidth: 1)
            )
    }
}
