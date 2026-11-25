//
//  MomentsPostStage+Lower.swift
//  Pantopus
//
//  The phone's Post sheet pulled down to see the photo or video being posted
//  (founder, 2026-11-24). A drag down on the grab handle, on Post's row, or
//  past the top of the options lowers the sheet to a strip at the bottom of
//  the screen, and the picture shows whole and no longer darkened, as it will
//  post. A drag up on the strip, or a tap on it, brings the sheet back as it
//  was; a tap on the grab handle lowers it. The sheet follows the finger and
//  springs to the end the drag aims at, at the finger's speed, as the Plans
//  sheet does (`PlansMapSheet.swift`): it is laid out once and moved by an
//  offset, so a drag frame redraws only the offset, the strip and the dimming.
//

import SwiftUI

extension EnvironmentValues {
    /// The phone's Post sheet's drag, over a photo or a video; nil elsewhere (the Duo's layouts, a text card).
    @Entry var momentsPostLowering: MomentsPostLowering?
}

/// The finger on the phone's Post sheet: where it holds the sheet, the hand-off between the sheet and its options,
/// and whether the sheet rests up or lowered.
@Observable
@MainActor
final class MomentsPostLowering {
    /// Lowered: only the strip shows above the home indicator.
    private(set) var isLowered = false
    /// How far below its place the sheet stands while a finger holds it; nil while it rests.
    private(set) var held: CGFloat?
    /// The options hold still while the sheet takes over a pull that began in them.
    private(set) var locksOptions = false
    /// The sheet's height, measured.
    private(set) var sheetHeight: CGFloat = 0
    /// The home indicator's part of the screen, under the strip.
    private(set) var bottomInset: CGFloat = 0

    /// Where the options' top stands in their scroll view: 0 at their top, below 0 scrolled down, above 0 pulled past it.
    @ObservationIgnored var optionsTop: CGFloat = 0
    /// The options' own height and the room they have: when they fit, nothing scrolls and a pull down moves the sheet.
    @ObservationIgnored var optionsHeight: CGFloat = 0
    @ObservationIgnored var optionsRoom: CGFloat = 0
    @ObservationIgnored var reduceMotion = false
    @ObservationIgnored private var startOffset: CGFloat = 0
    @ObservationIgnored private var startTranslation: CGFloat = 0
    @ObservationIgnored private var lastOptionsTranslation: CGFloat = 0
    /// The finger's last speed, for a drag the system cancels (it ends with no release).
    @ObservationIgnored private var lastVelocity: CGFloat = 0

    /// What the lowered sheet shows above the home indicator: the grab handle and its line.
    static let strip: CGFloat = 56
    /// The grab handle's band at the top of the sheet: the handle and the space under it, down to the map.
    static let handleBand: CGFloat = 24
    /// Faster than this (points a second) a release goes the way it was going.
    static let flick: CGFloat = 300
    /// How far toward the other end a drag must aim to go there: a third of the way, so a short pull down shows the
    /// picture and a short push up brings the options back.
    static let reach: CGFloat = 0.3

    /// How far down the lowered sheet stands: all of it but the strip.
    var travel: CGFloat {
        max(sheetHeight - Self.strip - bottomInset, 0)
    }

    /// How far below its place the sheet stands now.
    var offset: CGFloat {
        held ?? (isLowered ? travel : 0)
    }

    /// 0 with the sheet up, 1 lowered.
    var progress: CGFloat {
        travel > 0 ? min(max(offset / travel, 0), 1) : 0
    }

    func measured(sheet height: CGFloat) {
        if abs(sheetHeight - height) > 0.5 { sheetHeight = height }
    }

    func measured(bottomInset inset: CGFloat) {
        if abs(bottomInset - inset) > 0.5 { bottomInset = inset }
    }

    /// A drag on the grab handle, on Post's row or on the strip.
    func moved(_ value: DragGesture.Value) {
        if held == nil { begin(at: value.translation.height) }
        lastVelocity = value.velocity.height
        held = resisted(startOffset + value.translation.height - startTranslation)
    }

    /// A drag in the options. They scroll until they're at their top (when they fit, they're always there); a pull down
    /// from there moves the sheet, and they hold still (no bounce under the finger).
    func optionsMoved(_ value: DragGesture.Value) {
        let translation = value.translation.height
        defer { lastOptionsTranslation = translation }
        if held == nil {
            let atTop = optionsHeight <= optionsRoom + 0.5 || optionsTop >= -0.5
            guard !isLowered, atTop, translation > 0, translation >= lastOptionsTranslation else { return }
            locksOptions = true
            begin(at: translation)
        }
        lastVelocity = value.velocity.height
        held = resisted(startOffset + translation - startTranslation)
    }

    func ended(_ value: DragGesture.Value) {
        settle(velocity: value.velocity.height)
    }

    /// The system cancelled a drag (no end comes): the sheet still goes to an end, the way the finger was going.
    func settleIfHeld() {
        settle(velocity: lastVelocity)
    }

    /// A tap on the handle or the strip, or VoiceOver's actions.
    func setLowered(_ lowered: Bool) {
        guard lowered != isLowered, held == nil, travel > 0 else { return }
        if lowered { Keyboard.close() }
        withAnimation(spring(velocity: 0, distance: travel)) { isLowered = lowered }
    }

    private func begin(at translation: CGFloat) {
        // The caption's keyboard goes as the sheet starts down.
        if !isLowered { Keyboard.close() }
        startOffset = isLowered ? travel : 0
        startTranslation = translation
    }

    private func settle(velocity: CGFloat) {
        lastOptionsTranslation = 0
        lastVelocity = 0
        defer { locksOptions = false }
        guard let position = held else { return }
        let aimed = position + velocity * 0.18
        // A third of the way from where it rested is enough to go to the other end.
        let line = travel * (startOffset > 0 ? 1 - Self.reach : Self.reach)
        let lower = velocity > Self.flick || (velocity >= -Self.flick && aimed > line)
        withAnimation(spring(velocity: velocity, distance: (lower ? travel : 0) - position)) {
            isLowered = lower
            held = nil
        }
    }

    /// Past the top and the bottom the sheet gives less and less, as a scroll view's rubber band does.
    private func resisted(_ position: CGFloat) -> CGFloat {
        if position < 0 { return -Self.resist(-position) }
        if position > travel { return travel + Self.resist(position - travel) }
        return position
    }

    private static func resist(_ distance: CGFloat) -> CGFloat {
        let limit: CGFloat = 80
        return limit * (1 - 1 / (distance * 0.55 / limit + 1))
    }

    /// The Plans sheet's spring (about 0.35 s), starting at the finger's speed; a short ease under Reduce Motion.
    private func spring(velocity: CGFloat, distance: CGFloat) -> Animation {
        if reduceMotion { return .easeInOut(duration: 0.15) }
        let relative = abs(distance) > 1 ? min(max(velocity / distance, -10), 10) : 0
        return .interpolatingSpring(Spring(response: 0.35, dampingRatio: 0.86), initialVelocity: Double(relative))
    }
}

/// The one view a drag frame redraws for the sheet: its offset down from where it stands, and the strip over its top.
/// It holds the sheet as built, so a frame of the drag evaluates nothing else. With no drag (a text card) it is the
/// sheet as it always was.
struct MomentsPostSheetPosition<Content: View>: View {
    let lowering: MomentsPostLowering?
    @ViewBuilder let content: Content

    var body: some View {
        if let lowering {
            content
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { lowering.measured(sheet: $0) }
                // Lowered, VoiceOver reads the strip, not the options under it.
                .accessibilityHidden(lowering.isLowered)
                // The sheet's color hangs below it, so a pull up past its place never shows the picture under it.
                .background(alignment: .bottom) {
                    Theme.Color.appSurface
                        .frame(height: 120)
                        .offset(y: 119)
                        .allowsHitTesting(false)
                }
                .overlay(alignment: .top) { MomentsPostStrip(lowering: lowering) }
                .offset(y: lowering.offset)
        } else {
            content
        }
    }
}

/// The darkening over the picture under the sheet: it lifts as the sheet lowers, so the picture shows as it will post.
struct MomentsPostDimming: View {
    let lowering: MomentsPostLowering?
    /// A text card's colors were never darkened.
    let dims: Bool

    var body: some View {
        Color.black
            .opacity(dims ? 0.3 * (1 - (lowering?.progress ?? 0)) : 0)
            .allowsHitTesting(false)
    }
}

/// The lowered sheet's strip: the grab handle and "Swipe up to finish posting". A drag up or a tap brings the sheet
/// back. It fades in over the sheet's top as the sheet goes down, and takes touches only while the sheet is down.
private struct MomentsPostStrip: View {
    let lowering: MomentsPostLowering

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Theme.Color.appBorderStrong)
                .frame(width: 36, height: 5)
                .padding(.top, Spacing.s2)
            Text("Swipe up to finish posting")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.top, Spacing.s3)
                .padding(.horizontal, Spacing.s4)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .frame(height: MomentsPostLowering.strip + lowering.bottomInset, alignment: .top)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24, style: .continuous)
                .fill(Theme.Color.appSurface)
        }
        .opacity(lowering.progress)
        .contentShape(Rectangle())
        .onTapGesture { lowering.setLowered(false) }
        .modifier(MomentsPostDrag(lowering: lowering))
        .allowsHitTesting(lowering.isLowered)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Post options")
        .accessibilityHint("Shows the options and Post again")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { lowering.setLowered(false) }
        .accessibilityIdentifier("moments.post.strip")
        // Only while the sheet is down: up, VoiceOver reads the options.
        .accessibilityHidden(!lowering.isLowered)
    }
}

extension View {
    /// A part of the sheet that never scrolls (the grab handle's band, Post's row): a drag on it moves the sheet, ahead
    /// of the buttons under it.
    func momentsPostDragArea(_ lowering: MomentsPostLowering?) -> some View {
        modifier(MomentsPostDragArea(lowering: lowering))
    }

    /// The options' scroll view: a pull past its top moves the sheet instead of bouncing the options.
    func momentsPostOptionsDrag(_ lowering: MomentsPostLowering?) -> some View {
        modifier(MomentsPostOptionsDrag(lowering: lowering))
    }
}

private struct MomentsPostDragArea: ViewModifier {
    let lowering: MomentsPostLowering?

    func body(content: Content) -> some View {
        if let lowering {
            content
                .contentShape(Rectangle())
                .modifier(MomentsPostDrag(lowering: lowering))
        } else {
            content
        }
    }
}

private struct MomentsPostOptionsDrag: ViewModifier {
    let lowering: MomentsPostLowering?

    func body(content: Content) -> some View {
        if let lowering {
            content
                .scrollDisabled(lowering.locksOptions)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { lowering.optionsRoom = $0 }
                .modifier(MomentsPostDrag(lowering: lowering, inOptions: true))
        } else {
            content
        }
    }
}

/// The drag that moves the sheet, on one part of it.
private struct MomentsPostDrag: ViewModifier {
    let lowering: MomentsPostLowering
    /// The options' drag runs beside their own scrolling; any other one goes ahead of the buttons under it.
    var inOptions = false
    /// Set while the finger is down: a drag the system cancels never ends, so the sheet settles then.
    @GestureState private var isActive = false

    func body(content: Content) -> some View {
        Group {
            if inOptions {
                content.simultaneousGesture(gesture)
            } else {
                content.highPriorityGesture(gesture)
            }
        }
        .onChange(of: isActive) { _, isActive in
            if !isActive { Task { lowering.settleIfHeld() } }
        }
    }

    private var gesture: some Gesture {
        // In the window's coordinates: the sheet moves under the finger, and a translation in its own coordinates
        // would chase itself.
        DragGesture(minimumDistance: inOptions ? 8 : 10, coordinateSpace: .global)
            .updating($isActive) { _, isActive, _ in isActive = true }
            .onChanged { value in
                if inOptions {
                    lowering.optionsMoved(value)
                } else {
                    lowering.moved(value)
                }
            }
            .onEnded { lowering.ended($0) }
    }
}
