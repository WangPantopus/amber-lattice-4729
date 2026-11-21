//
//  MomentsDraftFiles.swift
//  Pantopus
//
//  The temporary files a draft's video lives in: a library video's copy
//  (`MomentsLibraryLoader.videoFile`) and a camera recording
//  (`MomentsCameraController`). Each is needed while it is the draft (the
//  Post sheet and the marks editor play it, its export and Text and Draw's
//  export read it) and never after: posting, the uploader and a retry from
//  the map read only the outbox. So each goes with its draft, and any left by
//  an earlier time the composer was open are swept when it opens again. A
//  recording the camera is still writing is never touched.
//

import Foundation
import os

enum MomentsDraftFiles {
    static let libraryPrefix = "moment-library-"
    static let cameraPrefix = "moment-camera-"
    /// Recordings the camera is writing now (their file names).
    private static let writing = OSAllocatedUnfairLock(initialState: Set<String>())

    /// A new file in the temporary folder for a library copy or a recording.
    static func newFile(_ prefix: String) -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("\(prefix)\(UUID().uuidString).mov")
    }

    /// The camera started writing `url` / finished with it.
    static func beginWriting(_ url: URL) {
        writing.withLock { _ = $0.insert(url.lastPathComponent) }
    }

    static func endWriting(_ url: URL) {
        writing.withLock { _ = $0.remove(url.lastPathComponent) }
    }

    /// One of these files: a library copy, a recording, or a recording named as earlier builds named them
    /// ("moment-<uuid>.mov"). Save to Photos' "moment-<uuid>.mp4" removes itself and isn't one.
    static func isDraftFile(_ name: String) -> Bool {
        if name.hasPrefix(libraryPrefix) || name.hasPrefix(cameraPrefix) { return true }
        guard name.hasPrefix("moment-"), name.hasSuffix(".mov") else { return false }
        return UUID(uuidString: String(name.dropFirst("moment-".count).dropLast(".mov".count))) != nil
    }

    /// Removes `url` when it is one of these files and the camera isn't writing it.
    static func drop(_ url: URL?) {
        guard let url, isDraftFile(url.lastPathComponent), !isWriting(url.lastPathComponent) else { return }
        Task.detached(priority: .utility) { try? FileManager.default.removeItem(at: url) }
    }

    /// Those left by an earlier time the composer was open (the app closed with a draft on the sheet, a pick that
    /// finished after the composer closed): all but `keeping`, any the camera is writing, and any written since this
    /// was called.
    static func sweep(keeping: URL?) {
        let kept = keeping?.lastPathComponent
        let since = Date()
        Task.detached(priority: .utility) {
            let manager = FileManager.default
            let folder = manager.temporaryDirectory
            for name in (try? manager.contentsOfDirectory(atPath: folder.path)) ?? [] where isDraftFile(name) && name != kept {
                let file = folder.appendingPathComponent(name)
                guard !isWriting(name), let written = (try? manager.attributesOfItem(atPath: file.path))?[.modificationDate] as? Date,
                      written < since else { continue }
                try? manager.removeItem(at: file)
            }
        }
    }

    private static func isWriting(_ name: String) -> Bool {
        writing.withLock { $0.contains(name) }
    }
}
