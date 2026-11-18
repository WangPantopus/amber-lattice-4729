//
//  PlanGroupPayParts.swift
//  Pantopus
//
//  Plans for the holidays, one person pays for the group (08-extras section 7, board 31). On the payment sheet, with
//  more than one spot: "Who are they for?" with "People with me" (today's party) and "I'll send a link", where the
//  stepper picks how many spots (the buyer's own among them) and the server's note says what the link does. After
//  paying, the plan shows "Your 11 spots" with "4 taken", "Copy link", "Share" and "Give back 7 spots"; someone who
//  came by the link sees "Chris got you a spot". Every amount and sentence is the server's.
//

import SwiftUI

/// The sheet's "Who are they for?" and, for a link, the spots stepper.
struct PlanGroupPayChooser: View {
    let offer: PlanGroupPayOfferDTO
    @Binding var forLink: Bool
    @Binding var spots: Int

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text.planOverline(offer.title)
            PlanSegmented(
                options: offer.choices.map { ($0.id == "link", $0.label) },
                selection: $forLink,
                label: offer.title,
                identifiers: offer.choices.map { "planGroupPay.\($0.id)" }
            )
            if forLink {
                HStack(spacing: Spacing.s3) {
                    Text("Spots")
                        .planFont(.bodyStrong)
                        .foregroundStyle(Theme.Color.appText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Stepper(value: $spots, in: 2...max(offer.maxSpots, 2)) {
                        Text("\(spots)").planFont(.bodyStrong).monospacedDigit().foregroundStyle(Theme.Color.appText)
                    }
                    .fixedSize()
                    .accessibilityLabel("Spots")
                    .accessibilityValue("\(spots)")
                    .accessibilityIdentifier("planGroupPaySpots")
                }
                .padding(.vertical, Spacing.s2)
            }
        }
    }
}

/// The server's line about the link, in the info box (board 31).
struct PlanGroupPayNote: View {
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Icon(.link, size: 16, color: Theme.Color.primary600).accessibilityHidden(true)
            Text(text)
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextStrong)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).fill(Theme.Color.infoBg))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("planGroupPayNote")
    }
}

/// On the plan: the buyer's spots and link, or the claimer's line.
struct PlanGroupPayCard: View {
    let viewModel: PlanScreenViewModel
    let groupPay: PlanGroupPayCardDTO

    @State private var isWorking = false
    @State private var asksGiveBack = false
    @State private var copied = false
    @State private var line: String?

    var body: some View {
        PlanCardBox(padding: 14) {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                header
                if groupPay.isBuyer {
                    if let link = groupPay.url.flatMap(URL.init(string:)), groupPay.open { linkButtons(link) }
                    if let note = groupPay.note { PlanScopeLine(text: note, icon: .info) }
                    if let giveBack = groupPay.giveBack, groupPay.open {
                        Button(giveBack.label) { asksGiveBack = true }
                            .planButton(.text, size: .small)
                            .disabled(isWorking)
                            .accessibilityIdentifier("planGroupPayGiveBack")
                    }
                }
                if let line {
                    Text(line)
                        .planFont(.footnote)
                        .foregroundStyle(Theme.Color.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("planGroupPayError")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planGroupPayCard")
        .confirmationDialog(groupPay.giveBack?.label ?? "", isPresented: $asksGiveBack, titleVisibility: .visible) {
            Button(groupPay.giveBack?.label ?? "Give back") { giveBack() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(groupPay.giveBack?.text ?? "")
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.s3) {
            Icon(groupPay.isBuyer ? .users : .gift, size: 18, color: Theme.Color.appTextStrong).accessibilityHidden(true)
            Text(groupPay.text)
                .planFont(.bodyStrong)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let taken = groupPay.takenText {
                Text(taken).planFont(.small).monospacedDigit().foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func linkButtons(_ link: URL) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { copyButton(link)
                shareButton(link)
            }
            VStack(spacing: 10) { copyButton(link)
                shareButton(link)
            }
        }
    }

    private func copyButton(_ link: URL) -> some View {
        Button {
            UIPasteboard.general.url = link
            copied = true
        } label: {
            PlanButtonLabel(title: copied ? "Copied" : "Copy link", icon: .copy, kind: .secondary)
        }
        .planButton(.secondary, size: .small)
        .accessibilityIdentifier("planGroupPayCopy")
    }

    private func shareButton(_ link: URL) -> some View {
        ShareLink(item: link) {
            PlanButtonLabel(title: "Share", icon: .share, kind: .primary)
        }
        .planButton(.primary, size: .small)
        .accessibilityIdentifier("planGroupPayShare")
    }

    private func giveBack() {
        guard !isWorking else { return }
        Task {
            isWorking = true
            line = nil
            do {
                let _: PlanDetailDTO = try await viewModel.api.request(PlansEndpoints.giveBackSpots(planId: viewModel.planId))
                PlansStoreReads.changed(planId: viewModel.planId)
            } catch {
                line = PlanErrors.sentence(for: error)
            }
            await viewModel.load()
            isWorking = false
        }
    }
}
