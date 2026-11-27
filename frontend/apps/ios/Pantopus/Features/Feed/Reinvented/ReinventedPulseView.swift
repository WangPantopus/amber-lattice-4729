//
//  ReinventedPulseView.swift
//  Pantopus
//
//  "Pulse, reinvented" phase 1 (PHASE-1 §2 pieces 2 to 5; board B1): Pulse as it opens while `pulse_reinvented` is on.
//  The top row (the side menu, the scope pill with the town's name, the chat button), the List | Map switch, the chips
//  the place has, and the list resting over the map at three heights: the middle (the map across the top third, the
//  list below: how it opens), List (full screen) and Map (full screen). A Moment that fades is borderless and full
//  width with its time left; a post that stays is today's Pulse card with a status line. Bands mark the distance; the
//  list ends "Caught up around you. Keep exploring?". Built beside today's feed (`FeedView`), which shows whenever the
//  switch is off.
//

import MapKit
import SwiftUI

struct ReinventedPulseView: View {
    enum Height {
        case middle, list, map
    }

    let onOpenPost: (String) -> Void

    @State private var model = ReinventedPulseModel()
    @State private var map = ReinventedMapModel()
    @State private var strip = ReinventedStripModel()
    @State private var height: Height = .middle
    @State private var dragged: CGFloat = 0
    @State private var watching: MomentsWatchSession?
    @State private var showsDial = false
    /// My Atlas (CONTRACT 6e, `ReinventedAtlas`): the switch's third choice, and the kept Moment opened from it.
    @State private var atlas = ReinventedAtlasModel()
    @State private var inAtlas = false
    @State private var atlasItem: MomentDTO?
    /// + : the Studio, as the Moments tab's + opens it (`MomentsComposerChoice`).
    @State private var composing: MomentsComposeRequest?
    /// "This Moment has ended." after a link to one that can't be played.
    @State private var linkNote: String?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .top) {
                ReinventedPulseMap(model: map, onOpen: open)
                    .ignoresSafeArea()
                panel(in: geo)
                if height == .map {
                    ReinventedPeekDeck(model: map, onOpen: open)
                        .frame(maxHeight: .infinity, alignment: .bottom)
                        .padding(.bottom, 76)
                } else {
                    addButton
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                        .padding(.trailing, Spacing.s4)
                        .padding(.bottom, 92)
                }
                VStack(spacing: Spacing.s2) {
                    topRow
                    viewSwitch
                    // My Atlas has no time row and no chips.
                    if height == .map, !inAtlas {
                        ReinventedTimeRow(model: map)
                    } else if model.reach != "explore", !inAtlas {
                        chipsRow
                    }
                }
                .padding(.bottom, Spacing.s2)
                .background(height == .list ? Theme.Color.appBg : Color.clear)
            }
        }
        .task { await model.refresh() }
        .task { await strip.read() }
        .sheet(item: $atlasItem) { moment in
            ReinventedAtlasItem(moment: moment, model: atlas) { atlasItem = nil }
                .presentationDetents([.large])
                // A Moment deleted for good leaves the map too.
                .onDisappear { if inAtlas { map.reread() } }
        }
        // A Moment's link or notice (PHASE-1 §3): with every Moment in Pulse, it plays here.
        .onChange(of: MomentsNavigator.shared.pending, initial: true) { _, _ in playLinked() }
        .alert(linkNote ?? "", isPresented: Binding(get: { linkNote != nil }, set: { if !$0 { linkNote = nil } })) {
            Button("OK", role: .cancel) {}
        }
        .fullScreenCover(item: $composing) { request in
            MomentsComposerChoice(request: request) {
                composing = nil
                Task { await model.refresh() }
            }
        }
        .fullScreenCover(item: $watching) { session in
            MomentsViewer(
                session: session,
                systemScheme: colorScheme,
                stopsOnDisappear: true,
                onHideAuthor: { _ in },
                onShowAuthor: { _ in },
                onClose: {
                    watching = nil
                    Task { await MomentsTabDot.shared.reread() }
                }
            )
        }
    }

    /// One camera (PHASE-1 §2.11): + opens the Studio. Its "+ Ask / Kind" comes with that piece.
    private var addButton: some View {
        Button {
            composing = MomentsComposeRequest(model: MomentsComposerModel(), studio: true)
        } label: {
            Icon(.plus, size: 26, strokeWidth: 2.6, color: .white)
                .frame(width: 58, height: 58)
                .background(Circle().fill(Theme.Color.primarySolid))
                .shadow(color: .black.opacity(0.25), radius: 6, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add a Moment")
        .accessibilityIdentifier("reinventedPulse.add")
    }

    // MARK: - Top

    private var topRow: some View {
        HStack(spacing: Spacing.s2) {
            NavigationMenuButton(accessibilityIdentifier: "reinventedPulse.menu", floating: height != .list)
            scopePill
            MessagesButton(accessibilityIdentifier: "reinventedPulse.chat", floating: height != .list)
        }
        .padding(.horizontal, Spacing.s4)
    }

    /// The town's name (or Close circle, or Explore); it opens the reach dial.
    private var scopePill: some View {
        Button { showsDial = true } label: {
            HStack(spacing: Spacing.s2) {
                Icon(scopeIcon, size: 16, strokeWidth: 2.2, color: Theme.Color.primaryTint)
                Text(scopeTitle)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Icon(.chevronDown, size: 16, color: Theme.Color.appText)
            }
            .padding(.horizontal, Spacing.s4)
            .frame(height: 44)
            .background(Capsule().fill(Theme.Color.appSurface))
            .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Showing \(scopeTitle). Change what Pulse shows")
        .accessibilityIdentifier("reinventedPulse.scope")
        .sheet(isPresented: $showsDial) {
            ReinventedReachDial(reach: model.reach, miles: model.miles) { reach, miles in
                showsDial = false
                Task { await model.pick(reach: reach, miles: miles) }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var scopeIcon: PantopusIcon {
        switch model.reach {
        case "close": .users
        case "explore": .globe
        default: .mapPin
        }
    }

    private var scopeTitle: String {
        switch model.reach {
        case "close": "Close circle"
        case "explore": "Explore"
        default: model.placeLabel.map { "\($0) · \(model.miles) mi" } ?? "Around me"
        }
    }

    /// The big List | Map switch (the middle height reads as List).
    private var viewSwitch: some View {
        HStack(spacing: 4) {
            switchButton("List", icon: .list, on: !inAtlas && height != .map) { show(atlas: false, at: .list) }
            switchButton("Map", icon: .map, on: !inAtlas && height == .map) { show(atlas: false, at: .map) }
            switchButton("Atlas", icon: .bookmark, on: inAtlas) { show(atlas: true, at: .list) }
        }
        .padding(4)
        .background(Capsule().fill(Theme.Color.appSurface))
        .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: 1))
        .padding(.horizontal, Spacing.s4)
    }

    private func switchButton(_ title: String, icon: PantopusIcon, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Icon(icon, size: 16, strokeWidth: 2.2, color: on ? .white : Theme.Color.appText)
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(on ? Color.white : Theme.Color.appText)
            }
            .frame(maxWidth: .infinity, minHeight: 40)
            .background(Capsule().fill(on ? Theme.Color.primarySolid : Color.clear))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("reinventedPulse.view.\(title.lowercased())")
    }

    private var chipsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.s2) {
                ForEach(model.chips, id: \.self) { chip in
                    let on = model.chip == chip
                    Button { Task { await model.pick(chip: chip) } } label: {
                        Text(Self.chipTitle(chip))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(on ? Color.white : Theme.Color.appText)
                            .padding(.horizontal, Spacing.s3)
                            .frame(height: 34)
                            .background(Capsule().fill(on ? Theme.Color.primarySolid : Theme.Color.appSurface))
                            .overlay(Capsule().stroke(on ? Color.clear : Theme.Color.appBorder, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                    .accessibilityIdentifier("reinventedPulse.chip.\(chip)")
                }
            }
            .padding(.horizontal, Spacing.s4)
        }
    }

    static func chipTitle(_ chip: String) -> String {
        switch chip {
        case "all": "All"
        case "live": "Live"
        case "learn": "Learn"
        case "spots": "Spots"
        case "ask": "Ask"
        case "plans": "Plans"
        case "sports": "Sports"
        default: chip.capitalized
        }
    }

    // MARK: - The list over the map

    /// List, Map or Atlas: Atlas shows the person's kept Moments in the list's place and on the map.
    private func show(atlas: Bool, at next: Height) {
        inAtlas = atlas
        map.show(atlas: atlas)
        setHeight(next)
    }

    private func setHeight(_ next: Height) {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { height = next }
    }

    /// Under the top row, the switch and the chips.
    private static let header: CGFloat = 150

    /// Where the panel's top rests for a height.
    private func rest(_ height: Height, in geo: GeometryProxy) -> CGFloat {
        switch height {
        case .list: Self.header
        case .middle: Self.header + geo.size.height / 3
        case .map: geo.size.height - 64
        }
    }

    private func panelTop(in geo: GeometryProxy) -> CGFloat {
        rest(height, in: geo)
    }

    private func panel(in geo: GeometryProxy) -> some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Theme.Color.appBorder)
                .frame(width: 40, height: 5)
                .padding(.vertical, Spacing.s2)
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                .gesture(dragToRest(in: geo))
                .accessibilityLabel(height == .map ? "Show the list" : "List height")
                .accessibilityAddTraits(.isButton)
                .onTapGesture { setHeight(height == .map ? .middle : height == .middle ? .list : .middle) }
                .accessibilityIdentifier("reinventedPulse.handle")
            if inAtlas {
                ReinventedAtlasView(model: atlas) { atlasItem = $0 }
            } else {
                ReinventedPulseList(
                    model: model,
                    strip: strip.strip,
                    onOpenPost: onOpenPost,
                    onOpenMoment: open,
                    onOpenRing: { ring in open(.ring(ring)) },
                    onRefreshStrip: { await strip.read() }
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
        .frame(height: max(geo.size.height - min(max(panelTop(in: geo) + dragged, 120), geo.size.height - 64), 64), alignment: .top)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: height == .list ? 0 : 22, topTrailingRadius: height == .list ? 0 : 22)
                .fill(Theme.Color.appBg)
                .shadow(color: .black.opacity(height == .list ? 0 : 0.12), radius: 8, y: -2)
                .ignoresSafeArea(edges: .bottom)
        )
        .frame(maxHeight: .infinity, alignment: .bottom)
    }

    /// Pull the panel up or down; it rests at the nearest of the three heights.
    private func dragToRest(in geo: GeometryProxy) -> some Gesture {
        DragGesture()
            .onChanged { value in dragged = value.translation.height }
            .onEnded { value in
                let top = panelTop(in: geo) + value.translation.height
                let nearest = [Height.list, .middle, .map].min {
                    abs(rest($0, in: geo) - top) < abs(rest($1, in: geo) - top)
                } ?? .middle
                dragged = 0
                setHeight(nearest)
            }
    }

    private func open(_ moment: MomentDTO) {
        let ring = MomentRingDTO(moment: moment, mine: model.isMine(moment))
        watching = MomentsWatchSession(request: MomentsWatchRequest(rings: [ring], start: 0, newOnly: false)) { _ in }
    }

    /// The Moment a link named: it plays at once; ended, or not one this person may see, a line says so.
    private func playLinked() {
        guard let id = MomentsNavigator.shared.pending else { return }
        MomentsNavigator.shared.pending = nil
        Task {
            do {
                let moment = try await MomentsAPI.send(MomentsEndpoints.moment(id: id), as: MomentEnvelope.self).moment
                open(moment)
            } catch {
                let failure = error as? MomentsFailure
                linkNote = failure == .ended || failure == .notFound ? "This Moment has ended." : failure?.message
                    ?? "Couldn't open that Moment."
            }
        }
    }

    /// A pin or a card on the map: a ring plays its Moments, a mark opens its post, a ticket its plan in Plans.
    private func open(_ item: ReinventedMapModel.Item) {
        switch item {
        case let .ring(ring):
            watching = MomentsWatchSession(request: MomentsWatchRequest(rings: [ring], start: 0, newOnly: false)) { _ in }
        case let .mark(mark):
            onOpenPost(mark.post.id)
        case let .kept(kept):
            if inAtlas { atlasItem = kept.moment } else { open(kept.moment) }
        case let .ticket(ticket):
            DeepLinkRouter.shared.handle(path: "/plans/\(ticket.id)")
        }
    }
}
