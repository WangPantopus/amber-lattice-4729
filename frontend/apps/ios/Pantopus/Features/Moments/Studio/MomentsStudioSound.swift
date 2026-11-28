//
//  MomentsStudioSound.swift
//  Pantopus
//
//  The Studio's Sound ("Pulse, reinvented" phase 2: Voice Spark and place sound; CONTRACT 7e). On a photo or video
//  Moment under the person's own name (a voice tells who someone is: never under a made-up name). Voice Spark is the
//  person's own voice, up to a minute, with their exact words lit as they are said; place sound is three seconds of
//  where they are. A Moment carries one of the two; a whisper dot (Illuminate) carries its own three seconds. They go
//  up after the Moment is made, as its media do.
//

import SwiftUI

extension MomentsComposerModel {
    /// Sound goes on a photo or a video under the person's own name.
    var offersSound: Bool {
        offersDots && !postsUnderMadeUpName
    }

    var studioVoice: MomentsStudioRecording? {
        offersSound ? marking.studio?.voice : nil
    }

    var studioPlace: MomentsStudioRecording? {
        offersSound ? marking.studio?.place : nil
    }

    /// A voice recorded (or taken off): its words fill in; a voice replaces place sound.
    func setStudioVoice(_ recording: MomentsStudioRecording?) {
        if marking.studio == nil { marking.studio = MomentsStudioTools() }
        let before = marking.studio?.voice
        marking.studio?.voice = recording
        // The same take with the wind cleaned (or put back) keeps the words already typed for it.
        let sameTake = recording.map { new in before.map { new.original == $0.file || $0.original == new.file } ?? false } ?? false
        if !sameTake { marking.studio?.voiceWords = recording?.words?.map(\.w).joined(separator: " ") ?? "" }
        if recording != nil { marking.studio?.place = nil }
    }

    func setStudioPlace(_ recording: MomentsStudioRecording?) {
        if marking.studio == nil { marking.studio = MomentsStudioTools() }
        marking.studio?.place = recording
        if recording != nil {
            marking.studio?.voice = nil
            marking.studio?.voiceWords = ""
        }
    }

    func setWhisper(_ recording: MomentsStudioRecording?, dot: String) {
        marking.studio?.whispers[dot] = recording
    }

    /// The voice's words as they go out: as heard, or, once the person changed them, spread over the voice.
    private var voiceWordsOut: [MomentSoundWord]? {
        guard let voice = studioVoice else { return nil }
        let typed = (marking.studio?.voiceWords ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if let heard = voice.words, heard.map(\.w).joined(separator: " ") == typed { return heard }
        return MomentsSoundRecorder.spread(typed, over: voice.durationMs)
    }

    /// After Post: the Moment's voice or place sound, and its whispers, go up (switch on only; under one's own name).
    func uploadStudioSounds(to moment: MomentDTO?) {
        guard let moment, offersSound else { return }
        var sends: [MomentsSoundSend] = []
        if let voice = studioVoice { sends.append(MomentsSoundSend(kind: "voice", recording: voice, words: voiceWordsOut)) }
        if let place = studioPlace { sends.append(MomentsSoundSend(kind: "place", recording: place)) }
        let sentDots = Set((studioDots ?? []).filter { $0.kind == .whisper }.map(\.id))
        for (dot, whisper) in marking.studio?.whispers ?? [:] where sentDots.contains(dot) {
            sends.append(MomentsSoundSend(kind: "whisper", recording: whisper, dot: dot))
        }
        guard !sends.isEmpty else { return }
        Task { @MainActor in
            var refused: [(what: String, why: String)] = []
            for send in sends {
                if let why = await send.upload(momentId: moment.id) { refused.append((send.what, why)) }
            }
            // The Studio has usually closed by now: one alert tells the author what isn't on their Moment, and why.
            if let first = refused.first {
                let title = refused.count == 1 ? "\(first.what) wasn't added" : "Some of your sound wasn't added"
                await MomentsSoundRefusalAlert.show(title, refused.count == 1 ? first.why : refused.map(\.why).joined(separator: "\n"))
            }
        }
    }
}

/// One sound going up for a Moment just made.
struct MomentsSoundSend {
    let kind: String
    let recording: MomentsStudioRecording
    var dot: String?
    var words: [MomentSoundWord]?

    /// "Your voice", for the words that tell its author it wasn't added.
    var what: String {
        switch kind {
        case "voice": "Your voice"
        case "place": "Your place sound"
        default: "Your whisper"
        }
    }

    /// Sends it; nil when it went on, else what to tell its author: the server's own sentence where it gave one. A 503
    /// or a lost connection is tried once more; `403 PULSE_REINVENTED_OFF` reads the switch again at once (CONTRACT 7e).
    @MainActor
    func upload(momentId: String) async -> String? {
        defer {
            try? FileManager.default.removeItem(at: recording.file)
            if let original = recording.original { try? FileManager.default.removeItem(at: original) }
        }
        guard let data = try? Data(contentsOf: recording.file) else { return "It couldn't be read on your iPhone." }
        var fields = ["kind": kind, "duration_ms": String(recording.durationMs)]
        if let dot { fields["dot"] = dot }
        if recording.cleaned { fields["cleaned"] = "true" }
        if let words, let json = try? JSONEncoder().encode(words) { fields["words"] = String(data: json, encoding: .utf8) }
        let file = MultipartFile(fieldName: "file", filename: "\(kind).m4a", mimeType: "audio/mp4", data: data)
        var failure = StudioPlayFailure(status: 0, code: nil, words: nil)
        for attempt in 0..<2 {
            if attempt > 0 { try? await Task.sleep(for: .seconds(2)) }
            guard let answer = try? await MultipartUploader.shared.uploadMomentSound(momentId: momentId, file: file, fields: fields) else {
                // A lost connection: once more.
                continue
            }
            if (200..<300).contains(answer.status) { return nil }
            let json = (try? JSONSerialization.jsonObject(with: answer.body)) as? [String: Any]
            failure = StudioPlayFailure(status: answer.status, code: json?["code"] as? String, words: json?["error"] as? String)
            if failure.code == "PULSE_REINVENTED_OFF" { await PulseReinventedFlags.shared.recheck() }
            // Storage down: once more; any other answer stands.
            guard answer.status == 503 else { break }
        }
        return failure.message("It couldn't be sent. Try again on a new Moment.")
    }
}

/// The one alert that tells a Moment's author its sound wasn't added, over whatever is on screen once the Studio closed.
@MainActor
enum MomentsSoundRefusalAlert {
    static func show(_ title: String, _ message: String) async {
        // Let the Studio's own cover finish closing first.
        try? await Task.sleep(for: .milliseconds(700))
        guard let top = topViewController() else { return }
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        top.present(alert, animated: true)
    }

    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes
        let scene = (scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene) ?? scenes.first as? UIWindowScene
        var top = (scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first)?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}

/// The Studio's Sound sheet: your voice (with your words) or place sound, one of the two.
struct MomentsStudioSoundSheet: View {
    let model: MomentsComposerModel
    let onDone: () -> Void
    @State private var recorder = MomentsSoundRecorder()
    @State private var recordingKind: MomentsSoundRecorder.Kind?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                Text("A Moment carries your voice or its place sound, one of the two.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                head("Your voice", "Up to a minute, with your words lit as you say them")
                MomentsSoundRecordRow(recorder: recorder, kind: .voice, kept: model.studioVoice, recordingKind: $recordingKind) {
                    model.setStudioVoice($0)
                }
                if model.studioVoice != nil {
                    words
                }
                head("Place sound", "Three seconds of where you are")
                MomentsSoundRecordRow(recorder: recorder, kind: .place, kept: model.studioPlace, recordingKind: $recordingKind) {
                    model.setStudioPlace($0)
                }
                if case let .failed(words) = recorder.state {
                    Text(words)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s5)
            .padding(.bottom, Spacing.s4)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.studio.sound")
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField(
                "",
                text: Binding(
                    get: { model.marking.studio?.voiceWords ?? "" },
                    set: { model.marking.studio?.voiceWords = String($0.prefix(1200)) }
                ),
                prompt: Text("Your words, as you said them").foregroundColor(Theme.Color.appTextSecondary),
                axis: .vertical
            )
            .font(.system(size: 15))
            .foregroundStyle(Theme.Color.appText)
            .lineLimit(2...5)
            .padding(12)
            .typesInFieldOnTap()
            .background(RoundedRectangle(cornerRadius: Radii.md).fill(Theme.Color.appSurfaceRaised))
            .accessibilityLabel("Your words, as you said them")
            .accessibilityIdentifier("moments.studio.sound.words")
            Text(model.studioVoice?.words == nil
                ? "Your phone couldn't turn this into words. Type what you said; it shows as you speak."
                : "Your phone heard these words. Fix anything it got wrong.")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func head(_ title: String, _ line: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
            Text(line)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.appTextSecondary)
        }
    }
}

/// Record (tap to start, tap to stop; it stops by itself at the kind's length), hear it back, take it off.
struct MomentsSoundRecordRow: View {
    let recorder: MomentsSoundRecorder
    let kind: MomentsSoundRecorder.Kind
    let kept: MomentsStudioRecording?
    @Binding var recordingKind: MomentsSoundRecorder.Kind?
    let onChange: (MomentsStudioRecording?) -> Void
    private let player = MomentSoundPlayer.shared

    private var mine: Bool {
        recordingKind == kind && (recorder.recording || recorder.state == .hearing || recorder.state == .asking)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            controls
            if let kept, !mine { MomentsSoundWindChip(kept: kept, onChange: onChange) }
        }
    }

    private var controls: some View {
        HStack(spacing: Spacing.s2) {
            if mine, recorder.recording {
                chip("Stop · \(Self.time(recorder.elapsed)) / \(Self.time(kind.seconds))", icon: .square, on: true) {
                    Task { await onChange(recorder.stop()) }
                }
            } else if mine, recorder.state == .hearing {
                chip("Hearing your words…", icon: .mic, on: false) {}
            } else {
                chip(kept == nil ? (kind == .voice ? "Record your voice" : "Record 3 seconds") : "Record again", icon: .mic, on: false) {
                    recordingKind = kind
                    Task {
                        await recorder.start(kind) { made in onChange(made) }
                    }
                }
                .disabled(recorder.recording || recorder.state == .hearing)
            }
            if let kept, !mine {
                chip("Hear it", icon: .play, on: false) { player.play(kept.file, on: "studio") }
                Button { onChange(nil) } label: {
                    Icon(.trash, size: 16, strokeWidth: 2.2, color: Theme.Color.appTextSecondary)
                        .frame(width: 38, height: 38)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Take the sound off")
                .accessibilityIdentifier("moments.studio.sound.\(kind.rawValue).off")
            }
        }
    }

    static func time(_ seconds: Double) -> String {
        let whole = Int(seconds.rounded(.down))
        return "\(whole / 60):\(String(format: "%02d", whole % 60))"
    }

    private func chip(_ words: String, icon: PantopusIcon, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Icon(icon, size: 15, strokeWidth: 2.2, color: on ? .white : Theme.Color.primaryTint)
                Text(words)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(on ? Color.white : Theme.Color.appText)
                    .monospacedDigit()
            }
            .padding(.horizontal, 12)
            .frame(height: 38)
            .background(Capsule().fill(on ? Theme.Color.primarySolid : Theme.Color.appSurfaceRaised))
            .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: on ? 0 : 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("moments.studio.sound.\(kind.rawValue)")
    }
}

/// "Clean the wind": a cleaned copy made on the phone, marked as cleaned; a second tap puts the original back.
struct MomentsSoundWindChip: View {
    let kept: MomentsStudioRecording
    let onChange: (MomentsStudioRecording?) -> Void
    @State private var cleaning = false

    var body: some View {
        Button {
            Task { await toggle() }
        } label: {
            HStack(spacing: 6) {
                if cleaning {
                    ProgressView().controlSize(.small)
                } else {
                    Icon(kept.cleaned ? .check : .wind, size: 15, strokeWidth: 2.2, color: Theme.Color.primaryTint)
                }
                Text(cleaning ? "Cleaning the wind…" : kept.cleaned ? "Wind cleaned · your sound says so" : "Clean the wind")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
            }
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(Capsule().fill(Theme.Color.appSurfaceRaised))
            .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(cleaning)
        .accessibilityLabel(kept
            .cleaned ? "Wind cleaned. Tap to put the sound back as it was." : "Clean the wind from this sound, on your iPhone")
        .accessibilityIdentifier("moments.studio.sound.wind")
    }

    private func toggle() async {
        if kept.cleaned, let original = kept.original {
            try? FileManager.default.removeItem(at: kept.file)
            return onChange(MomentsStudioRecording(file: original, durationMs: kept.durationMs, words: kept.words))
        }
        cleaning = true
        defer { cleaning = false }
        guard let made = await MomentsSoundCleaner.clean(kept.file) else { return }
        let cleaned = MomentsStudioRecording(file: made, durationMs: kept.durationMs, words: kept.words, cleaned: true, original: kept.file)
        onChange(cleaned)
    }
}
