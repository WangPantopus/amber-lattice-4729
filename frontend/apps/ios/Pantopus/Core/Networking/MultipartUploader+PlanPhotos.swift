//
//  MultipartUploader+PlanPhotos.swift
//  Pantopus
//
//  Plans for the holidays, photos afterwards (08-extras section 5): one picture a call to `POST /api/plans/:id/photos`
//  (field `file`, JPEG, HEIC or PNG up to 10 MB), answering the grid. Refusals carry the server's sentence, the
//  picture check's `503 check_unavailable` included. Route backend/routes/plans.js (`/:id/photos`), `planPhotos.add`.
//

import Foundation

extension MultipartUploader {
    @MainActor
    func uploadPlanPhoto(planId: String, jpeg: Data) async throws -> PlanPhotosGridDTO {
        let boundary = "PantopusBoundary-\(UUID().uuidString)"
        var components = URLComponents(
            url: apiBaseURL.appendingPathComponent("/api/plans/\(planId)/photos"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = PlansEndpoints.biz().sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        guard let url = components?.url else { throw APIError.invalidURL }
        let file = MultipartFile(fieldName: "file", filename: "photo.jpg", mimeType: "image/jpeg", data: jpeg)
        let body = Self.buildBody(boundary: boundary, file: file, fields: [:])
        let (data, http) = try await performUpload(to: url, boundary: boundary, body: body)
        let text = String(data: data, encoding: .utf8)
        switch http.statusCode {
        case 200..<300: return try JSONDecoder().decode(PlanPhotosGridDTO.self, from: data)
        case 401: throw APIError.unauthorized
        // 503 is the picture check that couldn't run: its sentence says to try again.
        case 400..<500, 503: throw APIError.clientError(status: http.statusCode, message: text)
        default: throw APIError.server(status: http.statusCode, body: text ?? "")
        }
    }
}
