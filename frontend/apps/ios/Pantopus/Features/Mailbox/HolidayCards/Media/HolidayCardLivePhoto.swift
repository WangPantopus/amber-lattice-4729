//
//  HolidayCardLivePhoto.swift
//  Pantopus
//
//  A Live Photo picked for a card (`holiday_card_memories`; contract section 13, the founder's ask of November 16):
//  its still, as the picker gives any photo, and its few seconds of video, made here into an MP4 with no location or
//  other metadata before anything leaves the phone (the server blanks the tags again). Pulse's picker reads a Live
//  Photo's two parts the same way (`PulseMediaPicker.swift`). What isn't a Live Photo, or can't be read as one, is
//  just a photo.
//

import AVFoundation
import Photos
import PhotosUI
import SwiftUI

enum HolidayCardLivePhoto {
    /// The Live Photo's still and its moving part (at most `maxBytes`), or nil when the picked item isn't a Live Photo
    /// or either part can't be read: the caller then adds the photo as a still.
    ///
    /// The item is simply asked for a Live Photo. A still answers with none (checked on the iOS 27 simulator with
    /// HEIC and JPEG stills), and the SwiftUI picker's items don't list the Live Photo type that Pulse's UIKit picker
    /// checks first, so there is nothing to tell them apart by beforehand.
    static func load(_ item: PhotosPickerItem, maxBytes: Int) async -> (still: Data, clip: Data)? {
        guard let live = try? await item.loadTransferable(type: PHLivePhoto.self) else { return nil }
        let resources = PHAssetResource.assetResources(for: live)
        guard let still = resources.first(where: { $0.type == .photo || $0.type == .fullSizePhoto }),
              let clip = resources.first(where: { $0.type == .pairedVideo || $0.type == .fullSizePairedVideo }) else { return nil }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let stillURL = directory.appendingPathComponent("still")
            let clipURL = directory.appendingPathComponent("clip.mov")
            try await write(still, to: stillURL)
            try await write(clip, to: clipURL)
            let moving = try await clean(clipURL, into: directory.appendingPathComponent("clip.mp4"))
            guard !moving.isEmpty, moving.count <= maxBytes else { return nil }
            return try (Data(contentsOf: stillURL), moving)
        } catch {
            return nil
        }
    }

    private static func write(_ resource: PHAssetResource, to url: URL) async throws {
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
            PHAssetResourceManager.default().writeData(for: resource, toFile: url, options: options) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    /// The clip as an MP4 at most 1080 across, with its picture and sound and none of its metadata.
    private static func clean(_ clip: URL, into output: URL) async throws -> Data {
        guard let exporter = AVAssetExportSession(asset: AVURLAsset(url: clip), presetName: AVAssetExportPreset1920x1080) else {
            throw URLError(.cannotDecodeContentData)
        }
        exporter.outputURL = output
        exporter.outputFileType = .mp4
        exporter.metadata = []
        exporter.shouldOptimizeForNetworkUse = true
        await exporter.export()
        guard exporter.status == .completed else { throw exporter.error ?? URLError(.cannotDecodeContentData) }
        return try Data(contentsOf: output)
    }
}
