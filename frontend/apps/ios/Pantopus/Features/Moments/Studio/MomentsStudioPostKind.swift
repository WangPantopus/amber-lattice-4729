//
//  MomentsStudioPostKind.swift
//  Pantopus
//
//  "+ Ask / Kind" in the Studio ("Pulse, reinvented" phase 1, one camera; CONTRACT 6d): the photo or the words become
//  one of today's Pulse posts, the October 13 kinds, instead of a Moment. Nothing here is a new kind: each is a post
//  type today's composer already makes, posted with today's `POST /api/posts` plus the Studio's `studio` field
//  (`MomentsStudioPostKind+Posting`). Only the Studio offers it, and only while the switch is on; today's composer and
//  Post sheet never see it.
//
//  A post is one photo or the words. Under a made-up name a post is words only, of its own four kinds (the made-up
//  names contract), so there the Studio offers those for a text card.
//

import Foundation

/// One of today's Pulse post kinds, in the order the Studio offers them (the web's `postKinds.ts`).
enum StudioPostKind: String, CaseIterable, Identifiable {
    case askLocal = "ask_local"
    case alert
    case lostFound = "lost_found"
    case recommendation
    case localUpdate = "local_update"
    case event
    /// Offered only under a made-up name, which takes four kinds.
    case localWin = "neighborhood_win"

    var id: String {
        rawValue
    }

    /// The kinds a post under one's own name may be, and under a made-up name.
    static let ownName: [StudioPostKind] = [.askLocal, .alert, .lostFound, .recommendation, .localUpdate, .event]
    static let madeUpName: [StudioPostKind] = [.askLocal, .recommendation, .localUpdate, .localWin]

    var name: String {
        switch self {
        case .askLocal: "Question"
        case .alert: "Heads-up"
        case .lostFound: "Lost and found"
        case .recommendation: "Spot"
        case .localUpdate: "Learning"
        case .event: "Event"
        case .localWin: "Local win"
        }
    }

    var hint: String {
        switch self {
        case .askLocal: "Answers will show under it"
        case .alert: "Shows first, in red, on the map"
        case .lostFound: "Stays until it's claimed"
        case .recommendation, .localUpdate, .localWin: "Stays on the map and in your Atlas"
        case .event: "Shows on the map until it happens"
        }
    }

    /// Today's composer's purpose for each kind.
    var purpose: String {
        switch self {
        case .askLocal: "ask"
        case .alert: "heads_up"
        case .lostFound: "lost_found"
        case .recommendation: "recommend"
        case .localUpdate: "local_update"
        case .event: "event"
        case .localWin: "neighborhood_win"
        }
    }

    /// A Spot, Learning or Event may also go to Explore (CONTRACT 6d, 6f); the others stay tied to the place.
    var mayGoToExplore: Bool {
        self == .recommendation || self == .localUpdate || self == .event
    }

    /// The pill's first line (CONTRACT 6d): "Stays until answered", "Stays in Atlas", "Until claimed", "Until <end>".
    func pillTitle(eventStart: Date?, eventEnd: Date?, now: Date = Date()) -> String {
        switch self {
        case .askLocal: return "Stays until answered"
        case .recommendation, .localUpdate, .localWin: return "Stays in Atlas"
        case .lostFound: return "Until claimed"
        case .alert:
            // A Heads-up stays up two days (today's PostCategoryTTL `alert`).
            return "Until \(Self.untilLabel(now.addingTimeInterval(2 * 24 * 3600), now: now))"
        case .event:
            guard let at = eventEnd ?? eventStart else { return "Until it happens" }
            return "Until \(Self.untilLabel(at, now: now))"
        }
    }

    /// "Saturday 11 am", or "today 4:30 pm" / "tomorrow 9 am" when it is that close (read after "Until").
    static func untilLabel(_ at: Date, now: Date = Date()) -> String {
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: at)).day ?? 0
        let day = DateFormatter()
        day.locale = Locale(identifier: "en_US")
        day.dateFormat = days > 1 && days < 7 ? "EEEE" : "MMM d"
        let name = days == 0 ? "today" : (days == 1 ? "tomorrow" : day.string(from: at))
        let time = DateFormatter()
        time.locale = Locale(identifier: "en_US")
        time.amSymbol = "am"
        time.pmSymbol = "pm"
        time.dateFormat = calendar.component(.minute, from: at) == 0 ? "h a" : "h:mm a"
        return "\(name) \(time.string(from: at))"
    }

    /// Words that ask something: they end with a question mark (or one followed only by an emoji or a space). The
    /// Studio then offers "Keep until answered?" (CONTRACT 6d: the app's own chip; yes makes the post a Question).
    static func asksSomething(_ words: String) -> Bool {
        let trimmed = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > 3 else { return false }
        return trimmed.range(of: #"\?[\s\p{Extended_Pictographic}\x{FE0F}]*$"#, options: .regularExpression) != nil
    }
}

/// What the Studio holds for a post while a kind is picked: the words (a post's are up to 500 characters, a Moment's
/// caption 100) and each kind's own details, today's composer's.
struct MomentsStudioPostDraft: Equatable {
    var kind: StudioPostKind?
    var words = ""
    /// "Keep until answered?" was turned down for this picture.
    var askDeclined = false
    var alertKind = PulseSafetyAlertKind.other
    var found = false
    /// How to reach the author about a lost or found thing: `dm`, `comment` or `phone`.
    var contact = "dm"
    var phone = ""
    var eventStart: Date?
    var eventEnd: Date?
    var venue = ""
    /// Names this post: a second Post tap (say after the photo failed to go up) gets the same post back.
    var requestId: String?

    static let wordsLimit = 500
}

extension MomentsComposerModel {
    /// The Studio's post, held with its other tools (so a fold keeps it); only the Studio sets it.
    var studioPost: MomentsStudioPostDraft {
        get { marking.studio?.post ?? MomentsStudioPostDraft() }
        set {
            if marking.studio == nil { marking.studio = MomentsStudioTools() }
            marking.studio?.post = newValue
        }
    }

    /// "+ Ask / Kind" is offered: one photo or a text card (not a video, nor one of several picked together); under a
    /// made-up name, a text card only.
    var offersStudioKinds: Bool {
        guard let draft, pickedTogether <= 1 else { return false }
        if postsUnderMadeUpName { return draft == .text }
        return draft.kind != .video
    }

    var studioKindChoices: [StudioPostKind] {
        postsUnderMadeUpName ? StudioPostKind.madeUpName : StudioPostKind.ownName
    }

    /// The kind this posts as, or nil: a Moment.
    var studioPostKind: StudioPostKind? {
        guard offersStudioKinds, let kind = studioPost.kind, studioKindChoices.contains(kind) else { return nil }
        return kind
    }

    /// What the post says: the text card's words, or what was written on the picture.
    var studioPostWords: String {
        draft == .text ? text : studioPost.words
    }

    /// The words ask something and no kind is picked yet: "Keep until answered?".
    var offersKeepUntilAnswered: Bool {
        guard offersStudioKinds, studioPost.kind == nil, !studioPost.askDeclined,
              studioKindChoices.contains(.askLocal) else { return false }
        return StudioPostKind.asksSomething(draft == .text ? text : caption)
    }

    /// It posts at its place to people nearby (or over its area under a made-up name), else to connections, no place.
    var studioPostPlaced: Bool {
        !noLocationOn && (audience == .nearby || postsUnderMadeUpName)
    }

    func pickStudioKind(_ kind: StudioPostKind) {
        var post = studioPost
        // The caption becomes the post's words; a text card's words are the card.
        if post.kind == nil, draft != .text { post.words = caption }
        post.kind = kind
        studioPost = post
        // A post isn't a Guess the spot.
        studioGuess = false
    }

    /// Back to a Moment: the words go back to the caption (a caption is up to 100 characters).
    func clearStudioKind() {
        let post = studioPost
        guard post.kind != nil else { return }
        if draft != .text { caption = String(post.words.prefix(Self.captionLimit)) }
        var cleared = MomentsStudioPostDraft()
        cleared.askDeclined = post.askDeclined
        studioPost = cleared
    }

    /// What stops Post for a post, in today's composer's words; nil when it can go.
    var studioKindBlocker: (message: String, inDrawer: Bool)? {
        guard let kind = studioPostKind else { return nil }
        let post = studioPost
        if studioPostPlaced, pin == nil {
            return ("Turn on location for Pantopus in Settings, or choose Friends.", false)
        }
        if studioPostWords.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return ("Write what the \(kind.name.lowercased()) is about.", false)
        }
        if kind == .event {
            guard let start = post.eventStart else { return ("Add when the event starts.", true) }
            if let end = post.eventEnd, end <= start { return ("The event end time must be after its start time.", true) }
        }
        if kind == .lostFound, post.contact == "phone" {
            let digits = post.phone.filter(\.isNumber).count
            if digits < 7 || digits > 15 { return ("Enter a valid phone number.", true) }
        }
        return nil
    }
}
