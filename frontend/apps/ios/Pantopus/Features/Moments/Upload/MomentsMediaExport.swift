//
//  MomentsMediaExport.swift
//  Pantopus
//
//  A photo or video made ready to post (Moments brief, "Posting"): a photo
//  becomes an upright JPEG no larger than 2048 px with no metadata; a video
//  becomes an MP4 at 720p and a known bit rate (`MomentsVideoEncoder`: H.264,
//  with its sound, no metadata), sized to the largest file the server takes,
//  with a poster frame and two more frames for the server's picture check. A
//  video longer than one Moment's (60 seconds, `MomentsLimits`) is cut into
//  equal parts, each a Moment of its own. The files sit in each Moment's own
//  outbox folder until the upload is done.
//

import AVFoundation
import Foundation
import UIKit

/// What an upload sends, as file names inside the Moment's outbox folder.
struct MomentPreparedMedia: Codable, Hashable {
    let kind: MomentKind
    let file: String
    let mimeType: String
    let poster: String?
    let frames: [String]
    let durationMs: Double?
}

enum MomentsMediaExport {
    /// The longest one Moment's video may be (the camera stops there).
    static var maxVideoSeconds: Double {
        MomentsLimits.video.maxSeconds
    }

    /// The longest video that can be picked: it posts as several Moments.
    static var longestVideoSeconds: Double {
        MomentsLimits.longestVideoSeconds
    }

    /// A little over, for a clip the camera stopped at 30 s.
    static let videoSecondsTolerance = 0.6
    /// The largest video file the server takes.
    static var maxVideoBytes: Int {
        MomentsLimits.video.maxBytes
    }

    /// The system's export is stepped down a size while its file is over this.
    private static var roomyVideoBytes: Int {
        min(24 * 1024 * 1024, Int(Double(maxVideoBytes) * 0.92))
    }

    private static let maxPhotoPixels: CGFloat = 2048

    // MARK: - Photo

    /// A photo from its bytes (the camera's, or the library's).
    static func photo(data: Data, into folder: URL) throws -> MomentPreparedMedia {
        guard let image = UIImage(data: data) else { throw MomentsFailure.mediaRejected }
        return try photo(image, into: folder)
    }

    /// An upright JPEG at most 2048 px on its longest side. Drawing it again
    /// leaves the camera's details (and any location) behind.
    static func photo(_ image: UIImage, into folder: URL) throws -> MomentPreparedMedia {
        let jpeg = try jpegData(image, maxPixels: maxPhotoPixels, quality: 0.85)
        let name = "photo.jpg"
        try jpeg.write(to: folder.appendingPathComponent(name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return MomentPreparedMedia(kind: .photo, file: name, mimeType: "image/jpeg", poster: nil, frames: [], durationMs: nil)
    }

    // MARK: - Video

    /// How long a video is, in seconds.
    static func duration(of url: URL) async -> Double {
        guard let time = try? await AVURLAsset(url: url).load(.duration) else { return 0 }
        return time.seconds.isFinite ? time.seconds : 0
    }

    /// A video's picture as it's shown (after the phone's rotation) and its length: what the marks editor frames.
    static func shown(_ url: URL) async -> (size: CGSize, seconds: Double)? {
        guard let track = try? await AVURLAsset(url: url).loadTracks(withMediaType: .video).first,
              let (natural, transform) = try? await track.load(.naturalSize, .preferredTransform)
        else { return nil }
        let shown = CGRect(origin: .zero, size: natural).applying(transform)
        return await (CGSize(width: abs(shown.width), height: abs(shown.height)), duration(of: url))
    }

    /// Where a video's own file says it was taken (its location tag,
    /// "+45.6237-122.6812/"), for a library video Photos has no place for.
    static func location(of url: URL) async -> (latitude: Double, longitude: Double)? {
        guard let items = try? await AVURLAsset(url: url).load(.metadata) else { return nil }
        // An iPhone's tag, then the one Android cameras write.
        let tagged = AVMetadataItem.metadataItems(from: items, filteredByIdentifier: .commonIdentifierLocation)
            + AVMetadataItem.metadataItems(from: items, filteredByIdentifier: .quickTimeMetadataLocationISO6709)
            + AVMetadataItem.metadataItems(from: items, filteredByIdentifier: .quickTimeUserDataLocationISO6709)
        for item in tagged {
            if let text = try? await item.load(.stringValue), let point = coordinate(iso6709: text) { return point }
        }
        return nil
    }

    /// Latitude and longitude from "+45.6237-122.6812+012.3/".
    static func coordinate(iso6709 text: String) -> (latitude: Double, longitude: Double)? {
        let characters = Array(text.trimmingCharacters(in: .whitespacesAndNewlines))
        let isSign: (Character) -> Bool = { $0 == "+" || $0 == "-" }
        guard let first = characters.first, isSign(first),
              let split = characters.indices.dropFirst().first(where: { isSign(characters[$0]) }) else { return nil }
        let end = characters.indices.first { $0 > split && (isSign(characters[$0]) || characters[$0] == "/") } ?? characters.count
        guard let latitude = Double(String(characters[..<split])), let longitude = Double(String(characters[split..<end])),
              abs(latitude) <= 90, abs(longitude) <= 180 else { return nil }
        return (latitude, longitude)
    }

    /// The stretches of a video `seconds` long that each make one Moment: one for a video a Moment can hold, else
    /// equal parts (130 seconds is three of 43.3, never two of 60 and a scrap).
    static func parts(of seconds: Double) -> [CMTimeRange] {
        let limits = MomentsLimits.video
        let whole = min(seconds, limits.maxSeconds * Double(limits.maxParts))
        let count = whole <= limits.maxSeconds + videoSecondsTolerance
            ? 1
            : min(limits.maxParts, Int((whole / limits.maxSeconds).rounded(.up)))
        let each = min(whole, limits.maxSeconds * Double(count)) / Double(count)
        return (0..<count).map { index in
            CMTimeRange(
                start: CMTime(seconds: each * Double(index), preferredTimescale: 600),
                duration: CMTime(seconds: each, preferredTimescale: 600)
            )
        }
    }

    /// What's said when a video's marks or its placement can't be put on it: it isn't posted without them.
    static let marksFailed = "Couldn't put your changes on this video. Tap Done in Text, Draw or Resize to try again."

    /// An MP4 at 720p with its sound, its poster and two frames: the whole video, or the `part` of it this Moment is,
    /// with `overlay` (Text and Draw) over every frame and each frame at `placing` on the 9:16 canvas (Resize). The
    /// poster and frames come from the file, so they carry it too.
    static func video(
        at source: URL,
        into folder: URL,
        part: CMTimeRange? = nil,
        overlay: MomentsVideoEncoder.Overlay? = nil,
        placing: MomentsVideoEncoder.Placing? = nil
    ) async throws -> MomentPreparedMedia {
        let seconds = await duration(of: source)
        guard seconds > 0 else { throw MomentsFailure.mediaRejected }
        guard part != nil || seconds <= maxVideoSeconds + videoSecondsTolerance else { throw MomentsFailure.mediaTooLong }
        let name = "video.mp4"
        let output = folder.appendingPathComponent(name)
        let range = part ?? CMTimeRange(start: .zero, duration: CMTime(seconds: min(seconds, maxVideoSeconds), preferredTimescale: 600))
        let kept = range.duration.seconds
        // The background's colours, from the first frame, when the editor hadn't read them.
        var placing = placing
        if let placed = placing, placed.backdrop == nil {
            let colors = await MomentPlacementDrawing.backdrop(ofVideo: source)
            placing = MomentsVideoEncoder.Placing(placement: placed.placement, backdrop: colors)
        }
        try? FileManager.default.removeItem(at: output)
        do {
            var bits = MomentsVideoEncoder.videoBits(seconds: kept, maxBytes: maxVideoBytes)
            try await MomentsVideoEncoder.encode(source, to: output, range: range, bits: bits, overlay: overlay, placing: placing)
            // An encoder that ran over its bit rate (it is asked for an average) gets one more go, at what fits.
            let made = fileBytes(output)
            if made > maxVideoBytes {
                bits = Int(Double(bits) * Double(maxVideoBytes) / Double(made) * 0.9)
                try? FileManager.default.removeItem(at: output)
                try await MomentsVideoEncoder.encode(
                    source, to: output, range: range, bits: max(bits, 800_000), overlay: overlay, placing: placing
                )
            }
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            // A video the encoder can't take still posts, through the system's own export (not one let go meanwhile),
            // with the same marks and placement or not at all.
            try Task.checkCancellation()
            try await systemExport(source, to: output, range: range, changes: (overlay, placing))
        }
        // Said here, before the Moment is made, not after its file has gone up and been refused.
        guard fileBytes(output) <= maxVideoBytes else { throw MomentsFailure.mediaTooLarge }
        let frames = try await stills(of: AVURLAsset(url: output), seconds: kept, into: folder)
        return MomentPreparedMedia(
            kind: .video,
            file: name,
            mimeType: "video/mp4",
            poster: frames.first,
            frames: Array(frames.dropFirst()),
            durationMs: kept * 1000
        )
    }

    /// The system's export, whose file size nobody promises (26.6 MB for 13 seconds of 4K HDR on an iPhone): the
    /// largest of its sizes whose file has room, else the smallest.
    private static func systemExport(
        _ source: URL,
        to output: URL,
        range: CMTimeRange,
        changes: (overlay: MomentsVideoEncoder.Overlay?, placing: MomentsVideoEncoder.Placing?)
    ) async throws {
        let asset = AVURLAsset(url: source)
        // Marks and the placement go through the encoder's own composition (`MomentsMarksCompositor`).
        let changed = changes.overlay != nil || changes.placing != nil
        var marked: AVVideoComposition?
        if changed {
            guard let track = try? await asset.loadTracks(withMediaType: .video).first,
                  let composition = try? await MomentsVideoEncoder.composition(
                      for: track, overlay: changes.overlay, placing: changes.placing
                  )
            else { throw MomentsFailure.other(marksFailed) }
            marked = composition
        }
        for preset in [AVAssetExportPreset1280x720, AVAssetExportPreset960x540, AVAssetExportPreset640x480] {
            try? FileManager.default.removeItem(at: output)
            guard let exporter = AVAssetExportSession(asset: asset, presetName: preset) else {
                throw changed ? MomentsFailure.other(marksFailed) : MomentsFailure.mediaRejected
            }
            exporter.videoComposition = marked
            exporter.outputURL = output
            exporter.outputFileType = .mp4
            // No location, no camera details.
            exporter.metadata = []
            exporter.shouldOptimizeForNetworkUse = true
            exporter.timeRange = range
            await exporter.export()
            guard exporter.status == .completed
            else { throw changed ? MomentsFailure.other(marksFailed) : MomentsFailure.mediaRejected }
            if fileBytes(output) <= roomyVideoBytes { return }
        }
    }

    private static func fileBytes(_ url: URL) -> Int {
        ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int) ?? 0
    }

    /// The poster (near the start) and frames a third and two thirds in.
    private static func stills(of asset: AVURLAsset, seconds: Double, into folder: URL) async throws -> [String] {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1280, height: 1280)
        generator.requestedTimeToleranceBefore = CMTime(seconds: 0.2, preferredTimescale: 600)
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.2, preferredTimescale: 600)
        let times = [min(0.1, seconds / 10), seconds / 3, seconds * 2 / 3]
        var names: [String] = []
        for (index, time) in times.enumerated() {
            let image = try await generator.image(at: CMTime(seconds: time, preferredTimescale: 600)).image
            let name = index == 0 ? "poster.jpg" : "frame\(index).jpg"
            let data = try jpegData(UIImage(cgImage: image), maxPixels: 1280, quality: 0.8)
            try data.write(to: folder.appendingPathComponent(name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            names.append(name)
        }
        return names
    }

    // MARK: - Helpers

    private static func jpegData(_ image: UIImage, maxPixels: CGFloat, quality: CGFloat) throws -> Data {
        let pixels = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        let longest = max(pixels.width, pixels.height)
        guard longest > 0 else { throw MomentsFailure.mediaRejected }
        let scale = min(1, maxPixels / longest)
        let target = CGSize(width: (pixels.width * scale).rounded(), height: (pixels.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let upright = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        guard let data = upright.jpegData(compressionQuality: quality) else { throw MomentsFailure.mediaRejected }
        return data
    }
}

/// The multipart body for `POST /api/moments/:id/media`, written to a file so
/// a large video is never held in memory twice.
enum MomentsUploadBody {
    static func write(media: MomentPreparedMedia, folder: URL, boundary: String) throws -> URL {
        let url = folder.appendingPathComponent("upload-body")
        FileManager.default.createFile(
            atPath: url.path,
            contents: nil,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        )
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try part(handle, boundary: boundary, field: "file", file: folder.appendingPathComponent(media.file), mimeType: media.mimeType)
        if let poster = media.poster {
            try part(handle, boundary: boundary, field: "poster", file: folder.appendingPathComponent(poster), mimeType: "image/jpeg")
        }
        for frame in media.frames {
            try part(handle, boundary: boundary, field: "frames", file: folder.appendingPathComponent(frame), mimeType: "image/jpeg")
        }
        try handle.write(contentsOf: Data("--\(boundary)--\r\n".utf8))
        return url
    }

    private static func part(_ handle: FileHandle, boundary: String, field: String, file: URL, mimeType: String) throws {
        let header = "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(field)\"; filename=\"\(file.lastPathComponent)\"\r\n"
            + "Content-Type: \(mimeType)\r\n\r\n"
        try handle.write(contentsOf: Data(header.utf8))
        let input = try FileHandle(forReadingFrom: file)
        defer { try? input.close() }
        while let chunk = try input.read(upToCount: 1 << 20), !chunk.isEmpty {
            try handle.write(contentsOf: chunk)
        }
        try handle.write(contentsOf: Data("\r\n".utf8))
    }
}
