//
//  MomentsLoopMaker.swift
//  Pantopus
//
//  Makes a loop's file on the phone ("Pulse, reinvented" phase 0 step 5; CONTRACT 7j): the span of a video, upright at
//  720 px on its short side, with no sound, and with "Bounce" the same frames backwards after it, so the file itself is
//  the loop. Every app plays it: the new viewers repeat it, today's play it once as a short, silent video. Nothing is
//  sent anywhere while it is made; today's export then makes it ready to post like any video.
//

import AVFoundation
import CoreVideo
import Foundation

enum MomentsLoopMaker {
    /// A loop is half a second to six seconds (CONTRACT 7j). With Bounce the file is twice the span.
    static let shortest = 0.5
    static let longest = 6.0
    static let longestBounce = 3.0
    /// The bounce's way back is read in pieces this long, so only a few frames are held at a time.
    private static let pieceSeconds = 0.4

    enum Failure: Error {
        case unreadable
        case unwritable
    }

    /// Writes `length` seconds of the video at `source` from `start` to a new file, silent, and with `bounce` played
    /// back again after it. Answers the file and its length in seconds.
    static func make(_ source: URL, start: Double, length: Double, bounce: Bool) async throws -> (url: URL, seconds: Double) {
        let asset = AVURLAsset(url: source)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw Failure.unreadable }
        let duration = try await asset.load(.duration).seconds
        let from = max(0, min(start, max(duration - shortest, 0)))
        let span = min(max(length, shortest), bounce ? longestBounce : longest, max(duration - from, 0))
        guard span >= shortest - 0.01 else { throw Failure.unreadable }
        // Upright, at 720 px on its short side and at most 30 frames a second: what today's export makes of any video.
        let composition = try await MomentsVideoEncoder.composition(for: track, overlay: nil)
        let video = Source(asset: asset, track: track, composition: composition)
        let size = composition.renderSize
        let output = MomentsDraftFiles.newFile(MomentsDraftFiles.libraryPrefix)
        let writer = try AVAssetWriter(outputURL: output, fileType: .mov)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height),
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: MomentsVideoEncoder.videoBitsPerSecond,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
            ]
        ])
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
        guard writer.canAdd(input) else { throw Failure.unwritable }
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? Failure.unwritable }
        writer.startSession(atSourceTime: .zero)
        do {
            let range = CMTimeRange(
                start: CMTime(seconds: from, preferredTimescale: 600),
                duration: CMTime(seconds: span, preferredTimescale: 600)
            )
            // The way there: every frame of the span, written as it is read.
            var first: CMTime?
            var last = CMTime.zero
            try await each(video, range: range) { buffer, time in
                let at = time - range.start
                guard at >= .zero else { return }
                if first == nil { first = at }
                try await append(buffer, at: at, to: input, adaptor)
                last = at
            }
            guard let first else { throw Failure.unreadable }
            var end = last + composition.frameDuration
            if bounce {
                try await back(video, range: range, first: first, last: last) { buffer, at in
                    try await append(buffer, at: at, to: input, adaptor)
                }
                end = last + (last - first)
            }
            input.markAsFinished()
            writer.endSession(atSourceTime: end)
            await writer.finishWriting()
            guard writer.status == .completed else { throw writer.error ?? Failure.unwritable }
            return (output, end.seconds)
        } catch {
            writer.cancelWriting()
            try? FileManager.default.removeItem(at: output)
            throw error
        }
    }

    /// The way back: the same frames from the last but one to the second, a short piece at a time from the end, so only
    /// a few frames are held at once. `write` takes each with its time in the file (after the way there).
    private static func back(
        _ video: Source,
        range: CMTimeRange,
        first: CMTime,
        last: CMTime,
        write: (CVPixelBuffer, CMTime) async throws -> Void
    ) async throws {
        var pieceEnd = range.end
        while pieceEnd > range.start {
            let pieceStart = max(range.start, pieceEnd - CMTime(seconds: pieceSeconds, preferredTimescale: 600))
            var piece: [(buffer: CVPixelBuffer, at: CMTime)] = []
            let span = CMTimeRange(start: pieceStart, end: pieceEnd)
            try await each(video, range: span) { buffer, time in
                let at = time - range.start
                guard at > first, at < last, time >= pieceStart, time < pieceEnd else { return }
                try piece.append((copy(buffer), at))
            }
            for frame in piece.reversed() {
                try await write(frame.buffer, last + (last - frame.at))
            }
            pieceEnd = pieceStart
        }
    }

    /// Each frame of `range`, upright and at the composition's size, in order. A frame lasts only for its call: keep
    /// one with `copy`.
    private static func each(_ video: Source, range: CMTimeRange, _ body: (CVPixelBuffer, CMTime) async throws -> Void) async throws {
        let reader = try AVAssetReader(asset: video.asset)
        let output = AVAssetReaderVideoCompositionOutput(
            videoTracks: [video.track],
            videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        )
        output.videoComposition = video.composition
        output.alwaysCopiesSampleData = false
        guard reader.canAdd(output) else { throw Failure.unreadable }
        reader.add(output)
        reader.timeRange = range
        guard reader.startReading() else { throw reader.error ?? Failure.unreadable }
        defer { reader.cancelReading() }
        while let sample = output.copyNextSampleBuffer() {
            try Task.checkCancellation()
            guard let buffer = CMSampleBufferGetImageBuffer(sample) else { continue }
            try await body(buffer, CMSampleBufferGetPresentationTimeStamp(sample))
        }
        guard reader.status != .failed else { throw reader.error ?? Failure.unreadable }
    }

    /// The video being read: its file, its picture track and how each frame is drawn upright at its size.
    private struct Source {
        let asset: AVAsset
        let track: AVAssetTrack
        let composition: AVVideoComposition
    }

    private static func append(
        _ buffer: CVPixelBuffer, at time: CMTime, to input: AVAssetWriterInput, _ adaptor: AVAssetWriterInputPixelBufferAdaptor
    ) async throws {
        while !input.isReadyForMoreMediaData {
            try await Task.sleep(for: .milliseconds(5))
        }
        guard adaptor.append(buffer, withPresentationTime: time) else { throw Failure.unwritable }
    }

    /// A frame of its own, so the reader's buffers go back to it.
    private static func copy(_ source: CVPixelBuffer) throws -> CVPixelBuffer {
        var made: CVPixelBuffer?
        let attributes = [kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any]()] as CFDictionary
        let (width, height) = (CVPixelBufferGetWidth(source), CVPixelBufferGetHeight(source))
        CVPixelBufferCreate(nil, width, height, CVPixelBufferGetPixelFormatType(source), attributes, &made)
        guard let made else { throw Failure.unwritable }
        CVPixelBufferLockBaseAddress(source, .readOnly)
        CVPixelBufferLockBaseAddress(made, [])
        defer {
            CVPixelBufferUnlockBaseAddress(made, [])
            CVPixelBufferUnlockBaseAddress(source, .readOnly)
        }
        guard let from = CVPixelBufferGetBaseAddress(source), let into = CVPixelBufferGetBaseAddress(made) else { throw Failure.unwritable }
        let rows = CVPixelBufferGetHeight(source)
        let fromRow = CVPixelBufferGetBytesPerRow(source)
        let intoRow = CVPixelBufferGetBytesPerRow(made)
        for row in 0..<rows {
            memcpy(into + row * intoRow, from + row * fromRow, min(fromRow, intoRow))
        }
        return made
    }
}
