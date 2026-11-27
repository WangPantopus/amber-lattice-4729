//
//  MomentSoundLayer.swift
//  Pantopus
//
//  A Moment's sound in the viewer ("Pulse, reinvented" phase 2; CONTRACT 7e), only while the switch is on for the
//  person watching. Place sound: the few seconds kept where the picture was taken, played once as the Moment opens,
//  with a button to hear it again. Voice Spark: the person's own voice with their exact words as moving text, each word
//  lit as it is said; the viewer holds still while it plays. A muted viewer waits for a tap. Sound cleaned of wind says
//  so. A whisper plays from its dot's card.
//

import AVFoundation
import Observation
import SwiftUI

/// One sound playing in the viewer (or the Studio's "Hear it"), at most one at a time.
@Observable
@MainActor
final class MomentSoundPlayer {
    static let shared = MomentSoundPlayer()

    /// What is playing: a Moment's id (or "studio", or a whisper's "<moment>/<dot>"), and how far in, in ms.
    private(set) var playingOn: String?
    private(set) var atMs: Int = 0
    private var player: AVPlayer?
    private var ticker: Task<Void, Never>?
    /// Moments whose sound already played once as they opened, in this run.
    var heard: Set<String> = []

    func play(_ url: URL, on owner: String) {
        stop()
        let item = AVPlayerItem(url: url)
        let made = AVPlayer(playerItem: item)
        player = made
        playingOn = owner
        atMs = 0
        made.play()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(50))
                guard let self, let player else { return }
                let seconds = player.currentTime().seconds
                atMs = seconds.isFinite ? Int(seconds * 1000) : 0
                if item.status == .failed || (player.rate == 0 && seconds > 0 && item.duration.seconds.isFinite
                    && seconds >= item.duration.seconds - 0.05) {
                    stop()
                    return
                }
            }
        }
    }

    func stop() {
        ticker?.cancel()
        ticker = nil
        player?.pause()
        player = nil
        playingOn = nil
    }

    func isPlaying(_ owner: String) -> Bool {
        playingOn == owner
    }
}

extension MomentsViewerModel {
    /// The viewer holds still while a Moment's voice plays.
    var soundHolds: Bool {
        guard let moment, moment.layers.sound?.kind == .voice else { return false }
        return MomentSoundPlayer.shared.isPlaying(moment.id)
    }
}

/// Under the header: place sound's button, or the voice's words lit as they are said.
struct MomentSoundStrip: View {
    let model: MomentsViewerModel
    private let player = MomentSoundPlayer.shared
    @State private var flags = PulseReinventedFlags.shared

    var body: some View {
        if flags.isOn, let moment = model.moment, let sound = moment.layers.sound, let url = sound.url.flatMap(URL.init(string:)) {
            Group {
                if sound.kind == .voice {
                    voice(moment, sound, url)
                } else {
                    place(moment, sound, url)
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s2)
            .task(id: moment.id) {
                // Played once as it opens, unless the viewer is muted.
                guard !model.muted, !player.heard.contains(moment.id) else { return }
                player.heard.insert(moment.id)
                player.play(url, on: moment.id)
            }
            .onDisappear { if player.isPlaying(moment.id) { player.stop() } }
        }
    }

    private func place(_ moment: MomentDTO, _ sound: MomentSoundDTO, _ url: URL) -> some View {
        let playing = player.isPlaying(moment.id)
        return Button { playing ? player.stop() : player.play(url, on: moment.id) } label: {
            HStack(spacing: 6) {
                Icon(playing ? .volume2 : .play, size: 14, strokeWidth: 2.4, color: .white)
                Text(playing ? "Place sound" : "Hear the place")
                    .font(.system(size: 13.5, weight: .bold))
                    .foregroundStyle(.white)
                if sound.cleaned {
                    Text("· Wind cleaned on the phone")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Color.white.opacity(0.8))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Capsule().fill(Color.black.opacity(0.5)))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("moments.viewer.placeSound")
    }

    private func voice(_ moment: MomentDTO, _ sound: MomentSoundDTO, _ url: URL) -> some View {
        let playing = player.isPlaying(moment.id)
        let words = sound.words ?? []
        return VStack(alignment: .leading, spacing: Spacing.s2) {
            if !words.isEmpty {
                lit(words, at: playing ? player.atMs : -1)
                    .font(.system(size: 21, weight: .bold))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(words.map(\.w).joined(separator: " "))
            }
            Button { playing ? player.stop() : player.play(url, on: moment.id) } label: {
                HStack(spacing: 6) {
                    Icon(playing ? .pause : .play, size: 14, strokeWidth: 2.4, color: .white)
                    Text(playing ? "Pause" : "Hear \(moment.author.shortName)")
                        .font(.system(size: 13.5, weight: .bold))
                        .foregroundStyle(.white)
                    if sound.cleaned {
                        Text("· Wind cleaned on the phone")
                            .font(.system(size: 12.5))
                            .foregroundStyle(Color.white.opacity(0.8))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(Color.white.opacity(0.18)))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("moments.viewer.voice")
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.black.opacity(0.5)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.viewer.voiceSpark")
    }

    /// The words, the ones said so far bright and the rest dim.
    private func lit(_ words: [MomentSoundWord], at ms: Int) -> Text {
        words.enumerated().reduce(Text("")) { line, entry in
            let (index, word) = entry
            let said = ms >= word.startMs
            return line + Text(index == 0 ? word.w : " \(word.w)").foregroundColor(said ? .white : Color.white.opacity(0.4))
        }
    }
}
