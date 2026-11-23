//
//  SheetFitsContent.swift
//  Pantopus
//
//  A short sheet is as tall as what it says, on an iPad. iPadOS shows a sheet
//  with detents along the bottom of the screen, and on an iPad's tall screen
//  the half-screen detent (`.medium`) left most of a short sheet empty: "Your
//  daily briefings" was two-thirds blank on a 13-inch iPad. In a regular-width
//  iPad window the sheet is a form sized to its content instead (Apple's fitted
//  sizing: a card in the middle of the window, which scrolls when the content
//  is taller than the window). A card in the middle of the window isn't dragged
//  down from an edge, so it shows no drag handle. In a narrow iPad window
//  sheets are phone sheets again, so they keep their detents and handle there,
//  as iPhones (the iPhone Duo included) always do.
//

import SwiftUI
import UIKit

public extension View {
    /// In place of `presentationDetents(_:)` and `presentationDragIndicator(_:)` on a sheet: in a regular-width iPad
    /// window the sheet is sized to its content, with no drag handle; elsewhere it keeps `detents` and `dragIndicator`.
    func presentationDetentsFittingContentOnIPad(
        _ detents: Set<PresentationDetent>,
        dragIndicator: Visibility = .automatic
    ) -> some View {
        modifier(SheetFitsContentOnIPad(detents: detents, dragIndicator: dragIndicator))
    }
}

public extension EnvironmentValues {
    /// The sheet this view is in is a card in the middle of an iPad window (`presentationDetentsFittingContentOnIPad`):
    /// a drag handle the sheet draws itself hides, as the system's does.
    @Entry var sheetIsFittedCard = false
}

private struct SheetFitsContentOnIPad: ViewModifier {
    let detents: Set<PresentationDetent>
    let dragIndicator: Visibility
    /// The sheet's own width class changes when the window is resized across the regular/compact line (a form sheet
    /// becomes a phone sheet): reading it makes the choice below again.
    @Environment(\.horizontalSizeClass) private var sheetWidthClass

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *), fitsContent(sheetWidthClass) {
            content
                .environment(\.sheetIsFittedCard, true)
                .presentationSizing(.form.fitted(horizontal: false, vertical: true))
                .presentationDragIndicator(.hidden)
        } else {
            content
                .presentationDetents(detents)
                .presentationDragIndicator(dragIndicator)
        }
    }

    /// An iPad whose app window is regular width. The sheet's own width class isn't the window's: a form sheet can be compact
    /// inside a regular window.
    private func fitsContent(_: UserInterfaceSizeClass?) -> Bool {
        guard UIDevice.current.userInterfaceIdiom == .pad else { return false }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        return scene?.traitCollection.horizontalSizeClass != .compact
    }
}
