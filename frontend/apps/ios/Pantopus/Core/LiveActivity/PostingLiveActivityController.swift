//
//  PostingLiveActivityController.swift
//  Pantopus
//
//  App-side driver for the posting card (founder, 2026-11-27): while a
//  Moment's photo or video goes up, the Lock Screen and the Dynamic Island
//  say "Posting your Moment", then "Your Moment is live" with View.
//  `MomentsUploader` tells this controller what happens to an upload; the
//  card's drawing lives in the PantopusWidgets extension.
//
//  What iOS allows shapes it:
//  - A card can only be started while the app is on screen, so it starts
//    when Post is tapped (and is only seen once the person leaves).
//  - After the person leaves, the app runs for about half a minute more and
//    is then paused, while the upload itself carries on. The percent is
//    shown only while the app can read it: once it can't, the card shows no
//    number rather than an old one.
//  - When the upload ends, iOS wakes the app and the card gets its last
//    word. If nothing of ours ever runs again (the app was swiped away,
//    which stops its uploads), the card's `staleDate` turns it to "didn't
//    post" by itself, at the time the reminder notification comes.
//

import ActivityKit
import ImageIO
import UIKit

@MainActor
final class PostingLiveActivityController {
    static let shared = PostingLiveActivityController()

    private typealias Card = Activity<PostingActivityAttributes>
    private typealias CardState = PostingActivityAttributes.ContentState

    /// What is remembered of one card between updates.
    private struct Posting {
        var phase = PostingActivityPhase.posting
        var parts = 1
        var percent = 0
        /// What the card last showed, and when: it is told again a second later at the soonest.
        var shown: Int?
        var shownAt = Date.distantPast
        /// When the card gives up by itself (`staleDate`).
        var giveUp: Date?
    }

    /// How long "Your Moment is live" stays on the Lock Screen when nobody opens the app.
    private static let lingers: TimeInterval = 900
    /// How long the card waits, away from the app, for the picture check before it settles on "uploaded".
    private static let checkWait: TimeInterval = 15
    /// How long after the app leaves the screen the percent is still shown, at the most: iOS pauses the app soon after.
    private static let readsFor: TimeInterval = 20
    /// Back in the app with an upload still on its way: the card gives up this long from now, not sooner
    /// (as long as one try may take, `MomentsUploadReminder.delay`).
    private static let givesUpAgain: TimeInterval = 420

    private var postings: [String: Posting] = [:]
    /// Updates go to the system one after another, in the order they were made.
    private var tail: Task<Void, Never>?
    private var isFront: Bool
    /// The app can still read how far the upload is.
    private var readsProgress = true
    private var stopsReading: Task<Void, Never>?
    private var checkWaits: [String: Task<Void, Never>] = [:]
    private var checkTime: [String: UIBackgroundTaskIdentifier] = [:]
    private let isSuppressed: Bool

    init(environment: [String: String] = ProcessInfo.processInfo.environment) {
        isSuppressed = environment["XCTestConfigurationFilePath"] != nil
            || environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1"
        isFront = UIApplication.shared.applicationState == .active
        if !isSuppressed { watch() }
    }

    private var isOn: Bool {
        !isSuppressed && ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // MARK: - What the uploader says

    /// An upload starts (Post, Try again, or one picked up after a relaunch): its card is started, or the one
    /// an earlier run of the app left is taken over. `parts` is how many files it is (a long video's parts).
    func started(_ id: String, isVideo: Bool, picture: URL?, parts: Int) {
        guard isOn else { return }
        var posting = postings[id] ?? Posting()
        posting.phase = .posting
        posting.parts = max(parts, 1)
        posting.shown = nil
        postings[id] = posting
        let content = content(id)
        enqueue { [weak self] in
            if let card = Self.showing(id) {
                await card.update(content)
                return
            }
            // A card of an earlier try that ended ("didn't post") makes way for this one.
            for old in Card.activities where old.attributes.postingId == id {
                await old.end(nil, dismissalPolicy: .immediate)
            }
            let thumbnail = await Self.thumbnail(id, from: picture)
            // iOS refuses a card from an app that isn't on screen (a relaunch in the background): none then.
            _ = try? Card.request(
                attributes: PostingActivityAttributes(postingId: id, isVideo: isVideo, thumbnail: thumbnail),
                content: content
            )
            self?.sweepThumbnails()
        }
    }

    /// How far file number `part` (0 first) of the upload is, 0 to 1.
    func progress(_ id: String, part: Int, fraction: Double) {
        guard var posting = postings[id], posting.phase == .posting else { return }
        let whole = (Double(part) + min(max(fraction, 0), 1)) / Double(posting.parts)
        // 100 is never a number on the card: "uploaded" or "live" says it.
        let percent = min(99, Int((whole * 100).rounded(.down)))
        guard percent > posting.percent else { return }
        posting.percent = percent
        postings[id] = posting
        guard readsProgress, Date().timeIntervalSince(posting.shownAt) >= 1 else { return }
        show(id)
    }

    /// A try starts: nothing heard `seconds` from now means nothing of ours is running to finish it.
    func armed(_ id: String, giveUpAfter seconds: TimeInterval) {
        guard var posting = postings[id], posting.phase == .posting else { return }
        let date = Date().addingTimeInterval(seconds)
        posting.giveUp = max(posting.giveUp ?? date, date)
        postings[id] = posting
        show(id)
    }

    /// The file is in and the picture check is running.
    func uploaded(_ id: String) {
        guard var posting = postings[id], posting.phase == .posting else { return }
        posting.phase = .uploaded
        postings[id] = posting
        show(id)
        if !isFront { waitForCheck(id) }
    }

    /// The card's last word: live, waiting for review, shared later, uploaded (its check still running when
    /// time ran out), or stopped. With the app on screen the card goes, since the app says it itself;
    /// away, it stays to be read.
    func finished(_ id: String, _ phase: PostingActivityPhase, detail: String? = nil, momentId: String? = nil) {
        forget(id)
        guard !isSuppressed else { return }
        let state = CardState(phase: phase, detail: detail, momentId: momentId)
        let policy: ActivityUIDismissalPolicy = if isFront {
            .immediate
        } else if phase == .failed {
            // Something is left to do: it stays until it is seen (four hours at the most, iOS's own limit).
            .default
        } else {
            .after(Date().addingTimeInterval(Self.lingers))
        }
        enqueue {
            guard let card = Self.showing(id) else { return }
            await card.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: policy)
        }
    }

    /// The upload was discarded: its card goes without a word.
    func removed(_ id: String) {
        forget(id)
        guard !isSuppressed else { return }
        enqueue {
            guard let card = Self.showing(id) else { return }
            await card.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// Sign-out: nothing of the last account's stays on the Lock Screen.
    func removeAll() {
        for id in Array(postings.keys) {
            forget(id)
        }
        guard !isSuppressed else { return }
        enqueue { [weak self] in
            for card in Card.activities {
                await card.end(nil, dismissalPolicy: .immediate)
            }
            self?.sweepThumbnails()
        }
    }

    /// The app is open again and has picked up the uploads it was closed in the middle of (`keeping`):
    /// a card of anything else is left over from an upload that no longer exists.
    func resumed(keeping ids: Set<String>) {
        guard !isSuppressed else { return }
        enqueue { [weak self] in
            for card in Card.activities where card.activityState != .dismissed {
                let live = card.activityState == .active || card.activityState == .stale
                if !live || !ids.contains(card.attributes.postingId) {
                    await card.end(nil, dismissalPolicy: .immediate)
                }
            }
            self?.sweepThumbnails()
        }
    }

    /// The app is being closed by hand: iOS stops its uploads now, so a card still posting says how to finish
    /// it, as the reminder notification does. Nothing runs after this returns, so it waits (two seconds at most).
    nonisolated func appWillTerminate() {
        let open = Card.activities.filter { $0.activityState == .active && !$0.content.state.phase.isFinal }
        guard !open.isEmpty else { return }
        let done = DispatchSemaphore(value: 0)
        Task.detached {
            for card in open {
                let state = card.content.state.phase == .posting
                    ? CardState(phase: .failed, detail: PostingActivityContract.unfinished)
                    : CardState(phase: .uploaded)
                await card.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .default)
            }
            done.signal()
        }
        _ = done.wait(timeout: .now() + 2)
    }

    // MARK: - On screen, away

    /// Follows the app onto and off the screen.
    private func watch() {
        let center = NotificationCenter.default
        center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.cameToFront() }
        }
        center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.leftFront() }
        }
        center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.wentAway() }
        }
    }

    private func cameToFront() {
        isFront = true
        readsProgress = true
        stopsReading?.cancel()
        stopsReading = nil
        for id in Array(checkWaits.keys) {
            releaseCheck(id)
        }
        let again = Date().addingTimeInterval(Self.givesUpAgain)
        for (id, posting) in postings where posting.phase == .posting {
            if let giveUp = posting.giveUp { postings[id]?.giveUp = max(giveUp, again) }
            show(id)
        }
        // A card that had its last word has been read, or the app now says the same thing itself.
        enqueue {
            for card in Card.activities where card.activityState == .ended {
                await card.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    /// No longer in front (the Lock Screen, Notification Centre, the app switcher): the card may be seen now.
    private func leftFront() {
        isFront = false
        for (id, posting) in postings where posting.phase == .posting {
            show(id)
        }
    }

    private func wentAway() {
        isFront = false
        for (id, posting) in postings where posting.phase == .uploaded {
            waitForCheck(id)
        }
        guard stopsReading == nil, postings.values.contains(where: { $0.phase == .posting }) else { return }
        // iOS says how long the app still runs; the number goes a little before that.
        let left = UIApplication.shared.backgroundTimeRemaining
        let wait = left.isFinite && left < 600 ? min(Self.readsFor, max(1, left - 8)) : Self.readsFor
        stopsReading = Task { [weak self] in
            try? await Task.sleep(for: .seconds(wait))
            guard !Task.isCancelled else { return }
            self?.stopReading()
        }
    }

    /// The app is about to be paused: from here nobody can say how far the upload is.
    private func stopReading() {
        stopsReading = nil
        guard !isFront else { return }
        readsProgress = false
        for (id, posting) in postings where posting.phase == .posting {
            show(id)
        }
    }

    // MARK: - The picture check, away from the app

    /// Away from the app the check has a short while to end ("live", "waiting for review"); if it hasn't by
    /// then, the card settles on "uploaded", which is true whatever the check says.
    private func waitForCheck(_ id: String) {
        guard checkWaits[id] == nil, postings[id]?.phase == .uploaded else { return }
        checkTime[id] = UIApplication.shared.beginBackgroundTask(withName: "Posting card") { [weak self] in
            Task { @MainActor [weak self] in self?.checkRanOut(id) }
        }
        checkWaits[id] = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.checkWait))
            guard !Task.isCancelled else { return }
            self?.checkRanOut(id)
        }
    }

    private func checkRanOut(_ id: String) {
        guard !isFront, postings[id]?.phase == .uploaded else { return releaseCheck(id) }
        finished(id, .uploaded)
    }

    private func releaseCheck(_ id: String) {
        checkWaits.removeValue(forKey: id)?.cancel()
        if let time = checkTime.removeValue(forKey: id), time != .invalid {
            UIApplication.shared.endBackgroundTask(time)
        }
    }

    // MARK: - Telling the system

    private func forget(_ id: String) {
        postings[id] = nil
        releaseCheck(id)
    }

    private func content(_ id: String) -> ActivityContent<CardState> {
        let posting = postings[id] ?? Posting()
        let posts = posting.phase == .posting
        return ActivityContent(
            state: CardState(phase: posting.phase, percent: posts && readsProgress ? posting.percent : nil),
            staleDate: posts ? posting.giveUp : nil
        )
    }

    /// The card is told where its upload stands now.
    private func show(_ id: String) {
        guard !isSuppressed, var posting = postings[id] else { return }
        posting.shown = readsProgress ? posting.percent : nil
        posting.shownAt = Date()
        postings[id] = posting
        let content = content(id)
        enqueue {
            await Self.showing(id)?.update(content)
        }
    }

    private func enqueue(_ work: @escaping @MainActor () async -> Void) {
        let before = tail
        tail = Task { @MainActor in
            await before?.value
            await work()
        }
    }

    /// The card for this upload that hasn't had its last word.
    private static func showing(_ id: String) -> Card? {
        Card.activities.first {
            $0.attributes.postingId == id && ($0.activityState == .active || $0.activityState == .stale)
        }
    }

    // MARK: - The card's picture

    /// A small copy of the photo (or the video's poster) where the extension can read it. Made afresh from
    /// the pixels, so nothing the file says about where or when it was taken comes along.
    private nonisolated static func thumbnail(_ id: String, from picture: URL?) async -> String? {
        guard let picture, let folder = PostingActivityContract.thumbnailFolder() else { return nil }
        return await Task.detached(priority: .userInitiated) {
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 240
            ]
            guard let source = CGImageSourceCreateWithURL(picture as CFURL, nil),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
                  let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.8) else { return nil }
            let name = "\(id).jpg"
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                // The Lock Screen draws the card while the phone is locked.
                try data.write(
                    to: folder.appendingPathComponent(name),
                    options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
                )
                return name
            } catch {
                return nil
            }
        }.value
    }

    /// Pictures of cards that are gone go too.
    private func sweepThumbnails() {
        guard let folder = PostingActivityContract.thumbnailFolder(),
              let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return }
        let kept = Set(Card.activities.filter { $0.activityState != .dismissed }.compactMap(\.attributes.thumbnail))
        for file in files where !kept.contains(file.lastPathComponent) {
            try? FileManager.default.removeItem(at: file)
        }
    }
}
