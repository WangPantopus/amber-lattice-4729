//
//  MultipartUploader+Sound.swift
//  Pantopus
//
//  "Pulse, reinvented" phase 2 (CONTRACT 7e): a Moment's sound, sent by its author after the Moment is made, only while
//  the switch is on for them. `POST /api/reinvented/moments/:id/sound`, multipart: the file, its kind (`voice`,
//  `place`, `whisper`), the whisper's dot, its length, and a voice's words with their times. Route
//  `backend/routes/reinvented.js:389`.
//

import Foundation

extension MultipartUploader {
    /// One sound of a Moment. Answers the server's status and body; the caller says what a refusal means.
    @MainActor
    func uploadMomentSound(
        momentId: String,
        file: MultipartFile,
        fields: [String: String]
    ) async throws -> (status: Int, body: Data) {
        let boundary = "PantopusBoundary-\(UUID().uuidString)"
        let id = momentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? momentId
        let url = apiBaseURL.appendingPathComponent("/api/reinvented/moments/\(id)/sound")
        let body = Self.buildBody(boundary: boundary, file: file, fields: fields)
        let (data, http) = try await performUpload(to: url, boundary: boundary, body: body)
        return (http.statusCode, data)
    }
}
