//
//  PlanGiftForm.swift
//  Pantopus
//
//  Plans for the holidays, the gift exchange on the host form and the Change screen (08-extras section 4, board 26):
//  "Gift exchange" / "Everyone who joins draws one name", "Spend up to", "Draw names" (between now and the plan's
//  start) and "Nobody sees who drew whom, not even you." After the draw the Change screen changes "Spend up to"
//  only. The server checks each value and answers with its sentence. Off (`plans_gift_exchange`): nothing is drawn
//  or sent.
//

import SwiftUI

/// What the host set. The amount is dollars as typed; the server checks it is $1 to $500.
struct PlanGiftDraft: Equatable {
    var amount = ""
    var drawAt: Date

    /// Names are drawn the day before the plan, at noon (board 26), or halfway to a start closer than that.
    init(start: Date) {
        let calendar = Calendar.current
        let dayBefore = calendar.date(byAdding: .day, value: -1, to: start) ?? start
        let noon = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: dayBefore) ?? dayBefore
        drawAt = noon > Date() ? noon : Date().addingTimeInterval(start.timeIntervalSinceNow / 2)
    }

    init(_ gift: PlanGiftDTO) {
        let cents = gift.budgetCents
        amount = cents % 100 == 0 ? "\(cents / 100)" : String(format: "%d.%02d", cents / 100, cents % 100)
        drawAt = PlanTime.parse(gift.drawAt) ?? Date()
    }

    /// The value to send, or nil while "Spend up to" isn't an amount.
    var body: PlanGiftBody? {
        guard let cents = PlanChipInDraft.cents(amount) else { return nil }
        return PlanGiftBody(budgetCents: cents, drawAt: PlanTime.string(drawAt))
    }

    static let incomplete = "Add how much each person spends, or switch Gift exchange off."
}

/// Board 26's "Gift exchange" card: the switch row and, while it's on, "Spend up to" and "Draw names", with the line
/// under the card.
struct PlanGiftFormCard: View {
    @Binding var draft: PlanGiftDraft?
    /// The plan's start: names are drawn before it.
    let start: Date
    /// After the draw only the budget changes.
    var isDrawn = false
    var identifierPrefix = "planGift"
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            PlanFormCard {
                PlanExtraSwitchRow(
                    icon: .gift,
                    title: "Gift exchange",
                    subtitle: "Everyone who joins draws one name",
                    isOn: Binding(get: { draft != nil }, set: { draft = $0 ? (draft ?? PlanGiftDraft(start: start)) : nil })
                )
                .accessibilityIdentifier(identifierPrefix)
                if draft != nil {
                    Divider().overlay(Theme.Color.appBorder)
                    amountRow
                    if !isDrawn {
                        Divider().overlay(Theme.Color.appBorder)
                        PlanDateRow(
                            label: "Draw names",
                            date: Binding(get: { draft?.drawAt ?? start }, set: { draft?.drawAt = $0 }),
                            components: [.date, .hourAndMinute],
                            range: Date()...max(start, Date().addingTimeInterval(60))
                        )
                        .accessibilityIdentifier("\(identifierPrefix)DrawAt")
                    }
                }
            }
            if draft != nil { PlanScopeLine(text: "Nobody sees who drew whom, not even you.") }
        }
        .accessibilityElement(children: .contain)
    }

    private var amountRow: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.s1))
            : AnyLayout(HStackLayout(spacing: Spacing.s3))
        return layout {
            Text("Spend up to").planFont(.body).foregroundStyle(Theme.Color.appText).fixedSize()
            HStack(spacing: 2) {
                Text("$").planFont(.bodyStrong).foregroundStyle(Theme.Color.appTextSecondary).allowsHitTesting(false)
                TextField("25", text: Binding(get: { draft?.amount ?? "" }, set: { draft?.amount = $0 }))
                    .keyboardType(.decimalPad)
                    .planFont(.bodyStrong)
                    .multilineTextAlignment(.trailing)
                    .fixedSize()
                    .accessibilityLabel("Spend up to, in dollars")
                    .accessibilityIdentifier("\(identifierPrefix)Amount")
            }
            .padding(.horizontal, Spacing.s3)
            .frame(minWidth: 64, minHeight: 44)
            .typesInFieldOnTap()
            .overlay(RoundedRectangle(cornerRadius: Radii.md, style: .continuous).stroke(Theme.Color.appBorderStrong, lineWidth: 1))
            .frame(maxWidth: .infinity, alignment: typeSize.isAccessibilitySize ? .leading : .trailing)
        }
        .padding(.vertical, Spacing.s2)
        .frame(minHeight: 52)
    }
}

/// The Change screen's gift exchange: what the plan had and what the host has now; only a change is sent.
struct PlanGiftEdit {
    private(set) var original: PlanGiftDraft?
    var draft: PlanGiftDraft?
    private(set) var isDrawn = false

    init() {}

    init(card: PlanCardDTO) {
        original = card.extrasPart.gift.map(PlanGiftDraft.init)
        isDrawn = card.extrasPart.gift?.isDrawn ?? false
        draft = original
    }

    /// Puts the change on `body`: a new value or `null` (calls it off). After the draw only the budget counts; the
    /// server still checks the draw time, so a draw time gone by is sent as the plan's start. Answers the sentence to
    /// show instead when "Spend up to" is empty.
    func apply(to body: inout UpdatePlanBody, start: Date) -> String? {
        guard draft != original else { return nil }
        guard var draft else {
            body.gift = .remove
            return nil
        }
        if isDrawn, draft.drawAt <= Date() { draft.drawAt = start }
        guard let value = draft.body else { return PlanGiftDraft.incomplete }
        body.gift = .set(value)
        return nil
    }
}

extension PlanCardDTO {
    /// The Change screen offers the gift exchange on the host's own private plan (not a business's, never a playdate)
    /// while `plans_gift_exchange` is on for the host, as the host form does.
    @MainActor var changesGift: Bool {
        PlansFlags.shared.giftExchange && isPrivate && !isBusiness && kind != .playdate
    }
}
