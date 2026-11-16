//
//  PlanDealForm.swift
//  Pantopus
//
//  Plans for the holidays, the business track (07-screens D3, board 09): the
//  business adds a deal to its plan. One step in the business's host flow
//  after the details ("3 of 4"), and the same form from the plan's "Change"
//  while nobody is in. "Guests will read" is the server's sentence from
//  `POST /api/plans/deal-preview`; errors are the server's words under their
//  field. Only the kinds the plan can carry are drawn: "Something free"
//  always; money off "The spot" on a priced plan (B4) and off "Food" or
//  "Everything but alcohol" when guests pay their bill here (B5). Nothing can
//  be off alcohol, and "Two for one" is not built.
//

import SwiftUI

/// The deal being drafted. The server decides everything again when the plan is posted or changed.
@Observable
@MainActor
final class PlanDealDraft {
    enum Scope: String, CaseIterable {
        case none
        case everyone
        case group
    }

    var scope = Scope.none
    var kind = "free_item"
    var item = ""
    var percent = 20
    var dollars = ""
    var appliesTo: String?
    var groupSize = 2
    var groupBy: Date?
    /// "Give a smaller deal anyway" when a group deal doesn't unlock.
    var givesSmaller = false
    var smallerKind = "free_item"
    var smallerItem = ""
    var smallerPercent = 10
    var smallerDollars = ""
    /// The server's answer for what is chosen now; kept while a new one loads.
    private(set) var preview: PlanDealPreviewResponse?
    private(set) var previewProblem: String?

    init() {}

    /// The card's `form` (staff), for "Change".
    init(form: PlanDealInput, timezone _: String?) {
        scope = form.scope == "group" ? .group : .everyone
        kind = form.kind
        item = form.item ?? ""
        appliesTo = form.appliesTo
        Self.setValue(form.value, kind: form.kind, percent: &percent, dollars: &dollars)
        groupSize = form.groupSize ?? 2
        groupBy = PlanTime.parse(form.groupBy)
        if let smaller = form.ifShort {
            givesSmaller = true
            smallerKind = smaller.kind
            smallerItem = smaller.item ?? ""
            Self.setValue(smaller.value, kind: smaller.kind, percent: &smallerPercent, dollars: &smallerDollars)
        }
    }

    private static func setValue(_ value: Int?, kind: String, percent: inout Int, dollars: inout String) {
        guard let value else { return }
        if kind == "percent" { percent = value }
        if kind == "amount" { dollars = value % 100 == 0 ? "\(value / 100)" : String(format: "%d.%02d", value / 100, value % 100) }
    }

    /// The deal as posted, or nil for "No deal".
    func input(start: Date) -> PlanDealInput? {
        guard scope != .none else { return nil }
        var deal = PlanDealInput(scope: scope.rawValue, kind: kind)
        (deal.item, deal.value) = Self.amount(kind: kind, item: item, percent: percent, dollars: dollars)
        if kind != "free_item" { deal.appliesTo = appliesTo }
        if scope == .group {
            deal.groupSize = groupSize
            deal.groupBy = PlanTime.string(groupBy ?? start)
            if givesSmaller {
                var smaller = PlanDealSmaller(kind: smallerKind)
                (smaller.item, smaller.value) = Self.amount(
                    kind: smallerKind,
                    item: smallerItem,
                    percent: smallerPercent,
                    dollars: smallerDollars
                )
                if smallerKind != "free_item" { smaller.appliesTo = appliesTo }
                deal.ifShort = smaller
            }
        }
        return deal
    }

    /// Something free sends its words; percent the number; dollars the typed amount in cents (the server checks it).
    private static func amount(kind: String, item: String, percent: Int, dollars: String) -> (item: String?, value: Int?) {
        switch kind {
        case "free_item": (item.trimmingCharacters(in: .whitespacesAndNewlines), nil)
        case "percent": (nil, percent)
        default: (nil, cents(dollars))
        }
    }

    /// "4" or "4.50" typed as dollars, in cents; nil when it isn't an amount.
    static func cents(_ typed: String) -> Int? {
        let cleaned = typed.replacingOccurrences(of: "$", with: "").trimmingCharacters(in: .whitespaces)
        guard let amount = Decimal(string: cleaned, locale: Locale(identifier: "en_US_POSIX")), amount > 0 else { return nil }
        return NSDecimalNumber(decimal: amount * 100).rounding(accordingToBehavior: nil).intValue
    }

    /// A group deal's deadline starts a day before the plan (or now, when sooner), within now to the start.
    func keepGroupByInRange(start: Date) {
        let now = Date()
        if let by = groupBy, by > now, by <= start { return }
        groupBy = max(now.addingTimeInterval(15 * 60), start.addingTimeInterval(-86400))
    }

    /// `POST /api/plans/deal-preview`: the sentence for what is chosen, nothing saved.
    func refreshPreview(businessUserId: String, spots: Int, start: Date, priceCents: Int?, payHere: Bool) async {
        guard let deal = input(start: start) else {
            preview = nil
            previewProblem = nil
            return
        }
        var body = PlanDealPreviewBody(businessUserId: businessUserId, deal: deal, spots: spots, startsAt: PlanTime.string(start))
        body.priceCents = priceCents
        body.payHere = payHere ? true : nil
        do {
            let answer: PlanDealPreviewResponse = try await APIClient.shared.request(PlansEndpoints.dealPreview(body))
            preview = answer
            previewProblem = nil
        } catch is CancellationError {
        } catch {
            previewProblem = PlanErrors.sentence(for: error)
        }
    }

    /// The server's words under a field, from the last preview.
    func error(_ field: String) -> String? {
        guard scope != .none else { return nil }
        return preview?.errors[field]
    }
}

/// What the deal form may offer on this plan.
struct PlanDealOffer: Equatable {
    /// "On" choices for money off, in order; empty when only "Something free" is offered.
    var targets: [(key: String, label: String)] = []

    static func == (lhs: PlanDealOffer, rhs: PlanDealOffer) -> Bool {
        lhs.targets.map(\.key) == rhs.targets.map(\.key)
    }

    /// B4: money off the spot on a priced plan; B5: off food or everything but alcohol when guests pay here.
    static func on(priced: Bool, payHere: Bool) -> PlanDealOffer {
        var targets: [(key: String, label: String)] = []
        if priced { targets.append(("spot", "The spot")) }
        if payHere {
            targets.append(("food", "Food"))
            targets.append(("no_alcohol", "Everything but alcohol"))
        }
        return PlanDealOffer(targets: targets)
    }

    var offersMoney: Bool {
        !targets.isEmpty
    }
}

/// D3 items 3 to 7: the deal's scope, what they get, how much, and for a group deal when it unlocks and what
/// happens if it doesn't.
struct PlanDealForm: View {
    @Bindable var draft: PlanDealDraft
    let spots: Int
    let start: Date
    let offer: PlanDealOffer

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s6) {
            PlanFormField(label: "Deal") {
                PlanFormCard {
                    scopeRow(.none, "No deal", nil)
                    Divider().overlay(Theme.Color.appBorder)
                    scopeRow(
                        .everyone,
                        "For everyone who joins",
                        draft.kind == "free_item" ? "Each guest gets it there" : "Each guest gets it when they pay"
                    )
                    Divider().overlay(Theme.Color.appBorder)
                    scopeRow(.group, "A group deal", "Unlocks for all when enough people join in time")
                }
                if let error = draft.error("scope") { PlanDealFieldError(text: error) }
            }
            if draft.scope != .none {
                PlanDealWhatFields(
                    kind: $draft.kind,
                    item: $draft.item,
                    percent: $draft.percent,
                    dollars: $draft.dollars,
                    appliesTo: $draft.appliesTo,
                    offer: offer,
                    errors: PlanDealFieldErrors(
                        kind: draft.error("kind"),
                        amount: draft.error("item") ?? draft.error("value"),
                        target: draft.error("applies_to")
                    ),
                    identifier: "planDeal"
                )
            }
            if draft.scope == .group {
                unlocks
                ifShort
            }
        }
        .onChange(of: draft.scope) { _, scope in if scope == .group { draft.keepGroupByInRange(start: start) } }
        .onChange(of: start) { _, start in draft.keepGroupByInRange(start: start) }
        .onAppear { if draft.scope == .group { draft.keepGroupByInRange(start: start) } }
    }

    private func scopeRow(_ scope: PlanDealDraft.Scope, _ title: String, _ subtitle: String?) -> some View {
        let isOn = draft.scope == scope
        return Button { draft.scope = scope } label: {
            HStack(spacing: Spacing.s3) {
                PlanRadio(isOn: isOn)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    if let subtitle {
                        Text(subtitle)
                            .planFont(.small)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 10)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("planDealScope.\(scope.rawValue)")
    }

    private var unlocks: some View {
        PlanFormField(label: "Unlocks when") {
            PlanFormCard {
                HStack {
                    Text("People who join").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    Spacer()
                    PlanStepper(value: $draft.groupSize, range: 2...max(2, spots), label: "People who join")
                        .accessibilityIdentifier("planDealGroupSize")
                }
                .padding(.vertical, Spacing.s2)
                Divider().overlay(Theme.Color.appBorder)
                DatePicker(
                    selection: Binding(get: { draft.groupBy ?? start }, set: { draft.groupBy = $0 }),
                    in: Date()...max(Date(), start),
                    displayedComponents: [.date, .hourAndMinute]
                ) {
                    Text("By").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                }
                .tint(Theme.Color.primary700)
                .padding(.vertical, 10)
                .accessibilityIdentifier("planDealGroupBy")
            }
            if let error = draft.error("group_size") ?? draft.error("group_by") { PlanDealFieldError(text: error) }
            PlanScopeLine(text: "Guests see the count and the time left, and can share the plan to get there.", icon: .info)
        }
    }

    private var ifShort: some View {
        VStack(alignment: .leading, spacing: Spacing.s6) {
            PlanFormField(label: "If it doesn't unlock") {
                PlanFormCard {
                    smallerRow(false, "The plan still happens", "Without the deal")
                    Divider().overlay(Theme.Color.appBorder)
                    smallerRow(true, "Give a smaller deal anyway", "You choose it next")
                }
                if let error = draft.error("if_short") { PlanDealFieldError(text: error) }
            }
            if draft.givesSmaller {
                PlanDealWhatFields(
                    kind: $draft.smallerKind,
                    item: $draft.smallerItem,
                    percent: $draft.smallerPercent,
                    dollars: $draft.smallerDollars,
                    appliesTo: $draft.appliesTo,
                    offer: offer,
                    errors: PlanDealFieldErrors(),
                    identifier: "planDealSmaller",
                    showsTarget: false
                )
            }
        }
    }

    private func smallerRow(_ gives: Bool, _ title: String, _ subtitle: String) -> some View {
        let isOn = draft.givesSmaller == gives
        return Button { draft.givesSmaller = gives } label: {
            HStack(spacing: Spacing.s3) {
                PlanRadio(isOn: isOn)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    Text(subtitle).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 10)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier(gives ? "planDealIfShort.smaller" : "planDealIfShort.none")
    }
}

/// "What they get" and "How much" (and "On" for money off), for the deal or its smaller one.
struct PlanDealWhatFields: View {
    @Binding var kind: String
    @Binding var item: String
    @Binding var percent: Int
    @Binding var dollars: String
    @Binding var appliesTo: String?
    let offer: PlanDealOffer
    /// The server's words under "What they get", "How much" and "On".
    let errors: PlanDealFieldErrors
    let identifier: String
    var showsTarget = true

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s6) {
            PlanFormField(label: "What they get") {
                PlanChoiceChips(
                    options: kinds.map { PlanChoiceOption(id: $0.key, label: $0.label) },
                    isSelected: { $0 == kind },
                    onTap: { kind = $0 },
                    groupLabel: "What they get",
                    identifier: "\(identifier)Kind"
                )
                if let error = errors.kind { PlanDealFieldError(text: error) }
            }
            .onAppear { if !kinds.contains(where: { $0.key == kind }) { kind = "free_item" } }
            PlanFormField(label: kind == "free_item" ? "What is it?" : "How much") {
                switch kind {
                case "percent":
                    PlanFormCard {
                        HStack {
                            Text("\(percent)%").planFont(.bodyStrong).monospacedDigit().foregroundStyle(Theme.Color.appText)
                            Spacer()
                            PlanStepper(value: $percent, range: 5...50, label: "Percent off")
                                .accessibilityIdentifier("\(identifier)Percent")
                        }
                        .padding(.vertical, Spacing.s2)
                    }
                case "amount":
                    PlanDealDollarsField(text: $dollars, identifier: "\(identifier)Dollars")
                default:
                    PlanTextInput(
                        placeholder: "appetizer for the table",
                        text: $item,
                        limit: 40,
                        identifier: "\(identifier)Item",
                        label: "What is it?"
                    )
                }
                if let error = errors.amount { PlanDealFieldError(text: error) }
            }
            if kind != "free_item", showsTarget {
                PlanFormField(label: "On") {
                    PlanChoiceChips(
                        options: offer.targets.map { PlanChoiceOption(id: $0.key, label: $0.label) },
                        isSelected: { $0 == appliesTo },
                        onTap: { appliesTo = $0 },
                        groupLabel: "On",
                        identifier: "\(identifier)On"
                    )
                    if let error = errors.target { PlanDealFieldError(text: error) }
                }
                .onAppear {
                    if appliesTo == nil || !offer.targets.contains(where: { $0.key == appliesTo }) { appliesTo = offer.targets.first?.key }
                }
            }
        }
    }

    /// "Percent off" and "Dollars off" only where money moves through Pantopus on this plan.
    private var kinds: [(key: String, label: String)] {
        var all: [(key: String, label: String)] = []
        if offer.offersMoney {
            all.append(("percent", "Percent off"))
            all.append(("amount", "Dollars off"))
        }
        all.append(("free_item", "Something free"))
        return all
    }
}

/// The server's words under "What they get", "How much" and "On".
struct PlanDealFieldErrors {
    var kind: String?
    var amount: String?
    var target: String?
}

/// "$" and an amount for "Dollars off".
struct PlanDealDollarsField: View {
    @Binding var text: String
    let identifier: String

    var body: some View {
        HStack(spacing: Spacing.s2) {
            Text("$").planFont(.body).foregroundStyle(Theme.Color.appTextSecondary).allowsHitTesting(false)
            TextField("4", text: $text)
                .keyboardType(.decimalPad)
                .planFont(.body)
                .accessibilityLabel("Dollars off")
                .accessibilityIdentifier(identifier)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 50)
        .typesInFieldOnTap()
        .background(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).fill(Theme.Color.appSurface))
        .overlay(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
    }
}

/// The server's words under a field.
struct PlanDealFieldError: View {
    let text: String

    var body: some View {
        Text(text)
            .planFont(.small)
            .foregroundStyle(Theme.Color.error)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("planDealError")
    }
}

/// D3 item 8: "Guests will read", the server's sentence and how it's claimed.
struct PlanDealGuestsRead: View {
    let draft: PlanDealDraft

    var body: some View {
        if draft.scope != .none {
            PlanFormField(label: "Guests will read") {
                VStack(alignment: .leading, spacing: Spacing.s2) {
                    if let preview = draft.preview, let text = preview.text {
                        Text(text).planFont(.h4).foregroundStyle(Theme.Color.appText).fixedSize(horizontal: false, vertical: true)
                        if let condition = preview.conditionText {
                            Text(condition).planFont(.small).foregroundStyle(Theme.Color.appTextStrong).fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                        }
                        if let ifShort = preview.ifShortText {
                            Text(ifShort).planFont(.small).foregroundStyle(Theme.Color.appTextStrong).fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                        }
                        if let claim = preview.claimText {
                            Text(claim).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary).fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                        }
                    } else if let problem = draft.previewProblem {
                        PlanDealFieldError(text: problem)
                    } else {
                        Shimmer(width: nil, height: 44, cornerRadius: Radii.md)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).fill(Theme.Color.successBg))
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("planDealPreview")
            }
        }
    }
}
