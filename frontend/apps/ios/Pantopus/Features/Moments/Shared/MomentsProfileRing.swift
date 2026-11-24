//
//  MomentsProfileRing.swift
//  Pantopus
//
//  The Moments ring around a person's profile picture, anywhere it shows
//  (a Pulse post, Messages, a chat, Connections, their profile): sky to
//  green while one of their Moments is new to you, grey once you've watched
//  them all, one segment per Moment, as on the Moments map. A tap on a
//  circle with a ring plays their Moments; without a ring the circle does
//  what it did before. Who has a ring is the server's answer
//  (`MomentsPeopleRings`), by the map's rules.
//

import SwiftUI
import UIKit

extension EnvironmentValues {
    /// False where a ring must not open the viewer: on a profile opened from the viewer itself.
    @Entry var momentsRingsPlay = true
    /// Where a tapped ring's Moments play for the app's tabs (`momentsRingStage()` on the root).
    @Entry var momentsRingStage: MomentsRingStage?
}

extension View {
    /// Draws the Moments ring around this profile circle when `userId` has Moments to watch, and plays them on a tap.
    /// The ring sits outside the circle (`gap` away), so the circle keeps its size and place. `spoken: false` where
    /// the circle is part of a row VoiceOver reads as one element: the tap still plays, and the row keeps its own
    /// label and identifier.
    ///
    /// The same circle also wears the outer ring of the person's mark (the profile with sources, board 6) while the
    /// `profile_sources` launch key is on: it hugs the circle, and the Moments ring sits just outside it.
    /// `profileMark: false` where the circle already sits inside the whole mark (the profile's own header).
    func momentsRing(
        of userId: String?,
        lineWidth: CGFloat = 2,
        gap: CGFloat = 2,
        spoken: Bool = true,
        profileMark: Bool = true
    ) -> some View {
        modifier(MomentsProfileRing(userId: userId, lineWidth: lineWidth, gap: gap, spoken: spoken, profileMark: profileMark))
    }
}

struct MomentsProfileRing: ViewModifier {
    let userId: String?
    let lineWidth: CGFloat
    let gap: CGFloat
    let spoken: Bool
    var profileMark = true

    /// This circle's own stage, for a circle on a screen that is itself shown over the app (your own profile, a
    /// sheet): the tabs' stage can't show a viewer over that.
    @State private var own = MomentsRingStage()
    /// The circle's size, for the room the mark's ring takes beside it.
    @State private var diameter: CGFloat = 0
    @Environment(\.momentsRingStage) private var tabsStage
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.momentsRingsPlay) private var plays
    @Environment(RootTabModel.self) private var rootTabs: RootTabModel?

    func body(content: Content) -> some View {
        let people = MomentsPeopleRings.shared
        let ring = people.ring(for: userId)
        let marks = ProfileMarks.shared
        let mark = profileMark ? marks.mark(for: userId) : nil
        content
            .onGeometryChange(for: CGFloat.self) { min($0.size.width, $0.size.height) } action: { diameter = $0 }
            .overlay {
                if let mark {
                    GeometryReader { proxy in
                        ProfileAvatarRing(summary: mark, diameter: min(proxy.size.width, proxy.size.height))
                    }
                }
            }
            .overlay {
                if let ring {
                    if let mark {
                        GeometryReader { proxy in
                            momentsStroke(ring, outside: markReach(mark, proxy.size))
                        }
                    } else {
                        momentsStroke(ring, outside: 0)
                    }
                }
            }
            .overlay {
                if let ring, plays {
                    if let mark {
                        GeometryReader { proxy in
                            playButton(ring, outside: markReach(mark, proxy.size))
                        }
                    } else {
                        playButton(ring, outside: 0)
                    }
                }
            }
            // Asked when the circle comes on screen, and again each minute it stays there.
            .task(id: userId) {
                while !Task.isCancelled {
                    people.want(userId)
                    try? await Task.sleep(for: .seconds(MomentsPeopleRings.keepFor + 1))
                }
            }
            .task(id: profileMark ? userId : nil) {
                guard profileMark, ProfileMarks.isOn else { return }
                while !Task.isCancelled {
                    marks.want(userId)
                    try? await Task.sleep(for: .seconds(ProfileMarks.keepFor + 1))
                }
            }
            .showsMomentsRingViewer(on: own)
            // Board 6 counts the mark's ring as part of the avatar: the circle keeps its size, and what sits beside it
            // moves over by the ring. Without a mark, nothing moves.
            .padding(mark.map { ProfileAvatarRing.reach($0, diameter: diameter) } ?? 0)
    }

    private func momentsStroke(_ ring: MomentRingDTO, outside: CGFloat) -> some View {
        MomentRingStroke(seen: ring.ringSeen, lineWidth: lineWidth)
            .padding(-(gap + lineWidth + outside))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    private func playButton(_ ring: MomentRingDTO, outside: CGFloat) -> some View {
        Button { play(ring) } label: {
            Circle().fill(Color.clear).contentShape(Circle())
        }
        .buttonStyle(.plain)
        .padding(-(gap + lineWidth + outside))
        .accessibilityLabel(ring.mine ? "Your Moments" : "\(ring.author.name)'s Moments")
        .accessibilityHint("Plays them")
        .accessibilityIdentifier("moments.profileRing.\(ring.author.id)")
        .accessibilityHidden(!spoken)
    }

    /// How much further out the Moments ring sits when the mark's ring is there: just beyond it, 1 pt clear, in place
    /// of its own gap (so the pair stays as tight as the Moments ring alone plus the mark).
    private func markReach(_ mark: ProfileMarkSummary, _ size: CGSize) -> CGFloat {
        max(0, ProfileAvatarRing.reach(mark, diameter: min(size.width, size.height)) + 1 - gap)
    }

    /// Plays the person's Moments from the first one not watched yet. On the open iPhone Duo held sideways they play
    /// beside the map in the Moments tab, as a chat's quote does.
    private func play(_ ring: MomentRingDTO) {
        if let rootTabs, MomentsDuoScreen.windowIsWide, let first = ring.moments.first(where: { !$0.seen }) ?? ring.moments.first {
            MomentsNavigator.shared.pending = first.id
            rootTabs.selected = .moments
            return
        }
        // The tabs' stage shows the viewer from above every page. A viewer shown from the circle itself, in a row
        // of a scrolling page, was shown again by SwiftUI whenever the page under it was laid out, which closed any
        // sheet open over the viewer and opened it again, over and over.
        if let tabsStage, tabsStage.canShow {
            tabsStage.play(ring, scheme: colorScheme)
        } else {
            own.play(ring, scheme: colorScheme)
        }
    }
}

/// A place a ring's Moments play from: it holds the viewer's session, so the screen that shows the viewer can be
/// built again without losing it.
@Observable
@MainActor
final class MomentsRingStage {
    var watching: MomentsWatchSession?
    /// Light or dark as it was when the viewer opened, given back to the screen for a moment when the viewer closes.
    private(set) var schemeBefore: ColorScheme?
    private(set) var schemeBack: ColorScheme?
    /// The stage above the app's tabs: it can't show a viewer while a sheet or another screen is shown over the tabs.
    @ObservationIgnored var isTabs = false

    var canShow: Bool {
        guard isTabs else { return true }
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        return windows.first(where: \.isKeyWindow)?.rootViewController?.presentedViewController == nil
    }

    func play(_ ring: MomentRingDTO, scheme: ColorScheme) {
        schemeBefore = scheme
        watching = MomentsWatchSession(request: MomentsWatchRequest(rings: [ring], start: 0, newOnly: false)) { _ in }
    }

    /// The viewer is always dark, and a screen that is itself shown over the app (your own profile, a sheet) keeps
    /// that dark after the viewer closes. Saying this screen's own light or dark for a moment puts it right; it is
    /// taken back at once, so the screen goes on following the phone.
    func closed() {
        watching = nil
        guard let schemeBefore else { return }
        schemeBack = schemeBefore
        Task {
            try? await Task.sleep(for: .seconds(1))
            schemeBack = nil
        }
    }
}

extension View {
    /// Shows the viewer for what `stage` plays, full screen over this view.
    func showsMomentsRingViewer(on stage: MomentsRingStage) -> some View {
        modifier(MomentsRingViewerCover(stage: stage))
    }

    /// On the app's tabs: every ring under them plays here, from above every page.
    func momentsRingStage() -> some View {
        modifier(MomentsRingTabsStage())
    }
}

private struct MomentsRingViewerCover: ViewModifier {
    @Bindable var stage: MomentsRingStage
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .fullScreenCover(item: $stage.watching) { session in
                MomentsViewer(
                    session: session,
                    // As it was when the viewer opened: under the dark viewer this screen may read dark itself.
                    systemScheme: stage.schemeBefore ?? colorScheme,
                    stopsOnDisappear: true,
                    onHideAuthor: { _ in },
                    onShowAuthor: { MomentsPeopleRings.shared.refresh($0) },
                    onClose: {
                        stage.closed()
                        // What was watched here is no longer new on the Moments tab.
                        Task { await MomentsTabDot.shared.reread() }
                    }
                )
            }
            // Said only for the moment after a viewer closes.
            .background {
                if let scheme = stage.schemeBack { Color.clear.preferredColorScheme(scheme) }
            }
    }
}

private struct MomentsRingTabsStage: ViewModifier {
    @State private var stage: MomentsRingStage = {
        let stage = MomentsRingStage()
        stage.isTabs = true
        return stage
    }()

    func body(content: Content) -> some View {
        content
            .environment(\.momentsRingStage, stage)
            .showsMomentsRingViewer(on: stage)
    }
}
