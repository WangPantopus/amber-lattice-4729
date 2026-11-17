//
//  PlanPaySpotSheet.swift
//  Pantopus
//
//  Plans for the holidays, the business track B2 and B4 (07-screens P1,
//  board 11): paying for a spot on a business's plan with a price. A sheet
//  over the plan, opened by "Join". Every amount is the server's quote
//  (`POST …/requests/quote`), asked again when the party changes; the app
//  never multiplies. "Pay" holds the spot (`POST …/requests`, 10 minutes),
//  opens the shipped payment sheet (Apple Pay and the card live inside it),
//  then confirms (`POST …/requests/mine/confirm`).
//

import SwiftUI

struct PlanPaySpotSheet: View {
    let card: PlanCardDTO
    let viewModel: PlanScreenViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var partySize = 1
    @State private var quote: PlanQuoteDTO?
    /// What the shown quote was asked for: paying sends exactly this, and only while it is what's chosen now.
    @State private var quotedFor: PlanQuoteAsk?
    @State private var quoteProblem: String?
    @State private var isPaying = false
    @State private var failed: String?
    @State private var contentHeight: CGFloat = 0
    /// One person pays for the group (08-extras section 7): the quote's "Who are they for?", and the link's spots.
    @State private var groupOffer: PlanGroupPayOfferDTO?
    @State private var forLink = false
    @State private var linkSpots = 2

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                header
                // While paying, the choice stays as it was paid for.
                if !forLink { party.disabled(isPaying) }
                if let groupOffer, partySize > 1 || forLink {
                    PlanGroupPayChooser(offer: groupOffer, forLink: $forLink, spots: $linkSpots).disabled(isPaying)
                }
                amounts
                if forLink, let note = shownQuote?.note { PlanGroupPayNote(text: note) }
                if let failed {
                    Text(failed)
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("planPayError")
                }
                Button(action: pay) {
                    PlanButtonLabel(title: shownQuote.map { "Pay \($0.totalText)" } ?? "Pay", kind: .primary, isLoading: isPaying)
                }
                .planButton(.primary)
                .disabled(shownQuote == nil || isPaying)
                .accessibilityIdentifier("planPayButton")
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s5)
            .padding(.bottom, Spacing.s6)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        }
        .presentationDetents(contentHeight > 0 ? [.height(contentHeight), .large] : [.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(26)
        .presentationBackground(Theme.Color.appSurface)
        .task(id: "\(partySize) \(forLink) \(linkSpots)") { await requote() }
        .onChange(of: forLink) { _, link in if link { linkSpots = max(partySize, 2) } }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planPaySheet")
    }

    /// P1 item 1: the kind tag and the title; the time and the place in one line.
    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: Spacing.s1) {
                PlanCardTag(card: card)
                Text(card.title)
                    .planFont(.h3)
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text("\(PlanScreenLines.shortWhen(card)) · \(PlanCardLines.businessWhere(card))")
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            Button { dismiss() } label: {
                Icon(.x, size: 16, color: Theme.Color.appText)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Theme.Color.appSurfaceSunken))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
    }

    /// P1 item 2: the shipped party chips, then "{n} spots" and the price each.
    private var party: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text.planOverline("Who's coming")
            PlanChoiceChips(
                options: (1...4).map { size in
                    PlanChoiceOption(id: size, label: size == 1 ? "Just me" : "Me + \(size - 1)", isEnabled: size <= max(card.spotsLeft, 1))
                },
                isSelected: { $0 == partySize },
                onTap: { partySize = $0 },
                groupLabel: "Who's coming",
                identifier: "planPayParty"
            )
        }
    }

    @ViewBuilder private var amounts: some View {
        if let quote = shownQuote {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack {
                    Text(quote.spotsText).planFont(.body).foregroundStyle(Theme.Color.appText)
                    Spacer()
                    Text(quote.eachText).planFont(.body).monospacedDigit().foregroundStyle(Theme.Color.appText)
                }
                .accessibilityElement(children: .combine)
                Divider().overlay(Theme.Color.appBorder)
                // P1 item 3: what they pay today, large.
                // Side by side; the amount under the words when they don't fit (the largest text), never split.
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline) {
                        payToday
                        Spacer()
                        total(quote)
                    }
                    VStack(alignment: .leading, spacing: Spacing.s1) {
                        payToday
                        total(quote)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("planPayTotal")
                if let group = quote.group { groupCard(group) }
                if let refund = quote.refundText {
                    PlanScopeLine(text: refund, icon: .info).accessibilityIdentifier("planPayRefund")
                }
            }
        } else if let quoteProblem {
            Text(quoteProblem).planFont(.small).foregroundStyle(Theme.Color.error).fixedSize(horizontal: false, vertical: true)
        } else {
            Shimmer(width: nil, height: 96, cornerRadius: Radii.lg)
        }
    }

    private var payToday: some View {
        Text("You pay today").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
    }

    private func total(_ quote: PlanQuoteDTO) -> some View {
        Text(quote.totalText)
            .planFont(.h2)
            .monospacedDigit()
            .foregroundStyle(Theme.Color.appText)
            .fixedSize()
    }

    /// P1 item 4 (B4): the group price while open ("7 of 10 in" and the server's sentence), or "Group price: $14".
    private func groupCard(_ group: PlanQuoteGroupDTO) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s1) {
            if group.state == "open" {
                HStack {
                    Text("Group price").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    Spacer()
                    Text("\(group.inCount) of \(group.size) in")
                        .planFont(.small)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            Text(group.text)
                .planFont(group.state == "open" ? .small : .bodyStrong)
                .foregroundStyle(Theme.Color.appTextStrong)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).fill(Theme.Color.successBg))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("planPayGroup")
    }

    /// What is chosen now: the party, or a link with these spots.
    private var asking: PlanQuoteAsk {
        PlanQuoteAsk(partySize: partySize, linkSpots: forLink ? linkSpots : nil)
    }

    /// The quote only while it is for what's chosen now: a new choice shows the shimmer (or a refusal) and Pay is off
    /// until the server answers for it (contract 11.2).
    private var shownQuote: PlanQuoteDTO? {
        quotedFor == asking ? quote : nil
    }

    private func requote() async {
        let ask = asking
        quoteProblem = nil
        do {
            let answer: PlanQuoteDTO = try await APIClient.shared.request(
                PlansEndpoints.quote(planId: card.id, PlanQuoteBody(partySize: ask.partySize, linkSpots: ask.linkSpots))
            )
            guard ask == asking else { return }
            quote = answer
            quotedFor = ask
            if let offer = answer.groupPay { groupOffer = offer }
        } catch is CancellationError {
        } catch {
            guard ask == asking else { return }
            quote = nil
            quotedFor = nil
            quoteProblem = PlanErrors.sentence(for: error)
        }
    }

    private func pay() {
        guard !isPaying, shownQuote != nil, let ask = quotedFor else { return }
        isPaying = true
        failed = nil
        Task {
            let outcome = await viewModel.joinAndPay(partySize: ask.partySize, linkSpots: ask.linkSpots)
            isPaying = false
            switch outcome {
            case .done: dismiss()
            case .stayed: break
            case let .problem(words): failed = words
            }
        }
    }
}

/// What a quote was asked for: a party, or a link with these spots.
struct PlanQuoteAsk: Equatable {
    let partySize: Int
    let linkSpots: Int?
}

/// How joining a paid plan ended.
enum PlanPayOutcome: Equatable {
    /// In (or on the waitlist, nothing charged).
    case done
    /// The guest closed the payment sheet: the sheet stays as it was.
    case stayed
    /// The server's words, or the payment sheet's.
    case problem(String)
}

extension PlanScreenViewModel {
    /// P1: hold the spot, pay through the shipped sheet, then confirm. Never sends an amount.
    /// `linkSpots`: "I'll send a link", every spot in one payment (08-extras section 7).
    func joinAndPay(
        partySize: Int,
        linkSpots: Int? = nil,
        presenter: PaymentSheetPresenting = StripePaymentSheetPresenter()
    ) async -> PlanPayOutcome {
        // A sheet left open past the 10-minute hold starts again (P1).
        if let held = payHoldExpires, held < Date() {
            payHoldExpires = nil
            return .problem("That took a while. Start again.")
        }
        // A fresh fix, as "Send request" sends one: without a home on file the server asks for it.
        let location = DeviceLocationProvider.shared
        let fix = location.canLocateWithoutAsking ? await location.requestCurrent(timeoutSeconds: 4) : nil
        let gps = fix.map { PlanGPSBody(latitude: $0.latitude, longitude: $0.longitude, timestamp: Date()) }
        let reply: PlanAskResponse
        do {
            if let linkSpots {
                var body = PlanBuySpotsBody(spots: linkSpots)
                body.gps = gps
                reply = try await api.request(PlansEndpoints.buySpots(planId: planId, body))
            } else {
                var body = AskToJoinBody(partySize: partySize, note: nil)
                body.gps = gps
                reply = try await api.request(PlansEndpoints.ask(planId: planId, body))
            }
        } catch {
            return .problem(PlanErrors.sentence(for: error))
        }
        plan = reply.plan
        guard let payment = reply.payment else {
            // Full (the waitlist, nothing charged) or already in.
            await load()
            return .done
        }
        payHoldExpires = PlanTime.parse(reply.request.holdExpiresAt)
        let result = await presenter.presentPayment(
            clientSecret: payment.clientSecret,
            customer: payment.customerId ?? "",
            ephemeralKey: payment.ephemeralKey ?? "",
            isSetupIntent: false,
            publishableKey: payment.publishableKey
        )
        switch result {
        case .canceled:
            return .stayed
        case let .failed(message):
            return .problem(message)
        case .completed:
            return await confirmPaid()
        }
    }

    /// `POST …/requests/mine/confirm`: once more after a moment while the payment is still settling.
    private func confirmPaid() async -> PlanPayOutcome {
        for attempt in 0..<3 {
            do {
                let detail: PlanDetailDTO = try await api.request(PlansEndpoints.confirmJoin(planId: planId))
                plan = detail
                payHoldExpires = nil
                PlansStoreReads.changed(planId: planId, store: store)
                await load()
                return .done
            } catch let APIError.clientError(_, body) where PlanErrors.code(in: body) == "payment_not_complete" && attempt < 2 {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            } catch {
                payHoldExpires = nil
                await load()
                return .problem(PlanErrors.sentence(for: error))
            }
        }
        return .problem("This payment hasn't gone through yet.")
    }
}

extension PlanCardDTO {
    /// B2: the price a spot, while the plan's business has `plans_paid`; nil is "Free".
    var price: PlanPriceDTO? {
        businessPart?.price
    }

    /// B2: what this guest paid, for a guest who is in and paid.
    var paid: PlanPaidDTO? {
        businessPart?.paid
    }

    /// "Join" opens P1 on a priced plan with room (a full one goes to the waitlist, nothing charged).
    var paysToJoin: Bool {
        price != nil && !isFull
    }
}

/// P1 after paying: "Paid $18.00" and "Receipt" under the title. The receipt is the shipped paid-invoice receipt in
/// Mail, under Receipts (`paid.receipt.link`); no button while the server sends none.
struct PlanPaidLine: View {
    let paid: PlanPaidDTO

    var body: some View {
        HStack(spacing: Spacing.s3) {
            Icon(.checkCircle, size: 16, color: Theme.Color.success)
            Text(paid.text)
                .planFont(.smallStrong)
                .monospacedDigit()
                .foregroundStyle(Theme.Color.appText)
                .accessibilityIdentifier("planPaid")
            Spacer(minLength: Spacing.s2)
            if let link = paid.receipt?.link, !link.isEmpty {
                Button("Receipt") { DeepLinkRouter.shared.handle(path: link) }
                    .planButton(.text, size: .extraSmall)
                    .fixedSize()
                    .accessibilityIdentifier("planReceipt")
            }
        }
        .accessibilityElement(children: .contain)
    }
}

/// The staff's Going list: a paid guest's line adds what they paid and who brought them ("Paid $18.00 · Pantopus").
enum PlanPersonMoney {
    static func facts(_ person: PlanPersonDTO, _ shipped: String) -> String {
        guard let paid = person.paid else { return shipped }
        return ([shipped, "Paid \(paid.text)", paid.broughtByText].compactMap { $0 }).joined(separator: " · ")
    }
}
