//
//  WindowControlsClearance.swift
//  Pantopus
//
//  Keeps the app below the iPad window buttons (close, minimize, full screen)
//  wherever iPadOS draws them inside the app's own area. The minimal window
//  control style (`PantopusSceneDelegate`) gives the buttons a strip of their
//  own in a floating window, but a window tiled into the screen's top-left
//  corner shows the status bar there, and the buttons drop below it, onto the
//  app's top-left control (the side menu, Back, Close). There Apple's
//  corner-adapted safe area, `safeArea(cornerAdaptation: .vertical)`, reaches
//  below the buttons while the plain safe area doesn't; the difference becomes
//  extra top room for the app and for any cover or sheet that reaches that
//  corner. Full screen, in a floating window, and on iPhones the two are the
//  same and nothing changes.
//
//  Installed once, on the app's window, from `RootView`.
//

import SwiftUI
import UIKit

@MainActor
final class WindowControlsClearance {
    private static var installed: [ObjectIdentifier: WindowControlsClearance] = [:]

    /// Starts keeping `window`'s screens clear of its window buttons (once per window).
    static func install(on window: UIWindow) {
        let key = ObjectIdentifier(window)
        guard installed[key] == nil else { return }
        installed[key] = WindowControlsClearance(window: window)
    }

    private weak var window: UIWindow?
    private let watcher = Watcher()
    /// While the buttons sit inside the app's area: newly presented covers and sheets get the room too.
    private var displayLink: CADisplayLink?
    /// The extra top room given to each screen, by controller.
    private var given: [ObjectIdentifier: CGFloat] = [:]
    /// When the buttons were first seen inside the app's area. As an app opens, iPadOS draws them below the status
    /// bar for a moment before moving them into it; the room waits until they stay, so a normal launch doesn't jump.
    private var areaSince: Date?
    private static let settleDelay: TimeInterval = 0.8

    private init(window: UIWindow) {
        self.window = window
        watcher.onChange = { [weak self] in self?.update() }
        watcher.frame = window.bounds
        watcher.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.insertSubview(watcher, at: 0)
        update()
    }

    /// The buttons' bottom edge in window points, and their right edge, where they sit inside the safe area; nil
    /// where they don't (a floating window's own strip) or can't be (full screen, iPhones).
    private func buttonsArea(in window: UIWindow) -> (bottom: CGFloat, right: CGFloat)? {
        // Only an iPad window that isn't full screen has the buttons. Elsewhere the corner-adapted safe area can
        // reach further for the screen's own rounded corner (the open iPhone Duo's has no status bar above it).
        guard window.traitCollection.userInterfaceIdiom == .pad, !Self.fillsScreen(window) else { return nil }
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            let adapted = window.edgeInsets(for: .safeArea(cornerAdaptation: .vertical)).top
            guard adapted > window.safeAreaInsets.top + 0.5 else { return nil }
            let right = window.edgeInsets(for: .safeArea(cornerAdaptation: .horizontal)).left
            return (adapted.rounded(.up), max(right, 1))
        }
        #endif
        return nil
    }

    private static func fillsScreen(_ window: UIWindow) -> Bool {
        guard let screen = window.windowScene?.screen.bounds.size else { return true }
        let size = window.bounds.size
        let same = abs(screen.width - size.width) < 1 && abs(screen.height - size.height) < 1
        let turned = abs(screen.width - size.height) < 1 && abs(screen.height - size.width) < 1
        return same || turned
    }

    private func update() {
        guard let window else {
            stopWatchingPresentations()
            return
        }
        let seen = buttonsArea(in: window)
        if seen == nil { areaSince = nil } else if areaSince == nil { areaSince = Date() }
        let settled = areaSince.map { Date().timeIntervalSince($0) >= Self.settleDelay } ?? false
        let area = settled ? seen : nil
        var controller = window.rootViewController
        var shown: Set<ObjectIdentifier> = []
        while let current = controller {
            shown.insert(ObjectIdentifier(current))
            give(room(for: current, in: window, area: area), to: current)
            controller = current.presentedViewController
        }
        // Controllers that were dismissed.
        given = given.filter { shown.contains($0.key) }
        if seen == nil { stopWatchingPresentations() } else { watchPresentations() }
    }

    /// The top room `controller`'s screen needs to clear the buttons: none unless its view reaches their corner.
    private func room(for controller: UIViewController, in window: UIWindow, area: (bottom: CGFloat, right: CGFloat)?) -> CGFloat {
        guard let area, let view = controller.viewIfLoaded, view.window === window else { return 0 }
        let frame = view.convert(view.bounds, to: window)
        guard frame.minX < area.right, frame.minY < area.bottom else { return 0 }
        // The safe area the screen has without this room: the window's, where the screen starts above its edge.
        let top = max(frame.minY, 0)
        let ownSafeTop = max(0, window.safeAreaInsets.top - top)
        return max(0, area.bottom - top - ownSafeTop).rounded(.up)
    }

    private func give(_ room: CGFloat, to controller: UIViewController) {
        let key = ObjectIdentifier(controller)
        let before = given[key] ?? 0
        guard abs(room - before) >= 0.5 else { return }
        controller.additionalSafeAreaInsets.top += room - before
        given[key] = room
    }

    private func watchPresentations() {
        guard displayLink == nil else { return }
        let link = CADisplayLink(target: Ticker { [weak self] in self?.update() }, selector: #selector(Ticker.tick))
        // A cover slides up from the bottom for about half a second: ten checks a second give it the room long before
        // it reaches the top.
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 8, maximum: 12, preferred: 10)
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    private func stopWatchingPresentations() {
        displayLink?.invalidate()
        displayLink = nil
    }

    /// A clear, untouchable view behind everything in the window, told when the window's size or safe area changes.
    private final class Watcher: UIView {
        var onChange: (() -> Void)?

        override init(frame: CGRect) {
            super.init(frame: frame)
            isUserInteractionEnabled = false
            backgroundColor = .clear
            isAccessibilityElement = false
            accessibilityElementsHidden = true
        }

        @available(*, unavailable)
        required init?(coder _: NSCoder) {
            nil
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            onChange?()
        }

        override func safeAreaInsetsDidChange() {
            super.safeAreaInsetsDidChange()
            onChange?()
        }
    }

    /// The display link's target, so the link doesn't keep the clearance alive.
    private final class Ticker: NSObject {
        let action: @MainActor () -> Void

        init(_ action: @escaping @MainActor () -> Void) {
            self.action = action
        }

        @objc func tick() {
            MainActor.assumeIsolated { action() }
        }
    }
}

/// Installs `WindowControlsClearance` on the window this sits in.
struct WindowControlsClearanceInstaller: UIViewRepresentable {
    func makeUIView(context _: Context) -> InstallerView {
        InstallerView()
    }

    func updateUIView(_: InstallerView, context _: Context) {}

    final class InstallerView: UIView {
        override func didMoveToWindow() {
            super.didMoveToWindow()
            if let window { WindowControlsClearance.install(on: window) }
        }
    }
}
