//
//  PhoneCheckViewModel.swift
//  Pantopus
//
//  The phone number check (FASTVERIFY phase 3, drawings V2 and V3): text a
//  code to the person's mobile number, then ask the phone company's records
//  whether the number is billed to this Home's address. A pass verifies the
//  person (B3); a miss changes nothing (B4). The number is never kept here.
//

import Foundation
import Observation

@Observable
@MainActor
final class PhoneCheckViewModel {
    enum Stage: Equatable {
        case number
        case code
        case verified
        case noMatch
    }

    let homeId: String
    let address: String
    private let api: APIClient

    private(set) var stage: Stage = .number
    private(set) var isWorking = false
    private(set) var error: String?
    /// The name on the account, as the records question uses it unless someone else's is given.
    private(set) var accountName = ""
    var phoneInput = ""
    var usesOtherName = false
    var otherFirstName = ""
    var otherLastName = ""
    var code = ""
    /// The number the code went to, in E.164; the verify call repeats it.
    private(set) var sentTo: String?
    private(set) var resendAvailableAt: Date?
    private(set) var triesLeft: Int?

    init(homeId: String, address: String, api: APIClient = .shared) {
        self.homeId = homeId
        self.address = address
        self.api = api
    }

    func load() async {
        guard accountName.isEmpty,
              let profile: ProfileResponse = try? await api.request(UsersEndpoints.profile()) else { return }
        accountName = [profile.user.firstName, profile.user.lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    // MARK: Number

    /// The typed number in E.164: ten US digits (a leading 1 allowed), or a number typed with its own "+".
    static func e164(_ typed: String) -> String? {
        let trimmed = typed.trimmingCharacters(in: .whitespaces)
        let digits = trimmed.filter(\.isNumber)
        if trimmed.hasPrefix("+") { return (8...15).contains(digits.count) ? "+" + digits : nil }
        if digits.count == 10 { return "+1" + digits }
        if digits.count == 11, digits.hasPrefix("1") { return "+" + digits }
        return nil
    }

    /// "(360) 555-0142" for a US number; others as typed.
    static func display(_ e164: String) -> String {
        let digits = e164.filter(\.isNumber)
        guard e164.hasPrefix("+1"), digits.count == 11 else { return e164 }
        let d = Array(digits.dropFirst())
        return "(\(String(d[0..<3]))) \(String(d[3..<6]))-\(String(d[6..<10]))"
    }

    var canSend: Bool {
        guard !isWorking, Self.e164(phoneInput) != nil else { return false }
        guard usesOtherName else { return true }
        return !otherFirstName.trimmingCharacters(in: .whitespaces).isEmpty
            && !otherLastName.trimmingCharacters(in: .whitespaces).isEmpty
    }

    func sendCode() async {
        guard canSend, let phone = Self.e164(phoneInput) else { return }
        isWorking = true
        error = nil
        defer { isWorking = false }
        let first = otherFirstName.trimmingCharacters(in: .whitespaces)
        let last = otherLastName.trimmingCharacters(in: .whitespaces)
        do {
            let response: PhoneCheckStartResponse = try await api.request(HomeFastVerifyEndpoints.phoneStart(
                homeId: homeId,
                request: PhoneCheckStartRequest(
                    phone: phone,
                    accountFirstName: usesOtherName ? first : nil,
                    accountLastName: usesOtherName ? last : nil
                )
            ))
            sentTo = phone
            code = ""
            triesLeft = nil
            resendAvailableAt = Date().addingTimeInterval(TimeInterval(max(response.resendAfterS ?? 30, 0)))
            stage = .code
        } catch {
            self.error = Self.message(for: error)
        }
    }

    func changeNumber() {
        stage = .number
        code = ""
        error = nil
        triesLeft = nil
    }

    // MARK: Code

    var canVerify: Bool {
        !isWorking && sentTo != nil && code.count == 6
    }

    func verify() async {
        guard canVerify, let phone = sentTo else { return }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            let response: PhoneCheckVerifyResponse = try await api.request(HomeFastVerifyEndpoints.phoneVerify(
                homeId: homeId,
                request: PhoneCheckVerifyRequest(
                    phone: phone,
                    code: code,
                    accountFirstName: usesOtherName ? otherFirstName.trimmingCharacters(in: .whitespaces) : nil,
                    accountLastName: usesOtherName ? otherLastName.trimmingCharacters(in: .whitespaces) : nil
                )
            ))
            switch response.result {
            case "verified":
                HomeVerifyOptionsStore.shared.forget(homeId: homeId)
                stage = .verified
            case "no_match":
                stage = .noMatch
            default:
                triesLeft = response.triesLeft
                code = ""
                switch triesLeft {
                case 0?:
                    // The code is used up or expired: "Send again" right away, in the web's words.
                    resendAvailableAt = nil
                    error = "That code can't be used any more. Send a new one."
                case let left?:
                    error = left == 1 ? "That code didn't match. 1 try left." : "That code didn't match. \(left) tries left."
                case nil:
                    error = "That code didn't match. Check it and try again."
                }
            }
        } catch {
            self.error = Self.message(for: error)
        }
    }

    /// The server's words for a refusal (SPEC section 6), or a plain fallback.
    static func message(for error: any Error) -> String {
        guard let apiError = error as? APIError else { return "Something went wrong. Try again." }
        switch apiError {
        case let .clientError(_, body):
            return FastCheckErrors.message(body) ?? APIError.friendlyClientMessage(body) ?? "Something went wrong. Try again."
        case let .server(_, body):
            return FastCheckErrors.message(body) ?? "The phone check isn't available right now. Verify another way."
        case .notFound:
            return "This way to verify isn't available. Choose another way to verify."
        case .transport:
            return "Can't reach Pantopus. Check your connection."
        default:
            return apiError.errorDescription ?? "Something went wrong. Try again."
        }
    }
}

/// The fast-check refusals' words: the server's `error`, or the SPEC's words for its `code`.
enum FastCheckErrors {
    static let words: [String: String] = [
        "MAIL_PROOF_REQUIRED": "This needs a mailed code. Ask for the postcard in Place.",
        "FAST_CHECK_OFF": "This way to verify isn't available. Choose another way to verify.",
        "FAST_CHECK_ONE_HOME": "A fast check covers one home. Choose another way to verify this address.",
        "FAST_CHECK_LIMIT": "Too many tries for now. Try again later, or verify another way.",
        "PHONE_IN_USE": "This number already verified another account. Use a different way.",
        "PHONE_INVALID": "Check the number and try again.",
        "PHONE_CHECK_UNAVAILABLE": "The phone check isn't available right now. Verify another way."
    ]

    static func message(_ body: String?) -> String? {
        guard let body, let data = body.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        if let code = json["code"] as? String, let known = words[code] { return known }
        return (json["error"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }
}
