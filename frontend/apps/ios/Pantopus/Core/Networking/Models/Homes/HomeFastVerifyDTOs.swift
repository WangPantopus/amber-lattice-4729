//
//  HomeFastVerifyDTOs.swift
//  Pantopus
//
//  Faster home verification (FASTVERIFY): which ways to verify this person
//  can use at a Home, read from `GET /api/homes/:id/verify-options`. The
//  server answers 404 `FAST_CHECK_OFF` while `home_fast_verify` is off, and
//  the app then keeps today's verify sheet. Every field past the SPEC's base
//  shape is read leniently, so an older or newer server never breaks Place.
//

import Foundation

/// The person's standing at a Home and the ways they may verify there.
public struct HomeVerifyOptions: Decodable, Sendable, Hashable {
    /// `none`, `added` (an instant claim), `fast` (a fast check stands) or `proven` (mail, document, landlord).
    public enum Level: String, Sendable, Hashable {
        /// No claim and no proof here (`none`).
        case notAdded = "none"
        case added, fast, proven
    }

    public let homeId: String
    public let level: Level
    public let fast: HomeFastCheck?
    public let options: [HomeVerifyOption]
    /// Add Home in two steps (`home_short_add`).
    public let shortAddHome: Bool
    /// The card's QR picture and "This wasn't me" (`home_postcard_scan`).
    public let postcardScan: Bool
    /// How the person is Verified here, as the apps say it: `phone`, `location`, `bill`, `mail`, `document` or
    /// `landlord`; nil until Verified.
    public let verifiedBy: String?
    /// When that check or proof was made (ISO date).
    public let verifiedAt: String?
    /// A fast check stands, and residency letters and home Mail still need the mailed code.
    public let needsMail: Bool

    private enum CodingKeys: String, CodingKey {
        case homeId = "home_id"
        case level, fast, options
        case shortAddHome = "short_add_home"
        case postcardScan = "postcard_scan"
        case verifiedBy = "verified_by"
        case verifiedAt = "verified_at"
        case needsMail = "needs_mail"
    }

    public init(
        homeId: String,
        level: Level,
        fast: HomeFastCheck? = nil,
        options: [HomeVerifyOption] = [],
        shortAddHome: Bool = false,
        postcardScan: Bool = false,
        verifiedBy: String? = nil,
        verifiedAt: String? = nil,
        needsMail: Bool = false
    ) {
        self.homeId = homeId
        self.level = level
        self.fast = fast
        self.options = options
        self.shortAddHome = shortAddHome
        self.postcardScan = postcardScan
        self.verifiedBy = verifiedBy
        self.verifiedAt = verifiedAt
        self.needsMail = needsMail
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        homeId = try c.decode(String.self, forKey: .homeId)
        level = (try? c.decodeIfPresent(String.self, forKey: .level)).flatMap(Level.init(rawValue:)) ?? .notAdded
        fast = try? c.decodeIfPresent(HomeFastCheck.self, forKey: .fast)
        options = (try? c.decodeIfPresent([HomeVerifyOption].self, forKey: .options)) ?? []
        shortAddHome = (try? c.decodeIfPresent(Bool.self, forKey: .shortAddHome)) ?? false
        postcardScan = (try? c.decodeIfPresent(Bool.self, forKey: .postcardScan)) ?? false
        verifiedBy = try? c.decodeIfPresent(String.self, forKey: .verifiedBy)
        verifiedAt = try? c.decodeIfPresent(String.self, forKey: .verifiedAt)
        // An answer without it: a fast check stands exactly when residency letters still need the mailed code.
        needsMail = (try? c.decodeIfPresent(Bool.self, forKey: .needsMail)) ?? (level == .fast)
    }

    /// The option with this id, when the server listed it.
    public func option(_ id: HomeVerifyOption.Kind) -> HomeVerifyOption? {
        options.first { $0.id == id.rawValue }
    }

    /// True when the server offers this way now.
    public func offers(_ id: HomeVerifyOption.Kind) -> Bool {
        option(id)?.available == true
    }

    /// Verified at this Home, by a fast check or by proof.
    public var isVerified: Bool {
        level == .fast || level == .proven
    }
}

/// One way to verify, as the server lists it.
public struct HomeVerifyOption: Decodable, Sendable, Hashable {
    public enum Kind: String, Sendable, CaseIterable {
        case phone, location, document, mail, landlord
    }

    public let id: String
    public let available: Bool
    /// `OFF`, `NEEDS_CLAIM`, `ONE_HOME`, `LIMIT`, `APP_ONLY`, `IN_REVIEW` or `UNAVAILABLE`; nil when available.
    public let reason: String?
    /// The document row only: true = the photo is read at once ("Bill check"), false = today's review-only upload.
    public let fast: Bool?

    private enum CodingKeys: String, CodingKey {
        case id, available, reason, fast
    }

    public init(id: String, available: Bool, reason: String? = nil, fast: Bool? = nil) {
        self.id = id
        self.available = available
        self.reason = reason
        self.fast = fast
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        available = (try? c.decodeIfPresent(Bool.self, forKey: .available)) ?? false
        reason = try? c.decodeIfPresent(String.self, forKey: .reason)
        fast = try? c.decodeIfPresent(Bool.self, forKey: .fast)
    }
}

/// A fast check that stands on the person's claimed home.
public struct HomeFastCheck: Decodable, Sendable, Hashable {
    /// `phone`, `location` or `document`.
    public let kind: String
    public let at: String?
    public let expiresAt: String?
    public let recheckDueAt: String?

    private enum CodingKeys: String, CodingKey {
        case kind, at
        case expiresAt = "expires_at"
        case recheckDueAt = "recheck_due_at"
    }

    public init(kind: String, at: String? = nil, expiresAt: String? = nil, recheckDueAt: String? = nil) {
        self.kind = kind
        self.at = at
        self.expiresAt = expiresAt
        self.recheckDueAt = recheckDueAt
    }
}
