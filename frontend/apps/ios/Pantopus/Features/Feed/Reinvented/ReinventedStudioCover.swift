//
//  ReinventedStudioCover.swift
//  Pantopus
//
//  The new Pulse's + opens the Studio ("Pulse, reinvented" phase 1, PHASE-1 §2.11). The Studio is presented from the
//  Pulse tab's root (`PulseTabRoot`), outside the tab's navigation stack, as the Moments tab presents it from its own
//  root: presented from inside the stack, a map opening in a sheet over the Studio (the drawer's) took the Studio's
//  view out of the window for a moment, which threw away the Studio's state and closed that sheet.
//

import SwiftUI

/// Who asked for the Studio: the new Pulse's + sets `composing`; the Pulse tab's root presents it.
@MainActor
@Observable
final class ReinventedStudioPresenter {
    static let shared = ReinventedStudioPresenter()

    var composing: MomentsComposeRequest?
    /// Counts the Studio closing, so the new Pulse reads its list again.
    private(set) var closings = 0

    func close() {
        composing = nil
        closings += 1
        // What phase 3 chose in the Studio, or opened it for, goes with it.
        TogetherStudio.shared.reset()
    }
}

/// The Studio's cover, on the Pulse tab's root.
struct ReinventedStudioCover: ViewModifier {
    @State private var presenter = ReinventedStudioPresenter.shared

    func body(content: Content) -> some View {
        content.fullScreenCover(item: Binding(get: { presenter.composing }, set: { presenter.composing = $0 })) { request in
            MomentsComposerChoice(request: request) { presenter.close() }
        }
    }
}
