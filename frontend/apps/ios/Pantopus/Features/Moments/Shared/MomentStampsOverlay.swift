//
//  MomentStampsOverlay.swift
//  Pantopus
//
//  A posted Moment's stamps over its picture ("Pulse, reinvented" phase 0 step 3), in today's viewer. Drawn only while
//  `pulse_reinvented` is on for the person looking; off, it draws nothing and the viewer is today's.
//
//  Each stamp sits where its author put it, 0–1 across and down the picture itself (as `MomentMarks` places text and
//  drawings), and its size is a share of the picture's drawn width: scale 1 is 96/402 of it for the postmark and 34/402
//  tall for a chip (lead, 2026-11-27). The postmark is wet red while the Moment reads "Live from here" (`live_until`
//  not passed) and dark ink after, and on every Moment without the Live mark; it dries on time, as the Live pill does.
//

import SwiftUI

struct MomentStampsOverlay: View {
    let moment: MomentDTO
    /// The picture's own size; nil for a text card (the card is the frame).
    let picture: CGSize?
    @State private var flags = PulseReinventedFlags.shared

    var body: some View {
        if flags.isOn, !moment.stamps.isEmpty {
            TimelineView(.periodic(from: .now, by: 15)) { context in
                MomentStampsDrawing(stamps: moment.stamps, picture: picture, wet: moment.live.isLive(at: context.date))
            }
            .allowsHitTesting(false)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("moments.stamps")
        }
    }
}

/// The stamps drawn over a frame the picture fills.
struct MomentStampsDrawing: View {
    let stamps: [MomentStampDTO]
    let picture: CGSize?
    let wet: Bool

    var body: some View {
        GeometryReader { geo in
            let frame = picture.map { MomentMarks.fill($0, in: geo.size) } ?? CGRect(origin: .zero, size: geo.size)
            let unit = frame.width / 402
            ForEach(stamps, id: \.placement.kind) { stamp in
                MomentStampView(kind: stamp.placement.kind, value: stamp.value, wet: wet)
                    .scaleEffect(CGFloat(stamp.placement.scale) * unit)
                    .rotationEffect(.degrees(stamp.placement.rotation))
                    .position(
                        x: frame.minX + stamp.placement.x * frame.width,
                        y: frame.minY + stamp.placement.y * frame.height
                    )
            }
        }
    }
}

extension MomentDTO {
    /// The photo's or video's own size, when the server sent it.
    var pictureSize: CGSize? {
        guard let width, let height, width > 0, height > 0 else { return nil }
        return CGSize(width: width, height: height)
    }
}
