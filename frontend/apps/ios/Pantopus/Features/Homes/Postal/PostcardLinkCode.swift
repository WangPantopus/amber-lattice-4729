//
//  PostcardLinkCode.swift
//  Pantopus
//
//  The code from a scanned postcard's link (`…/verify-postcard#c=<code>`,
//  FASTVERIFY), handed from the deep-link router to the postcard screen. It
//  stays in memory, out of the navigation path, and is taken once.
//

import Foundation

@MainActor
enum PostcardLinkCode {
    private static var codes: [String: String] = [:]

    /// The card prints 6 letters and digits; the server accepts 6 to 8.
    nonisolated static func sanitized(_ raw: String?) -> String? {
        guard let raw = raw?.removingPercentEncoding ?? raw else { return nil }
        let code = raw.trimmingCharacters(in: .whitespaces).uppercased()
        guard code.range(of: "^[A-Z0-9]{6,8}$", options: .regularExpression) != nil else { return nil }
        return code
    }

    static func hand(_ code: String?, homeId: String) {
        guard let code = sanitized(code) else { return }
        codes[homeId.lowercased()] = code
    }

    /// The code waiting for this Home's postcard screen, once.
    static func take(homeId: String) -> String? {
        codes.removeValue(forKey: homeId.lowercased())
    }
}
