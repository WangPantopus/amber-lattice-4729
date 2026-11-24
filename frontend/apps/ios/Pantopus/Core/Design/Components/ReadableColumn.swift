//
//  ReadableColumn.swift
//  Pantopus
//
//  Screens keep a readable width on a wide screen (founder, 2026-11-01). Open,
//  the iPhone Duo's inner screen is about 950 pt wide, and a phone layout
//  stretched across it runs every card and line edge to edge, which Apple's
//  guidelines name as the thing to avoid ("You don't want just a stretched out
//  iPhone app"). This keeps the content in a centered column of Apple's reading
//  width by padding the safe area: the content moves in, while backgrounds,
//  maps and anything else that ignores the safe area still fill the screen. On
//  a phone the reading width is wider than the screen, so nothing changes.
//
//  It goes inside a navigation stack, on the stack's first screen and on each
//  pushed screen: padding added outside a stack doesn't reach the screens in
//  it, and a stack narrowed from outside keeps an empty strip for the Duo's
//  side controls inside the column. Full width, the stack's controls join the
//  Duo's side strip, as Apple places them.
//
//  A screen that lays out its own readable columns where the screen is wide
//  enough (Place and Today, `PlaceColumns`) says from which width; there the
//  column leaves it the screen's whole width.
//
//  A screen that is one column of fields and buttons (sign-in, the Place
//  launch) can keep its column beside the Duo's fold: half folded like a book,
//  the fold runs down the middle of the column and its buttons sit on the
//  crease. There the column takes the larger page beside the fold instead, as
//  the founder chose for bottom buttons (`besideFold()`, 2026-11-05), and
//  backgrounds still fill the screen.
//

import SwiftUI

public extension View {
    /// Keeps this screen's content in a centered column no wider than the reading width. Put it on a navigation
    /// stack's first screen and on the screens its `navigationDestination` pushes, or on the root of a screen
    /// that has no stack (a signed-out screen, a full-screen cover).
    @MainActor func readableColumn() -> some View {
        modifier(ReadableColumn())
    }

    /// The same, in a narrower column: `width` at the default text size. For a screen of cards that carry
    /// pictures (Today's Around you and its post page), where the reading width's cards run the open iPhone Duo's
    /// whole upright screen with pictures to match.
    @MainActor func readableColumn(width: CGFloat) -> some View {
        modifier(ReadableColumn(width: width))
    }

    /// Keeps a prompt or form inside a full-screen cover (a card between spacers, under the cover's own Close) no
    /// wider than the reading width, centered in the room it is offered. On a phone the reading width is wider than
    /// the screen, so nothing changes.
    @MainActor func readableWidth() -> some View {
        modifier(ReadableWidth())
    }

    /// For a screen inside `readableColumn()` that lays out its own readable columns on a wide screen: where the
    /// screen is at least `width` wide, the column leaves this screen the whole width.
    func readableColumnWidens(from width: CGFloat) -> some View {
        preference(key: ReadableColumnWidensKey.self, value: width)
    }

    /// For a screen inside `readableColumn()` that is one column of fields and buttons: while the iPhone Duo is half
    /// folded like a book, with the fold down through the column, the column takes the larger page beside the fold
    /// (the left one) instead of running across it. Everywhere else the column is as before.
    func readableColumnBesideFold() -> some View {
        preference(key: ReadableColumnBesideFoldKey.self, value: true)
    }

    /// A screen's own top bar (its Back or Close, title and buttons) on an iPad: it runs the window's whole width
    /// instead of the reading column's, so Back sits in the window's top-left corner and the buttons in its top-right,
    /// where the system's bar puts them, while the content below stays in the column (founder, 2026-11-23: "the left up
    /// arrow button in the middle of the up screen instead of left up corner"). Put it on the bar itself, inside the
    /// screen. Phones and the iPhone Duo keep the bar in the column, as before.
    func topBarSpansWindow() -> some View {
        modifier(TopBarSpansWindow())
    }
}

/// The room the reading column leaves on each side of a screen in it, on an iPad; zero elsewhere and outside a column.
struct ReadableColumnInsets: Equatable {
    var leading: CGFloat = 0
    var trailing: CGFloat = 0
    /// The space the column is centered in, in the window's coordinates: a bar spans out to its edges.
    var space: CGRect = .zero

    static let zero = ReadableColumnInsets()

    /// The column's own frame in the window.
    var column: CGRect {
        CGRect(x: space.minX + leading, y: space.minY, width: max(0, space.width - leading - trailing), height: space.height)
    }
}

private struct ReadableColumnInsetsKey: EnvironmentKey {
    static let defaultValue = ReadableColumnInsets.zero
}

extension EnvironmentValues {
    /// The room the reading column around this screen leaves on each side, on an iPad (`topBarSpansWindow()`).
    var readableColumnInsets: ReadableColumnInsets {
        get { self[ReadableColumnInsetsKey.self] }
        set { self[ReadableColumnInsetsKey.self] = newValue }
    }
}

private struct TopBarSpansWindow: ViewModifier {
    @Environment(\.readableColumnInsets) private var insets
    /// The bar's frame in the window, as the screen lays it out (before it reaches outward).
    @State private var frame: CGRect = .zero

    func body(content: Content) -> some View {
        let reach = reach
        // Outward to the edges of the space the column is centered in: the bar lays out across the window, the screen
        // around it keeps the column's width.
        content
            .padding(.leading, -reach.leading)
            .padding(.trailing, -reach.trailing)
            // Measured outside the reach, so reaching never changes the frame it comes from.
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame = $0 }
    }

    /// How far the bar reaches out on each side: to the space's edges while the bar runs (nearly) the column's width
    /// inside it, as a screen's bar does. Nothing for a bar elsewhere: a sheet or a card shown from the screen gets
    /// the screen's environment, but not its column.
    private var reach: (leading: CGFloat, trailing: CGFloat) {
        let column = insets.column
        guard insets.leading > 0 || insets.trailing > 0, column.width > 0, frame.width > 0 else { return (0, 0) }
        let slack: CGFloat = 32
        let inColumn = frame.minX >= column.minX - 1 && frame.maxX <= column.maxX + 1
            && frame.minX - column.minX <= slack && column.maxX - frame.maxX <= slack
        guard inColumn else { return (0, 0) }
        return (frame.minX - insets.space.minX, insets.space.maxX - frame.maxX)
    }
}

/// The narrowest screen width at which a screen inside the column lays out its own columns; nil for none.
private struct ReadableColumnWidensKey: PreferenceKey {
    static let defaultValue: CGFloat? = nil

    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) {
        if let next = nextValue() { value = min(value ?? next, next) }
    }
}

/// Whether a screen inside the column keeps it beside a fold that runs down through it.
private struct ReadableColumnBesideFoldKey: PreferenceKey {
    static let defaultValue = false

    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = value || nextValue()
    }
}

private struct ReadableWidth: ViewModifier {
    /// The reading width at the default text size; it grows with larger text, as the column's does.
    @ScaledMetric private var width: CGFloat

    @MainActor init() {
        _width = ScaledMetric(wrappedValue: ReadableColumn.defaultWidth, relativeTo: .body)
    }

    func body(content: Content) -> some View {
        content.frame(maxWidth: width)
    }
}

private struct ReadableColumn: ViewModifier {
    /// Apple's readable content width at the default text size (UIKit's `readableContentGuide`); it grows with
    /// larger text, so the lines keep about the same number of words.
    @ScaledMetric private var readableWidth: CGFloat
    @State private var widensFrom: CGFloat?
    @State private var besideFold = false
    /// The Duo's fold while it is half folded across the screen, with the room to keep clear beside it; nil
    /// otherwise.
    @State private var fold: CGRect?

    /// Apple's readable content width at the default text size.
    static let readingWidth: CGFloat = 672

    /// The column on an iPad at the default text size: wider than the reading width, so a screen of cards and rows
    /// takes more of a big window (founder, 2026-11-23: the sides were "waste area"). Text inside cards keeps its own
    /// padding, so lines stay readable.
    static let padWidth: CGFloat = 840

    /// The column's width at the default text size on this device.
    @MainActor static var defaultWidth: CGFloat {
        WideLayout.isPad ? padWidth : readingWidth
    }

    /// A screen's own narrower column (`readableColumn(width:)`) keeps its width; the default column is the device's.
    @MainActor init(width: CGFloat? = nil) {
        _readableWidth = ScaledMetric(wrappedValue: width ?? ReadableColumn.defaultWidth, relativeTo: .body)
    }

    func body(content: Content) -> some View {
        // The width is read in the layout pass that uses it. Kept in @State from `onGeometryChange`, it arrived a pass
        // late: unfolding the Duo laid the screen out once at the whole new width first, which clamped a horizontal
        // scroller's offset (Today's hourly strip lost five hours) and could move a page near its end. Measured
        // outside the padding, so the inset never feeds back into the width it comes from. The screen sits inside the
        // safe area already (the Duo's side controls are outside it), so its width is the room the column centers in.
        GeometryReader { proxy in
            let insets = sideInsets(in: proxy.size.width)
            content
                .safeAreaPadding(EdgeInsets(top: 0, leading: insets.leading, bottom: 0, trailing: insets.trailing))
                .environment(
                    \.readableColumnInsets,
                    WideLayout.isPad
                        ? ReadableColumnInsets(
                            leading: insets.leading,
                            trailing: insets.trailing,
                            space: proxy.frame(in: .global)
                        )
                        : .zero
                )
                // Centered, as the screen is without the reader.
                .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .readsActiveFold($fold)
        .onPreferenceChange(ReadableColumnWidensKey.self) { widensFrom = $0 }
        .onPreferenceChange(ReadableColumnBesideFoldKey.self) { besideFold = $0 }
    }

    /// The room on each side of the column in a screen this wide: the reading width centered in the screen, or, for
    /// a screen kept beside the fold, in the larger page beside a fold that runs down through it (the leading one
    /// when they match, as `besideFold()` picks); none where the screen lays out its own columns.
    private func sideInsets(in width: CGFloat) -> (leading: CGFloat, trailing: CGFloat) {
        if besideFold, let fold, fold.height > fold.width, fold.minX > 0, fold.maxX < width {
            let page = fold.minX >= width - fold.maxX ? 0...fold.minX : fold.maxX...width
            let inset = sideInset(in: page.upperBound - page.lowerBound)
            return (page.lowerBound + inset, width - page.upperBound + inset)
        }
        if let widensFrom, width >= widensFrom { return (0, 0) }
        let inset = sideInset(in: width)
        return (inset, inset)
    }

    /// The room on each side of the reading width in a space this wide.
    private func sideInset(in width: CGFloat) -> CGFloat {
        max(0, ((width - readableWidth) / 2).rounded(.down))
    }
}
