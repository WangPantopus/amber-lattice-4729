//
//  PlansEmptyAndLocation.swift
//  Pantopus
//
//  Board F4 "Nothing planned yet": the next game as a watch-party nudge,
//  "Plan with people you know" (a private plan, with `plans_private`), the
//  other kinds to start, and "Invite a friend". Board F5 "See plans near
//  you": the location ask, with the home as the other choice.
//

import SwiftUI

struct PlansEmptyCard: View {
    let viewModel: PlansMapViewModel
    let actions: PlansMapActions
    @State private var flags = PlansFlags.shared
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var showsTeams = false
    @State private var teams = PlanTeamsModel()
    @AppStorage("plans.sports.askDismissed") private var sportsAskDismissed = false

    var body: some View {
        PlansSheetScroll {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                // The lowest stop shows the title and the suggestion over the map.
                VStack(alignment: .leading, spacing: Spacing.s3) {
                    VStack(alignment: .leading, spacing: Spacing.s1) {
                        Text("Nothing planned yet")
                            .planFont(.h3)
                            .foregroundStyle(Theme.Color.appText)
                            .accessibilityAddTraits(.isHeader)
                        Text("Plans here start with one person. Yours could be the first.")
                            .planFont(.small)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    watchNudge
                }
                .plansSheetPeek(.empty)
                if flags.privatePlans, let hostPrivate = actions.hostPrivate {
                    PlanPrivateStartRow(action: hostPrivate).hiddenUnderPlansTabBar()
                }
                Text("Or start something else")
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .padding(.top, 2)
                    .hiddenUnderPlansTabBar()
                otherKinds.hiddenUnderPlansTabBar()
                Divider().overlay(Theme.Color.appBorder).padding(.top, Spacing.s1)
                if let elsewhere = viewModel.nearestElsewhere {
                    HStack(spacing: 10) {
                        Icon(.mapPin, size: 16, color: Theme.Color.appTextSecondary)
                        Text("\(elsewhere.count) plan\(elsewhere.count == 1 ? "" : "s") in \(elsewhere.city), \(elsewhere.miles) mi away")
                            .planFont(.small)
                            .foregroundStyle(Theme.Color.appText)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Button("Show") { viewModel.showElsewhere() }
                            .planFont(.smallStrong)
                            .foregroundStyle(Theme.Color.primaryInk)
                            .frame(minHeight: 44)
                            .accessibilityIdentifier("plansShowElsewhere")
                    }
                    .hiddenUnderPlansTabBar()
                }
                // The person's own invite link, so the friend sees who asked them.
                ShareLink(
                    item: PersonalInviteLink.shared.url,
                    message: Text("I'm on Pantopus to make plans with people nearby. Join me.")
                ) {
                    PlanButtonLabel(title: "Invite a friend", icon: .share, kind: .secondary)
                }
                .planButton(.secondary, size: .small)
                .accessibilityIdentifier("plansInviteNeighbor")
                .hiddenUnderPlansTabBar()
            }
            .padding(.bottom, Spacing.s4)
            // One drag up shows all of it: the middle stop fits the whole message.
            .plansSheetFit(.empty)
        }
        .accessibilityIdentifier("plansEmpty")
        .sheet(isPresented: $showsTeams, onDismiss: { Task { await viewModel.loadGames() } }, content: { PlanTeamsSheet() })
    }

    /// "Seahawks play Sunday at 1:25 · Host a watch party", from the next
    /// game on the checked list; without one, the plain invitation.
    private var watchNudge: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            VStack(alignment: .leading, spacing: Spacing.s2) {
                if viewModel.sports?.canChoose == true {
                    if viewModel.sports?.state == "unset", !sportsAskDismissed {
                        sportsAsk
                    } else if viewModel.sports?.state == "on", viewModel.games.contains(where: { $0.isAvailable(at: context.date) }) {
                        watchNudge(at: context.date)
                    }
                    if let attribution = viewModel.sports?.attribution,
                       viewModel.games.contains(where: { $0.isAvailable(at: context.date) }) {
                        Text(attribution).planFont(.caption).foregroundStyle(Theme.Color.appTextSecondary)
                    }
                    if let error = teams.error { Text(error).planFont(.small).foregroundStyle(Theme.Color.warning) }
                } else {
                    watchNudge(at: context.date)
                }
            }
        }
    }

    private var sportsAsk: some View {
        PlanFormCard {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                HStack {
                    Text("Watch games with people nearby?").planFont(.bodyStrong)
                    Spacer()
                    Button("×") { sportsAskDismissed = true }
                        .frame(minWidth: 44, minHeight: 44).accessibilityLabel("Dismiss sports suggestions")
                }
                Button("Choose teams") { showsTeams = true }.planButton(.primary)
                Button("Not into sports") {
                    Task { if await teams.save(SportsPreferencesDTO(watch: "off")) { await viewModel.loadGames() } }
                }
                .planButton(.text)
            }
        }
    }

    private func watchNudge(at now: Date) -> some View {
        let game = viewModel.games.first { $0.isAvailable(at: now) }
        return Button {
            actions.host(PlansHostStart(kind: .watchParty, game: game))
        } label: {
            HStack(spacing: Spacing.s3) {
                PlanSwatch(kind: .watchParty, size: 40, glyph: 20)
                VStack(alignment: .leading, spacing: 0) {
                    Text(game.map(gameLine) ?? "Watch a game together")
                        .planFont(.bodyStrong)
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.leading)
                    Text("Host a watch party")
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).fill(PlanKind.watchParty.tint))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("plansEmptyWatch")
        .contextMenu {
            if viewModel.sports?.canChoose == true {
                PlanSportsMenu(game: game, model: teams) { await viewModel.loadGames() }
            }
        }
    }

    /// "Seahawks play Sunday at 1:25".
    private func gameLine(_ game: PlanGameOptionDTO) -> String {
        guard let start = game.startsAtDate else { return "\(game.label) play soon" }
        let day = PlanFormat.dayHeading(start)
        let when = day == "Today" ? "today" : day == "Tomorrow" ? "tomorrow" : day
        let time = PlanFormat.time(start).replacingOccurrences(of: " PM", with: "").replacingOccurrences(of: " AM", with: "")
        let matchup = game.opponent == nil ? "\(game.label) play" : game.matchupLabel
        return "\(matchup) \(when) at \(time)"
    }

    /// The other kinds as tonal buttons: a row of today's, or with `plans_kinds` on a grid of eight with board
    /// Main's buttons (`.btns4`), in 4 columns, or 2 above the default text size so no word breaks.
    @ViewBuilder private var otherKinds: some View {
        let kinds = PlanKind.listed(withNewer: flags.kinds).filter { $0 != .watchParty && ($0 != .playdate || flags.playdates) }
        if flags.kinds {
            let count = typeSize >= .xLarge ? 2 : 4
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Spacing.s2), count: count), spacing: Spacing.s2) {
                ForEach(kinds) { kind in
                    kindButton(kind, spacing: 6).buttonStyle(PlanKindGridButtonStyle())
                }
            }
        } else {
            HStack(spacing: Spacing.s2) {
                ForEach(kinds) { kind in
                    kindButton(kind, spacing: Spacing.s1).planButton(.tonal, size: .stack)
                }
            }
        }
    }

    private func kindButton(_ kind: PlanKind, spacing: CGFloat) -> some View {
        Button { actions.host(PlansHostStart(kind: kind)) } label: {
            VStack(spacing: spacing) {
                PlanSwatch(kind: kind)
                Text(kind.title)
            }
        }
        .accessibilityLabel(hostLabel(kind))
        .accessibilityIdentifier("planKind.\(kind.rawValue)")
    }

    private func hostLabel(_ kind: PlanKind) -> String {
        switch kind {
        case .foodDrinks: "Host food and drinks"
        case .gameNight: "Host a game night"
        case .outdoors: "Host an outing"
        case .somethingElse: "Host something else"
        default: "Host a \(kind.spokenTitle.lowercased())"
        }
    }
}

struct PlansLocationCard: View {
    let viewModel: PlansMapViewModel
    @State private var isAsking = false

    var body: some View {
        PlansSheetScroll {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                RoundedRectangle(cornerRadius: 15, style: .continuous)
                    .fill(Theme.Color.primary100)
                    .frame(width: 52, height: 52)
                    .overlay(Icon(.locationArrow, size: 28, color: Theme.Color.primary700))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    Text("See plans near you")
                        .planFont(.h2)
                        .foregroundStyle(Theme.Color.appText)
                        .accessibilityAddTraits(.isHeader)
                    Text("Pantopus uses your location to show what people are planning close by.")
                        .planFont(.body)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                PlanScopeLine(text: "Hosts and guests never see where you are. They see a distance like \u{201C}about 1 mi\u{201D}.")
                    .hiddenUnderPlansTabBar()
                if viewModel.locationUnavailable {
                    Text(viewModel.homeCenter == nil
                        ? "Location is off for Pantopus. You can turn it on in Settings."
                        : "Location is off for Pantopus. You can use your home instead.")
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.warning)
                        .fixedSize(horizontal: false, vertical: true)
                        .hiddenUnderPlansTabBar()
                }
                VStack(spacing: Spacing.s2) {
                    Button {
                        Task {
                            isAsking = true
                            await viewModel.useMyLocation()
                            isAsking = false
                        }
                    } label: {
                        PlanButtonLabel(title: "Use my location", kind: .primary, isLoading: isAsking)
                    }
                    .planButton(.primary)
                    .disabled(isAsking)
                    .accessibilityIdentifier("plansUseLocation")
                    if viewModel.homeCenter != nil {
                        Button("Use my home instead") { Task { await viewModel.useHome() } }
                            .planButton(.secondary)
                            .accessibilityIdentifier("plansUseHome")
                    }
                    if viewModel.locationUnavailable, viewModel.homeCenter == nil {
                        Button("Open Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }
                        .planButton(.text)
                    }
                }
                .padding(.top, Spacing.s1)
                .hiddenUnderPlansTabBar()
            }
            .padding(.top, Spacing.s1)
            .padding(.bottom, Spacing.s4)
            // The question and its buttons all show at the middle stop when they fit.
            .plansSheetFit(.location)
        }
        .accessibilityIdentifier("plansNeedsLocation")
    }
}
