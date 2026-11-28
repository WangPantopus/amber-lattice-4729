//
//  MomentsComposerModel+Shared.swift
//  Pantopus
//
//  A photo or video another app's share sheet handed to Pantopus
//  (`ShareInCoordinator`, founder 2026-11-27): an album item without the
//  album. It becomes the draft exactly as one picked from the library does
//  (`use(asset:)`): it pins where its file says it was taken, when the file
//  says, and with no place in the file it pins here, as a photo with no place
//  from the album does. It is never the camera's shot, so never Live.
//

import AVFoundation
import UIKit

extension MomentsComposerModel {
    func use(shared file: URL, isVideo: Bool) async {
        error = nil
        if isVideo {
            // In the temporary folder under a draft file's name, so it goes with its draft like an album copy.
            let copy = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(MomentsDraftFiles.libraryPrefix)\(UUID().uuidString).\(file.pathExtension)")
            guard (try? FileManager.default.copyItem(at: file, to: copy)) != nil else {
                error = "Couldn't open that video."
                return
            }
            let tagged = await MomentsMediaExport.location(of: copy)
            let made = try? await AVURLAsset(url: copy).load(.creationDate)?.load(.dateValue)
            takenAt = made
            capture = tagged.map { MediaCaptureLocation(latitude: $0.latitude, longitude: $0.longitude, capturedAt: made ?? Date()) }
            await useVideo(copy)
            // Too long to post after all: nothing will read the copy.
            if draft != .video(copy) { MomentsDraftFiles.drop(copy) }
        } else {
            guard let data = try? Data(contentsOf: file), let image = UIImage(data: data) else {
                error = "Couldn't open that photo."
                return
            }
            let tagged = await MediaLocationExtractor.imageLocation(from: data)
            // The draft and its export first (they start from no place), then where and when the file says.
            use(photo: image)
            takenAt = tagged?.capturedAt
            capture = tagged.map {
                MediaCaptureLocation(latitude: $0.latitude, longitude: $0.longitude, capturedAt: $0.capturedAt ?? Date())
            }
        }
        if let capture { await preview(latitude: capture.latitude, longitude: capture.longitude) }
    }
}
