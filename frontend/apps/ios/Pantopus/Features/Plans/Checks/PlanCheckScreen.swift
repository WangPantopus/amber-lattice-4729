//
//  PlanCheckScreen.swift
//  Pantopus
//
//  Plans for the holidays, the business track B5 (07-screens C1, picture 12;
//  C2, picture 13): the guest's check at the place, opened by "Pay at
//  {business}" on the plan or by the check's notice. C1: the check, its lines,
//  "Add a tip" and one "Pay {total}" into the shipped payment sheet (Apple Pay
//  and the card live inside it). C2 once paid: "Show this to your server", the
//  lines as paid, the receipt line, Done and "Something's wrong with this
//  payment". Every word and amount is the server's.
//

import SwiftUI

struct PlanCheckScreen: View {
    @State private var model: PlanCheckModel
    let onBack: () -> Void
    /// The shipped conversation with the business, with its first line.
    let onOpenChat: (InboxConversationDestination, String) -> Void

    @State private var typedTotal = ""
    /// The check's amount, large (board 12), growing with the text size.
    @ScaledMetric(relativeTo: .largeTitle) private var amountSize: CGFloat = 44
    @State private var asksOther = false
    @State private var typedTip = ""

    init(planId: String, onBack: @escaping () -> Void, onOpenChat: @escaping (InboxConversationDestination, String) -> Void) {
        _model = State(initialValue: PlanCheckModel(planId: planId))
        self.onBack = onBack
        self.onOpenChat = onOpenChat
    }

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: model.check?.isOpen == false ? "" : "Pay \(model.businessName)", leading: .back, onLeading: onBack)
            switch model.phase {
            case .loading:
                loading
            case let .error(message):
                errorState(message)
            case .loaded:
                if let check = model.check, !check.isOpen {
                    PlanCheckPaidView(check: check, businessName: model.businessName, onAction: paidAction)
                } else {
                    open
                }
            }
        }
        .background(Theme.Color.appBg)
        .toolbar(.hidden, for: .navigationBar)
        .hidesTabBar(true)
        .task { await model.load() }
        .alert("Another amount", isPresented: $asksOther) {
            TextField("Tip in dollars", text: $typedTip)
                .keyboardType(.decimalPad)
                .accessibilityIdentifier("planCheckTipOtherField")
            Button("Add tip") { Task { await model.chooseOther(typed: typedTip) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("A tip goes to \(model.businessName).")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planCheck")
    }

    // MARK: - C1

    private var open: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                if let check = model.check {
                    heading(check)
                    PlanCheckLinesCard(lines: (model.shown ?? check).lines, deal: model.card?.deal)
                    if check.tipsOn, !check.tipChoices.isEmpty { tips(check) }
                    if let note = (model.shown ?? check).noteText {
                        PlanScopeLine(text: note, icon: .info).accessibilityIdentifier("planCheckNote")
                    }
                } else if model.canStart {
                    startCheck
                } else {
                    // K7: with a deal on the bill, staff send the check (the server's sentence on `409 staff_send_checks`).
                    PlanScopeLine(text: "Ask your server for the check: the deal comes off when they send it.", icon: .info)
                        .accessibilityIdentifier("planCheckAskServer")
                }
                if let problem = model.problem { PlanDealFieldError(text: problem).accessibilityIdentifier("planCheckError") }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s2)
            .padding(.bottom, Spacing.s6)
        }
        .refreshable { await model.load() }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if model.check != nil {
                Button { Task { await model.pay() } } label: {
                    PlanButtonLabel(title: model.payTitle, kind: .primary, isLoading: model.isWorking || model.isQuoting)
                }
                .planButton(.primary)
                .disabled(!model.canPay)
                .accessibilityIdentifier("planCheckPay")
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
                .background(Theme.Color.appSurface)
                .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
            }
        }
    }

    /// C1 item 2: "Your check, sent by {business}" and the amount, large.
    private func heading(_ check: PlanCheckDTO) -> some View {
        VStack(spacing: Spacing.s1) {
            Text(check.heading)
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .multilineTextAlignment(.center)
            Text(check.amountText)
                .font(.system(size: amountSize, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Theme.Color.appText)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .accessibilityIdentifier("planCheckAmount")
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    /// "What's your total?" (only on a plan with no deal on the bill, K7).
    private var startCheck: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Text("What's your total?")
                .planFont(.h3)
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
            PlanDollarsField(text: $typedTotal, placeholder: "48.00", label: "Your total", identifier: "planCheckTotalField")
            Text("Type the total on your bill")
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
            Button { Task { await model.start(typed: typedTotal) } } label: {
                PlanButtonLabel(title: "Next", kind: .primary, isLoading: model.isWorking)
            }
            .planButton(.primary)
            .disabled(typedTotal.trimmingCharacters(in: .whitespaces).isEmpty || model.isWorking)
            .accessibilityIdentifier("planCheckStart")
        }
    }

    /// C1 item 4: "Add a tip", the three choices with their amounts, "Another amount" and "No tip"; none chosen at first.
    private func tips(_ check: PlanCheckDTO) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline) {
                    Text.planOverline("Add a tip")
                    Spacer()
                    baseText(check)
                }
                VStack(alignment: .leading, spacing: Spacing.s1) {
                    Text.planOverline("Add a tip")
                    baseText(check)
                }
            }
            HStack(spacing: Spacing.s2) {
                ForEach(Array(check.tipChoices.enumerated()), id: \.offset) { index, choice in
                    tipButton(
                        selected: model.tip == .choice(index),
                        title: choice.label,
                        subtitle: choice.tipText,
                        identifier: "planCheckTip.\(index)"
                    ) { Task { await model.choose(.choice(index)) } }
                }
            }
            HStack(spacing: Spacing.s2) {
                tipButton(selected: otherChosen, title: "Another amount", subtitle: nil, identifier: "planCheckTip.other") {
                    typedTip = ""
                    asksOther = true
                }
                tipButton(selected: model.tip == PlanCheckModel.Tip.none, title: "No tip", subtitle: nil, identifier: "planCheckTip.none") {
                    Task { await model.choose(.none) }
                }
            }
        }
    }

    private func baseText(_ check: PlanCheckDTO) -> some View {
        Text(check.tipBaseText ?? "")
            .planFont(.footnote)
            .foregroundStyle(Theme.Color.appTextSecondary)
    }

    private var otherChosen: Bool {
        if case .other = model.tip { return true }
        return false
    }

    private func tipButton(
        selected: Bool,
        title: String,
        subtitle: String?,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(title).planFont(.bodyStrong)
                if let subtitle { Text(subtitle).planFont(.footnote).monospacedDigit() }
            }
            .foregroundStyle(selected ? Theme.Color.primaryInk : Theme.Color.appText)
            .frame(maxWidth: .infinity, minHeight: subtitle == nil ? 44 : 58)
            .background(
                RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                    .fill(selected ? Theme.Color.primary50 : Theme.Color.appSurface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                    .stroke(selected ? Theme.Color.primary600 : Theme.Color.appBorder, lineWidth: selected ? 1.5 : 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(model.isWorking)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier(identifier)
    }

    // MARK: - States

    private var loading: some View {
        VStack(spacing: Spacing.s3) {
            Shimmer(width: 200, height: 52, cornerRadius: Radii.lg)
            Shimmer(width: nil, height: 180, cornerRadius: Radii.xl)
            Shimmer(width: nil, height: 120, cornerRadius: Radii.xl)
            Spacer()
        }
        .padding(Spacing.s4)
        .accessibilityElement()
        .accessibilityLabel("Loading your check")
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: Spacing.s3) {
            Text("Couldn't load your check").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
            Text(message).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary).multilineTextAlignment(.center)
            Button("Try again") { Task { await model.load() } }
                .planButton(.secondary, size: .small)
                .frame(maxWidth: 200)
                .accessibilityIdentifier("planCheckRetry")
            Spacer()
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity)
    }

    // MARK: - C2's actions

    private func paidAction(_ action: PlanCheckPaidView.Action) {
        switch action {
        case .done:
            onBack()
        case let .receipt(link):
            DeepLinkRouter.shared.handle(path: link)
        case .problem:
            guard let business = model.card?.business, let line = model.paymentFirstLine else { return }
            let words = business.name.split(separator: " ").prefix(2).compactMap { $0.first.map(String.init) }.joined()
            let destination = InboxConversationDestination(
                mode: .person(otherUserId: business.userId),
                displayName: business.name,
                initials: words.isEmpty ? "··" : words.uppercased(),
                avatarURL: business.avatarUrl,
                identityKind: "business",
                // As the business page's Message: a person thread's "verified" reads "Verified neighbor".
                verified: false
            )
            onOpenChat(destination, line)
        }
    }
}

/// C1 item 3 and C2 item 3: the server's lines in a card; the deal's amount in the ok color, the last line bold.
struct PlanCheckLinesCard: View {
    let lines: [PlanCheckLineDTO]
    let deal: PlanDealDTO?
    /// C2: the total line reads "Paid with {Apple Pay}".
    var totalLabel: String?

    var body: some View {
        PlanCardBox(padding: Spacing.s4) {
            VStack(spacing: 0) {
                ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                    if index > 0 { Divider().overlay(Theme.Color.appBorder) }
                    row(line)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planCheckLines")
    }

    private func row(_ line: PlanCheckLineDTO) -> some View {
        HStack(spacing: Spacing.s2) {
            if line.key == "deal", let deal { PlanDealTag(text: deal.isGroup ? "Group deal" : "Deal") }
            Text(line.isTotal ? (totalLabel ?? line.label) : line.label)
                .planFont(line.isTotal ? .bodyStrong : .body)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: Spacing.s2)
            Text(line.text)
                .planFont(line.isTotal || line.tone == "ok" ? .bodyStrong : .body)
                .monospacedDigit()
                .foregroundStyle(line.tone == "ok" ? Theme.Color.success : Theme.Color.appText)
                .fixedSize()
        }
        .padding(.vertical, Spacing.s3)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("planCheckLine.\(line.key)")
    }
}
