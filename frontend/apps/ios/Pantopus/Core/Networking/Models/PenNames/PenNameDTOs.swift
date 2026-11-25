//
//  PenNameDTOs.swift
//  Pantopus
//
//  Made-up names (`backend/routes/penNames.js`; contract `docs/product/made-up-names/README.md`). Every field is read
//  leniently: an older server sends none of them.
//

import Foundation

/// The person's own made-up name.
public struct PenNameDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let avatarURL: String?
    /// When the name in use may be given up for another (ISO 8601), once something was written under it.
    public let changeAfter: String?

    private enum CodingKeys: String, CodingKey {
        case id, name
        case avatarURL = "avatar_url"
        case changeAfter = "change_after"
    }

    public init(id: String, name: String, avatarURL: String?, changeAfter: String? = nil) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
        self.changeAfter = changeAfter
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = c.lenient(String.self, forKey: .name) ?? ""
        avatarURL = c.lenient(String.self, forKey: .avatarURL)
        changeAfter = c.lenient(String.self, forKey: .changeAfter)
    }

    public var avatar: URL? {
        avatarURL.flatMap(URL.init(string:))
    }
}

/// Why this account can't use a made-up name (`/me`'s and `/check`'s `refusal`): `message` is shown as it is.
public struct PenNameRefusalDTO: Decodable, Sendable, Hashable {
    public let code: String?
    public let message: String
}

/// `GET /api/pen-names/me`.
public struct PenNameMeResponse: Decodable, Sendable, Hashable {
    public let penName: PenNameDTO?
    public let allowed: Bool
    public let refusal: PenNameRefusalDTO?
    public let nameMin: Int
    public let nameMax: Int
    /// The kinds of post a made-up name may carry (`ask_local`, `recommendation`, `local_update`, `neighborhood_win`).
    public let postTypes: [String]
    /// The three sentences of the promise, shown where the name is chosen.
    public let promise: [String]
    /// Names Pantopus could give, when the person has none and may have one.
    public let suggestions: [String]

    private enum CodingKeys: String, CodingKey {
        case penName = "pen_name"
        case allowed, refusal
        case nameRules = "name_rules"
        case postTypes = "post_types"
        case promise, suggestions
    }

    private struct NameRules: Decodable {
        let min: Int?
        let max: Int?
    }

    public init(
        penName: PenNameDTO?,
        allowed: Bool,
        refusal: PenNameRefusalDTO? = nil,
        postTypes: [String] = PenNameMeResponse.defaultPostTypes,
        promise: [String] = [],
        suggestions: [String] = []
    ) {
        self.penName = penName
        self.allowed = allowed
        self.refusal = refusal
        nameMin = 3
        nameMax = 24
        self.postTypes = postTypes
        self.promise = promise
        self.suggestions = suggestions
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        penName = c.lenient(PenNameDTO.self, forKey: .penName)
        allowed = c.lenient(Bool.self, forKey: .allowed) ?? false
        refusal = c.lenient(PenNameRefusalDTO.self, forKey: .refusal)
        let rules = c.lenient(NameRules.self, forKey: .nameRules)
        nameMin = rules?.min ?? 3
        nameMax = rules?.max ?? 24
        let types = c.lenient([String].self, forKey: .postTypes) ?? []
        postTypes = types.isEmpty ? Self.defaultPostTypes : types
        promise = c.lenient([String].self, forKey: .promise) ?? []
        suggestions = c.lenient([String].self, forKey: .suggestions) ?? []
    }

    /// The contract's four kinds, for a server that sends no list.
    public static let defaultPostTypes = ["ask_local", "recommendation", "local_update", "neighborhood_win"]
}

/// `GET /api/pen-names/suggestions`.
public struct PenNameSuggestionsResponse: Decodable, Sendable {
    public let suggestions: [String]

    private enum CodingKeys: String, CodingKey { case suggestions }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        suggestions = c.lenient([String].self, forKey: .suggestions) ?? []
    }
}

/// `POST /api/pen-names` → 201 `{ pen_name }`.
public struct PenNameTakeResponse: Decodable, Sendable {
    public let penName: PenNameDTO

    private enum CodingKeys: String, CodingKey {
        case penName = "pen_name"
    }
}

/// `GET /api/pen-names/check`.
public struct PenNameCheckResponse: Decodable, Sendable, Hashable {
    public let allowed: Bool
    public let refusal: PenNameRefusalDTO?
    /// Shown above the Post button when few verified homes are near.
    public let warning: String?

    private enum CodingKeys: String, CodingKey { case allowed, refusal, warning }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        allowed = c.lenient(Bool.self, forKey: .allowed) ?? true
        refusal = c.lenient(PenNameRefusalDTO.self, forKey: .refusal)
        warning = c.lenient(String.self, forKey: .warning)
    }
}

/// `GET /api/pen-names/:id` → `{ pen_name }`: the small card.
public struct PenNameCardResponse: Decodable, Sendable {
    public let penName: PenNameCardDTO

    private enum CodingKeys: String, CodingKey {
        case penName = "pen_name"
    }
}

public struct PenNameCardDTO: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let avatarURL: String?
    public let badges: [String]
    /// "A made-up name. Pantopus knows who this is and holds them to the same rules as everyone."
    public let note: String?
    public let isYours: Bool
    public let muted: Bool
    public let blocked: Bool

    private enum CodingKeys: String, CodingKey {
        case id, name, badges, note, muted, blocked
        case avatarURL = "avatar_url"
        case isYours = "is_yours"
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = c.lenient(String.self, forKey: .name) ?? ""
        avatarURL = c.lenient(String.self, forKey: .avatarURL)
        badges = c.lenient([String].self, forKey: .badges) ?? []
        note = c.lenient(String.self, forKey: .note)
        isYours = c.lenient(Bool.self, forKey: .isYours) ?? false
        muted = c.lenient(Bool.self, forKey: .muted) ?? false
        blocked = c.lenient(Bool.self, forKey: .blocked) ?? false
    }
}

/// A made-up-name refusal from any route: `{ error, code }`. The app shows `error` as it is.
public struct PenNameRefusal: Sendable, Equatable {
    public let code: String
    public let message: String

    /// Every made-up-name code starts so.
    static let prefix = "PEN_NAME_"

    /// The refusal an error carries, when the server sent one. A 403 keeps only its sentence (`APIClient` maps it
    /// by status), so its code reads as `PEN_NAME_REFUSED_403`.
    public static func from(_ error: any Error) -> PenNameRefusal? {
        switch error as? APIError {
        case let .clientError(_, body):
            return parse(body)
        case let .server(_, body):
            return parse(body)
        case let .forbidden(message):
            guard let message, !message.isEmpty else { return nil }
            return PenNameRefusal(code: "PEN_NAME_REFUSED_403", message: message)
        default:
            return nil
        }
    }

    private static func parse(_ body: String?) -> PenNameRefusal? {
        guard let data = body?.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let code = json["code"] as? String, code.hasPrefix(prefix),
              let message = json["error"] as? String, !message.isEmpty else { return nil }
        return PenNameRefusal(code: code, message: message)
    }

    /// No made-up name yet: the name screen opens, then the post is sent again.
    public var needsName: Bool {
        code == "PEN_NAME_NEEDED"
    }
}
