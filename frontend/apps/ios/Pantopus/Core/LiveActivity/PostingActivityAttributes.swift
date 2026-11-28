//
//  PostingActivityAttributes.swift
//  Pantopus
//
//  The ActivityKit contract for the posting card: while a Moment's photo or
//  video goes up, the Lock Screen and the Dynamic Island say so, then say it
//  is live (founder, 2026-11-27). Compiled into BOTH the app target (which
//  starts and updates the card via `PostingLiveActivityController`) and the
//  PantopusWidgets extension (which draws it) — see the explicit sources
//  entry in `project.yml`. Keep it self-contained: no Theme / DTO / feature
//  imports.
//

import ActivityKit
import Foundation

/// Where a Moment on its way stands, as the card says it.
public enum PostingActivityPhase: String, Codable, Hashable, Sendable {
    /// The file is going up.
    case posting
    /// The file is in; the picture check is running.
    case uploaded
    case live
    /// It waits for a review before it shows.
    case held
    /// Shared later (the Sky): it is on no map until its time.
    case later
    /// It stopped: opening the app finishes it, or says why it can't.
    case failed

    /// The card's first line, in the words the app's own posting strip uses.
    public var title: String {
        switch self {
        case .posting: "Posting your Moment"
        case .uploaded: "Your Moment is uploaded"
        case .live: "Your Moment is live"
        case .held: "Your Moment is waiting for a quick review"
        case .later: "Your Moment is saved"
        case .failed: "Your Moment didn't post"
        }
    }

    /// Nothing more will change on this card.
    public var isFinal: Bool {
        self != .posting && self != .uploaded
    }
}

/// What the card is about rides here; everything that changes while it posts rides `ContentState`.
public struct PostingActivityAttributes: ActivityAttributes, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var phase: PostingActivityPhase
        /// How far the file is, 0 to 100, while the app can read it. Nil once it can't (iOS has paused the
        /// app; the upload itself carries on): the card then shows no number, never an old one.
        public var percent: Int?
        /// A second line worded by the app: how long it shows for, when it shares, why it stopped.
        public var detail: String?
        /// The Moment a tap on the card opens, once there is one to open.
        public var momentId: String?

        public init(phase: PostingActivityPhase, percent: Int? = nil, detail: String? = nil, momentId: String? = nil) {
            self.phase = phase
            self.percent = percent
            self.detail = detail
            self.momentId = momentId
        }
    }

    /// The upload's outbox folder (a long video's first part's): one card for each thing posted.
    public let postingId: String
    /// A video, not a photo.
    public let isVideo: Bool
    /// The small picture of what is posting, a file in the shared container (`PostingActivityContract`).
    public let thumbnail: String?

    public init(postingId: String, isVideo: Bool, thumbnail: String?) {
        self.postingId = postingId
        self.isVideo = isVideo
        self.thumbnail = thumbnail
    }
}

/// What the app and the extension agree on beside the card's state.
public enum PostingActivityContract {
    /// The second line when nothing of ours could run to finish it (the app was swiped away, or its last
    /// try failed with the app closed). The same words as the reminder notification.
    public static let unfinished = "Open Pantopus to finish it."
    /// The second line while the file goes up and the app can't report how far it is.
    public static let away = "It keeps going while you're away."
    /// The second line while the picture check runs.
    public static let checking = "It shows once a quick check is done."

    /// The card's pictures live here in the App Group container, where the extension can read them.
    public static func thumbnailFolder() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: GigWidgetSnapshotContract.appGroupId)?
            .appendingPathComponent("PostingCards", isDirectory: true)
    }

    public static func thumbnailURL(_ name: String) -> URL? {
        thumbnailFolder()?.appendingPathComponent(name)
    }

    /// Where a tap on the card goes: the Moment once it has one to play, else the Moments tab
    /// (`DeepLinkRouter`, `/moments` and `/moments/:id`).
    public static func link(momentId: String?) -> URL? {
        guard let momentId, !momentId.isEmpty else { return URL(string: "pantopus://moments?src=posting-card") }
        return URL(string: "pantopus://moments/\(momentId)?src=posting-card")
    }
}
