//
//  PlacePreviewBody.swift
//  Pantopus
//
//  C0 — the anonymous T0 preview (the funnel's hook). Wedge v2 D1: the
//  aha card leads, then every Band-A section as a one-shot snapshot
//  through the same section cards the claimed dashboard uses, then the
//  one locked (Band B) descriptor and a sticky "Create a free account"
//  wall. Older backends that send only `free` still render the three
//  legacy tiles. A6 region body lives here too.
//

import SwiftUI

// swiftlint:disable multiline_function_chains

struct PlacePreviewBody: View {
    let preview: PlacePreview
    /// Signed-in "Save a place": Cancel instead of Sign in, and the wall
    /// keeps the address for a private save rather than sign-in.
    var signedInEntry = false
    var onSignIn: () -> Void
    var onCreateAccount: () -> Void
    var onBack: () -> Void
    var onRetry: () -> Void
    var retrying: Bool
    /// "See this home's full record": the record page for this address.
    var onOpenRecord: (() -> Void)?
    /// The looked-up address, for "Ask Pantopus: what does this mean for me?" (the reading, SPEC 5.2).
    var readingAddress: String?
    @State private var reading: PlaceReadingRequest?

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollViewReader { proxy in
                ScrollView {
                    // LOOKUPORDER: the facts lead; the record button sits in the server's order, under the money card.
                    PlacePreviewContent(
                        preview: preview,
                        onOpenRecord: onOpenRecord,
                        onAsk: askAction,
                        onScrollTo: { id in withAnimation(.easeOut(duration: 0.3)) { proxy.scrollTo(id, anchor: .top) } },
                        onAction: onCreateAccount,
                        onRetry: onRetry,
                        retrying: retrying
                    )
                    .padding(.horizontal, 16)
                    .padding(.bottom, 120)
                }
            }
        }
        .overlay(alignment: .bottom) { wall }
        .sheet(item: $reading) { request in
            PlaceReadingSheet(
                address: request.address,
                // Signed out, "Ask your own question" goes where Continue goes, once the sheet is down.
                onSignUp: signedInEntry ? nil : {
                    reading = nil
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(400))
                        onCreateAccount()
                    }
                }
            ) { reading = nil }
                .presentationDetents([.large])
        }
    }

    private var askAction: (() -> Void)? {
        guard let address = readingAddress else { return nil }
        return { reading = PlaceReadingRequest(address: address) }
    }

    private var header: some View {
        HStack(alignment: .top) {
            Button(action: onBack) {
                Icon(.chevronLeft, size: 20, strokeWidth: 2.5, color: Theme.Color.appTextStrong)
                    .frame(width: 34, height: 34).background(Theme.Color.appSurface).clipShape(Circle())
                    .shadow(color: .black.opacity(0.06), radius: 1, x: 0, y: 1)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back")
            VStack(alignment: .leading, spacing: 2) {
                Text("Your Place")
                    .font(.system(size: 22, weight: .bold))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.Color.appText)
                if let address = preview.place?.address {
                    Text(address)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.Color.appTextMuted)
                        .lineLimit(1)
                }
            }
            .padding(.leading, 4)
            Spacer(minLength: 0)
            Button(signedInEntry ? "Cancel" : "Sign in", action: onSignIn)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.primaryInk)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        // On an iPad the header runs the window's width: Back in its top-left corner, Sign in in its top-right.
        .topBarSpansWindow()
    }

    private var wall: some View {
        VStack(spacing: 10) {
            Text("Save this address. It opens fresh every day.")
                .font(.system(size: 14.5, weight: .semibold))
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.Color.appText)
            PrimaryButton(title: signedInEntry ? "Continue" : "Save it, free") { onCreateAccount() }
                .accessibilityIdentifier("place.preview.continue")
            Text(signedInEntry
                ? "Saving a place does not create or verify a Home."
                : "Your preview stays on this device for up to 24 hours while you sign in.")
                .font(Theme.Font.caption).foregroundStyle(Theme.Color.appTextMuted)
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, Spacing.s6)
        .frame(maxWidth: .infinity)
        .background(.bar)
        .overlay(alignment: .top) { Rectangle().fill(Theme.Color.appBorder).frame(height: 1) }
    }
}

/// The facts of a preview, drawn in the server's order (`layout.order`, LOOKUPORDER
/// SPEC 1.1; an older server's answer keeps the built-in order): the stand-out card,
/// "At a glance", "Money here", the record button, the section groups, the locked
/// descriptors and the could-not-check line. The funnel's preview and the Place
/// tab's saved address both show them.
struct PlacePreviewContent: View {
    let preview: PlacePreview
    /// "More with a free account": only for someone without an account.
    var showsLocked = true
    var onOpenDetail: ((PlaceDetailGroup) -> Void)?
    /// "See this home's full record" and the money card's record line; neither is drawn without it.
    var onOpenRecord: (() -> Void)?
    /// "Ask Pantopus: what does this mean for me?"; the row is drawn only with it.
    var onAsk: (() -> Void)?
    /// Scrolls the page to a section's card (`PlacePreviewContent.anchor`): a glance row's tap.
    var onScrollTo: ((String) -> Void)?
    /// The aha follow-up and every locked, verify or claim call to action.
    var onAction: () -> Void
    var onRetry: () -> Void
    var retrying: Bool
    @State private var ballotGovernments: BallotGovernmentsSheet?

    /// The scroll target of a section's card.
    static func anchor(_ sectionId: String) -> String {
        "place.preview.section.\(sectionId)"
    }

    private var order: [String] {
        let sent = preview.layout?.order ?? []
        return sent.isEmpty ? PlacePreviewLayout.builtInOrder : sent
    }

    var body: some View {
        // Ballot P0 (ballot_p0): the "Your ballot" card under "This season",
        // in place of the election row. The server places it: where the order
        // names "ballot", there; otherwise at the top of Civic.
        let ballot = PlaceDashboardView.ballot(in: preview.sections ?? [])
        let order = order
        let firstGroup = order.firstIndex { $0.hasPrefix("group:") }
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(order.enumerated()), id: \.offset) { index, block in
                self.block(block, at: index, ballot: ballot, drawsFree: index == firstGroup)
            }
        }
        .sheet(item: $ballotGovernments) { sheet in
            let address = preview.place?.address ?? ""
            BallotGovernmentsView(
                governments: sheet.governments,
                address: address.components(separatedBy: ",").first ?? address
            ) { ballotGovernments = nil }
                .presentationDetents([.large])
                .presentationDragIndicator(.hidden)
        }
    }

    /// One block of the order; a block this build does not know, or one with nothing to draw, draws nothing.
    @ViewBuilder
    private func block(_ name: String, at index: Int, ballot: (card: BallotSummary, asOf: String?)?, drawsFree: Bool) -> some View {
        if name.hasPrefix("group:") {
            groupBlock(String(name.dropFirst("group:".count)), ballot: ballot, drawsFree: drawsFree)
        } else if name.hasPrefix("section:") {
            soloSection(String(name.dropFirst("section:".count)), at: index, ballot: ballot)
        } else if name == "ballot" {
            if let ballot { ballotBlock(ballot) }
        } else if name == "locked" {
            if showsLocked, let locked = preview.locked, !locked.isEmpty { lockedSections(locked) }
        } else if name == "not_checked" {
            if let missing = preview.notChecked, !missing.isEmpty { notCheckedLine(missing) }
        } else if name == "record" || name == "ask" {
            doorBlock(name)
        } else {
            firstScreenBlock(name)
        }
    }

    /// "See this home's full record" and "Ask Pantopus: what does this mean for me?".
    @ViewBuilder
    private func doorBlock(_ name: String) -> some View {
        switch name {
        case "record":
            if let onOpenRecord {
                HomeRecordEntryButton(
                    title: "See this home's full record",
                    line: "What the county and federal records show"
                ) { onOpenRecord() }
                    .padding(.top, 14)
                    .accessibilityIdentifier("place.preview.record")
            }
        case "ask":
            if let onAsk {
                AskPantopusBox(
                    title: "Ask Pantopus: what does this mean for me?",
                    subtitle: nil,
                    spokenLabel: "Ask Pantopus: what does this mean for me?",
                    identifier: "place.preview.ask",
                    action: onAsk
                )
                .padding(.top, 14)
            }
        default:
            EmptyView()
        }
    }

    /// The stand-out card, "At a glance" and "Money here".
    @ViewBuilder
    private func firstScreenBlock(_ name: String) -> some View {
        switch name {
        case "aha":
            if let aha = preview.aha, aha.isRenderable { ahaCard(aha) }
        case "glance":
            if let rows = preview.glance, !rows.isEmpty {
                PlacePreviewGlanceCard(rows: rows) { row in
                    if let id = row.sectionId { onScrollTo?(Self.anchor(id)) }
                }
                .padding(.top, 14)
            }
        case "money":
            if let money = preview.money, money.isRenderable {
                PlacePreviewMoneyCard(money: money, onOpenRecord: onOpenRecord)
                    .padding(.top, 14)
            } else if let lead = preview.moneyLead, lead.isRenderable, lead.kind != .floodPremium {
                moneyLeadCard(lead).padding(.top, 14)
            }
        default:
            EmptyView()
        }
    }

    // MARK: - Groups and sections

    /// The launch-set groups' labels; a group the client does not know is not shown here.
    private static let groupLabels: [String: String] = [
        "today": "Today",
        "risk_readiness": "Risk & readiness",
        "health_environment": "Health & environment",
        "your_block": "Your block",
        "money_signals": "Money signals",
        "civic": "Civic",
        "your_home": "Your home"
    ]

    /// The sections the order names on their own, left out of their groups.
    private var soloSectionIds: Set<String> {
        Set(order.filter { $0.hasPrefix("section:") }.map { String($0.dropFirst("section:".count)) })
    }

    @ViewBuilder
    private func groupBlock(_ group: String, ballot: (card: BallotSummary, asOf: String?)?, drawsFree: Bool) -> some View {
        if let sections = preview.sections, !sections.isEmpty {
            let items = groupItems(group, in: sections, ballot: ballot)
            // The flood cost band heads Risk & readiness (SPEC 1.5).
            let lead = group == "risk_readiness" ? floodCostLead : nil
            // Ballot, when the order does not name it, leads Civic (right under its label).
            let civicBallot = group == "civic" && !order.contains("ballot") ? ballot : nil
            if let label = Self.groupLabels[group], !items.isEmpty || lead != nil || civicBallot != nil {
                PlaceGroupLabel(text: label).padding(.top, 18)
                if let civicBallot { ballotBlock(civicBallot, top: 8) }
                VStack(spacing: 8) {
                    if let lead { moneyLeadCard(lead) }
                    ForEach(items, id: \.id) { sectionCard($0) }
                }
            }
        } else if drawsFree, let free = preview.free {
            // An older server sends only the three tiles.
            freeSections(free)
        }
    }

    /// A group's own cards: less the sections the order places on their own, and the election row the ballot replaces.
    private func groupItems(_ group: String, in sections: [PlaceSectionEnvelope], ballot: (card: BallotSummary, asOf: String?)?)
        -> [PlaceSectionEnvelope] {
        let solo = soloSectionIds
        return sections.filter {
            $0.group.rawValue == group && !solo.contains($0.id.rawValue) && !(ballot != nil && $0.id == .civicElection)
        }
    }

    /// `flood_cost`; from an older server with no money card, a flood premium `money_lead`.
    private var floodCostLead: PlaceMoneyLead? {
        if let cost = preview.floodCost, cost.isRenderable { return cost }
        guard preview.money == nil, let lead = preview.moneyLead, lead.kind == .floodPremium, lead.isRenderable else { return nil }
        return lead
    }

    /// A section the order places on its own ("Homes here", "Verified homes nearby"), under its group's label
    /// unless that label is already on the page above it.
    @ViewBuilder
    private func soloSection(_ id: String, at index: Int, ballot: (card: BallotSummary, asOf: String?)?) -> some View {
        if let env = preview.sections?.first(where: { $0.id.rawValue == id }) {
            let group = env.group.rawValue
            if let label = Self.groupLabels[group], !labelShown(group, before: index, ballot: ballot) {
                PlaceGroupLabel(text: label).padding(.top, 18)
            } else {
                Color.clear.frame(height: 10)
            }
            sectionCard(env)
        }
    }

    /// Whether a block before `index` already drew `group`'s label.
    private func labelShown(_ group: String, before index: Int, ballot: (card: BallotSummary, asOf: String?)?) -> Bool {
        let sections = preview.sections ?? []
        return order.prefix(index).contains { name in
            if name == "group:\(group)" {
                return !groupItems(group, in: sections, ballot: ballot).isEmpty
                    || (group == "risk_readiness" && floodCostLead != nil)
                    || (group == "civic" && ballot != nil && !order.contains("ballot"))
            }
            guard name.hasPrefix("section:") else { return false }
            let id = name.dropFirst("section:".count)
            return sections.contains { $0.id.rawValue == id && $0.group.rawValue == group }
        }
    }

    private func sectionCard(_ env: PlaceSectionEnvelope) -> some View {
        PlaceSectionView(
            env: env,
            onOpen: detailAction(for: env),
            onVerify: onAction,
            onClaim: onAction,
            onRetry: onRetry,
            retrying: retrying
        )
        .id(Self.anchor(env.id.rawValue))
    }

    private func ballotBlock(_ ballot: (card: BallotSummary, asOf: String?), top: CGFloat = 18) -> some View {
        BallotSeasonBlock(
            card: ballot.card,
            asOf: ballot.asOf,
            onOpenGovernments: ballot.card.governments.map { governments in
                { ballotGovernments = BallotGovernmentsSheet(governments: governments) }
            }
        )
        .padding(.top, top)
        .padding(.bottom, 8)
        .id(Self.anchor(PlaceSectionID.civicElection.rawValue))
    }

    /// "Could not check today: Homes here, Next election."
    private func notCheckedLine(_ missing: [PlacePreviewNotChecked]) -> some View {
        Text("Could not check today: \(missing.map(\.label).joined(separator: ", ")).")
            .font(.system(size: 13))
            .lineSpacing(2)
            .foregroundStyle(Theme.Color.appTextMuted)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 2)
            .padding(.top, 18)
            .accessibilityIdentifier("place.preview.notChecked")
    }

    private func detailAction(for env: PlaceSectionEnvelope) -> (() -> Void)? {
        guard env.band == .a, let open = onOpenDetail,
              let group = PlaceDetailGroup.forGroup(env.group), group.supportsSavedPlace else { return nil }
        return { open(group) }
    }

    @ViewBuilder
    private func freeSections(_ free: PlacePreviewFree) -> some View {
        PlaceGroupLabel(text: "Risk & readiness").padding(.top, 18)
        PlaceSectionCard(
            icon: .waves,
            title: "Flood",
            state: free.flood.status == .ready ? .loaded : .unavailable,
            value: free.flood.description ?? free.flood.zone.map { "Zone \($0)" },
            chip: free.flood.zone != nil ? PlaceChipModel(tone: .success, text: free.flood.description ?? "Flood zone") : nil
        )

        PlaceGroupLabel(text: "Your block").padding(.top, 18)
        VStack(spacing: 8) {
            PlaceDensityCard(bucket: free.density.bucket, label: free.density.label, ctaTitle: nil, onTap: nil)
            if free.area.status == .ready {
                PlaceSectionCard(
                    icon: .home,
                    title: "Homes here",
                    state: .loaded,
                    value: free.area.medianYearBuilt.map { "Median built \($0)" } ?? free.area.note,
                    caption: free.area.note
                )
            }
        }
    }
}

// MARK: - A6 — coming to your region

struct PlaceComingRegionBody: View {
    let message: String
    var signedInEntry = false
    /// Replaces the primary button's title (the Place tab's first-run screen).
    var primaryTitle: String?
    var onBrowse: () -> Void
    var onBack: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onBack) {
                    Icon(.chevronLeft, size: 20, strokeWidth: 2.5, color: Theme.Color.appTextStrong)
                        .frame(width: 34, height: 34).background(Theme.Color.appSurface).clipShape(Circle())
                }
                .buttonStyle(.plain)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            // On an iPad Back sits in the window's top-left corner.
            .topBarSpansWindow()

            Spacer(minLength: 0)
            VStack(spacing: 16) {
                ZStack {
                    Circle().fill(Theme.Color.homeBg).frame(width: 80, height: 80)
                    Icon(.mapPin, size: 34, strokeWidth: 2, color: Theme.Color.home)
                }
                Text("Home features are coming to your region.")
                    .font(.system(size: 24, weight: .bold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.Color.appText)
                // Launch cut #1 (Beacon): no Beacon fan memberships to mention.
                Text(message +
                    " Today, home intelligence reads off U.S. sources — county records, FEMA, the Census. "
                    + (LaunchFeatures.beacon
                        ? "Following, fanning, and messaging work in your region right now."
                        : "Following and messaging work in your region right now."))
                    .pantopusTextStyle(.small)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                PrimaryButton(title: primaryTitle ?? (signedInEntry ? "Back to saved places" : "Follow people & places")) { onBrowse() }
            }
            .padding(.horizontal, 28)
            Spacer(minLength: 0)
        }
        .background(Theme.Color.appBg)
    }
}
