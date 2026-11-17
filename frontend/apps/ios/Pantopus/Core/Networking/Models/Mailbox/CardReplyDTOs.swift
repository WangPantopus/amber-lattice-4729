//
//  CardReplyDTOs.swift
//  Pantopus
//
//  Writing back to a Christmas card (experience plan Part 3, the memories contract's three reply routes and the joined
//  card's read). Server-only switch `card_replies` with `mailbox` and `holiday_card_memories`; the joined card needs
//  only `mailbox`. A reply carries a note and the saved signature, never a photo or voice in this build.
//

import Foundation

/// The card a reply answers, so the reply is drawn with that card's picture (`card_reply` on a piece, in Sent and on
/// the joined card's reply page).
public struct CardReplyCard: Decodable, Sendable, Hashable {
    public let cardId: String
    public let design: String
    public let number: Int?
    public let caption: String?
    public let paper: String?
    public let height: Int?
    public let slug: String?
    public let table: String?
    public let year: Int
    /// The writer's signature beside FROM (detail reads only).
    public let signature: CardSignature?
    /// In the writer's Sent: whether it can still be taken back, and until when.
    public let canTakeBack: Bool?
    public let takeBackUntil: String?

    private enum CodingKeys: String, CodingKey {
        case design, number, caption, paper, height, slug, table, year, signature
        case cardId = "card_id"
        case canTakeBack = "can_take_back"
        case takeBackUntil = "take_back_until"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        cardId = try c.decode(String.self, forKey: .cardId)
        design = try c.decode(String.self, forKey: .design)
        number = try? c.decodeIfPresent(Int.self, forKey: .number)
        caption = try? c.decodeIfPresent(String.self, forKey: .caption)
        paper = try? c.decodeIfPresent(String.self, forKey: .paper)
        height = try? c.decodeIfPresent(Int.self, forKey: .height)
        slug = try? c.decodeIfPresent(String.self, forKey: .slug)
        table = try? c.decodeIfPresent(String.self, forKey: .table)
        year = (try? c.decodeIfPresent(Int.self, forKey: .year)) ?? Calendar.current.component(.year, from: Date())
        signature = try? c.decodeIfPresent(CardSignature.self, forKey: .signature)
        canTakeBack = try? c.decodeIfPresent(Bool.self, forKey: .canTakeBack)
        takeBackUntil = try? c.decodeIfPresent(String.self, forKey: .takeBackUntil)
    }
}

/// `GET /api/mailbox/cards/:id/exchange`: the card and its reply, for either of the two people, as one joined card.
public struct HolidayCardExchange: Decodable, Sendable, Hashable {
    /// One page of the joined card: the card, or the reply.
    public struct Page: Decodable, Sendable, Hashable {
        public let id: String
        public let fromName: String
        public let toName: String
        /// `YYYY-MM-DD` by the reader's clock.
        public let sentOn: String?
        public let deliveredOn: String?
        public let card: MailCard?
        public let cardReply: CardReplyCard?
        /// Nil only for a sealed card seen by its reader.
        public let note: String?

        private enum CodingKeys: String, CodingKey {
            case id, card, note
            case fromName = "from_name"
            case toName = "to_name"
            case sentOn = "sent_on"
            case deliveredOn = "delivered_on"
            case cardReply = "card_reply"
        }

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            fromName = (try? c.decodeIfPresent(String.self, forKey: .fromName)) ?? ""
            toName = (try? c.decodeIfPresent(String.self, forKey: .toName)) ?? ""
            sentOn = try? c.decodeIfPresent(String.self, forKey: .sentOn)
            deliveredOn = try? c.decodeIfPresent(String.self, forKey: .deliveredOn)
            card = try? c.decodeIfPresent(MailCard.self, forKey: .card)
            cardReply = try? c.decodeIfPresent(CardReplyCard.self, forKey: .cardReply)
            note = try? c.decodeIfPresent(String.self, forKey: .note)
        }
    }

    /// The writer's reply while it waits for the 7 a.m. pickup.
    public struct Pending: Decodable, Sendable, Hashable {
        public let id: String
        public let arrivesOn: String?
        public let takeBackUntil: String?
        public let canTakeBack: Bool

        private enum CodingKeys: String, CodingKey {
            case id
            case arrivesOn = "arrives_on"
            case takeBackUntil = "take_back_until"
            case canTakeBack = "can_take_back"
        }
    }

    public struct Refusal: Decodable, Sendable, Hashable {
        public let code: String?
        public let error: String?
    }

    public let original: Page?
    public let reply: Page?
    public let pendingReply: Pending?
    /// "Write back to {first name}" shows only when true.
    public let canReply: Bool
    public let replyRefusal: Refusal?

    private enum CodingKeys: String, CodingKey {
        case original, reply
        case pendingReply = "pending_reply"
        case canReply = "can_reply"
        case replyRefusal = "reply_refusal"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        original = try? c.decodeIfPresent(Page.self, forKey: .original)
        reply = try? c.decodeIfPresent(Page.self, forKey: .reply)
        pendingReply = try? c.decodeIfPresent(Pending.self, forKey: .pendingReply)
        canReply = (try? c.decodeIfPresent(Bool.self, forKey: .canReply)) ?? false
        replyRefusal = try? c.decodeIfPresent(Refusal.self, forKey: .replyRefusal)
    }
}

/// The reply as stored: `{ reply }` from `POST /cards/:id/reply` (201, or 200 for the same request again).
public struct CardReplyAnswer: Decodable, Sendable, Hashable {
    public struct Summary: Decodable, Sendable, Hashable {
        public let id: String?
        public let cardId: String?
        public let toName: String?
        public let arrivesAt: String?
        public let arrivesOn: String?
        public let takeBackUntil: String?
        public let canTakeBack: Bool?

        private enum CodingKeys: String, CodingKey {
            case id
            case cardId = "card_id"
            case toName = "to_name"
            case arrivesAt = "arrives_at"
            case arrivesOn = "arrives_on"
            case takeBackUntil = "take_back_until"
            case canTakeBack = "can_take_back"
        }
    }

    public let reply: Summary
}

/// `{ message, request_id, signature? }`: one request ID per draft, the same on every retry.
public struct CardReplyBody: Encodable, Sendable, Hashable {
    public let message: String
    public let requestId: String
    public let signature: CardSignature?

    public init(message: String, requestId: String, signature: CardSignature?) {
        self.message = message
        self.requestId = requestId
        self.signature = signature
    }

    private enum CodingKeys: String, CodingKey {
        case message, signature
        case requestId = "request_id"
    }
}

/// `{ taken_back: true, card_id }`.
public struct CardReplyTakeBack: Decodable, Sendable, Hashable {
    public let takenBack: Bool?

    private enum CodingKeys: String, CodingKey {
        case takenBack = "taken_back"
    }
}
