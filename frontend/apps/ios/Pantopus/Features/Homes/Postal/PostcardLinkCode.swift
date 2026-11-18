//
//  PostcardLinkCode.swift
//  Pantopus
//
//  The code from a scanned postcard's link (`…/verify-postcard#c=<code>`,
//  FASTVERIFY), handed from the deep-link router to the postcard screen. It
//  stays in memory, out of the navigation path, and is taken once: by the
//  postcard screen when it opens, or by the one already open when a link
//  arrives (`handed` changes).
//

import Foundation
import Observation

@Observable
@MainActor
final class PostcardLinkCode {
    static let shared = PostcardLinkCode()
    @ObservationIgnored private var codes: [String: String] = [:]
    /// Counts hand-overs, so an open postcard screen can take a code that arrives while it shows.
    private(set) var handed = 0

    private init() {}

    /// The card prints 6 letters and digits; the server accepts 6 to 8.
    nonisolated static func sanitized(_ raw: String?) -> String? {
        guard let raw = raw?.removingPercentEncoding ?? raw else { return nil }
        let code = raw.trimmingCharacters(in: .whitespaces).uppercased()
        guard code.range(of: "^[A-Z0-9]{6,8}$", options: .regularExpression) != nil else { return nil }
        return code
    }

    static func hand(_ code: String?, homeId: String) {
        guard let code = sanitized(code) else { return }
        shared.codes[homeId.lowercased()] = code
        shared.handed += 1
    }

    /// The code waiting for this Home's postcard screen, once.
    static func take(homeId: String) -> String? {
        shared.codes.removeValue(forKey: homeId.lowercased())
    }
}
