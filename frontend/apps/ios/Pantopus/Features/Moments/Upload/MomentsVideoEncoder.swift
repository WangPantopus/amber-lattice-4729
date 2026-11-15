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

    /// Writes `range` of the video at `source` to `output` as an MP4 at `bits` a second of video. Throws when the
    /// video can't be read or written.
    static func encode(_ source: URL, to output: URL, range: CMTimeRange, bits: Int = videoBitsPerSecond) async throws {
        let asset = AVURLAsset(url: source)
        guard let video = try await asset.loadTracks(withMediaType: .video).first else { throw MomentsFailure.mediaRejected }
        let sounds = try await asset.loadTracks(withMediaType: .audio)
        var sound: AVAssetTrack?
        for track in sounds where sound == nil {
            // A second sound track (spatial audio) is an alternate of the first, switched off.
            if try await track.load(.isEnabled) { sound = track }
        }
        let tracks = (video: video, sound: sound ?? sounds.first)
        let job = try await Job(asset: asset, tracks: tracks, output: output, range: range, bits: bits)
        try await withTaskCancellationHandler {
            try await job.run()
        } onCancel: {
            job.cancel()
        }
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
        private let start: CMTime

        init(
            asset: AVURLAsset, tracks: (video: AVAssetTrack, sound: AVAssetTrack?), output: URL, range: CMTimeRange, bits: Int
        ) async throws {
            let (video, sound) = tracks
            let (natural, transform, rate) = try await video.load(.naturalSize, .preferredTransform, .nominalFrameRate)
            let frame = MomentsVideoEncoder.frame(natural: natural, transform: transform)
            let frames = rate > 0 ? min(framesPerSecond, Int32(rate.rounded())) : framesPerSecond
            start = range.start

            reader = try AVAssetReader(asset: asset)
            reader.timeRange = range
            writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
            writer.shouldOptimizeForNetworkUse = true
            // No location, no camera details.
            writer.metadata = []

            let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: video)
            layer.setTransform(frame.transform, at: .zero)
            let instruction = AVMutableVideoCompositionInstruction()
            instruction.timeRange = CMTimeRange(start: .zero, duration: .positiveInfinity)
            instruction.layerInstructions = [layer]
            let composition = AVMutableVideoComposition()
            composition.renderSize = frame.size
            composition.frameDuration = CMTime(value: 1, timescale: max(1, frames))
            composition.instructions = [instruction]
            // Standard colours: an HDR video is tone-mapped here instead of looking washed out in H.264.
            composition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
            composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
            composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2

            let pictures = AVAssetReaderVideoCompositionOutput(
                videoTracks: [video],
                videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
            )
            pictures.videoComposition = composition
            pictures.alwaysCopiesSampleData = false
            let pictureInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: frame.size.width,
                AVVideoHeightKey: frame.size.height,
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
                    return
                }
            }
            await withTaskGroup(of: Void.self) { group in
                for index in pairs.indices {
                    group.addTask { await self.carry(index) }
                }
            }
            watch.cancel()
            guard reader.status == .completed, soundReader?.status ?? .completed == .completed, writer.status == .writing else {
                let refused = writer.status == .failed || reader.status == .failed || soundReader?.status == .failed
                    || stalled.withLock { $0 }
                writer.cancelWriting()
                throw refused ? MomentsFailure.mediaRejected : CancellationError()
            }
            await writer.finishWriting()
            guard writer.status == .completed else { throw MomentsFailure.mediaRejected }
        }

        func cancel() {
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
                        if let sample = output.copyNextSampleBuffer() {
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
