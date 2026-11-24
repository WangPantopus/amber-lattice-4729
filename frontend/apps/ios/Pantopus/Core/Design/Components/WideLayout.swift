//
//  WideLayout.swift
//  Pantopus
//
//  Screens laid out for an iPad's big window (founder, 2026-11-23: "take
//  advantage of the iPad screen", "left side and right side of the screen are
//  not used, waste area"). A screen of sections puts them in two columns
//  side by side where an iPad window holds two phone-wide columns, and in its
//  one written order everywhere else: phones, the iPhone Duo (whose own
//  two-column screens, Place and Today, keep `PlaceColumns`), a narrow iPad
//  window beside another app, and the accessibility text sizes (as Messages
//  does). The sections are the same views either way, so turning the iPad or
//  resizing the window keeps what is open, scrolled to and typed.
//
//  It reuses Place and Today's two-column layout (`PlaceColumnsLayout`): each
//  section says which column it goes in with `placeColumn(_:order:)`.
//

import SwiftUI
import UIKit

@MainActor
enum WideLayout {
    /// An iPad. The iPad layouts are drawn for its windows; the iPhone Duo keeps the layouts drawn and checked for it.
    static var isPad: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }

    /// The narrowest column of two: an iPhone's content width, where every section already fits.
    static let minimumColumn: CGFloat = 360
    /// Between the two columns.
    static let gap = Spacing.s5
    /// The screen's margin each side of the two columns.
    static let margin = Spacing.s5

    /// The narrowest window that holds two columns with the margins: the screen asks the reading column around it for
    /// the window's whole width from there (`wideColumnsScreen()`).
    static var minimumScreenWidth: CGFloat {
        2 * minimumColumn + gap + 2 * margin
    }

    /// Whether a screen this wide, on this device at this text size, lays its sections out in two columns.
    static func splits(width: CGFloat, dynamicTypeSize: DynamicTypeSize) -> Bool {
        isPad && !dynamicTypeSize.isAccessibilitySize && width >= minimumScreenWidth
    }
}

private struct WideColumnsSplitKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// The screen's sections are in two columns (`WideColumns`): for a section that draws differently there.
    var wideColumnsSplit: Bool {
        get { self[WideColumnsSplitKey.self] }
        set { self[WideColumnsSplitKey.self] = newValue }
    }
}

/// A screen's sections in two columns on an iPad window wide enough for two phone-wide columns, else one column in the
/// written order. Each section names its column with `placeColumn(_:order:)`; a section without one goes in the leading
/// column. Put it inside the screen's scroll view, in place of the stack that held the sections, and put
/// `wideColumnsScreen()` on the screen so the reading column gives it the window's width.
struct WideColumns<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var width: CGFloat = 0

    var body: some View {
        let allowed = WideLayout.isPad && !dynamicTypeSize.isAccessibilitySize
        // The layout splits wherever two columns fit in its own width; the flag says whether they do now.
        let splits = allowed && width >= 2 * WideLayout.minimumColumn + WideLayout.gap
        PlaceColumnsLayout(splits: allowed, hinge: nil, gap: WideLayout.gap, minimumColumn: WideLayout.minimumColumn) {
            content()
        }
        .environment(\.wideColumnsSplit, splits)
        .environment(\.placeColumnsSplit, splits)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    }
}

extension View {
    /// For a screen whose sections are in `WideColumns`: on an iPad window wide enough for two columns, the reading
    /// column leaves it the window's whole width (its two columns are the readable widths). Elsewhere the screen keeps
    /// the reading column.
    @MainActor func wideColumnsScreen() -> some View {
        readableColumnWidens(from: WideLayout.isPad ? WideLayout.minimumScreenWidth : .infinity)
    }

    /// The screen's side margins around `WideColumns` where it has two columns, else `narrow` (the screen's one-column
    /// margin).
    func wideColumnsMargins(_ narrow: CGFloat = Spacing.s4) -> some View {
        modifier(WideColumnsMargins(narrow: narrow))
    }
}

private struct WideColumnsMargins: ViewModifier {
    let narrow: CGFloat
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var width: CGFloat = 0

    func body(content: Content) -> some View {
        let wide = WideLayout.splits(width: width, dynamicTypeSize: dynamicTypeSize)
        content
            .padding(.horizontal, wide ? WideLayout.margin : narrow)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    }
}
