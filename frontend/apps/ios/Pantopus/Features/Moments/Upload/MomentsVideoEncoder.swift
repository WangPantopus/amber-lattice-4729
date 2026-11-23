//
//  MomentsVideoEncoder.swift
//  Pantopus
//
//  A Moment's video at a size known before it is made: 720 px on its short
//  side, H.264 at 5 Mbit/s (less when the file must be smaller) and 30 frames
//  a second with AAC sound, so 30 seconds is about 19 MB whatever the camera
//  shot (the Android app does the same at 4 Mbit/s). The system's "1280x720" export has no such promise: an
//  iPhone made 26.6 MB from 13 seconds of 4K HDR at 60 frames a second, more
//  than storage took (November 14). An HDR video comes out in standard
//  colours, upright, with no location, camera details or data tracks.
//

import AVFoundation
import Foundation
import os

enum MomentsVideoEncoder {
    static let shortSide: CGFloat = 720
    static let videoBitsPerSecond = 5_000_000
    static let audioBitsPerSecond = 128_000
    static let framesPerSecond: Int32 = 30
    /// No sample moved for this long: the export has stopped by itself and is given up (the system's export runs).
    static let stallSeconds = 30.0

    /// The video bit rate for `seconds` of video whose file must stay under `maxBytes`: 5 Mbit/s, or what fits
    /// (60 seconds under storage's 25 MB is about 3 Mbit/s), with the sound and the file's own overhead allowed for.
    static func videoBits(seconds: Double, maxBytes: Int) -> Int {
        let fits = Int(Double(maxBytes) * 0.92 * 8 / max(seconds, 1)) - audioBitsPerSecond
        return min(videoBitsPerSecond, max(1_500_000, fits))
    }

    /// Writes `range` of the video at `source` to `output` as an MP4 at `bits` a second of video, with `overlay` (the
    /// marks drawn on a clear picture the size it's asked for) over every frame, and each frame at `placing` on the 9:16
    /// canvas when the author placed it (Resize). Throws when the video can't be read or written.
    static func encode(
        _ source: URL,
        to output: URL,
        range: CMTimeRange,
        bits: Int = videoBitsPerSecond,
        overlay: Overlay? = nil,
        placing: Placing? = nil
    ) async throws {
        let asset = AVURLAsset(url: source)
        guard let video = try await asset.loadTracks(withMediaType: .video).first else { throw MomentsFailure.mediaRejected }
        let sounds = try await asset.loadTracks(withMediaType: .audio)
        var sound: AVAssetTrack?
        for track in sounds where sound == nil {
            // A second sound track (spatial audio) is an alternate of the first, switched off.
            if try await track.load(.isEnabled) { sound = track }
        }
        let tracks = (video: video, sound: sound ?? sounds.first)
        let job = try await Job(asset: asset, tracks: tracks, output: output, range: range, bits: bits, marks: (overlay, placing))
        try await withTaskCancellationHandler {
            try await job.run()
        } onCancel: {
            job.cancel()
        }
    }

    /// Draws the marks on a clear picture of the size given (the exported frame's), or nil for none.
    typealias Overlay = @Sendable (CGSize) -> CGImage?

    /// A placed video (Resize): where its picture sits on the 9:16 canvas, and the canvas's background (read from the
    /// first frame when the editor hadn't read it).
    struct Placing {
        let placement: MomentPlacement
        let backdrop: MomentPlacement.Backdrop?
    }

    /// A placed video's frame: 9:16 at 720 on its short side, as every export is.
    static let canvasSize = CGSize(width: 720, height: 1280)

    /// The video's picture as it is exported, with the marks over it when `overlay` draws any and on its canvas when
    /// `placing` places it: the layer instruction today's export has, or the marks compositor doing the same transform
    /// over the canvas's background (`MomentsMarksCompositor`). The system's export uses it too, so a marked or placed
    /// video never loses its marks or its placement there.
    static func composition(for video: AVAssetTrack, overlay: Overlay?, placing: Placing? = nil) async throws -> AVMutableVideoComposition {
        let (natural, transform, rate) = try await video.load(.naturalSize, .preferredTransform, .nominalFrameRate)
        let frame = placing.map { placed(natural: natural, transform: transform, placement: $0.placement) }
            ?? frame(natural: natural, transform: transform)
        let frames = rate > 0 ? min(framesPerSecond, Int32(rate.rounded())) : framesPerSecond
        let composition = AVMutableVideoComposition()
        composition.renderSize = frame.size
        composition.frameDuration = CMTime(value: 1, timescale: max(1, frames))
        let marks = overlay?(frame.size)
        if marks != nil || placing != nil {
            composition.customVideoCompositorClass = MomentsMarksCompositor.self
            let instruction = MomentsMarksInstruction(
                trackID: video.trackID,
                transform: frame.transform,
                overlay: marks,
                backdrop: placing.map { $0.backdrop ?? .dark },
                size: frame.size
            )
            composition.instructions = [instruction]
        } else {
            let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: video)
            layer.setTransform(frame.transform, at: .zero)
            let instruction = AVMutableVideoCompositionInstruction()
            instruction.timeRange = CMTimeRange(start: .zero, duration: .positiveInfinity)
            instruction.layerInstructions = [layer]
            composition.instructions = [instruction]
        }
        // Standard colours: an HDR video is tone-mapped here instead of looking washed out in H.264.
        composition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
        composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
        composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
        return composition
    }

    /// The picture as it is shown (after the phone's rotation), at its placement on the 720 x 1280 canvas: the same
    /// numbers the editor lays it out with (`MomentPlacement.pictureSize`, `pictureCenter`), drawn from the source frame
    /// at its own size.
    private static func placed(
        natural: CGSize, transform: CGAffineTransform, placement: MomentPlacement
    ) -> (size: CGSize, transform: CGAffineTransform) {
        let shown = CGRect(origin: .zero, size: natural).applying(transform)
        let picture = placement.pictureSize(aspect: shown.width / max(shown.height, 1), on: canvasSize)
        let middle = placement.pictureCenter(on: canvasSize)
        let fitted = transform
            .concatenating(CGAffineTransform(translationX: -shown.minX, y: -shown.minY))
            .concatenating(CGAffineTransform(scaleX: picture.width / max(shown.width, 1), y: picture.height / max(shown.height, 1)))
            .concatenating(CGAffineTransform(translationX: -picture.width / 2, y: -picture.height / 2))
            .concatenating(CGAffineTransform(rotationAngle: placement.turn * .pi / 180))
            .concatenating(CGAffineTransform(translationX: middle.x, y: middle.y))
        return (canvasSize, fitted)
    }

    /// The picture as it is shown (after the phone's rotation), scaled to 720 px on its short side, never up.
    private static func frame(
        natural: CGSize, transform: CGAffineTransform
    ) -> (size: CGSize, transform: CGAffineTransform) {
        let shown = CGRect(origin: .zero, size: natural).applying(transform)
        let scale = min(1, shortSide / max(1, min(shown.width, shown.height)))
        // Encoders want even sizes.
        let even: (CGFloat) -> CGFloat = { max(2, ($0 * scale / 2).rounded() * 2) }
        let size = CGSize(width: even(shown.width), height: even(shown.height))
        let fitted = transform
            .concatenating(CGAffineTransform(translationX: -shown.minX, y: -shown.minY))
            .concatenating(CGAffineTransform(scaleX: size.width / shown.width, y: size.height / shown.height))
        return (size, fitted)
    }

    /// One reading and writing of a video. Each track has a reader of its own: with one reader for both, the reader
    /// holds the picture back until the sound is taken while the writer holds the sound back until the picture
    /// comes, and the export stops for good (a 60-second test video did, a megabyte in).
    private final class Job: @unchecked Sendable {
        private let reader: AVAssetReader
        private var soundReader: AVAssetReader?
        private let writer: AVAssetWriter
        private var pairs: [(input: AVAssetWriterInput, output: AVAssetReaderOutput)] = []
        /// When a sample last went from a reader to the writer, and whether the watch gave the export up.
        private let beat = OSAllocatedUnfairLock(initialState: Date())
        private let stalled = OSAllocatedUnfairLock(initialState: false)
        /// Set by `cancel()`: each track's loop reads no more samples once it is.
        private let stopping = OSAllocatedUnfairLock(initialState: false)
        private let start: CMTime

        init(
            asset: AVURLAsset,
            tracks: (video: AVAssetTrack, sound: AVAssetTrack?),
            output: URL,
            range: CMTimeRange,
            bits: Int,
            marks: (overlay: Overlay?, placing: Placing?)
        ) async throws {
            let (video, sound) = tracks
            let composition = try await MomentsVideoEncoder.composition(for: video, overlay: marks.overlay, placing: marks.placing)
            let size = composition.renderSize
            let frames = composition.frameDuration.timescale
            start = range.start

            reader = try AVAssetReader(asset: asset)
            reader.timeRange = range
            writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
            writer.shouldOptimizeForNetworkUse = true
            // No location, no camera details.
            writer.metadata = []

            let pictures = AVAssetReaderVideoCompositionOutput(
                videoTracks: [video],
                videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
            )
            pictures.videoComposition = composition
            pictures.alwaysCopiesSampleData = false
            let pictureInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: size.width,
                AVVideoHeightKey: size.height,
                AVVideoColorPropertiesKey: [
                    AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2
                ],
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: bits,
                    AVVideoExpectedSourceFrameRateKey: frames,
                    AVVideoMaxKeyFrameIntervalKey: frames * 2,
                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
                ]
            ])
            pictureInput.expectsMediaDataInRealTime = false
            guard reader.canAdd(pictures), writer.canAdd(pictureInput) else { throw MomentsFailure.mediaRejected }
            reader.add(pictures)
            writer.add(pictureInput)
            pairs.append((pictureInput, pictures))

            if let sound {
                let samples = AVAssetReaderAudioMixOutput(audioTracks: [sound], audioSettings: [AVFormatIDKey: kAudioFormatLinearPCM])
                let soundInput = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                    AVFormatIDKey: kAudioFormatMPEG4AAC,
                    AVNumberOfChannelsKey: 2,
                    AVSampleRateKey: 44100,
                    AVEncoderBitRateKey: audioBitsPerSecond
                ])
                soundInput.expectsMediaDataInRealTime = false
                // A sound track that can't be read doesn't stop the video: it posts without sound.
                if let listener = try? AVAssetReader(asset: asset), listener.canAdd(samples), writer.canAdd(soundInput) {
                    listener.timeRange = range
                    listener.add(samples)
                    writer.add(soundInput)
                    pairs.append((soundInput, samples))
                    soundReader = listener
                }
            }
        }

        func run() async throws {
            guard reader.startReading(), soundReader?.startReading() ?? true, writer.startWriting() else {
                throw MomentsFailure.mediaRejected
            }
            writer.startSession(atSourceTime: start)
            beat.withLock { $0 = Date() }
            // Nothing in the reader or the writer says "stuck": an export that moves no sample is stopped from here.
            let watch = Task { [self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(2))
                    guard Date().timeIntervalSince(beat.withLock { $0 }) > stallSeconds else { continue }
                    stalled.withLock { $0 = true }
                    cancel()
                    // A read that is stuck never sees that: if the tracks still haven't finished a little later, only
                    // stopping the readers from here frees it, as before. (They have if this task was cancelled.)
                    try? await Task.sleep(for: .seconds(2))
                    if !Task.isCancelled { stopReaders() }
                    return
                }
            }
            await withTaskGroup(of: Void.self) { group in
                for index in pairs.indices {
                    group.addTask { await self.carry(index) }
                }
            }
            watch.cancel()
            // Every track's loop has ended, so no read is in progress: the readers can be stopped now.
            if stopping.withLock({ $0 }) { stopReaders() }
            guard reader.status == .completed, soundReader?.status ?? .completed == .completed, writer.status == .writing else {
                let refused = writer.status == .failed || reader.status == .failed || soundReader?.status == .failed
                    || stalled.withLock { $0 }
                writer.cancelWriting()
                throw refused ? MomentsFailure.mediaRejected : CancellationError()
            }
            await writer.finishWriting()
            guard writer.status == .completed else { throw MomentsFailure.mediaRejected }
        }

        /// Stops the export, from any thread: the task being cancelled (Retake, the composer closing), the watch, or a
        /// track whose sample the writer refused. Each track's loop sees it before its next read and finishes its
        /// track, and `run()` stops the readers once they all have. Stopping a reader from here while its track was
        /// inside `copyNextSampleBuffer()` on its own queue crashed the app in MediaToolbox.
        func cancel() {
            stopping.withLock { $0 = true }
        }

        private func stopReaders() {
            reader.cancelReading()
            soundReader?.cancelReading()
        }

        /// Moves one track's samples from the reader to the writer, as fast as the writer takes them.
        private func carry(_ index: Int) async {
            let queue = DispatchQueue(label: "app.pantopus.ios.moments.encode.\(index)")
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                pairs[index].input.requestMediaDataWhenReady(on: queue) { [self] in
                    let (input, output) = pairs[index]
                    while input.isReadyForMoreMediaData {
                        if !stopping.withLock({ $0 }), let sample = output.copyNextSampleBuffer() {
                            if input.append(sample) {
                                beat.withLock { $0 = Date() }
                                continue
                            }
                            // The writer refused it: nothing more can be written, so reading stops for every track.
                            cancel()
                        }
                        input.markAsFinished()
                        continuation.resume()
                        return
                    }
                }
            }
        }
    }
}
