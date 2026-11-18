//
//  PlanErrors.swift
//  Pantopus
//
//  The sentences Plans shows when an action doesn't go through.
//

import Foundation

/// Error sentences for Plans actions. The server's own sentence wins
/// (`{ error, message }`); a few codes get the boards' words.
enum PlanErrors {
    /// A `409 full` on an ask, in the boards' words.
    static let fullSentence = "That plan just filled up."

    static func sentence(for error: any Error) -> String {
        guard let apiError = error as? APIError else { return "Something went wrong. Please try again." }
        switch apiError {
        case let .clientError(status, body):
            if status == 409, code(in: body) == "full" { return fullSentence }
            // What to do about it, as the J1 footer says it (and Android).
            if code(in: body) == "too_many_requests" { return "You have 10 open requests. Withdraw one to ask here." }
            return apiError.errorDescription ?? "Something went wrong. Please try again."
        case .transport:
            return "Can't reach Pantopus. Check your connection and try again."
        default:
            return apiError.errorDescription ?? "Something went wrong. Please try again."
        }
    }

    /// The Plans API's machine code (`error`) from a raw body.
    static func code(in body: String?) -> String? {
        guard let body, let data = body.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return (json["error"] as? String) ?? (json["code"] as? String)
    }
}
