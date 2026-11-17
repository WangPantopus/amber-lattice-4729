//
//  PlanChipInCard.swift
//  Pantopus
//
//  Plans for the holidays, chip in on the plan's page (08-extras section 3, board 27). For a person who is in:
//  "Chip in $12", what it's for, "7 of 12 paid", "Pay Maya on Venmo" (the host's own link, opened outside the app)
//  and "I've paid", which becomes "You chipped in" with "Undo". The host sees the same card with the count. Every
//  word naming money is the server's; the card comes only to the host and people who are in, and no money moves
//  through Pantopus.
//

import SwiftUI

struct PlanChipInCard: View {
    let viewModel: PlanScreenViewModel
    let chipIn: PlanChipInDTO

    @State private var isWorking = false
    @State private var line: String?
    @Environment(\.openURL) private var openURL

    var body: some View {
        PlanCardBox(padding: 14) {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                header
                if let mine = chipIn.mine {
                    if mine.paid { paidRow } else { buttons }
                }
                if let line {
                    Text(line)
                        .planFont(.footnote)
                        .foregroundStyle(Theme.Color.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("planChipInError")
                }
                if let straight = chipIn.straightText {
                    Text(straight)
                        .planFont(.caption)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planChipInCard")
    }

    private var header: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: Spacing.s3) {
                tile
                words.frame(maxWidth: .infinity, alignment: .leading)
                count
            }
            HStack(alignment: .top, spacing: Spacing.s3) {
                tile
                VStack(alignment: .leading, spacing: Spacing.s1) {
                    words
                    count
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var tile: some View {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(Theme.Color.appSurfaceSunken)
            .frame(width: 36, height: 36)
            .overlay(Icon(.dollarSign, size: 18, color: Theme.Color.appTextStrong))
            .accessibilityHidden(true)
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(chipIn.text).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
            if let note = chipIn.note, !note.isEmpty {
                Text(note)
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var count: some View {
        Text(chipIn.paidText)
            .planFont(.small)
            .foregroundStyle(Theme.Color.appTextSecondary)
            .accessibilityIdentifier("planChipInCount")
    }

    private var buttons: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { paidButton
                payButton
            }
            VStack(spacing: 10) { payButton
                paidButton
            }
        }
    }

    private var paidButton: some View {
        Button {
            run { try await viewModel.api.request(PlansEndpoints.markChipIn(planId: viewModel.planId), as: PlanChipInResponse.self) }
        } label: {
            PlanButtonLabel(title: "I've paid", kind: .secondary, isLoading: isWorking)
        }
        .planButton(.secondary, size: .small)
        .disabled(isWorking)
        .accessibilityIdentifier("planChipInPaid")
    }

    /// "Pay Maya on Venmo": the host's link, outside the app. Only an https link is opened.
    @ViewBuilder private var payButton: some View {
        if let text = chipIn.payText, let link = chipIn.link, let url = URL(string: link), url.scheme?.lowercased() == "https" {
            Button { openURL(url) } label: {
                // "Pay Maya on Venmo" wraps at the largest text sizes instead of being cut.
                Text(text).lineLimit(3).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
            .planButton(.primary, size: .small)
            .accessibilityHint("Opens outside Pantopus")
            .accessibilityIdentifier("planChipInPay")
        }
    }

    private var paidRow: some View {
        HStack(spacing: Spacing.s2) {
            Icon(.checkCircle, size: 18, color: Theme.Color.success).accessibilityHidden(true)
            Text("You chipped in")
                .planFont(.bodyStrong)
                .foregroundStyle(Theme.Color.appText)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Undo") {
                run { try await viewModel.api.request(PlansEndpoints.unmarkChipIn(planId: viewModel.planId), as: PlanChipInResponse.self) }
            }
            .planButton(.text, size: .small)
            .disabled(isWorking)
            .accessibilityLabel("Undo, I haven't chipped in")
            .accessibilityIdentifier("planChipInUndo")
        }
        .accessibilityElement(children: .contain)
    }

    private func run(_ work: @escaping () async throws -> PlanChipInResponse) {
        guard !isWorking else { return }
        Task {
            isWorking = true
            line = nil
            do {
                _ = try await work()
                PlansStoreReads.changed(planId: viewModel.planId)
            } catch {
                line = PlanErrors.sentence(for: error)
            }
            await viewModel.load()
            isWorking = false
        }
    }
}

/// The cards between the place and the buttons on the page of a person who is in: a business's paid line and deals
/// (B1, B2), then the extras'.
struct PlanGoingExtraCards: View {
    let viewModel: PlanScreenViewModel
    let card: PlanCardDTO

    var body: some View {
        PlanGoingDealCards(card: card)
        if let chipIn = card.extrasPart.chipIn { PlanChipInCard(viewModel: viewModel, chipIn: chipIn) }
    }
}

/// The host's cards under the counts: find a date's while picking, the bring list (H2), then chip in.
struct PlanHostExtraCards: View {
    let viewModel: PlanScreenViewModel
    let card: PlanCardDTO
    let onOpenBring: () -> Void

    var body: some View {
        if let dates = card.extrasPart.dates { PlanDatesHostCard(card: card, dates: dates) }
        if let bring = card.bring { PlanBringHostCard(bring: bring, onOpen: onOpenBring) }
        if let chipIn = card.extrasPart.chipIn { PlanChipInCard(viewModel: viewModel, chipIn: chipIn) }
    }
}
