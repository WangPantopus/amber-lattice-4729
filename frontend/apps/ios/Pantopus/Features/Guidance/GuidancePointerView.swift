//
//  GuidancePointerView.swift
//  Pantopus
//
//  Shape 2, the pointer (GUIDE spec §1, drawings "The two shapes"): a ring
//  around one control (2.5 pt, 4 pt clear of it, a 6 pt soft halo) and a blue
//  bubble 272 pt wide attached to it, its arrow on the control: below the
//  control, or above it when the control is in the lower half of the screen,
//  12 pt from the screen's edges. A bold title, one sentence and "Got it".
//  The screen is not dimmed and still works (`GuidanceWindow`). The pointer
//  follows its control while it shows, and closes if the control goes away.
//

import SwiftUI

struct GuidancePointerView: View {
    let card: GuidancePointerCard
    let model: GuidanceOverlayModel

    @State private var anchor: CGRect?
    @State private var cornerRadius: CGFloat?
    @State private var bubbleHeight: CGFloat = 0
    @AccessibilityFocusState private var titleFocused: Bool
    @Environment(\.colorScheme) private var colorScheme

    private static let clearance: CGFloat = 4
    private static let gap: CGFloat = 14
    private static let edge: CGFloat = 12
    private static let bubbleWidth: CGFloat = 272

    var body: some View {
        GeometryReader { proxy in
            if let anchor {
                pointer(anchor: anchor, screen: proxy.size)
            }
        }
        .ignoresSafeArea()
        .opacity(model.isShown ? 1 : 0)
        .animation(.easeOut(duration: 0.2), value: model.isShown)
        .task { await follow() }
    }

    /// Reads the control's place every frame or so; gone for a moment, the pointer closes (it showed: it counts).
    private func follow() async {
        var missing = 0
        while !Task.isCancelled {
            if let found = GuidanceCenter.shared.anchorFrame(for: card.id) {
                missing = 0
                if anchor != found.frame { anchor = found.frame }
                if cornerRadius != found.cornerRadius { cornerRadius = found.cornerRadius }
            } else {
                missing += 1
                if missing > 9, let shown = model.presentation {
                    GuidanceCenter.shared.close(shown)
                    return
                }
            }
            try? await Task.sleep(for: .milliseconds(33))
        }
    }

    private func pointer(anchor: CGRect, screen: CGSize) -> some View {
        let ring = anchor.insetBy(dx: -Self.clearance, dy: -Self.clearance)
        let radius = (cornerRadius ?? min(anchor.width, anchor.height) / 2) + Self.clearance
        let width = min(Self.bubbleWidth, screen.width - Self.edge * 2)
        let above = anchor.midY > screen.height / 2
        let x = min(max(anchor.midX - width / 2, Self.edge), screen.width - Self.edge - width)
        let arrowX = min(max(anchor.midX - x, 20), width - 20)
        let rawY = above ? ring.minY - Self.gap - bubbleHeight : ring.maxY + Self.gap
        let y = min(max(rawY, Self.edge), screen.height - Self.edge - bubbleHeight)
        return ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: radius + 6, style: .continuous)
                .strokeBorder(ringColor.opacity(colorScheme == .dark ? 0.28 : 0.2), lineWidth: 6)
                .frame(width: ring.width + 12, height: ring.height + 12)
                .offset(x: ring.minX - 6, y: ring.minY - 6)
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(ringColor, lineWidth: 2.5)
                .frame(width: ring.width, height: ring.height)
                .offset(x: ring.minX, y: ring.minY)
            bubble(arrowX: arrowX, arrowOnTop: !above)
                .frame(width: width)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { bubbleHeight = $0 }
                .offset(x: x, y: y)
                // Where touches stay in the overlay (the window passes the rest to the app).
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { model.bubbleFrame = $0 }
                .opacity(bubbleHeight > 0 ? 1 : 0)
        }
        .frame(width: screen.width, height: screen.height, alignment: .topLeading)
        .accessibilityElement(children: .contain)
    }

    /// The primary blue in light; its light tint in dark (`primaryTint`).
    private var ringColor: Color {
        Theme.Color.primaryTint
    }

    private func bubble(arrowX: CGFloat, arrowOnTop: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(card.title)
                .scaledFont(17, weight: .bold)
                .kerning(-0.17)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($titleFocused)
            Text(card.sentence)
                .scaledFont(15.5)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Spacer(minLength: 0)
                Button(action: close) {
                    Text("Got it")
                        .scaledFont(15, weight: .semibold)
                        .padding(.vertical, 7)
                        .padding(.horizontal, Spacing.s4)
                        .background(Theme.Color.appTextInverse.opacity(0.2), in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("guidance.pointer.\(card.id.rawValue).ok")
            }
            .padding(.top, Spacing.s1)
        }
        .foregroundStyle(Theme.Color.appTextInverse)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 15)
        .padding(.horizontal, Spacing.s4)
        .padding(.bottom, Spacing.s3)
        .background(alignment: arrowOnTop ? .topLeading : .bottomLeading) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(Theme.Color.primarySolid)
                .frame(width: 16, height: 16)
                .rotationEffect(.degrees(45))
                .offset(x: arrowX - 8, y: arrowOnTop ? -7 : 7)
        }
        .background(Theme.Color.primarySolid, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: Color.black.opacity(0.3), radius: 17, x: 0, y: 14)
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        // A tap anywhere on the bubble closes it too.
        .onTapGesture(perform: close)
        .accessibilityElement(children: .contain)
        .accessibilityAction(.escape, close)
        .accessibilityIdentifier("guidance.pointer.\(card.id.rawValue)")
        .task {
            try? await Task.sleep(for: .milliseconds(250))
            titleFocused = true
        }
    }

    private func close() {
        if let shown = model.presentation { GuidanceCenter.shared.close(shown) }
    }
}
