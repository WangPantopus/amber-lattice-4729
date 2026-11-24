//
//  HolidayCardShelves.swift
//  Pantopus
//
//  "Pick a card" as shelves (server switch `card_shelves`, card shelves plan Part B): "One from each collection", a
//  row of one large card from each collection, then every collection as a shelf of its cards, each row scrolling
//  sideways and settling on a card's leading edge. Cards are big (the founder's rule): never smaller than a tile of
//  the two-across grid on the same screen. A tap on a card opens the card rack at it among its collection's cards; the
//  line under a large card goes to its collection's shelf. Every shelf is laid out (so the page can go to any of them),
//  but a shelf loads its pictures only as it comes near, and a row only those of the cards scrolled near.
//

// swiftlint:disable file_length

import SwiftUI

/// How large the shelves draw their cards (card shelves B2, B3 and the "Big cards" rule): the opening row's large card
/// about 76% of the screen's width (no wider than 340), a shelf's card about 56% (190 to 240), and neither smaller
/// than a tile of today's two-across grid in the same column. Where that makes a shelf card wide (a wide window), a
/// large card stays at least 1.3 times as wide, up to 60% of the window (the design session's answer of Nov 21).
struct HolidayCardShelfSizes: Equatable {
    /// A grid tile's picture: half the column less the grid's gap and the tile's padding.
    let grid: CGFloat
    let opening: CGFloat
    let shelf: CGFloat

    init(screen: CGFloat, column: CGFloat) {
        grid = max(0, (column - Spacing.s3) / 2 - Spacing.s1 * 2)
        shelf = max(grid, min(max(screen * 0.56, 190), 240))
        let large = max(grid, min(screen * 0.76, 340))
        opening = max(large, min(shelf * 1.3, screen * 0.6))
    }

    /// Pick a card as a page across an iPad window (`HolidayCardPadRoom.page`; founder, 2026-11-23: the cards were
    /// "messy in the screen"): every card the same frame, the shelves' cards as many as fit at `HolidayCardPad.shelfCard`
    /// or wider, filling the page's width exactly, and one fewer, larger, in "One from each collection". So each row
    /// starts and ends at the page's margins, its captions and links level, and the next card peeks past the margin.
    init(padColumn column: CGFloat) {
        let across = Self.padAcross(column: column)
        shelf = Self.padCard(across: across, column: column)
        opening = Self.padCard(across: across - 1, column: column)
        grid = shelf
    }

    /// How many shelf cards fill a page this wide (three at least); a collection's page shows its grid as many across.
    static func padAcross(column: CGFloat) -> Int {
        let gap = HolidayCardPad.gap
        return max(3, Int(((column + gap) / (HolidayCardPad.shelfCard + gap)).rounded(.down)))
    }

    /// The width of each of `across` cards with the page's gap between them, filling a page this wide.
    static func padCard(across: Int, column: CGFloat) -> CGFloat {
        let count = CGFloat(max(1, across))
        return max(0, ((column - HolidayCardPad.gap * (count - 1)) / count).rounded(.down))
    }
}

/// The page scrolling to a shelf: from the line under a large card (it slides), or to the chosen card's shelf as the
/// shelves open (it's simply there).
struct HolidayCardShelfJump: Equatable {
    let collection: String
    let animated: Bool
}

/// Where the flow's column sits in its scroll view: the rows run on to the screen's edges, their first card at the
/// column's edge.
struct HolidayCardShelfBleed: Equatable {
    var leading: CGFloat = Spacing.s4
    var trailing: CGFloat = Spacing.s4
    /// The column's width, and the scroll view's.
    var column: CGFloat = 370
    var screen: CGFloat = 402
}

extension HolidayCardsResponse {
    /// The collections that have a picture, in the server's order.
    var pickableCollections: [HolidayCardCollection] {
        collections.filter { !designs(in: $0).isEmpty }
    }

    /// The card shelves are on (server switch `card_shelves`) and the collections carry their facts (`slug` comes with
    /// them); otherwise one collection at a time behind a row of names, as before.
    var showsShelves: Bool {
        guard shelves else { return false }
        let collections = pickableCollections
        return !collections.isEmpty && collections.allSatisfy { $0.slug != nil }
    }

    /// The collections in the order "One from each collection" draws them: those the server's `opening` names, in its
    /// order (an id that isn't a collection is skipped), then the rest in the collections' order (card shelves E2).
    var openingCollections: [HolidayCardCollection] {
        var ordered: [HolidayCardCollection] = []
        let collections = pickableCollections
        for id in opening ?? [] {
            if let named = collections.first(where: { $0.id == id }), !ordered.contains(named) { ordered.append(named) }
        }
        return ordered + collections.filter { !ordered.contains($0) }
    }

    /// The pictures on the card shelves' first screen: the first two large cards and the first shelf's first two.
    var shelvesFirstScreen: [String] {
        let picks = openingCollections.compactMap(\.pick).prefix(2)
        let first = pickableCollections.first.map { designs(in: $0).prefix(2).map(\.id) } ?? []
        return Array(picks) + first
    }

    /// The collection a picture is in, for the shelf that holds it.
    func collection(holding design: String) -> HolidayCardCollection? {
        pickableCollections.first { $0.designs.contains(design) }
    }
}

/// A collection's large card in "One from each collection".
private struct ShelfPick: Identifiable {
    let collection: HolidayCardCollection
    let design: HolidayCardDesign

    var id: String {
        design.id
    }
}

struct HolidayCardShelves: View {
    @Bindable var viewModel: HolidayCardFlowViewModel
    let cards: HolidayCardsResponse
    @State private var bleed = HolidayCardShelfBleed()
    /// The shelves that have come within two screens of view: their pictures load (and stay).
    @State private var near: Set<String> = []
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// A page across an iPad window: uniform frames from the page's margins (`HolidayCardShelfSizes(padColumn:)`).
    @Environment(\.holidayCardWidePage) private var widePage

    /// A shelf's place in the page, for the line under a large card and coming back from step 3.
    static func shelfId(_ collection: String) -> String {
        "sendCardShelf.\(collection)"
    }

    /// A row shows its collection's first 10 cards.
    static let rowLength = 10

    var body: some View {
        let collections = cards.pickableCollections
        let sizes = widePage
            ? HolidayCardShelfSizes(padColumn: bleed.column)
            : HolidayCardShelfSizes(screen: bleed.screen, column: bleed.column)
        // In the server's opening order; the shelves keep the collections' order.
        let picks = cards.openingCollections.compactMap { collection in
            collection.pick.flatMap { id in cards.designs(in: collection).first { $0.id == id } }
                .map { ShelfPick(collection: collection, design: $0) }
        }
        // A plain stack: a lazy one can't be scrolled to a shelf it hasn't built yet.
        VStack(alignment: .leading, spacing: Spacing.s0) {
            // No picks at all: no opening row and no label.
            if !picks.isEmpty {
                openingLabel
                // The page scrolls to the shelf (the flow's scroll view does it).
                openingRow(picks, sizes: sizes) { viewModel.shelfJump = HolidayCardShelfJump(collection: $0.id, animated: true) }
            }
            ForEach(collections) { collection in
                shelf(collection, sizes: sizes)
                    .onGeometryChange(for: Bool.self) { proxy in
                        let height = proxy.bounds(of: .scrollView)?.height ?? 900
                        let frame = proxy.frame(in: .scrollView)
                        return frame.minY < height * 2 && frame.maxY > -height
                    } action: { isNear in
                        if isNear { near.insert(collection.id) }
                    }
            }
        }
        // The rows run out to the screen's edges, beyond the flow's column.
        .onGeometryChange(for: HolidayCardShelfBleed.self) { proxy in
            let column = proxy.size.width
            guard let screen = proxy.bounds(of: .scrollView), screen.width >= column else {
                return HolidayCardShelfBleed(leading: Spacing.s4, trailing: Spacing.s4, column: column, screen: column + Spacing.s8)
            }
            return HolidayCardShelfBleed(
                leading: max(0, -screen.minX),
                trailing: max(0, screen.maxX - column),
                column: column,
                screen: screen.width
            )
        } action: { bleed = $0 }
        // Back from step 3, or opened with a card chosen: at the shelf that holds it.
        .onAppear {
            guard viewModel.shelvesStart else { return }
            viewModel.shelvesStart = false
            if let id = viewModel.designId, let shelf = cards.collection(holding: id) {
                viewModel.shelfJump = HolidayCardShelfJump(collection: shelf.id, animated: false)
            }
        }
        // The large cards' small pictures, and each of the first two shelves' first cards, before they show; the
        // rest load as their rows come near.
        .task {
            let ahead = picks.map(\.id) + collections.prefix(2).flatMap { cards.designs(in: $0).prefix(3).map(\.id) }
            HolidayCardPicture.loadAhead(ahead, thumb: true)
        }
        .task(id: viewModel.designId) {
            if let chosen = viewModel.designId { HolidayCardPicture.loadAhead([chosen]) }
        }
        // The card rack: the pictures at full size on the table's cloth (plan Part 5), over the shelves and a
        // collection's page alike.
        .fullScreenCover(item: $viewModel.largeDesign) { design in
            HolidayCardRack(viewModel: viewModel, cards: cards, start: design)
                .modifier(HolidayCardRackZoom(source: reduceMotion ? nil : viewModel.rackZoomSource))
        }
        // Opened another way next time ("See it larger"): today's opening, unless a card is tapped again.
        .onChange(of: viewModel.largeDesign) { _, open in
            guard open == nil else { return }
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 700_000_000)
                if viewModel.largeDesign == nil { viewModel.rackZoomSource = nil }
            }
        }
    }

    // MARK: One from each collection

    private var openingLabel: some View {
        Text("One from each collection")
            .font(.system(size: 12, weight: .semibold))
            .tracking(0.72)
            .textCase(.uppercase)
            .foregroundStyle(HolidayCardDesk.soft(scheme))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Spacing.s1)
            .padding(.bottom, Spacing.s2)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("sendCardOpeningLabel")
    }

    private func openingRow(
        _ picks: [ShelfPick],
        sizes: HolidayCardShelfSizes,
        toShelf: @escaping (HolidayCardCollection) -> Void
    ) -> some View {
        HolidayCardShelfRow(
            viewModel: viewModel,
            rowId: "picks",
            bleed: bleed,
            spacing: widePage ? HolidayCardPad.gap : 14,
            ids: picks.map(\.id)
        ) {
            ForEach(picks) { pick in
                let collection = pick.collection
                let design = pick.design
                let all = cards.designs(in: collection)
                VStack(spacing: Spacing.s1) {
                    cardButton(design, in: collection, all: all, width: sizes.opening, sharp: true)
                    Button { toShelf(collection) } label: {
                        Text("\(collection.name) · \(all.count) cards ›")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(HolidayCardDesk.wax(scheme))
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, minHeight: 32)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(collection.name), \(all.count) cards")
                    .accessibilityHint("Goes to its shelf.")
                    .accessibilityIdentifier("sendCardOpeningShelf.\(collection.id)")
                }
                .frame(width: sizes.opening)
            }
        }
        .padding(.bottom, Spacing.s3)
    }

    // MARK: A shelf

    private func shelf(_ collection: HolidayCardCollection, sizes: HolidayCardShelfSizes) -> some View {
        let all = cards.designs(in: collection)
        // The first 10, and the chosen card when it's further along: after the tenth, before "See all" (the B6
        // addition of Nov 21), so it shows ticked on its shelf and the row opens at it.
        let chosenLater = viewModel.designId.flatMap { id in all.dropFirst(Self.rowLength).first { $0.id == id } }
        let shown = Array(all.prefix(Self.rowLength)) + (chosenLater.map { [$0] } ?? [])
        return VStack(alignment: .leading, spacing: Spacing.s0) {
            // On an iPad page the line keeps to the page's margins, as the shelf under it does.
            Rectangle()
                .fill(MailPaper.cardRowLine)
                .frame(height: 1)
                .padding(.leading, widePage ? 0 : -bleed.leading)
                .padding(.trailing, widePage ? 0 : -bleed.trailing)
                .accessibilityHidden(true)
                // Where the page scrolls to for this shelf (on a view inside it: the scroll reader finds those).
                .id(Self.shelfId(collection.id))
            HStack(alignment: .bottom, spacing: Spacing.s2) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(collection.name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(HolidayCardDesk.text(scheme))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    if !collection.line.isEmpty {
                        Text(collection.line)
                            .font(.system(size: 13))
                            .foregroundStyle(HolidayCardDesk.muted(scheme))
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Button { open(collection) } label: {
                    Text("All \(all.count) ›")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(HolidayCardDesk.wax(scheme))
                        .fixedSize()
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.bottom, -Spacing.s3)
                .accessibilityLabel("All \(all.count) cards in \(collection.name)")
                .accessibilityIdentifier("sendCardShelfAll.\(collection.id)")
            }
            .padding(.top, 14)
            .padding(.bottom, 10)
            HolidayCardShelfRow(
                viewModel: viewModel,
                rowId: collection.id,
                bleed: bleed,
                spacing: widePage ? HolidayCardPad.gap : Spacing.s3,
                ids: shown.map(\.id)
            ) {
                ForEach(shown) { design in
                    cardButton(design, in: collection, all: all, width: sizes.shelf, loads: near.contains(collection.id))
                }
                // More than a row's worth: a last tile of the same size opens the collection's page.
                if all.count > Self.rowLength {
                    seeAll(collection, count: all.count, width: sizes.shelf)
                }
            }
            .padding(.bottom, Spacing.s4)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(Self.shelfId(collection.id))
    }

    /// "See all 31": a card-sized tile at a row's end.
    private func seeAll(_ collection: HolidayCardCollection, count: Int, width: CGFloat) -> some View {
        Button { open(collection) } label: {
            Text("See all \(count)")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(MailPaper.wax)
                .multilineTextAlignment(.center)
                .padding(Spacing.s3)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(MailPaper.cardField, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .strokeBorder(MailPaper.cardFieldEdge, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                )
                .frame(width: width)
                // On an iPad page, the cards' own frame.
                .aspectRatio(widePage ? HolidayCardPad.frameAspect : 15 / 16, contentMode: .fit)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .id("sendCardSeeAll.\(collection.id)")
        .accessibilityLabel("See all \(count) cards in \(collection.name)")
        .accessibilityIdentifier("sendCardSeeAll.\(collection.id)")
    }

    /// A collection's page, over the shelves (card shelves B4).
    private func open(_ collection: HolidayCardCollection) {
        if reduceMotion {
            viewModel.shelfPage = collection.id
        } else {
            withAnimation(.easeInOut(duration: 0.3)) { viewModel.shelfPage = collection.id }
        }
    }

    // MARK: A card

    /// A card in a row: a tap opens the card rack at it, among all its collection's cards. VoiceOver reads its caption
    /// and its place in the collection.
    private func cardButton(
        _ design: HolidayCardDesign,
        in collection: HolidayCardCollection,
        all: [HolidayCardDesign],
        width: CGFloat,
        sharp: Bool = false,
        loads: Bool = true
    ) -> some View {
        let selected = design.id == viewModel.designId
        let place = (all.firstIndex(of: design) ?? 0) + 1
        let zoomID = "\(sharp ? "picks" : collection.id)/\(design.id)"
        return Button {
            viewModel.rackZoomSource = zoomID
            viewModel.largeDesign = design
        } label: {
            HolidayCardTile(
                design: design,
                selected: selected,
                sharp: sharp,
                strongCaption: sharp,
                // On an iPad page the large cards keep two lines too, so their links line up.
                reservesTwoLines: !sharp || widePage,
                loads: loads,
                zoomID: zoomID,
                frameAspect: widePage ? HolidayCardPad.frameAspect : nil
            )
            .frame(width: width)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .modifier(HolidayCardHoldPreview(design: design) { viewModel.largeDesign = design })
        .accessibilityLabel(design.caption)
        .accessibilityValue(sharp ? "\(collection.name), \(place) of \(all.count)" : "\(place) of \(all.count)")
        .accessibilityHint("Shows it large.")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier(sharp ? "sendCardPick.\(design.id)" : "sendCardDesign.\(design.id)")
    }
}

/// The card rack grows out of the card tapped on the card shelves and shrinks back into it (iOS 18's zoom; card shelves
/// B8); opened any other way, or with Reduce Motion, it opens as it always has. It still closes only by ✕ or "Write on
/// this card", which choose the card seen last: the zoom's drag down to close would leave without choosing.
struct HolidayCardRackZoom: ViewModifier {
    let source: String?

    func body(content: Content) -> some View {
        if let source {
            content
                .itemZoomDestination(.card, id: source)
                .interactiveDismissDisabled()
        } else {
            content
        }
    }
}

/// One row of cards that scrolls sideways and settles on a card's leading edge, out to the screen's edges with its
/// first card at the column's edge, so the next card always peeks in. It keeps where it was scrolled while the flow
/// is on Pick a card; back from step 3 it shows the chosen card when it's in the row.
struct HolidayCardShelfRow<Content: View>: View {
    let viewModel: HolidayCardFlowViewModel
    let rowId: String
    let bleed: HolidayCardShelfBleed
    let spacing: CGFloat
    @ViewBuilder let content: Content
    @State private var position: String?

    init(
        viewModel: HolidayCardFlowViewModel,
        rowId: String,
        bleed: HolidayCardShelfBleed,
        spacing: CGFloat,
        ids: [String],
        @ViewBuilder content: () -> Content
    ) {
        self.viewModel = viewModel
        self.rowId = rowId
        self.bleed = bleed
        self.spacing = spacing
        self.content = content()
        let chosen = viewModel.designId.flatMap { ids.contains($0) ? $0 : nil }
        _position = State(initialValue: viewModel.shelfRowPlaces[rowId] ?? chosen)
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(alignment: .top, spacing: spacing) {
                content
            }
            .scrollTargetLayout()
            // Room for the cards' shadows.
            .padding(.vertical, 6)
        }
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition(id: $position, anchor: .leading)
        .contentMargins(.leading, bleed.leading, for: .scrollContent)
        .contentMargins(.trailing, bleed.trailing, for: .scrollContent)
        .padding(.leading, -bleed.leading)
        .padding(.trailing, -bleed.trailing)
        // Not on under the closed iPhone Duo's clock and Wi-Fi beside the screen.
        .stopsBeforeOcclusion()
        .onChange(of: position) { viewModel.shelfRowPlaces[rowId] = position }
    }
}

/// Press and hold a card on the card shelves for a large preview of it (card shelves B8), with "See it larger" under it
/// (the card rack). The picture itself once it's at hand, over its smaller copy.
struct HolidayCardHoldPreview: ViewModifier {
    let design: HolidayCardDesign
    let onLarger: () -> Void

    func body(content: Content) -> some View {
        content.contextMenu {
            Button("See it larger", action: onLarger)
        } preview: {
            HolidayCardPictureView(design: design.id, paper: design.paper, height: design.height, thumb: true)
                .overlay {
                    HolidayCardPictureImage(design: design.id) { image in
                        if let image {
                            Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
                        }
                    }
                }
                .clipped()
                .frame(width: 340)
        }
    }
}
