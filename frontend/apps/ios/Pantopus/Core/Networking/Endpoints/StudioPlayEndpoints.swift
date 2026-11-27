//
//  StudioPlayEndpoints.swift
//  Pantopus
//
//  The requests of "Pulse, reinvented" phase 2's layers (CONTRACT 7: dots, field cards, the playable items), sent only
//  while `pulse_reinvented` is on for the person; each answers `403 PULSE_REINVENTED_OFF` otherwise. Today's screens
//  never send them. Routes in `backend/routes/reinvented.js`.
//

import Foundation

public enum StudioPlayEndpoints {
    private static func part(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? value
    }

    /// `DELETE /api/reinvented/dots/:id/:dot` (CONTRACT 7c): the author takes one dot off their own Moment. `204`.
    /// Route `backend/routes/reinvented.js:259`.
    static func removeDot(postId: String, dot: String) -> Endpoint {
        Endpoint(method: .delete, path: "/api/reinvented/dots/\(part(postId))/\(part(dot))")
    }

    /// `POST /api/reinvented/dots/:id/:dot/card` (CONTRACT 7d): a thing's field card. The first tap makes it (one
    /// Pantopus AI call); every later one answers the kept card. Route `backend/routes/reinvented.js:271`.
    static func fieldCard(postId: String, dot: String) -> Endpoint {
        Endpoint(method: .post, path: "/api/reinvented/dots/\(part(postId))/\(part(dot))/card", body: StudioEmptyBody())
    }

    /// `POST /api/reinvented/dots/:id/:dot/card/correction` (CONTRACT 7d): "Not right?", one per person per card.
    /// Route `backend/routes/reinvented.js:280`.
    static func correctCard(postId: String, dot: String, name: String, note: String?) -> Endpoint {
        Endpoint(
            method: .post,
            path: "/api/reinvented/dots/\(part(postId))/\(part(dot))/card/correction",
            body: FieldCardCorrectionBody(name: name, note: note)
        )
    }

    /// `POST` / `DELETE /api/reinvented/dots/:id/:dot/collect` (CONTRACT 7f): keep the card in one's field guide, or let
    /// it go. Route `backend/routes/reinvented.js:292`.
    static func collect(postId: String, dot: String, keep: Bool) -> Endpoint {
        let path = "/api/reinvented/dots/\(part(postId))/\(part(dot))/collect"
        return keep ? Endpoint(method: .post, path: path, body: StudioEmptyBody()) : Endpoint(method: .delete, path: path)
    }

    /// `GET /api/reinvented/field-guide?cursor=` (CONTRACT 7f): the reader's own collected cards, newest first.
    /// Route `backend/routes/reinvented.js:314`.
    static func fieldGuide(cursor: String?) -> Endpoint {
        Endpoint(
            method: .get,
            path: "/api/reinvented/field-guide",
            query: cursor.map { ["cursor": $0] } ?? [:],
            cachePolicy: .reloadIgnoringLocalCacheData
        )
    }

    /// `GET /api/reinvented/settings` (CONTRACT 7d): the person's own choices, `pantopus_ai` among them.
    /// Route `backend/routes/reinvented.js:333`.
    static let settings = Endpoint(method: .get, path: "/api/reinvented/settings", cachePolicy: .reloadIgnoringLocalCacheData)

    /// `PATCH /api/reinvented/settings` with `{ "pantopus_ai": … }` (CONTRACT 7d). Route `backend/routes/reinvented.js:342`.
    static func setPantopusAI(_ on: Bool) -> Endpoint {
        Endpoint(method: .patch, path: "/api/reinvented/settings", body: PantopusAIChoiceBody(pantopusAI: on))
    }
}

struct StudioEmptyBody: Encodable {}

struct FieldCardCorrectionBody: Encodable {
    let name: String
    let note: String?
}

struct PantopusAIChoiceBody: Encodable {
    let pantopusAI: Bool

    enum CodingKeys: String, CodingKey {
        case pantopusAI = "pantopus_ai"
    }
}

/// `{ "card": … }`, a field card's answer.
struct FieldCardEnvelope: Decodable {
    let card: MomentFieldCardDTO
}

/// The person's own choices (CONTRACT 7d): only `pantopus_ai` is read here.
struct ReinventedChoicesDTO: Decodable {
    let pantopusAI: Bool

    enum CodingKeys: String, CodingKey {
        case pantopusAI = "pantopus_ai"
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pantopusAI = (try? c.decodeIfPresent(Bool.self, forKey: .pantopusAI)) ?? true
    }
}

/// One page of the reader's field guide (CONTRACT 7f).
struct FieldGuidePageDTO: Decodable {
    struct Entry: Decodable, Identifiable {
        let postId: String
        let dotId: String
        let collectedAt: String?
        let card: MomentFieldCardDTO
        let open: Bool

        var id: String {
            "\(postId)/\(dotId)"
        }

        enum CodingKeys: String, CodingKey {
            case card, open
            case postId = "post_id"
            case dotId = "dot_id"
            case collectedAt = "collected_at"
        }
    }

    let cards: [Entry]
    let nextCursor: String?

    enum CodingKeys: String, CodingKey {
        case cards
        case nextCursor = "next_cursor"
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        cards = (try? c.decodeIfPresent(MomentLenientList<Entry>.self, forKey: .cards))?.items ?? []
        nextCursor = try? c.decodeIfPresent(String.self, forKey: .nextCursor)
    }
}

/// One of phase 2's requests went out and was refused: its status, the contract's code and the server's words.
struct StudioPlayFailure: Error {
    let status: Int
    let code: String?
    let words: String?

    /// What to tell the person: the server's own sentence when it is one, else `fallback`.
    func message(_ fallback: String) -> String {
        if code == "MOMENT_ENDED" { return MomentsFailure.ended.message }
        if status == 0 { return MomentsFailure.offline.message }
        if let words, words.contains(" "), words.count <= 160 { return words }
        return fallback
    }
}

enum StudioPlayAPI {
    /// Sends one of phase 2's requests. A `403 PULSE_REINVENTED_OFF` reads the switch again at once, so the person goes
    /// back to today's screens.
    static func send<Response: Decodable>(_ endpoint: Endpoint, as _: Response.Type = Response.self) async throws -> Response {
        let response: APIClient.DataResponse
        do {
            response = try await APIClient.shared.requestDataResponse(endpoint, includingForbidden: true, includingNotFound: true)
        } catch {
            throw StudioPlayFailure(status: 0, code: nil, words: nil)
        }
        let status = response.response.statusCode
        guard (200..<300).contains(status) else {
            let json = (try? JSONSerialization.jsonObject(with: response.data)) as? [String: Any]
            let failure = StudioPlayFailure(status: status, code: json?["code"] as? String, words: json?["error"] as? String)
            if failure.code == "PULSE_REINVENTED_OFF" { await PulseReinventedFlags.shared.recheck() }
            throw failure
        }
        if Response.self == EmptyResponse.self {
            // swiftlint:disable:next force_cast
            return EmptyResponse() as! Response
        }
        do {
            return try JSONDecoder().decode(Response.self, from: response.data)
        } catch {
            throw StudioPlayFailure(status: status, code: nil, words: nil)
        }
    }

    static func send(_ endpoint: Endpoint) async throws {
        _ = try await send(endpoint, as: EmptyResponse.self)
    }
}
