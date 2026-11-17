//
//  PlanChipInForm.swift
//  Pantopus
//
//  Plans for the holidays, chip in on the host form and the Change screen (08-extras section 3, board 26): the
//  host suggests an amount each person, says what it's for and gives their own Venmo, PayPal or Cash App link.
//  No money moves through Pantopus. The server checks every value and answers with the field and its sentence
//  ("Use a Venmo, PayPal or Cash App link."). Off (`plans_chip_in`): the card isn't drawn and nothing is sent.
//

import SwiftUI

/// What the host typed. The amount is dollars as typed; the server checks it is $1 to $500.
struct PlanChipInDraft: Equatable {
    var amount = ""
    var note = ""
    var link = ""

    init() {}

    init(_ chipIn: PlanChipInDTO) {
        let cents = chipIn.amountCents
        amount = cents % 100 == 0 ? "\(cents / 100)" : String(format: "%d.%02d", cents / 100, cents % 100)
        note = chipIn.note ?? ""
        link = chipIn.link ?? ""
    }

    /// The value to send, or nil while a field is empty or the amount isn't one.
    var body: PlanChipInBody? {
        let note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let link = link.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let cents = Self.cents(amount), !note.isEmpty, !link.isEmpty else { return nil }
        return PlanChipInBody(amountCents: cents, note: note, link: Self.withScheme(link))
    }

    /// "12" or "12.50" typed as dollars, in cents; nil when it isn't an amount (the server checks the range).
    static func cents(_ typed: String) -> Int? {
        let cleaned = typed.replacingOccurrences(of: "$", with: "").trimmingCharacters(in: .whitespaces)
        guard let amount = Decimal(string: cleaned, locale: Locale(identifier: "en_US_POSIX")), amount > 0 else { return nil }
        return NSDecimalNumber(decimal: amount * 100).rounding(accordingToBehavior: nil).intValue
    }

    /// "venmo.com/u/maya" typed without its scheme is sent as https; anything else goes as typed.
    static func withScheme(_ link: String) -> String {
        link.lowercased().hasPrefix("http://") || link.lowercased().hasPrefix("https://") ? link : "https://\(link)"
    }

    static let incomplete = "Add how much each person chips in, what it's for and your payment link, or switch Chip in off."
}

/// Board 26's "Chip in" card: the switch row, and while it's on "Each person", "What for" and "Payment link", with
/// the line under the card.
struct PlanChipInFormCard: View {
    @Binding var draft: PlanChipInDraft?
    var identifierPrefix = "planChipIn"
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            PlanFormCard {
                PlanExtraSwitchRow(
                    icon: .dollarSign,
                    title: "Chip in",
                    subtitle: "Guests pay you, not Pantopus",
                    isOn: Binding(get: { draft != nil }, set: { draft = $0 ? (draft ?? PlanChipInDraft()) : nil })
                )
                .accessibilityIdentifier(identifierPrefix)
                if draft != nil {
                    Divider().overlay(Theme.Color.appBorder)
                    row("Each person") {
                        HStack(spacing: 2) {
                            Text("$").planFont(.bodyStrong).foregroundStyle(Theme.Color.appTextSecondary).allowsHitTesting(false)
                            TextField("12", text: binding(\.amount))
                                .keyboardType(.decimalPad)
                                .planFont(.bodyStrong)
                                .multilineTextAlignment(.trailing)
                                .fixedSize()
                                .accessibilityLabel("Each person, in dollars")
                                .accessibilityIdentifier("\(identifierPrefix)Amount")
                        }
                        .padding(.horizontal, Spacing.s3)
                        .frame(minWidth: 64, minHeight: 44)
                        .typesInFieldOnTap()
                        .overlay(
                            RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                                .stroke(Theme.Color.appBorderStrong, lineWidth: 1)
                        )
                    }
                    Divider().overlay(Theme.Color.appBorder)
                    row("What for") {
                        field("The turkey and the drinks", text: binding(\.note), limit: 60, id: "Note", label: "What for")
                    }
                    Divider().overlay(Theme.Color.appBorder)
                    row("Payment link") {
                        field("venmo.com/u/you", text: binding(\.link), limit: 300, id: "Link", label: "Payment link")
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                }
            }
            if draft != nil {
                PlanScopeLine(text: "A Venmo, PayPal or Cash App link. Only people who are in see it.", icon: .info)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func binding(_ path: WritableKeyPath<PlanChipInDraft, String>) -> Binding<String> {
        Binding(get: { draft?[keyPath: path] ?? "" }, set: { draft?[keyPath: path] = $0 })
    }

    /// The label on the left and the field on the right; one under the other at the accessibility text sizes. One
    /// layout for the whole time the field is typed in, so a long link never moves the field and drops the keyboard.
    private func row(_ label: String, @ViewBuilder content: () -> some View) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.s1))
            : AnyLayout(HStackLayout(spacing: Spacing.s3))
        return layout {
            Text(label).planFont(.body).foregroundStyle(Theme.Color.appText).fixedSize()
            content().frame(maxWidth: .infinity, alignment: typeSize.isAccessibilitySize ? .leading : .trailing)
        }
        .padding(.vertical, Spacing.s2)
        .frame(minHeight: 52)
    }

    private func field(_ placeholder: String, text: Binding<String>, limit: Int, id: String, label: String) -> some View {
        TextField(placeholder, text: text)
            .planFont(.bodyStrong)
            .foregroundStyle(Theme.Color.appText)
            .multilineTextAlignment(typeSize.isAccessibilitySize ? .leading : .trailing)
            .onChange(of: text.wrappedValue) { _, new in
                if new.count > limit { text.wrappedValue = String(new.prefix(limit)) }
            }
            .typesInFieldOnTap(reach: Spacing.s2)
            .accessibilityLabel(label)
            .accessibilityIdentifier("\(identifierPrefix)\(id)")
    }
}

/// The Change screen's chip in: what the plan had and what the host has now; only a change is sent.
struct PlanChipInEdit {
    private(set) var original: PlanChipInDraft?
    var draft: PlanChipInDraft?

    init() {}

    init(card: PlanCardDTO) {
        original = card.extrasPart.chipIn.map(PlanChipInDraft.init)
        draft = original
    }

    /// Puts the change on `body`: a new value (who paid is kept) or `null` (who paid is forgotten). Answers the
    /// sentence to show instead when a field is empty.
    func apply(to body: inout UpdatePlanBody) -> String? {
        guard draft != original else { return nil }
        guard let draft else {
            body.chipIn = .remove
            return nil
        }
        guard let value = draft.body else { return PlanChipInDraft.incomplete }
        body.chipIn = .set(value)
        return nil
    }
}

extension PlanCardDTO {
    /// The Change screen offers chip in on the host's own private plan (not a business's, never a playdate) while
    /// `plans_chip_in` is on for the host, as the host form does.
    @MainActor var changesChipIn: Bool {
        PlansFlags.shared.chipIn && isPrivate && !isBusiness && kind != .playdate
    }
}
