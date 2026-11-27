//
//  MomentLoopPlayback.swift
//  Pantopus
//
//  A loop in the viewer ("Pulse, reinvented"; CONTRACT 7j): a video Moment whose answer carries `loop` plays that span
//  over and over, muted, with no sound button, for as long as a photo shows (the viewer's clock, not the video's end,
//  moves on). Only while the switch is on: without it no answer carries `loop`, and every video plays once as today.
//

import AVFoundation

extension MomentDTO {
    /// The span the viewer repeats: a video's `loop`, only while the switch is on for the person watching.
    var loopSpan: MomentLoopDTO? {
        guard kind == .video, PulseReinventedFlags.shared.isOn else { return nil }
        return layers.loop
    }
}

@MainActor
enum MomentLoopPlayback {
    /// The item stops at the span's end and starts at its start; the player stays playing at the end, so a seek
    /// back plays on. With no loop, the player ends a video as it does today.
    static func hold(_ item: AVPlayerItem, on player: AVPlayer, to loop: MomentLoopDTO?) {
        player.actionAtItemEnd = loop == nil ? .pause : .none
        guard let loop else { return }
        item.forwardPlaybackEndTime = time(loop.end)
        if loop.fromMs > 0 { item.seek(to: time(loop.start), toleranceBefore: .zero, toleranceAfter: .zero, completionHandler: nil) }
    }

    /// The span's end was reached: back to its start (a paused player stays paused).
    static func again(_ player: AVPlayer, from loop: MomentLoopDTO) {
        player.seek(to: time(loop.start), toleranceBefore: .zero, toleranceAfter: .zero)
    }

    private static func time(_ seconds: Double) -> CMTime {
        CMTime(seconds: seconds, preferredTimescale: 600)
    }
}
