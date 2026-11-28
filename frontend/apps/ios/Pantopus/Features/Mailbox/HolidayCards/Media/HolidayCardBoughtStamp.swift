//
//  HolidayCardBoughtStamp.swift
//  Pantopus
//
//  A card's own photo or voice greeting goes only on a card sent with a bought stamp (founder, 2026-11-11; contract
//  `wave4-contract-notes` "Bought stamp only", server #3919). The server says what to do in `GET /api/mailbox/cards`
//  `media.bought_stamp.state`; with none left, "Add a photo" and "Record a greeting" open the stamp books, and a look
//  or seal the server refuses (402 `CARD_MEDIA_NEEDS_STAMP`) opens them too, keeping the card as it is.
//

import Foundation

extension HolidayCardFlowViewModel {
    /// The stamp books, saying a photo or greeting goes only with a bought stamp.
    func openStampsForMedia() {
        stampsForMedia = true
        showsStampBooks = true
    }

    /// The card carries a photo or greeting.
    var carriesMedia: Bool {
        !mediaPick.isEmpty
    }

    /// True only when the server still requires a bought stamp for photo/voice media AND this card carries media.
    var mediaRequiresBoughtStamp: Bool {
        cards?.media?.boughtStamp?.required == true && carriesMedia
    }

    /// True only when a bought stamp is required for media and the sender has none left.
    var mediaNeedsBoughtStamp: Bool {
        mediaRequiresBoughtStamp && boughtStampsLeft == 0
    }

    /// Bought stamps left, from the stamp books' balance; nil before it's read.
    var boughtStampsLeft: Int? {
        stamps.balance.map { max(0, $0.paidRemaining) }
    }

    /// Explanation when photo or voice requires a bought stamp (accounting for the 2-card free allowance).
    var mediaNeedsStampLine: String {
        if let free = cards?.media?.freeAllowance, free.limit > 0, free.remaining == 0 {
            return "You’ve used your \(free.limit) free photo or voice cards. Adding more uses a bought stamp."
        }
        return HolidayCardMediaRow.needsStampLine
    }

    /// Subtle 1-line note under the photo/voice buttons when the sender still has free media slots and 0 bought stamps.
    var freeMediaHint: String? {
        guard let free = cards?.media?.freeAllowance, free.limit > 0, free.remaining > 0 else { return nil }
        let paid = boughtStampsLeft ?? cards?.stamps?.paidRemaining ?? 0
        guard paid == 0 else { return nil }
        let count = recipient?.entries?.count ?? 1
        if count > free.remaining {
            let need = count - free.remaining
            let freeWord = free.remaining == 1 ? "card" : "cards"
            let stampWord = need == 1 ? "stamp" : "stamps"
            let freePart = "You have \(free.remaining) free photo or voice \(freeWord) left."
            return "\(freePart) This list of \(count) will need \(need) bought \(stampWord)."
        }
        if free.remaining == free.limit {
            return "Your first \(free.limit) cards with a photo or voice greeting are free."
        }
        let freeWord = free.remaining == 1 ? "card" : "cards"
        return "\(free.remaining) free photo or voice \(freeWord) left — after that, they use a bought stamp."
    }
}
