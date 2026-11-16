//
//  PlanDealParts.swift
//  Pantopus
//
//  Plans for the holidays, the business track B1 (07-screens D1, D2 and
//  "Mark used"): the deal card on a business's plan, "Your deal" for a guest
//  who is in, and the deal's one tag. Every word and number of a deal is the
//  server's (`deal.text`, `tag`, `short`, `condition_text`, `left_text`,
//  `if_short_text`, `state_text`); the app draws them and composes none.
//

import SwiftUI

/// "Deal" / "Group deal" (or the server's tag) on a quiet chip with a tag glyph.
struct PlanDealTag: View {
    let text: String

    var body: some View {
        HStack(spacing: 5) {
            Icon(.tag, size: 13, strokeWidth: 2.2, color: Theme.Color.successDk)
            Text(text).planFont(.footnote).fontWeight(.semibold).foregroundStyle(Theme.Color.successDk)
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 26)
        .background(Capsule().fill(Theme.Color.successBg))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}

/// D1: the deal under the business's name, on its plan before joining (and, before a group deal unlocks, for
/// someone who is in). A plan that is full, over or cancelled keeps the card as it was last read.
struct PlanDealCard: View {
    let card: PlanCardDTO
    let deal: PlanDealDTO

    var body: some View {
        PlanCardBox(padding: Spacing.s4) {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack(alignment: .center, spacing: Spacing.s2) {
                    PlanDealTag(text: deal.isGroup ? "Group deal" : "Deal")
                    Spacer(minLength: Spacing.s2)
                    if deal.isOpenGroup, let left = deal.group?.leftText {
                        Text(left)
                            .planFont(.footnote)
                            .fontWeight(.semibold)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .multilineTextAlignment(.trailing)
                            .accessibilityIdentifier("planDealLeft")
                    }
                }
                Text(deal.text)
                    .planFont(.h3)
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if deal.isGroup { group }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planDealCard")
    }

    @ViewBuilder private var group: some View {
        switch deal.state {
        case .open:
            if let condition = deal.conditionText {
                Text(condition).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary).fixedSize(horizontal: false, vertical: true)
            }
            if let group = deal.group {
                PlanDealBar(filled: group.inCount, of: group.size, done: false)
                countLine(group)
            }
            if let line = deal.ifShortText {
                Text(line).planFont(.small).foregroundStyle(Theme.Color.appTextStrong).fixedSize(horizontal: false, vertical: true)
            }
            if let url = card.shareUrl.flatMap(URL.init(string:)) {
                ShareLink(item: url, message: Text(card.title)) {
                    PlanButtonLabel(title: "Share: every friend who joins counts", icon: .share, kind: .secondary)
                }
                .planButton(.secondary, size: .small)
                .accessibilityIdentifier("planDealShare")
            }
        case .unlocked:
            if let group = deal.group { PlanDealBar(filled: group.size, of: group.size, done: true) }
            if let text = deal.stateText { stateLine(text, done: true) }
        case .short:
            if let text = deal.stateText { stateLine(text, done: false) }
        case .on, .unknown:
            EmptyView()
        }
    }

    /// "8 in · 4 more to unlock".
    private func countLine(_ group: PlanDealGroupDTO) -> some View {
        (Text("\(group.inCount) in").fontWeight(.semibold).foregroundStyle(Theme.Color.appText)
            + Text(group.left > 0 ? " · \(group.left) more to unlock" : "").foregroundStyle(Theme.Color.appTextSecondary))
            .planFont(.small)
            .monospacedDigit()
            .accessibilityIdentifier("planDealCount")
    }

    private func stateLine(_ text: String, done: Bool) -> some View {
        Text(text)
            .planFont(done ? .smallStrong : .small)
            .foregroundStyle(done ? Theme.Color.successDk : Theme.Color.appTextStrong)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("planDealState")
    }
}

/// The group deal's count as a bar: filled to in ÷ size, in the ok color once it unlocked.
struct PlanDealBar: View {
    let filled: Int
    let of: Int
    let done: Bool

    var body: some View {
        GeometryReader { proxy in
            let share = of > 0 ? min(1, max(0, CGFloat(filled) / CGFloat(of))) : 0
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Color.appSurfaceSunken)
                Capsule()
                    .fill(done ? Theme.Color.successSolid : Theme.Color.primary600)
                    .frame(width: max(share > 0 ? 8 : 0, proxy.size.width * share))
            }
        }
        .frame(height: 8)
        .accessibilityElement()
        .accessibilityLabel("\(min(filled, of)) of \(of) in")
    }
}

/// D2: "Your deal" for a guest who is in, from `deal.mine`. No card after a deal fell short with nothing.
struct PlanYourDealCard: View {
    let card: PlanCardDTO
    let deal: PlanDealDTO
    let mine: PlanDealMineDTO

    var body: some View {
        PlanCardBox(padding: Spacing.s4) {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                HStack(spacing: Spacing.s2) {
                    Text.planOverline("Your deal")
                    Spacer()
                    stateChip
                }
                Text(item)
                    .planFont(.bodyStrong)
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
                if let business = card.business {
                    HStack(spacing: Spacing.s2) {
                        PlanBusinessShape(url: business.avatarUrl, size: 22)
                        Text("\(business.name) · \(PlanScreenLines.shortWhen(card))")
                            .planFont(.small)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if mine.state == .ready || mine.state == .used, let text = mine.text {
                    Text(text)
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("planYourDeal")
    }

    /// Something free names the guest with the item ("Dana: a free appetizer for the table"), so staff can match them.
    private var item: String {
        let short = mine.short ?? deal.short ?? deal.text
        guard let name = mine.name, !name.isEmpty else { return short }
        return "\(name): \(short.prefix(1).lowercased() + short.dropFirst())"
    }

    @ViewBuilder private var stateChip: some View {
        switch mine.state {
        case .ready:
            Text("Ready")
                .planFont(.footnote)
                .fontWeight(.semibold)
                .foregroundStyle(Theme.Color.successDk)
                .padding(.horizontal, 10)
                .frame(minHeight: 24)
                .background(Capsule().fill(Theme.Color.successBg))
                .accessibilityIdentifier("planYourDealReady")
        case .used:
            Text(usedWords(mine.usedAtDate, timezone: card.timezone))
                .planFont(.footnote)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .accessibilityIdentifier("planYourDealUsed")
        case .waiting:
            Text("Not unlocked yet").planFont(.footnote).foregroundStyle(Theme.Color.appTextSecondary)
        case .none, .unknown:
            EmptyView()
        }
    }
}

/// "Used 8:40 PM" (the time in the plan's zone), or "Used" without one.
func usedWords(_ date: Date?, timezone: String?) -> String {
    guard let date else { return "Used" }
    return "Used \(PlanFormat.time(date, calendar: PlanFormat.calendar(for: timezone)))"
}

extension PlanCardDTO {
    /// The deal on a business's plan, while its business has `plans_deals` (sent only with `biz=1`).
    var deal: PlanDealDTO? {
        businessPart?.deal
    }

    /// "Your deal" shows for a guest who is in, unless a deal fell short with nothing in its place.
    var myDeal: PlanDealMineDTO? {
        guard let mine = deal?.mine, mine.state != .none, mine.state != .unknown else { return nil }
        return mine
    }

    /// A group deal that unlocked: the "You're in" banner reads its `state_text` (D2, one banner).
    var dealUnlockedBanner: String? {
        guard let deal, deal.isGroup, deal.state == .unlocked else { return nil }
        return deal.stateText
    }
}

/// "Mark used" on a guest's row in the business's Going list (staff), while their free thing is ready; "Used 8:40 PM"
/// after. Remove stays on the row's menu as it is.
struct PlanMarkUsedControl: View {
    let card: PlanCardDTO
    let person: PlanPersonDTO
    let onConfirm: (PlanConfirmation) -> Void

    var body: some View {
        if let deal = person.deal, let requestId = person.requestId {
            switch deal.state {
            case .ready:
                Button("Mark used") {
                    onConfirm(.markDealUsed(name: person.displayName, item: item, requestId: requestId))
                }
                .planButton(.secondary, size: .small)
                .fixedSize()
                .accessibilityLabel("Mark \(PlanCardLines.firstName(person.displayName))'s deal used")
                .accessibilityIdentifier("planMarkUsed_\(person.userId)")
            case .used:
                Text(usedWords(deal.usedAtDate, timezone: card.timezone))
                    .planFont(.footnote)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize()
                    .accessibilityIdentifier("planDealUsed_\(person.userId)")
            case .waiting, .none, .unknown:
                EmptyView()
            }
        }
    }

    /// The free thing as the question names it: "free appetizer for the table" (the server's short words).
    private var item: String {
        var words = card.deal?.mine?.short ?? card.deal?.short ?? "deal"
        for article in ["A ", "An "] where words.hasPrefix(article) {
            words = String(words.dropFirst(article.count))
        }
        return words.prefix(1).lowercased() + words.dropFirst()
    }
}

/// D2: a group deal that unlocked is the page's one banner; people who join later get it too, so no time is named.
struct PlanDealUnlockedBanner: View {
    let text: String

    var body: some View {
        PlanBanner(tone: .success, icon: .check, title: text, message: "Everyone who's in gets the deal")
            .accessibilityIdentifier("planDealUnlocked")
    }
}

/// D2 on the page of someone who is in: before a group deal unlocks, D1's card; and "Your deal" from their own deal.
struct PlanGoingDealCards: View {
    let card: PlanCardDTO

    var body: some View {
        if let deal = card.deal, deal.isOpenGroup { PlanDealCard(card: card, deal: deal) }
        if let deal = card.deal, let mine = card.myDeal { PlanYourDealCard(card: card, deal: deal, mine: mine) }
    }
}
