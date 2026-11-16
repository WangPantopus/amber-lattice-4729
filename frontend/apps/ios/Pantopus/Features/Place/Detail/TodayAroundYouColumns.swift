//
//  TodayAroundYouColumns.swift
//  Pantopus
//
//  Today's Around you on the iPhone Duo's open screen (founder, 2026-11-15:
//  "whether it's folded, unfolded level, unfolded upright, let's make sure
//  every layout is great"). Held sideways, the inner screen holds two
//  phone-wide pages: the list of posts is the page left of the hinge, under
//  Today's title and its At home | Around you switch, and the open post is the
//  page right of it, as Pulse shows a post beside its feed and as At home
//  keeps each of its two columns on its own side of the hinge
//  (`PlaceColumns`). Nothing is drawn across the hinge, flat or half folded
//  like a book. Before a post is picked the page says where to tap: it never
//  opens one by itself, because opening a post counts a view.
//
//  Everywhere else (a phone, the closed Duo, the open Duo upright) the list
//  is one column and a post is pushed over it. Upright that column is a
//  phone's reading width, centered (`readingWidth`).
//
//  The open post's model and what it presents live in `TodayAroundYouModel`,
//  so a fold or a turn moves the post between the stack and the page beside
//  the list with its reply and its place as they were, and the picture viewer
//  or the story sheet still open.
//

import Observation
import SwiftUI
import UIKit

/// Where Around you's two pages go, in Today's screen coordinates.
struct TodayAroundYouColumns: Equatable {
    /// The list's and the post page's width where the screen is wider than this and holds one column: about the
    /// widest iPhone's card and a quarter, so a picture is no taller than it is on that phone turned up a size.
    static let readingWidth: CGFloat = 560
    /// The narrowest a page gets: narrower than this, a post's page is tighter than on the smallest iPhone sold.
    static let minimumPage: CGFloat = 360
    /// The narrowest screen that holds both pages.
    static var minimumScreenWidth: CGFloat {
        2 * minimumPage
    }

    let leadingWidth: CGFloat
    let trailingX: CGFloat
    let trailingWidth: CGFloat

    /// Two pages, each on its own side of the hinge where one runs down the screen and leaves both room; else
    /// halves. Nil where two don't fit.
    init?(width: CGFloat, hinge: PlaceHinge?) {
        guard width >= Self.minimumScreenWidth else { return nil }
        if let hinge, hinge.minX >= Self.minimumPage, width - hinge.maxX >= Self.minimumPage {
            leadingWidth = hinge.minX
            trailingX = hinge.maxX
            trailingWidth = width - hinge.maxX
        } else {
            let half = (width / 2).rounded(.down)
            leadingWidth = half
            trailingX = half
            trailingWidth = width - half
        }
    }
}

/// The room Today's screens have: their width and the hinge down them. Read around Today's stack, not inside a
/// screen of it: a screen under a pushed one is not laid out, and one coming back from under a pushed one reports
/// its old width first, which moved an open post onto the stack and off it again on an unfold and closed it.
@Observable
@MainActor
final class TodayScreenSpace {
    var width: CGFloat = 0
    var hinge: PlaceHinge?
    /// A fold or a turn is under way: the screens are on their way to their new size. Around you moves its open
    /// post only once it is over.
    private(set) var isMoving = false
    @ObservationIgnored private var move = 0

    /// The longest a fold or a turn is waited for, should its end never be reported.
    private static let longestMove: Duration = .milliseconds(1500)
    /// How long after a fold or a turn ends the screens are given to settle: a reply box made the moment the
    /// animation ended sometimes lost the keyboard again as the window finished moving.
    private static let settling: Duration = .milliseconds(250)

    func moveBegan() {
        move += 1
        isMoving = true
        let began = move
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: Self.longestMove)
            guard let self, move == began else { return }
            isMoving = false
        }
    }

    func moveEnded() {
        move += 1
        let ended = move
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: Self.settling)
            guard let self, move == ended else { return }
            isMoving = false
        }
    }
}

private struct TodayScreenSpaceKey: EnvironmentKey {
    static var defaultValue: TodayScreenSpace? {
        nil
    }
}

extension EnvironmentValues {
    /// The room Today's screens have (`TodayTabRoot` reads it); nil outside the Today tab.
    var todayScreenSpace: TodayScreenSpace? {
        get { self[TodayScreenSpaceKey.self] }
        set { self[TodayScreenSpaceKey.self] = newValue }
    }
}

/// Reads the room the Today tab's screens have into `space`. It sits behind the tab's stack, inside the safe area
/// as the stack's screens are, so its width is theirs and the hinge is where they see it.
struct TodayScreenSpaceReader: View {
    let space: TodayScreenSpace

    var body: some View {
        Color.clear
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
                if space.width != width { space.width = width }
            }
            .readsPlaceHinge(Binding(
                get: { space.hinge },
                set: { hinge in if space.hinge != hinge { space.hinge = hinge } }
            ))
            .background { ScreenMoveWatcher(space: space) }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// Tells `space` when a fold or a turn begins and ends: UIKit announces a screen's change of size before it
/// happens and says when its animation is over.
private struct ScreenMoveWatcher: UIViewControllerRepresentable {
    let space: TodayScreenSpace

    func makeUIViewController(context _: Context) -> Controller {
        Controller(space: space)
    }

    func updateUIViewController(_: Controller, context _: Context) {}

    final class Controller: UIViewController {
        private let space: TodayScreenSpace

        init(space: TodayScreenSpace) {
            self.space = space
            super.init(nibName: nil, bundle: nil)
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            nil
        }

        override func loadView() {
            view = UIView()
            view.isUserInteractionEnabled = false
        }

        override func viewWillTransition(to size: CGSize, with coordinator: any UIViewControllerTransitionCoordinator) {
            super.viewWillTransition(to: size, with: coordinator)
            space.moveBegan()
            coordinator.animate(alongsideTransition: nil) { [space] _ in
                Task { @MainActor in space.moveEnded() }
            }
        }
    }
}

/// The page beside Around you's list: the open post with its replies, or where to tap before one is picked.
struct TodayAroundYouPostColumn: View {
    let model: TodayAroundYouModel

    var body: some View {
        Group {
            if let postId = model.openedPostId {
                PostPageDestination(
                    postId: postId,
                    currentUserId: model.viewerId ?? "",
                    viewModel: model.model(forPost: postId)
                ) {
                    model.closePost()
                } onOpenProfile: { userId in
                    DeepLinkRouter.shared.handle(path: "/u/\(userId)")
                } onEdit: { _ in }
                    // The list beside it is the way back.
                    .environment(\.pulsePostShowsBack, false)
                    // Made once more when the reply box lost its keyboard in a fold (`giveKeyboardAgainIfLost`).
                    .id(model.postScreen)
            } else {
                PulsePostPlaceholder(message: "Tap a post to read it and its replies here.")
            }
        }
        .background(Theme.Color.appBg)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("aroundYouPostColumn")
    }
}
