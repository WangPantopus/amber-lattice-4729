//
//  PlansTabRoot.swift
//  Pantopus
//
//  The Plans tab (Pulse S3; with the Pulse redesign off too, founder decision
//  2026-10-17), present only while the `plans` switch is on (`RootTabView`
//  adds and removes it at runtime). The same Plans screens the Nearby tab
//  used to open on: the map (board F1) with its list sheet (F2), the plan
//  screens pushed on this stack, and the host composer as a full-screen
//  cover. Plan links, pushes and Today's plan cards arrive through
//  `PlansNavigator`. With the redesign off, the list has no "More nearby"
//  rows: Pulse and Connections are on the Nearby tab beside it.
//
//  The map's plans, filters, selection and camera, and the sheets over it
//  (Area and time, the assistant), are held here, above the screen that
//  shows them, so a new layout for the same screen (the iPhone Duo folded or
//  unfolded) starts where the last one was.
//
//  On a wide screen (an iPad, the iPhone Duo open, held sideways or half
//  folded like a book; founder approved the drawing 2026-11-04) the list is a
//  column beside the map (`PlansListColumn`, `PlansMapBeside`) and a plan
//  opens in the column, the map keeping its place beside it. A swipe left
//  puts the column away for the whole map, a swipe from the left edge brings
//  it back (`PlansListStowing`, founder 2026-11-23). The column is this same
//  stack, so a fold keeps the plan open and every sheet over it; folded, or
//  upright (too narrow for the column beside a map), it is the map and
//  sheet again.
//

import SwiftUI

public struct PlansTabRoot: View {
    @Environment(RootTabModel.self) private var rootTabs
    /// Regular width (the iPhone Duo open) puts the list beside the map, where the screen is wide enough.
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var plansFlags = PlansFlags.shared
    @State private var plans = PlansNavigator.shared
    @State private var plansPath: [PlansRoute] = []
    @State private var hostRequest: PlansHostRequest?
    /// The plan just posted, opened once the composer has gone.
    @State private var postedPlanId: String?
    @State private var map = PlansMapViewModel()
    @State private var showsAreaPicker = false
    /// The assistant, opened from the map's header about plans.
    @State private var askTopic: AIAskTopic?
    /// Whether the list was last laid out beside the map.
    @State private var listBesideMap = false
    /// The list beside the map is put away, the map on the whole screen (`PlansListStowing`).
    @State private var listStowed = false
    /// How far a swipe has moved the column so far: left while it puts the list away, right while one from the
    /// screen's edge brings it back.
    @State private var listSwipe: CGFloat = 0
    /// The tab's first screen has appeared, and a moment later is showing: a handed-over plan waits for that.
    @State private var rootAppeared = false
    @State private var rootHasShown = false

    public init() {}

    public var body: some View {
        // Read in layout, so the first pass already picks the map and sheet or the two columns.
        GeometryReader { proxy in
            let beside = isSideBySide(width: proxy.size.width)
            let column = SideBySideColumnWidth.nearby.ideal
            let stowed = beside && listStowed
            // The map starts at the column's edge (never under it: Apple's Maps mark and Legal link stay in sight)
            // and widens as the column slides away, following a swipe.
            ZStack(alignment: .topLeading) {
                if beside {
                    PlansMapBeside(viewModel: map, selectedId: planBesideMap, onOpen: openFromMap)
                        .safeAreaPadding(.leading, max(0, column + columnOffset(column: column, stowed: stowed)))
                }
                NavigationStack(path: $plansPath) {
                    plansRoot(beside: beside)
                        .ignoresSafeArea(.container, edges: columnIgnores(beside: beside))
                        .toolbar(.hidden, for: .navigationBar)
                        .swipesBackFromEdge()
                        .navigationDestination(for: PlansRoute.self) { route in
                            // The map fills a wide screen; the plan pages keep a readable column.
                            PlansDestination(route: route, path: $plansPath) { hostRequest = PlansHostRequest(start: $0) }
                                .readableColumn()
                                .ignoresSafeArea(.container, edges: columnIgnores(beside: beside))
                        }
                }
                .environment(\.plansListBesideMap, beside)
                .frame(width: beside ? column : nil)
                .overlay(alignment: .trailing) {
                    if beside {
                        Rectangle().fill(Theme.Color.appBorder).frame(width: 1).ignoresSafeArea()
                    }
                }
                .offset(x: beside ? columnOffset(column: column, stowed: stowed) : 0)
                .plansListSwipesAway(enabled: beside && !stowed) { moved in
                    listSwipe = -moved
                } onEnd: { completes in
                    withAnimation(PlansListStow.animation) {
                        if completes { listStowed = true }
                        listSwipe = 0
                    }
                }
                .allowsHitTesting(!stowed)
                .accessibilityHidden(stowed)
                if stowed {
                    PlansListStowedControls(onShowList: showList)
                        .opacity(listSwipe > 0 ? 0 : 1)
                        .transition(.opacity)
                    PlansListEdgePull { moved in
                        listSwipe = min(moved, column)
                    } onEnd: { completes in
                        withAnimation(PlansListStow.animation) {
                            if completes { listStowed = false }
                            listSwipe = 0
                        }
                    }
                }
            }
            .onChange(of: beside, initial: true) { _, beside in
                listBesideMap = beside
                if beside { openSelectedPlan() }
            }
        }
        .accessibilityIdentifier("plansTabRoot")
        .onChange(of: plansPath) { _, path in
            // Back to the list beside the map: no plan is selected there.
            if listBesideMap, path.isEmpty, map.selectedId != nil { map.clearSelection() }
            // Back from the plan a new account opened on: the app's usual first screen (JOURNEYS 2, change 3).
            if PlanFirstOpen.shared.leftPlan(path: path) { rootTabs.selected = .place }
        }
        .sheet(isPresented: $showsAreaPicker) {
            PlansAreaPicker(viewModel: map) { showsAreaPicker = false }
                .presentationDetents([.medium, .large])
                .presentationBackground(Theme.Color.appSurface)
        }
        .askPantopus($askTopic)
        .fullScreenCover(item: $hostRequest, onDismiss: openPostedPlan) { request in
            PlanComposerRoot(start: request.start, isPrivate: request.isPrivate) { posted in
                postedPlanId = posted
                hostRequest = nil
            }
        }
        .onChange(of: plans.pending) { _, _ in consumePlansHandOff() }
        .onChange(of: plans.pendingHost) { _, _ in consumePlansHandOff() }
        .onChange(of: plansFlags.plans) { _, isOn in
            // Plans switched off: nothing of Plans is left open (the bar drops this tab).
            if !isOn {
                plansPath = []
                hostRequest = nil
                showsAreaPicker = false
                askTopic = nil
            }
        }
        .onChange(of: rootTabs.selected) { _, selected in
            // Another tab (a link's, Messages): the plan a new account opened on stays here as any plan would.
            if selected != .plans { PlanFirstOpen.shared.forget() }
            consumePlansHandOff()
        }
        .task { consumePlansHandOff() }
        .onAppear { consumePlansHandOff() }
    }

    /// The stack's first screen: the list beside the map, or the map with the list in its sheet.
    private func plansRoot(beside: Bool) -> some View {
        Group {
            if beside {
                PlansListColumn(viewModel: map, actions: plansActions)
            } else {
                PlansMapView(viewModel: map, actions: plansActions)
            }
        }
        .guidanceScreen(.plans)
        .onAppear(perform: rootShown)
    }

    /// The tab's first screen came on for the first time. A plan handed over before that (a link's, or a new
    /// account's first plan, opening this tab for the first time) is pushed only once that screen is really
    /// showing, and as a tap on it would push it. Put on the stack before its first screen had ever been on screen,
    /// or without the push's animation, the plan did not go back with a swipe from the left edge.
    private func rootShown() {
        guard !rootAppeared else { return }
        rootAppeared = true
        Task { @MainActor in
            // Appearing is not yet showing: the stack puts its first screen on screen in the next moments.
            try? await Task.sleep(for: .milliseconds(150))
            rootHasShown = true
            consumePlansHandOff()
        }
    }

    /// Two columns: regular width, with room for the phone-width column beside the narrowest iPhone's width (as
    /// the Nearby tab decides). Upright, the open iPhone Duo (669 pt) keeps the map and its sheet.
    private func isSideBySide(width: CGFloat) -> Bool {
        horizontalSizeClass == .regular && SideBySideColumnWidth.nearby.fitsBeside(in: width)
    }

    /// Beside the map the column is in the screen's middle, so the side tab bar's inset on the screen's trailing
    /// edge isn't its own. Under the system tab bar (Mail off) it reached the column's screens anyway and left them
    /// 84 pt short of the column's edge.
    private func columnIgnores(beside: Bool) -> Edge.Set {
        beside ? .trailing : []
    }

    /// Where the column sits: at the screen's leading edge, off it while the list is away, or part way while a swipe
    /// moves it.
    private func columnOffset(column: CGFloat, stowed: Bool) -> CGFloat {
        stowed ? min(0, -(column + 1) + listSwipe) : min(0, listSwipe)
    }

    /// "Show list", or a plan opening in the column: the list comes back beside the map.
    private func showList() {
        guard listStowed else { return }
        withAnimation(PlansListStow.animation) {
            listStowed = false
            listSwipe = 0
        }
    }

    /// The plan shown selected on the map beside the list: the one open in the column, else the pin tapped.
    private var planBesideMap: String? {
        for route in plansPath.reversed() {
            if case let .plan(id, _) = route { return id }
        }
        return map.selectedId
    }

    /// A pin tapped on the map beside the list opens its plan in the column, in place of one open there. It stays
    /// selected too, so folded the stack's plan closes back to that pin's card, as on a phone.
    private func openFromMap(_ pin: PlanPinDTO) {
        showList()
        map.select(pin)
        if let card = map.selectedCard { PlansStoreReads.seed(card) }
        let route = PlansRoute.plan(id: pin.id, intent: .view)
        guard plansPath != [route] else { return }
        if plansPath.isEmpty {
            plansPath = [route]
        } else {
            replacePath(with: [route])
        }
    }

    /// Unfolded with a pin's card open: its plan opens in the column.
    private func openSelectedPlan() {
        guard plansPath.isEmpty, let id = map.selectedId else { return }
        if let card = map.selectedCard { PlansStoreReads.seed(card) }
        replacePath(with: [.plan(id: id, intent: .view)])
    }

    /// Another plan in place of the one open, with no push or pop.
    private func replacePath(with routes: [PlansRoute]) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { plansPath = routes }
    }

    /// "See your plan" (H8): pushed after the composer is gone, since a screen
    /// pushed under a full-screen cover never learns it came on screen.
    private func openPostedPlan() {
        if let id = postedPlanId {
            postedPlanId = nil
            showList()
            plansPath = [.plan(id: id, intent: .view)]
        }
        consumePlansHandOff()
    }

    /// What the Plans map can open.
    private var plansActions: PlansMapActions {
        var actions = PlansMapActions(
            openPlan: { card, id, intent in
                if let card { PlansStoreReads.seed(card) }
                plansPath.append(.plan(id: id, intent: intent))
            },
            host: { start in hostRequest = PlansHostRequest(start: start) },
            areaPicker: { showsAreaPicker = true }
        )
        actions.ask = { askTopic = .plans() }
        actions.hostPrivate = { hostRequest = PlansHostRequest(start: nil, isPrivate: true) }
        actions.openChange = { plansPath.append(.change(planId: $0)) }
        if LaunchFeatures.pulseRedesign {
            actions.openPulse = { rootTabs.selected = .pulse }
            actions.openConnections = { DeepLinkRouter.shared.handle(path: "/connections") }
        }
        return actions
    }

    /// A plan link, a push or a Today card asked for a Plans screen.
    private func consumePlansHandOff() {
        guard rootTabs.selected == .plans, plansFlags.plans else { return }
        // Not under the composer: it waits until the composer is gone. Nor before the first screen is showing.
        if let route = plans.pending, hostRequest == nil, rootHasShown {
            plans.pending = nil
            showList()
            plansPath = [route]
        }
        if let request = plans.pendingHost {
            plans.pendingHost = nil
            hostRequest = request
        }
    }
}
