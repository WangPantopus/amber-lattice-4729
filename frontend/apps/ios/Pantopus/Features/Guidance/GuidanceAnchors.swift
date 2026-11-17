//
//  GuidanceAnchors.swift
//  Pantopus
//
//  How the cards learn where they are. A tab's first screen says it is showing
//  (`guidanceScreen`), with what its card needs to know; a control a pointer
//  explains carries `guidanceAnchor`. Each tab lives in its own hosting
//  controller (`RootTabContainer`), so a SwiftUI preference can't reach the
//  root: the anchor is a small UIKit view behind the control instead, which
//  knows whether it is in the window and where, and the pointer reads it each
//  frame while it shows.
//

import SwiftUI
import UIKit

// MARK: - Screens

extension View {
    /// This view is a tab's first screen for the guidance cards (`active` false: it isn't, here). `ready` turns
    /// true once it has finished loading: its card waits for that, then half a second.
    func guidanceScreen(
        _ screen: GuidanceScreen,
        ready: Bool = true,
        variants: GuidanceVariants = GuidanceVariants(),
        active: Bool = true
    ) -> some View {
        modifier(GuidanceScreenModifier(screen: screen, ready: ready, variants: variants, active: active))
    }

    /// A control a pointer explains. `when` is the pointer's own condition (no row opened yet, no post yet …);
    /// `cornerRadius` shapes the ring for a control that isn't round. Several controls with one id get one
    /// ring around all of them (Mail's "Me" and "Home").
    func guidanceAnchor(_ id: GuidanceCardID, when eligible: Bool = true, cornerRadius: CGFloat? = nil) -> some View {
        background(GuidanceAnchorProbe(id: id, eligible: eligible, cornerRadius: cornerRadius))
    }
}

private struct GuidanceScreenModifier: ViewModifier {
    let screen: GuidanceScreen
    let ready: Bool
    let variants: GuidanceVariants
    let active: Bool
    @State private var token = UUID()
    @State private var isOnScreen = false

    func body(content: Content) -> some View {
        content
            .onAppear {
                isOnScreen = true
                register()
            }
            .onDisappear {
                isOnScreen = false
                GuidanceCenter.shared.screenDisappeared(token)
            }
            .onChange(of: active) { _, _ in register() }
            .onChange(of: ready) { _, isReady in
                GuidanceCenter.shared.screenChanged(token, ready: isReady, variants: variants)
            }
            .onChange(of: variants) { _, newVariants in
                GuidanceCenter.shared.screenChanged(token, ready: ready, variants: newVariants)
            }
    }

    private func register() {
        guard isOnScreen, active else {
            GuidanceCenter.shared.screenDisappeared(token)
            return
        }
        GuidanceCenter.shared.screenAppeared(token, screen: screen, ready: ready, variants: variants)
    }
}

// MARK: - Controls

private struct GuidanceAnchorProbe: UIViewRepresentable {
    let id: GuidanceCardID
    let eligible: Bool
    let cornerRadius: CGFloat?

    func makeUIView(context _: Context) -> GuidanceAnchorView {
        GuidanceAnchorView(id: id)
    }

    func updateUIView(_ view: GuidanceAnchorView, context _: Context) {
        let changed = view.id != id || view.eligible != eligible
        view.id = id
        view.eligible = eligible
        view.cornerRadius = cornerRadius
        if changed { GuidanceCenter.shared.anchorsChanged() }
    }
}

/// The view behind a control: never drawn, never touched, never read by VoiceOver.
final class GuidanceAnchorView: UIView {
    var id: GuidanceCardID
    var eligible = true
    var cornerRadius: CGFloat?

    init(id: GuidanceCardID) {
        self.id = id
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        backgroundColor = .clear
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        GuidanceCenter.shared.anchorMoved(self)
    }

    /// The control's frame in the screen's points while it is fully on screen in the app's own window, above the
    /// bar and below the status bar; nil when it is scrolled away, hidden, or in a tab that isn't showing.
    var visibleFrame: CGRect? {
        guard let window, !window.isHidden, !(window is GuidanceWindow) else { return nil }
        var view: UIView? = self
        while let current = view {
            if current.isHidden || current.alpha < 0.01 { return nil }
            view = current.superview
        }
        let frame = convert(bounds, to: nil)
        guard frame.width > 1, frame.height > 1 else { return nil }
        let insets = window.safeAreaInsets
        let room = window.bounds.inset(by: UIEdgeInsets(
            top: insets.top,
            left: 0,
            bottom: insets.bottom + Self.barClearance,
            right: 0
        ))
        return room.insetBy(dx: -1, dy: -1).contains(frame) ? frame : nil
    }

    /// The drawn tab bar's height over the bottom safe area: a control under it doesn't count as on screen.
    private static let barClearance: CGFloat = 56
}
