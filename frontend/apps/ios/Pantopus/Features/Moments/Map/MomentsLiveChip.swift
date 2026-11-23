//
//  MomentsLiveChip.swift
//  Pantopus
//
//  "Live now" (Moments API v4.1, board L3), beside the time filter's chip
//  under the map's top row (`MomentsHeightsChip.swift`): on, the map shows
//  only rings that are live, a photo or video taken on the spot with the
//  app's camera in the last few minutes (each ring's `live_until`). The
//  others are hidden, as the time chip hides them; the pins, the bubbles, the
//  row of faces and Play all follow it. With nothing live in view, the empty
//  card says so. Drawn like "Elevation": glass while off, filled with a
//  check while on.
//
//  The choice lasts while the app runs, across tabs, and is off again after a
//  relaunch, like the time filter.
//

import SwiftUI

struct MomentsLiveChip: View {
    let viewModel: MomentsMapViewModel

    /// The empty card's line while "Live now" hides everything in view.
    static let emptyLine = "Nothing live right now. Turn off Live now to see other Moments."

    var body: some View {
        let on = viewModel.liveOnly
        Button { viewModel.liveOnly.toggle() } label: {
            HStack(spacing: 6) {
                MomentsLiveSign(size: 15, color: on ? .white : MomentsPalette.liveDot)
                Text("Live now")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(on ? .white : Theme.Color.appText)
                    .lineLimit(1)
                if on { Icon(.check, size: 13, strokeWidth: 2.75, color: .white) }
            }
            .padding(.horizontal, 14)
            .frame(height: MomentsHeightsBar.chipHeight)
            .background { surface(on: on) }
            .frame(minHeight: 44)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Live now")
        .accessibilityValue(on ? "On" : "Off")
        .accessibilityHint("Shows only Moments taken on the spot just now")
        .accessibilityAddTraits(.isToggle)
        .accessibilityIdentifier("moments.liveChip")
    }

    /// On, the board's filled chip; off, the map's glass, like the chips beside it.
    @ViewBuilder
    private func surface(on: Bool) -> some View {
        if on {
            Capsule()
                .fill(Theme.Color.primarySolid)
                .shadow(color: Theme.Color.primarySolid.opacity(0.35), radius: 5, x: 0, y: 2)
        } else {
            Capsule().fill(.clear).momentsGlass(Capsule())
        }
    }
}
