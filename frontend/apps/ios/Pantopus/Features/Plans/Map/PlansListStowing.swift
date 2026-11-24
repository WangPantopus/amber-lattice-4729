//
//  PlansListStowing.swift
//  Pantopus
//
//  The Plans list beside the map, put away and brought back (founder,
//  2026-11-23: "add a gesture for users to swipe left so it shows full screen
//  of the map view and can bring it back by swiping from left edge of the
//  screen to right side"). Wherever the list is a column beside the map (an
//  iPad, the iPhone Duo open sideways), a swipe to the left on the column
//  slides it off the screen's leading edge and the map has the whole screen;
//  a swipe from the screen's left edge to the right brings it back, following
//  the finger both ways. With the list away the side menu and a "Show list"
//  button float in the map's top-left corner, so the tab keeps its menu and
//  the list is a tap away too. A plan opened from the map, a link or a push
//  brings the list back with the plan in it.
//
//  A swipe on something in the column that scrolls sideways (the type chips,
//  a row of photos) scrolls it instead, and an up-and-down drag scrolls the
//  list as before.
//

import SwiftUI
import UIKit

/// How far the column follows a swipe before it settles away or back.
enum PlansListStow {
    /// A swipe this far (or a quick flick) puts the list away or brings it back; less settles where it was.
    static let threshold: CGFloat = 90
    /// A flick: the swipe's predicted end past the threshold by this much counts as quick.
    static let flick: CGFloat = 200
    /// The strip along the screen's leading edge that a swipe back starts in.
    static let edgeWidth: CGFloat = 24
    static let animation = Animation.interpolatingSpring(stiffness: 300, damping: 32)

    /// Whether a swipe that ended here (and was heading for `predicted`) completes.
    static func completes(translation: CGFloat, predicted: CGFloat) -> Bool {
        abs(translation) >= threshold || abs(predicted) >= threshold + flick
    }
}

extension View {
    /// A swipe to the left on this column puts the list away: `onChange` follows it (the distance moved left, 0 or
    /// more), `onEnd` says whether it went far enough.
    func plansListSwipesAway(
        enabled: Bool,
        onChange: @escaping @MainActor (CGFloat) -> Void,
        onEnd: @escaping @MainActor (Bool) -> Void
    ) -> some View {
        modifier(PlansListSwipeAway(enabled: enabled, onChange: onChange, onEnd: onEnd))
    }
}

private struct PlansListSwipeAway: ViewModifier {
    let enabled: Bool
    let onChange: @MainActor (CGFloat) -> Void
    let onEnd: @MainActor (Bool) -> Void

    func body(content: Content) -> some View {
        if !enabled {
            content
        } else if #available(iOS 18, *) {
            content.gesture(PlansListLeftSwipe(onChange: onChange, onEnd: onEnd))
        } else {
            content.simultaneousGesture(
                DragGesture(minimumDistance: 20)
                    .onChanged { value in
                        guard abs(value.translation.width) > abs(value.translation.height) * 1.5 else { return }
                        onChange(max(0, -value.translation.width))
                    }
                    .onEnded { value in
                        let horizontal = abs(value.translation.width) > abs(value.translation.height) * 1.5
                        onEnd(horizontal && value.translation.width < 0 && PlansListStow.completes(
                            translation: value.translation.width,
                            predicted: value.predictedEndTranslation.width
                        ))
                    }
            )
        }
    }
}

/// The swipe away, in UIKit so it starts only for a swipe to the left that is more across than down, and not on
/// something that scrolls sideways itself; the list's own scrolling goes on beside it.
@available(iOS 18, *)
private struct PlansListLeftSwipe: UIGestureRecognizerRepresentable {
    let onChange: @MainActor (CGFloat) -> Void
    let onEnd: @MainActor (Bool) -> Void

    func makeCoordinator(converter _: CoordinateSpaceConverter) -> Coordinator {
        Coordinator()
    }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let recognizer = UIPanGestureRecognizer()
        recognizer.maximumNumberOfTouches = 1
        recognizer.delegate = context.coordinator
        return recognizer
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context _: Context) {
        let moved = recognizer.translation(in: recognizer.view).x
        switch recognizer.state {
        case .began, .changed:
            onChange(max(0, -moved))
        case .ended:
            let velocity = recognizer.velocity(in: recognizer.view).x
            // About where a flick would carry it: a quarter second at the speed it was let go.
            onEnd(moved < 0 && PlansListStow.completes(translation: moved, predicted: moved + velocity * 0.25))
        case .cancelled, .failed:
            onEnd(false)
        default:
            break
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let pan = gestureRecognizer as? UIPanGestureRecognizer, let view = pan.view else { return false }
            let velocity = pan.velocity(in: view)
            guard velocity.x < 0, abs(velocity.x) > abs(velocity.y) * 1.5 else { return false }
            return !startsOnSidewaysScroller(pan.location(in: view), in: view)
        }

        /// The list scrolls up and down as before while the swipe goes on. Nothing else does: a row or button the
        /// swipe started on doesn't take it as a tap.
        func gestureRecognizer(
            _: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            other.view is UIScrollView && other is UIPanGestureRecognizer
        }

        /// Whether the swipe started on something that scrolls sideways (the type chips, a row of photos), which keeps
        /// the swipe for itself.
        private func startsOnSidewaysScroller(_ point: CGPoint, in view: UIView) -> Bool {
            var hit = view.hitTest(point, with: nil)
            while let current = hit, current !== view.window {
                if let scroller = current as? UIScrollView, scroller.isScrollEnabled,
                   scroller.contentSize.width > scroller.bounds.width + 1 {
                    return true
                }
                hit = current.superview
            }
            return false
        }
    }
}

/// The strip along the screen's leading edge, over the map, while the list is away: a swipe from it to the right
/// brings the list back, following the finger.
struct PlansListEdgePull: View {
    let onChange: @MainActor (CGFloat) -> Void
    let onEnd: @MainActor (Bool) -> Void

    var body: some View {
        Color.clear
            .frame(width: PlansListStow.edgeWidth)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 8, coordinateSpace: .global)
                    .onChanged { onChange(max(0, $0.translation.width)) }
                    .onEnded { value in
                        onEnd(value.translation.width > 0 && PlansListStow.completes(
                            translation: value.translation.width,
                            predicted: value.predictedEndTranslation.width
                        ))
                    }
            )
            .ignoresSafeArea()
            .accessibilityHidden(true)
    }
}

/// The side menu and "Show list", floating in the map's top-left corner while the list is away.
struct PlansListStowedControls: View {
    let onShowList: @MainActor () -> Void

    var body: some View {
        HStack(spacing: Spacing.s2) {
            NavigationMenuButton(accessibilityIdentifier: "plans.menu", floating: true)
            Button(action: onShowList) {
                HStack(spacing: Spacing.s2) {
                    Icon(.panelLeft, size: 18, strokeWidth: 2, color: Theme.Color.appText)
                    Text("Show list")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.appText)
                }
                .padding(.horizontal, Spacing.s4)
                .frame(height: 48)
                .background(Capsule().fill(.regularMaterial))
                .shadow(color: .black.opacity(0.12), radius: 5, x: 0, y: 2)
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Brings the list of plans back beside the map")
            .accessibilityIdentifier("plans.showList")
        }
        .padding(.leading, Spacing.s4)
        .padding(.top, Spacing.s2)
        // Its own ids, not the tab root's around it.
        .accessibilityElement(children: .contain)
    }
}
