//
//  PlanTapObserver.swift
//  Pantopus
//
//  Tells a view that it was tapped without taking the tap. The system's
//  graphical date picker keeps its own touches (SwiftUI gestures on it never
//  fire), and a tap on its month name swaps the days for the month and year
//  wheels in the same space: the Repeats screen uses this to bring the whole
//  picker above Done whenever it is tapped (the founder's check of 2026-11-15).
//

import SwiftUI
import UIKit.UIGestureRecognizerSubclass

/// Put behind a view (`.background`): `onTap` runs after each tap that lands on it. Drags don't count.
struct PlanTapObserver: UIViewRepresentable {
    let onTap: () -> Void

    func makeUIView(context _: Context) -> ObserverView {
        ObserverView()
    }

    func updateUIView(_ view: ObserverView, context _: Context) {
        view.onTap = onTap
    }

    final class ObserverView: UIView {
        var onTap: (() -> Void)?
        private weak var observed: UIWindow?
        private lazy var recognizer: TouchEndRecognizer = {
            let recognizer = TouchEndRecognizer()
            recognizer.cancelsTouchesInView = false
            recognizer.delaysTouchesBegan = false
            recognizer.delaysTouchesEnded = false
            recognizer.onTap = { [weak self] point in
                guard let self, bounds.contains(convert(point, from: nil)) else { return }
                onTap?()
            }
            return recognizer
        }()

        override init(frame: CGRect) {
            super.init(frame: frame)
            isUserInteractionEnabled = false
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            fatalError("init(coder:) is not used")
        }

        /// The window hears every touch; the recognizer leaves with the view.
        override func didMoveToWindow() {
            super.didMoveToWindow()
            observed?.removeGestureRecognizer(recognizer)
            observed = window
            window?.addGestureRecognizer(recognizer)
        }
    }
}

/// Watches touches end and never recognizes, so it can't delay or cancel anyone else's. A plain tap recognizer
/// wouldn't do: controls stop their superviews' tap recognizers.
final class TouchEndRecognizer: UIGestureRecognizer {
    /// A touch went down and came up within a few points: where it ended, in the window.
    var onTap: ((CGPoint) -> Void)?
    private var began: CGPoint?

    override func touchesBegan(_ touches: Set<UITouch>, with _: UIEvent) {
        began = touches.first?.location(in: nil)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with _: UIEvent) {
        if let began, let end = touches.first?.location(in: nil), abs(end.x - began.x) < 10, abs(end.y - began.y) < 10 {
            onTap?(end)
        }
        began = nil
        state = .failed
    }

    override func touchesCancelled(_: Set<UITouch>, with _: UIEvent) {
        began = nil
        state = .failed
    }
}
