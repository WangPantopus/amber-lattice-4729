//
//  MomentPosting.swift
//  Pantopus
//
//  A Moment while it posts, as `MomentsUploader` keeps it and the map, the
//  strip and the posting card show it.
//

import Foundation

/// A Moment on its way to the map.
struct MomentPosting: Identifiable, Equatable {
    enum Phase: Equatable {
        case uploading
        /// The file is in; the picture check is running.
        case checking
        /// Live: the ring stays where it is until the map has read the real one.
        case live
        /// Stopped; Retry tries again.
        case failed(String)
    }

    let id: String
    let kind: MomentKind
    var momentId: String?
    var latitude: Double
    var longitude: Double
    var progress: Double
    var phase: Phase
    /// How long it shows for, for "Your Moment is live. It shows for 24 hours."
    var hours = 24
    /// Posted with no location: only the strip shows it while it posts, never the map (contract v3.4).
    var noLocation = false
    /// The photo, or the video's poster, in the outbox: the strip shows what is posting.
    var picture: URL?
    /// A part of a video posted as several Moments: the parts' shared name, and which part this is (0 first).
    var series: String?
    var part = 0
    /// Not the last part: "Your Moment is live" is said once, when the last one is.
    var quiet = false
}

/// One Moment made by the Post sheet with the files that go up for it.
struct MomentsUploadPart {
    let moment: MomentDTO
    let media: MomentPreparedMedia
    let folderId: String
}
