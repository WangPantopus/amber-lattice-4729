//
//  MomentsSoundCleaner.swift
//  Pantopus
//
//  Cleaning wind from the person's own sound ("Pulse, reinvented" phase 2, PHASE-2 piece 10; CONTRACT 7e's `cleaned`):
//  a copy of the recording with the wind's low rumble taken down (a high-pass filter and a lower low end), made on the
//  phone with the system's own audio tools: nothing is sent, no service, no key. The original stays until the Moment is
//  posted, so "Clean the wind" can be undone; a cleaned sound says so wherever it plays ("Anything it touched is
//  marked").
//

import AVFoundation

enum MomentsSoundCleaner {
    /// The cleaned copy, or nil when it couldn't be made (the original is kept then).
    static func clean(_ source: URL) async -> URL? {
        await Task.detached(priority: .userInitiated) { render(source) }.value
    }

    private static func render(_ source: URL) -> URL? {
        guard let input = try? AVAudioFile(forReading: source) else { return nil }
        let format = input.processingFormat
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        let filter = AVAudioUnitEQ(numberOfBands: 2)
        filter.bands[0].filterType = .highPass
        filter.bands[0].frequency = 150
        filter.bands[0].bypass = false
        filter.bands[1].filterType = .lowShelf
        filter.bands[1].frequency = 320
        filter.bands[1].gain = -6
        filter.bands[1].bypass = false
        engine.attach(player)
        engine.attach(filter)
        engine.connect(player, to: filter, format: format)
        engine.connect(filter, to: engine.mainMixerNode, format: format)
        do {
            try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096)
            try engine.start()
        } catch {
            return nil
        }
        defer { engine.stop() }
        player.scheduleFile(input, at: nil)
        player.play()
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("moment-sound-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: format.channelCount,
            AVEncoderBitRateKey: 96000
        ]
        let capacity = engine.manualRenderingMaximumFrameCount
        let made = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: capacity).map { buffer in
            (try? AVAudioFile(
                forWriting: out, settings: settings, commonFormat: format.commonFormat, interleaved: format.isInterleaved
            )).map { written(engine, input.length, into: buffer, file: $0) } ?? false
        } ?? false
        guard made else {
            try? FileManager.default.removeItem(at: out)
            return nil
        }
        return out
    }

    /// Renders the whole sound through the filter into the new file; false on any failure.
    private static func written(
        _ engine: AVAudioEngine,
        _ length: AVAudioFramePosition,
        into buffer: AVAudioPCMBuffer,
        file output: AVAudioFile
    ) -> Bool {
        while engine.manualRenderingSampleTime < length {
            let frames = AVAudioFrameCount(min(Int64(buffer.frameCapacity), length - engine.manualRenderingSampleTime))
            guard let status = try? engine.renderOffline(frames, to: buffer) else { return false }
            switch status {
            case .success: guard (try? output.write(from: buffer)) != nil else { return false }
            case .error: return false
            case .insufficientDataFromInputNode, .cannotDoInCurrentContext: continue
            @unknown default: return false
            }
        }
        return true
    }
}
