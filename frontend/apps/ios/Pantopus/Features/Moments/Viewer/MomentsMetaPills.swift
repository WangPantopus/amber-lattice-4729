//
//  MomentsMetaPills.swift
//  Pantopus
//
//  Under the viewer's header, on small dark pills: "Taken Oct 3" for an old
//  photo or video from the library (contract v3.3), or, for one the app's own
//  camera made at its spot (Moments API v4.1, board L2), "Live from here" for
//  its first 15 minutes and "Taken here" after that, with the weather when it
//  was posted ("31°F · Snow") beside it. The pill turns from Live to Taken
//  here by itself at `live_until`, without reading the Moment again. Each pill
//  is drawn as the Taken pill always was; this view takes that pill's place on
//  the phone, in the Duo's layouts and on the table.
//

import SwiftUI

/// What the pills under the header say (`MomentsViewerModel.metaPills`).
struct MomentsMeta: Equatable {
    /// "Taken Oct 3": a library photo or video taken more than a day before it was posted.
    var taken: String?
    /// The Live mark and its weather; nil without the mark.
    var live: MomentLiveStateDTO?
}

struct MomentsMetaPills: View {
    let meta: MomentsMeta
    /// Moved on at `live_until`, so the body reads the clock again and "Live from here" becomes "Taken here".
    @State private var flips = 0

    var body: some View {
        // One line; one pill under the other where the line is too narrow for both.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 6) { pills }
            VStack(alignment: .leading, spacing: 6) { pills }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // Under the name: the header's leading inset, the 36 pt face and its 10 pt gap.
        .padding(.leading, 58)
        .padding(.top, 2)
        .task(id: meta.live?.liveUntil) { await flipAtLiveUntil() }
    }

    @ViewBuilder
    private var pills: some View {
        if let live = meta.live {
            if isLive {
                pill("Live from here", id: "moments.viewer.live") { MomentsLiveSign(size: 13, color: MomentsPalette.live) }
            } else {
                pill("Taken here", id: "moments.viewer.live") { Icon(.mapPin, size: 13, strokeWidth: 2.2, color: .white) }
            }
            if let weather = live.weather {
                pill(weather.text, spoken: "Weather, \(weather.spoken)", id: "moments.viewer.weather") {
                    Icon(TodayHourlyStrip.icon(weather.kind, night: false), size: 13, strokeWidth: 2.2, color: .white)
                }
            }
        } else if let taken = meta.taken {
            pill(taken, id: "moments.viewer.taken") { Icon(.calendar, size: 13, strokeWidth: 2.2, color: .white) }
        }
    }

    /// Read against the clock each time the body is drawn; `flips` makes sure it is drawn at `live_until`.
    private var isLive: Bool {
        _ = flips
        return meta.live?.isLive(at: Date()) ?? false
    }

    /// Waits until `live_until` (at least that long), then draws the pills again.
    private func flipAtLiveUntil() async {
        guard let until = meta.live?.liveUntil else { return }
        let wait = until.timeIntervalSinceNow
        guard wait > 0 else { return }
        try? await Task.sleep(for: .seconds(wait))
        guard !Task.isCancelled else { return }
        flips += 1
    }

    /// The Taken pill as it always was: a 13 pt icon and 12.5 pt words on a dark capsule.
    private func pill(_ text: String, spoken: String? = nil, id: String, @ViewBuilder icon: () -> some View) -> some View {
        HStack(spacing: 5) {
            icon()
            Text(text)
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(Color.black.opacity(0.48)))
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken ?? text)
        .accessibilityIdentifier(id)
    }
}

/// The Live sign (boards L2, L3): a dot in a faint ring. Green in the viewer's pill, white on the map's filled chip.
struct MomentsLiveSign: View {
    let size: CGFloat
    let color: Color

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(color.opacity(0.55), lineWidth: size * 0.1)
            Circle()
                .fill(color)
                .frame(width: size * 0.42, height: size * 0.42)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
