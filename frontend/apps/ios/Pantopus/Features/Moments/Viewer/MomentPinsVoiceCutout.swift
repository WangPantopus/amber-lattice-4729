//
//  MomentPinsVoiceCutout.swift
//  Pantopus
//
//  Pins on the photo, part 2 ("Pulse, reinvented" phase 3, PHASE-3 piece 4; CONTRACT 8b): besides a reaction, a reader
//  drops a voice bubble (three seconds, recorded as the Studio records a whisper, `MomentsSoundRecorder`) or one of
//  "Your cutouts" (`MomentsCutoutShelf`, the ones lifted in the Studio on this phone) on the chosen spot. Both go up as
//  multipart to `POST /api/reinvented/moments/:id/pins`; a cutout is checked before others see it (its sender sees
//  "Checking…"). Removing and reporting stay the replies' own. Drawn only inside the pin card, so only while the switch
//  is on and the Moment's replies are shown.
//

import AVFoundation
import SwiftUI
import UIKit

extension MultipartUploader {
    /// `POST /api/reinvented/moments/:id/pins` as multipart (a voice bubble or a cutout): the server's answer as it came.
    @MainActor
    func dropMomentPin(momentId: String, fields: [String: String], file: MultipartFile) async throws -> (Data, HTTPURLResponse) {
        let boundary = "PantopusBoundary-\(UUID().uuidString)"
        let id = momentId
            .addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? momentId
        let url = apiBaseURL.appendingPathComponent("/api/reinvented/moments/\(id)/pins")
        return try await performUpload(to: url, boundary: boundary, body: Self.buildBody(boundary: boundary, file: file, fields: fields))
    }
}

extension MomentPinsStore {
    /// The longest side a cutout goes up at (the server keeps up to 1024 and refuses more than 2 MB).
    static let cutoutSide: CGFloat = 768

    /// A voice bubble on the chosen spot: the recording's file, its length and (where the phone heard them) its words.
    func dropVoice(_ recording: MomentsStudioRecording, on momentId: String) async {
        guard let spot, let data = try? Data(contentsOf: recording.file) else { return }
        var fields = [
            "kind": "voice",
            "x": "\(spot.x)",
            "y": "\(spot.y)",
            "duration_ms": "\(max(1, recording.durationMs))"
        ]
        let words = (recording.words ?? []).map(\.w).joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        if !words.isEmpty { fields["text"] = String(words.prefix(200)) }
        await dropFile(
            MultipartFile(fieldName: "file", filename: "pin.m4a", mimeType: "audio/mp4", data: data),
            fields: fields,
            on: momentId
        )
    }

    /// One of "Your cutouts" on the chosen spot, as a PNG no larger than the server keeps.
    func dropCutout(_ image: UIImage, on momentId: String) async {
        guard let spot, let png = Self.smaller(image).pngData() else { return }
        let fields = ["kind": "cutout", "x": "\(spot.x)", "y": "\(spot.y)"]
        await dropFile(
            MultipartFile(fieldName: "file", filename: "pin.png", mimeType: "image/png", data: png),
            fields: fields,
            on: momentId
        )
    }

    private static func smaller(_ image: UIImage) -> UIImage {
        let side = max(image.size.width, image.size.height)
        guard side > cutoutSide else { return image }
        let scale = cutoutSide / side
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }
}

/// Under the five signals in the pin card: "A voice bubble (3 seconds)" and the cutouts lifted on this phone.
struct MomentPinsMoreRow: View {
    let moment: MomentDTO
    private let store = MomentPinsStore.shared
    private let shelf = MomentsCutoutShelf.shared
    @State private var recorder = MomentsSoundRecorder()
    @State private var recording: MomentsStudioRecording?
    @State private var player: AVPlayer?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            voice
            cutouts
        }
        .onAppear { shelf.load() }
        .onDisappear {
            Task { _ = await recorder.stop() }
            player?.pause()
            player = nil
        }
    }

    // MARK: A voice bubble

    @ViewBuilder private var voice: some View {
        if recorder.recording {
            Button { Task { recording = await recorder.stop() } } label: {
                label(icon: .square, "Stop · \(Int(max(0, 3 - recorder.elapsed).rounded(.up)))s left")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("moments.pins.voice.stop")
        } else if let recording {
            HStack(spacing: Spacing.s3) {
                Button {
                    player = AVPlayer(url: recording.file)
                    player?.play()
                } label: {
                    label(icon: .play, "Hear it")
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("moments.pins.voice.hear")
                Button { Task { await store.dropVoice(recording, on: moment.id) } } label: {
                    label(icon: .mic, store.busy ? "Dropping…" : "Drop this voice", strong: true)
                }
                .buttonStyle(.plain)
                .disabled(store.busy)
                .accessibilityIdentifier("moments.pins.voice.drop")
                Button("Again") { self.recording = nil }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.primaryTint)
                    .accessibilityIdentifier("moments.pins.voice.again")
            }
        } else {
            Button {
                Task {
                    await recorder.start(.whisper) { finished in recording = finished }
                }
            } label: {
                label(icon: .mic, "A voice bubble (3 seconds)")
            }
            .buttonStyle(.plain)
            .disabled(store.busy || recorder.state == .asking)
            .accessibilityIdentifier("moments.pins.voice.record")
        }
        if case let .failed(words) = recorder.state {
            Text(words)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.error)
        }
    }

    // MARK: Your cutouts

    @ViewBuilder private var cutouts: some View {
        if !shelf.kept.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text("Or one of your cutouts")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.s2) {
                        ForEach(shelf.kept) { kept in
                            Button { Task { await store.dropCutout(kept.image, on: moment.id) } } label: {
                                Image(uiImage: kept.image)
                                    .resizable()
                                    .scaledToFit()
                                    .frame(width: 52, height: 52)
                                    .padding(4)
                                    .background(RoundedRectangle(cornerRadius: Radii.md).fill(Theme.Color.appSurface))
                            }
                            .buttonStyle(.plain)
                            .disabled(store.busy)
                            .accessibilityLabel("Drop this cutout")
                            .accessibilityIdentifier("moments.pins.cutout")
                        }
                    }
                }
            }
        }
    }

    private func label(icon: PantopusIcon, _ words: String, strong: Bool = false) -> some View {
        HStack(spacing: 6) {
            Icon(icon, size: 16, strokeWidth: 2.2, color: strong ? .white : Theme.Color.primaryTint)
            Text(words)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(strong ? Color.white : Theme.Color.appText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 40)
        .background(Capsule().fill(strong ? Theme.Color.primarySolid : Theme.Color.appSurface))
        .contentShape(Capsule())
    }
}
