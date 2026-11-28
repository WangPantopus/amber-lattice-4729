//
//  ReinventedStudioCover.swift
//  Pantopus
//
//  The new Pulse's + opens the Studio ("Pulse, reinvented" phase 1, PHASE-1 §2.11). The Studio is presented from the
//  Pulse tab's root (`PulseTabRoot`), outside the tab's navigation stack, as the Moments tab presents it from its own
//  root: presented from inside the stack, a map opening in a sheet over the Studio (the drawer's) took the Studio's
//  view out of the window for a moment, which threw away the Studio's state and closed that sheet.
//  The Moment viewer the new Pulse opens is presented here too, for the same reason: from inside the stack, a
//  full-height sheet opened over the viewer (the field guide, a Retake) closed again right after it opened.
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

/// Who asked for the Moment viewer: the new Pulse sets `watching` (a row, a ring, a link); the Pulse tab's root presents it.
@MainActor
@Observable
final class ReinventedViewerPresenter {
    static let shared = ReinventedViewerPresenter()

    var watching: MomentsWatchSession?
    /// Counts the viewer closing.
    private(set) var closings = 0

    func close() {
        // Closing by ✕ calls this, and the cover's binding calls it again as the cover goes: count it once.
        guard watching != nil else { return }
        watching = nil
        closings += 1
        Task { await MomentsTabDot.shared.reread() }
    }
}

/// The Studio's cover and the Moment viewer's, on the Pulse tab's root.
struct ReinventedStudioCover: ViewModifier {
    @State private var presenter = ReinventedStudioPresenter.shared
    @State private var viewer = ReinventedViewerPresenter.shared
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .fullScreenCover(item: Binding(get: { presenter.composing }, set: { presenter.composing = $0 })) { request in
                MomentsComposerChoice(request: request) { presenter.close() }
            }
            // A second cover on its own (clear) view: two on one view would let only one of them present.
            .background {
                Color.clear
                    .fullScreenCover(item: Binding(get: { viewer.watching }, set: { if $0 == nil { viewer.close() } })) { session in
                        MomentsViewer(
                            session: session,
                            systemScheme: colorScheme,
                            stopsOnDisappear: true,
                            onHideAuthor: { _ in },
                            onShowAuthor: { _ in },
                            onClose: { viewer.close() }
                        )
                    }
            }
    }
}
