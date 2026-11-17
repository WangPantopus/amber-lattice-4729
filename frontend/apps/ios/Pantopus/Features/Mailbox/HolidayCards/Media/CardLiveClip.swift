//
//  CardLiveClip.swift
//  Pantopus
//
//  A card photo's moving part when it's a Live Photo (`holiday_card_memories`; contract section 13): fetched only
//  through the card's reader-checked routes, kept in memory like the photo and the greeting, and played from memory, so
//  nothing of it is ever written to this phone's disk. It plays over the opened photo: once without sound as the photo
//  opens, and with its sound while the photo is held or after its LIVE button.
//

import AVFoundation
import SwiftUI

/// The player of one Live Photo's moving part.
@MainActor @Observable
final class CardLiveClip {
    /// Ready to play.
    private(set) var player: AVPlayer?
    /// The moving part shows over the still.
    private(set) var showing = false
    @ObservationIgnored private var bytes: CardClipBytes?
    @ObservationIgnored private var ended: (any NSObjectProtocol)?
    @ObservationIgnored private var held = false

    /// Fetches the clip (or takes it from memory) and readies the player. Quietly does nothing when it can't: the
    /// photo is still a photo.
    func prepare(_ source: CardMediaSource, mimeType: String?) async {
        guard player == nil, let data = try? await HolidayCardMediaStore.shared.data(for: source), !Task.isCancelled else { return }
        let quicktime = mimeType == "video/quicktime"
        let bytes = CardClipBytes(data: data, type: quicktime ? AVFileType.mov.rawValue : AVFileType.mp4.rawValue)
        // A scheme of its own, so the player asks this phone's memory for the bytes instead of the network.
        guard let url = URL(string: "pantopus-card-clip://clip/\(source.fileId).\(quicktime ? "mov" : "mp4")") else { return }
        let asset = AVURLAsset(url: url)
        asset.resourceLoader.setDelegate(bytes, queue: CardClipBytes.queue)
        let item = AVPlayerItem(asset: asset)
        let player = AVPlayer(playerItem: item)
        player.actionAtItemEnd = .pause
        self.bytes = bytes
        self.player = player
        ended = NotificationCenter.default
            .addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.finished() }
            }
    }

    /// Plays it through once from its start.
    func playOnce(muted: Bool) {
        guard let player else { return }
        held = false
        start(player, muted: muted)
    }

    /// A finger holds the photo: it plays, with its sound, for as long as it's held.
    func hold(_ holding: Bool) {
        guard let player else { return }
        if holding {
            held = true
            start(player, muted: false)
        } else if held {
            held = false
            stop()
        }
    }

    func stop() {
        player?.pause()
        showing = false
    }

    private func start(_ player: AVPlayer, muted: Bool) {
        player.isMuted = muted
        player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
        player.play()
        showing = true
    }

    private func finished() {
        // Held past its end, it rests on its last frame until the finger lifts.
        if !held { showing = false }
    }

    func close() {
        stop()
        if let ended { NotificationCenter.default.removeObserver(ended) }
        ended = nil
        player = nil
        bytes = nil
    }
}

/// Answers the player's requests for the clip from the bytes in memory.
private final class CardClipBytes: NSObject, AVAssetResourceLoaderDelegate, @unchecked Sendable {
    static let queue = DispatchQueue(label: "app.pantopus.card-clip")
    private let data: Data
    private let type: String

    init(data: Data, type: String) {
        self.data = data
        self.type = type
    }

    func resourceLoader(_: AVAssetResourceLoader, shouldWaitForLoadingOfRequestedResource request: AVAssetResourceLoadingRequest) -> Bool {
        if let info = request.contentInformationRequest {
            info.contentType = type
            info.contentLength = Int64(data.count)
            info.isByteRangeAccessSupported = true
        }
        if let wanted = request.dataRequest {
            let start = Int(max(wanted.currentOffset, wanted.requestedOffset))
            guard start >= 0, start <= data.count else {
                request.finishLoading(with: URLError(.badServerResponse))
                return true
            }
            let length = wanted.requestsAllDataToEndOfResource ? data.count - start : min(wanted.requestedLength, data.count - start)
            wanted.respond(with: data.subdata(in: start..<(start + max(0, length))))
        }
        request.finishLoading()
        return true
    }
}

/// The small LIVE mark: on a print whose photo is a Live Photo, and the button that plays it in the opened photo.
struct CardLiveMark: View {
    var size: CGFloat = 11

    var body: some View {
        HStack(spacing: size * 0.36) {
            Circle()
                .strokeBorder(Color.white, lineWidth: max(1, size * 0.13))
                .frame(width: size * 0.9, height: size * 0.9)
                .overlay { Circle().fill(Color.white).frame(width: size * 0.3, height: size * 0.3) }
            Text(verbatim: "LIVE")
                .font(.system(size: size, weight: .bold))
                .tracking(size * 0.06)
                .foregroundStyle(Color.white)
        }
        .padding(.horizontal, size * 0.7)
        .frame(height: size * 2.1)
        .background(Color.black.opacity(0.5), in: Capsule())
        .accessibilityHidden(true)
    }
}
