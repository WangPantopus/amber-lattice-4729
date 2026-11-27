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
