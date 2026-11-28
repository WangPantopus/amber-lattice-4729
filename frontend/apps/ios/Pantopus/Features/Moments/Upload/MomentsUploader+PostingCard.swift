//
//  MomentsUploader+PostingCard.swift
//  Pantopus
//
//  What the uploader tells the posting card (the Lock Screen and the Dynamic
//  Island, `PostingLiveActivityController`): a photo or video starts going
//  up, how far it is, that it is in, and its last word. A long video posted
//  as several Moments has one card, named after its first part, which has
//  its last word when the last part does.
//

import Foundation

extension MomentsUploader {
    private var card: PostingLiveActivityController {
        .shared
    }

    /// "It shows for 24 hours.", after "Your Moment is live".
    static func showsFor(hours: Int) -> String {
        "It shows for \(hours == 1 ? "1 hour" : "\(hours) hours")."
    }

    private func posting(_ id: String) -> MomentPosting? {
        postings.first { $0.id == id }
    }

    /// Post, Try again, or an upload picked up after a relaunch.
    func cardStarts(_ id: String) {
        guard let posting = posting(id) else { return }
        // The parts still to go keep their numbers, so the last one's says how many there were.
        let parts = posting.series.map { series in
            (postings.filter { $0.series == series }.map(\.part).max() ?? 0) + 1
        }
        card.started(posting.series ?? posting.id, isVideo: posting.kind == .video, picture: posting.picture, parts: parts ?? 1)
    }

    func cardProgress(_ id: String) {
        guard let posting = posting(id) else { return }
        card.progress(posting.series ?? posting.id, part: posting.part, fraction: posting.progress)
    }

    /// A try starts: the card gives up when the reminder notification would come.
    func cardArmed(_ id: String) {
        guard let posting = posting(id) else { return }
        card.armed(posting.series ?? posting.id, giveUpAfter: MomentsUploadReminder.delay * Double(posting.part + 1))
    }

    /// The file is in and its picture check is running.
    func cardUploaded(_ id: String) {
        guard let posting = posting(id), !posting.quiet else { return }
        card.uploaded(posting.series ?? posting.id)
    }

    /// The last word, before the posting is let go.
    func cardEnds(_ id: String, _ phase: PostingActivityPhase, shareAt: String? = nil) {
        guard let posting = posting(id), !posting.quiet else { return }
        let detail: String? = switch phase {
        case .live: Self.showsFor(hours: posting.hours)
        case .later: MomentTime.parse(shareAt).map(SkyWords.scheduledNotice)
        default: nil
        }
        card.finished(posting.series ?? posting.id, phase, detail: detail, momentId: phase == .live ? posting.momentId : nil)
    }

    /// Any part that stops, stops the card: Try again in the app starts it anew.
    func cardFails(_ id: String, _ message: String) {
        guard let posting = posting(id) else { return }
        card.finished(posting.series ?? posting.id, .failed, detail: message)
    }

    func cardRemoved(_ id: String) {
        guard let posting = posting(id) else { return }
        card.removed(posting.series ?? posting.id)
    }

    /// After a relaunch: the uploads picked up have their cards (taken over, or started anew), and any other
    /// card is left over.
    func cardsResumed() {
        var seen: Set<String> = []
        for posting in postings where seen.insert(posting.series ?? posting.id).inserted {
            cardStarts(posting.id)
        }
        card.resumed(keeping: seen)
    }

    /// An upload ended with the app closed and nobody waiting for it. In: the card's last word comes from the
    /// upload's own answer. Not in: nothing of ours tries again until the app is opened, and the card says so.
    func cardEndsClosed(_ id: String?, answer: Data?, succeeded: Bool) {
        guard let id else { return }
        guard succeeded else { return card.finished(id, .failed, detail: PostingActivityContract.unfinished) }
        guard let answer, let moment = try? JSONDecoder().decode(MomentEnvelope.self, from: answer).moment else {
            // The answer didn't come whole. The file is in, which is all that is known.
            return card.finished(id, .uploaded)
        }
        switch moment.state {
        case .live:
            card.finished(id, .live, detail: Self.showsFor(hours: moment.hours), momentId: moment.id)
        case .held:
            card.finished(id, .held)
        case .scheduled:
            card.finished(id, .later, detail: MomentTime.parse(moment.sky.shareAt).map(SkyWords.scheduledNotice))
        case .ended:
            card.removed(id)
        case .uploading, .checking:
            card.finished(id, .uploaded)
        }
    }
}
