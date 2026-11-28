//
//  MomentPins.swift
//  Pantopus
//
//  Pins on the photo ("Pulse, reinvented" phase 3, PHASE-3 piece 4; CONTRACT 8b). Where a Moment's replies are shown
//  (8a), a reader drops a reaction (one of the five signals) on a spot in its picture; voice bubbles and cutouts that
//  others dropped are drawn and play. A pin is a reply, so removing and reporting are the replies' own; one toggle
//  hides every pin on the reader's own screen. Today's screens and the apps in the stores see a pin as a plain reply
//  ("😮"). With the switch off none of this is drawn or sent.
//

import AVFoundation
import Observation
import SwiftUI

/// One pin, as this reader may see it.
struct MomentPinDTO: Decodable, Hashable, Identifiable {
    let id: String
    let kind: String
    let x: Double
    let y: Double
    let emoji: String?
    let signal: String?
    let audioURL: String?
    let durationMs: Double?
    let imageURL: String?
    let text: String?
    /// A cutout being checked before others see it (its sender sees "Checking…").
    let checking: Bool
    let author: MomentAuthorDTO?
    let mine: Bool
    let canRemove: Bool

    private enum CodingKeys: String, CodingKey {
        case id, kind, x, y, emoji, signal, text, checking, author, mine
        case audioURL = "audio_url"
        case durationMs = "duration_ms"
        case imageURL = "image_url"
        case canRemove = "can_remove"
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? "reaction"
        x = try min(max(c.decodeIfPresent(Double.self, forKey: .x) ?? 0.5, 0), 1)
        y = try min(max(c.decodeIfPresent(Double.self, forKey: .y) ?? 0.5, 0), 1)
        emoji = try? c.decodeIfPresent(String.self, forKey: .emoji)
        signal = try? c.decodeIfPresent(String.self, forKey: .signal)
        audioURL = try? c.decodeIfPresent(String.self, forKey: .audioURL)
        durationMs = try? c.decodeIfPresent(Double.self, forKey: .durationMs)
        imageURL = try? c.decodeIfPresent(String.self, forKey: .imageURL)
        text = try? c.decodeIfPresent(String.self, forKey: .text)
        checking = (try? c.decodeIfPresent(Bool.self, forKey: .checking)) ?? false
        author = try? c.decodeIfPresent(MomentAuthorDTO.self, forKey: .author)
        mine = (try? c.decodeIfPresent(Bool.self, forKey: .mine)) ?? false
        canRemove = (try? c.decodeIfPresent(Bool.self, forKey: .canRemove)) ?? false
    }

    /// "Isaac's reaction", for VoiceOver and the card.
    var spoken: String {
        let who = author.map { "\($0.name.isEmpty ? "Someone" : $0.shortName)'s" } ?? "Someone's"
        switch kind {
        case "voice": return "\(who) voice"
        case "cutout": return "\(who) cutout"
        default: return "\(who) reaction"
        }
    }
}

struct MomentPinsDTO: Decodable {
    let pins: [MomentPinDTO]
}

struct MomentPinCreatedDTO: Decodable {
    let pin: MomentPinDTO
}

struct MomentPinReactionBody: Encodable {
    let kind = "reaction"
    let x: Double
    let y: Double
    let signal: String
}

/// The pins of each Moment read in this run, and what the reader is doing with them.
@Observable
@MainActor
final class MomentPinsStore {
    static let shared = MomentPinsStore()
    private static let hiddenKey = "pantopus.pins.hidden"

    private(set) var pins: [String: [MomentPinDTO]] = [:]
    /// The Moment a pin is being dropped on, and the spot chosen (shares of the picture).
    var dropping: String?
    var spot: CGPoint?
    /// The pin whose card is open.
    var open: String?
    var note: String?
    private(set) var busy = false
    /// The reader's one toggle, for every Moment, on this phone.
    var hidden = UserDefaults.standard.bool(forKey: MomentPinsStore.hiddenKey) {
        didSet { UserDefaults.standard.set(hidden, forKey: Self.hiddenKey) }
    }

    @ObservationIgnored private var player: AVPlayer?

    /// While a pin is being dropped or one is open, the viewer holds still.
    var holds: Bool {
        dropping != nil || open != nil
    }

    func load(_ moment: MomentDTO) async {
        guard let replies = moment.together.replies, replies.shown, replies.pins > 0 || replies.canReply else { return }
        do {
            let answer: MomentPinsDTO = try await MomentsAPI.send(TogetherEndpoints.pins(momentId: moment.id))
            pins[moment.id] = answer.pins
            countOnMoment[moment.id] = replies.count
        } catch {
            await PulseReinventedFlags.shared.recheck()
        }
    }

    func startDropping(on momentId: String) {
        open = nil
        note = nil
        spot = nil
        dropping = dropping == momentId ? nil : momentId
    }

    func closeCard() {
        dropping = nil
        spot = nil
        open = nil
        note = nil
    }

    func drop(_ signal: MomentSignal, on momentId: String) async {
        guard let spot, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let created: MomentPinCreatedDTO = try await MomentsAPI.send(
                TogetherEndpoints.dropReaction(momentId: momentId, x: spot.x, y: spot.y, signal: signal.rawValue)
            )
            pins[momentId, default: []].append(created.pin)
            bumpReplies(momentId, by: 1)
            closeCard()
        } catch {
            note = MomentRepliesWords.failure(error)
            await PulseReinventedFlags.shared.recheck()
        }
    }

    /// A voice bubble or a cutout (`MomentPinsVoiceCutout.swift`), sent as multipart.
    func dropFile(_ file: MultipartFile, fields: [String: String], on momentId: String) async {
        guard spot != nil, !busy else { return }
        busy = true
        note = nil
        defer { busy = false }
        do {
            let (data, http) = try await MultipartUploader.shared.dropMomentPin(momentId: momentId, fields: fields, file: file)
            guard (200..<300).contains(http.statusCode) else { throw MomentsFailure(status: http.statusCode, body: data) }
            let created = try JSONDecoder().decode(MomentPinCreatedDTO.self, from: data)
            pins[momentId, default: []].append(created.pin)
            bumpReplies(momentId, by: 1)
            closeCard()
        } catch {
            note = MomentRepliesWords.failure(error)
            await PulseReinventedFlags.shared.recheck()
        }
    }

    func remove(_ pin: MomentPinDTO, on momentId: String) async {
        do {
            try await MomentsAPI.send(TogetherEndpoints.removeReply(momentId: momentId, replyId: pin.id))
            pins[momentId]?.removeAll { $0.id == pin.id }
            bumpReplies(momentId, by: -1)
            closeCard()
        } catch {
            note = MomentRepliesWords.failure(error)
        }
    }

    func report(_ pin: MomentPinDTO, on momentId: String, reason: String) async {
        do {
            try await MomentsAPI.send(TogetherEndpoints.reportReply(momentId: momentId, replyId: pin.id, reason: reason))
            note = "Reported. We'll review it."
        } catch {
            note = MomentRepliesWords.failure(error)
        }
    }

    /// One voice plays at a time.
    func hear(_ pin: MomentPinDTO) {
        guard let url = pin.audioURL.flatMap(URL.init(string:)) else { return }
        player?.pause()
        player = AVPlayer(url: url)
        player?.play()
    }

    /// A pin is a reply: the replies chip counts it.
    private func bumpReplies(_ momentId: String, by change: Int) {
        let prompt = MomentRepliesPrompt.shared
        let base = prompt.counts[momentId] ?? countOnMoment[momentId] ?? 0
        prompt.counts[momentId] = max(0, base + change)
    }

    /// The replies count each Moment answered with, kept when its pins were read.
    @ObservationIgnored var countOnMoment: [String: Int] = [:]
}
