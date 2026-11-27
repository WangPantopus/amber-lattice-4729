//
//  MomentsSoundRecorder.swift
//  Pantopus
//
//  Recording a Moment's sound in the Studio ("Pulse, reinvented" phase 2; CONTRACT 7e): Voice Spark (the person's own
//  voice, up to a minute), place sound and a dot's whisper (three seconds each), as AAC in an .m4a file on the phone.
//  A voice's words come from the phone's own speech recognition, on the device only (no service, no key); where the
//  phone can't, the person types them. Nothing is changed in the sound.
//

import AVFoundation
import Observation
import Speech

/// A sound recorded in the Studio, waiting for its Moment.
struct MomentsStudioRecording: Equatable {
    let file: URL
    let durationMs: Int
    /// A voice's words with their times (from speech, or spread over the voice when typed).
    var words: [MomentSoundWord]?
}

@Observable
@MainActor
final class MomentsSoundRecorder {
    enum Kind: String {
        case voice, place, whisper

        /// How long it may be: a minute for a voice, three seconds for place sound and a whisper.
        var seconds: Double {
            self == .voice ? 60 : 3
        }
    }

    enum State: Equatable {
        case idle, asking, recording, hearing, failed(String)
    }

    private(set) var state = State.idle
    private(set) var elapsed: Double = 0
    private var recorder: AVAudioRecorder?
    private var ticker: Task<Void, Never>?
    private var kind = Kind.voice
    private var category: AVAudioSession.Category?

    var recording: Bool {
        state == .recording
    }

    /// Starts recording (asking for the microphone the first time); it stops by itself at the kind's length.
    func start(_ kind: Kind, finished: @escaping @MainActor (MomentsStudioRecording?) -> Void) async {
        guard state != .recording, state != .asking else { return }
        self.kind = kind
        state = .asking
        guard await AVAudioApplication.requestRecordPermission() else {
            state = .failed("Pantopus can't use the microphone. Turn it on in Settings.")
            return
        }
        let session = AVAudioSession.sharedInstance()
        category = session.category
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
        } catch {
            state = .failed("Couldn't start recording. Try again.")
            return
        }
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("moment-sound-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: kind == .voice ? 64000 : 96000
        ]
        guard let made = try? AVAudioRecorder(url: file, settings: settings), made.record(forDuration: kind.seconds) else {
            state = .failed("Couldn't start recording. Try again.")
            restoreSession()
            return
        }
        recorder = made
        elapsed = 0
        state = .recording
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self, let recorder else { return }
                if recorder.isRecording {
                    elapsed = recorder.currentTime
                } else {
                    // The kind's length reached: it stopped by itself.
                    await finished(finish())
                    return
                }
            }
        }
    }

    /// Stops now; the recording (with a voice's words), or nil when nothing was kept.
    func stop() async -> MomentsStudioRecording? {
        guard state == .recording else { return nil }
        return await finish()
    }

    private func finish() async -> MomentsStudioRecording? {
        ticker?.cancel()
        ticker = nil
        guard let recorder else { return nil }
        let seconds = max(recorder.currentTime, elapsed)
        recorder.stop()
        self.recorder = nil
        restoreSession()
        let file = recorder.url
        let duration = await Self.duration(of: file) ?? seconds
        guard duration >= 0.4 else {
            state = .idle
            try? FileManager.default.removeItem(at: file)
            return nil
        }
        var made = MomentsStudioRecording(file: file, durationMs: Int((min(duration, kind.seconds + 0.4) * 1000).rounded()))
        if kind == .voice {
            state = .hearing
            made.words = await Self.words(of: file)
        }
        state = .idle
        return made
    }

    private func restoreSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        if let category { try? session.setCategory(category) }
    }

    private static func duration(of file: URL) async -> Double? {
        guard let time = try? await AVURLAsset(url: file).load(.duration), time.seconds.isFinite else { return nil }
        return time.seconds
    }

    /// The words said, with their times, by the phone's own speech recognition on the device; nil where it can't.
    static func words(of file: URL) async -> [MomentSoundWord]? {
        let allowed = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
        guard allowed, let recognizer = SFSpeechRecognizer(), recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else {
            return nil
        }
        let request = SFSpeechURLRecognitionRequest(url: file)
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = false
        return await withCheckedContinuation { continuation in
            let once = MomentsAnswerOnce()
            _ = recognizer.recognitionTask(with: request) { result, error in
                if let result, result.isFinal {
                    let words = result.bestTranscription.segments.prefix(200).map { segment in
                        MomentSoundWord(
                            w: segment.substring,
                            startMs: Int((segment.timestamp * 1000).rounded()),
                            endMs: Int(((segment.timestamp + segment.duration) * 1000).rounded())
                        )
                    }
                    if once.claim() { continuation.resume(returning: words.isEmpty ? nil : Array(words)) }
                } else if error != nil, once.claim() {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    /// Typed words spread evenly over the voice (when the phone couldn't hear them).
    static func spread(_ typed: String, over durationMs: Int) -> [MomentSoundWord]? {
        let words = typed.split(whereSeparator: \.isWhitespace).prefix(200).map(String.init)
        guard !words.isEmpty, durationMs > 0 else { return nil }
        let step = Double(durationMs) / Double(words.count)
        return words.enumerated().map { index, word in
            MomentSoundWord(w: word, startMs: Int(Double(index) * step), endMs: Int(Double(index + 1) * step))
        }
    }
}

/// Lets a callback that may come more than once answer only the first time.
private final class MomentsAnswerOnce: @unchecked Sendable {
    private let lock = NSLock()
    private var answered = false

    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !answered else { return false }
        answered = true
        return true
    }
}
