//
//  HolidayCardCollectionPage.swift
//  Pantopus
//
//  A collection's page on the card shelves (server switch `card_shelves`, card shelves B4), opened from "All 15 ›" or
//  "See all 15" inside Pick a card: its name in the card serif, its line, then all its cards two across in the grid's
//  tiles. Christmas with Jesus Christ has parts: a row of pills under the title row, staying there while the page
//  scrolls; a tap goes to that part, and the part in view is the wax-red one. Back returns to the shelves where they
//  were. It lies over the shelves, so they keep their place under it.
//

import SwiftUI

struct HolidayCardCollectionPage: View {
    @Bindable var viewModel: HolidayCardFlowViewModel
    let cards: HolidayCardsResponse
    let collection: HolidayCardCollection
    @State private var width: CGFloat = 402
    /// The parts whose name has gone up under the pills: the last of them is the one in view.
    @State private var passed: Set<Int> = []
    /// The pills' height, which a part's place keeps clear of, and the page's.
    @State private var pillsHeight: CGFloat = 60
    @State private var pageHeight: CGFloat = 700
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static func partId(_ index: Int) -> String {
        "sendCardPart.\(index)"
    }

    var body: some View {
        let all = cards.designs(in: collection)
        let parts = collection.parts.filter { part in part.designs.contains { id in all.contains { $0.id == id } } }
        let column = min(width - Spacing.s8, 560)
        let columns = Self.columns(column: column, screen: width)
        ScrollViewReader { scroller in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Spacing.s0, pinnedViews: [.sectionHeaders]) {
                    heading
                    if parts.isEmpty {
                        grid(all, all: all, columns: columns)
                            .padding(.top, Spacing.s3)
                    } else {
                        Section {
                            // One plain stack of the parts, so a pill can bring the page to a part not seen yet.
                            VStack(alignment: .leading, spacing: Spacing.s0) {
                                ForEach(Array(parts.enumerated()), id: \.element.id) { index, part in
                                    partBlock(part, index: index, all: all, columns: columns)
                                }
                            }
                        } header: {
                            pills(parts, scroller: scroller)
                        }
                    }
                }
                .frame(maxWidth: column)
                .padding(.horizontal, Spacing.s4)
                .padding(.bottom, Spacing.s8)
                .frame(maxWidth: .infinity)
            }
            .coordinateSpace(.named(Self.space))
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { pageHeight = $0 }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .background(HolidayCardDesk.background(scheme).ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("sendCardCollectionPage.\(collection.id)")
    }

    private static let space = "sendCardCollectionPage"
    /// A part's name line, about.
    private static let partNameHeight: CGFloat = 20

    /// Two across, as the grid is; a wider screen adds a column only while every tile stays at least as wide as a
    /// shelf's card.
    static func columns(column: CGFloat, screen: CGFloat) -> Int {
        let shelf = HolidayCardShelfSizes(screen: screen, column: column).shelf
        var count = 2
        while (column - Spacing.s3 * CGFloat(count)) / CGFloat(count + 1) - Spacing.s1 * 2 >= shelf {
            count += 1
        }
        return count
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text(collection.name)
                .font(.system(size: 26, weight: .medium, design: .serif))
                .foregroundStyle(HolidayCardDesk.text(scheme))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("sendCardCollectionName")
            if !collection.line.isEmpty {
                Text(collection.line)
                    .font(.system(size: 15))
                    .foregroundStyle(HolidayCardDesk.muted(scheme))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("sendCardCollectionLine")
            }
        }
        .padding(.top, Spacing.s2)
        .padding(.bottom, Spacing.s2)
    }

    // MARK: Parts

    /// The parts' names as the flow's pills, staying under the title row; the part in view in wax red.
    private func pills(_ parts: [HolidayCardCollectionPart], scroller: ScrollViewProxy) -> some View {
        let current = passed.max() ?? 0
        return ScrollViewReader { row in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.s2) {
                    ForEach(Array(parts.enumerated()), id: \.element.id) { index, part in
                        HolidayCardPill(title: part.name, isOn: index == current) {
                            // The part's name just under the pills, which stay at the top: the name's top edge goes
                            // that far down the page (a scroll anchor lines up the same point of both).
                            let gap = pillsHeight + Spacing.s3
                            let anchor = UnitPoint(x: 0, y: min(0.9, gap / max(1, pageHeight - Self.partNameHeight)))
                            let move = { scroller.scrollTo(Self.partId(index), anchor: anchor) }
                            if reduceMotion { move() } else { withAnimation(.easeInOut(duration: 0.35)) { move() } }
                        }
                        .id(index)
                        .accessibilityIdentifier("sendCardPart.\(index)")
                    }
                }
                .padding(.horizontal, Spacing.s4)
            }
            .padding(.horizontal, -Spacing.s4)
            .stopsBeforeOcclusion()
            .onChange(of: current) {
                if reduceMotion {
                    row.scrollTo(current, anchor: .center)
                } else {
                    withAnimation(.easeOut(duration: 0.25)) { row.scrollTo(current, anchor: .center) }
                }
            }
        }
        .padding(.vertical, Spacing.s2)
        .background(HolidayCardDesk.background(scheme).padding(.horizontal, -Spacing.s16))
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { pillsHeight = $0 }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Parts")
        .accessibilityIdentifier("sendCardParts")
    }

    private func partBlock(
        _ part: HolidayCardCollectionPart,
        index: Int,
        all: [HolidayCardDesign],
        columns: Int
    ) -> some View {
        let designs = part.designs.compactMap { id in all.first { $0.id == id } }
        return VStack(alignment: .leading, spacing: Spacing.s0) {
            (Text(part.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(HolidayCardDesk.text(scheme))
                + Text(" · \(designs.count) cards").font(.system(size: 14)).foregroundStyle(HolidayCardDesk.muted(scheme)))
                .fixedSize(horizontal: false, vertical: true)
                // Where a tap on its pill brings the page.
                .id(Self.partId(index))
                .padding(.top, Spacing.s3)
                .padding(.bottom, Spacing.s2)
                .accessibilityAddTraits(.isHeader)
                // Gone up under the pills: this part is the one in view.
                .onGeometryChange(for: Bool.self) { proxy in
                    (proxy.frame(in: .named(Self.space)).minY) < pillsHeight + Spacing.s5
                } action: { above in
                    if above { passed.insert(index) } else { passed.remove(index) }
                }
            grid(designs, all: all, columns: columns)
        }
    }

    // MARK: The grid

    private func grid(_ designs: [HolidayCardDesign], all: [HolidayCardDesign], columns: Int) -> some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: Spacing.s3, alignment: .top), count: columns),
            spacing: Spacing.s4
        ) {
            ForEach(designs) { design in
                tile(design, all: all)
            }
        }
    }

    private func tile(_ design: HolidayCardDesign, all: [HolidayCardDesign]) -> some View {
        let selected = design.id == viewModel.designId
        let place = (all.firstIndex(of: design) ?? 0) + 1
        return Button {
            viewModel.rackZoomSource = "page/\(design.id)"
            viewModel.largeDesign = design
        } label: {
            HolidayCardTile(design: design, selected: selected, zoomID: "page/\(design.id)")
                .padding(Spacing.s1)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .modifier(HolidayCardHoldPreview(design: design) { viewModel.largeDesign = design })
        .accessibilityLabel(design.caption)
        .accessibilityValue("\(place) of \(all.count)")
        .accessibilityHint("Shows it large.")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("sendCardDesign.\(design.id)")
    }
}
