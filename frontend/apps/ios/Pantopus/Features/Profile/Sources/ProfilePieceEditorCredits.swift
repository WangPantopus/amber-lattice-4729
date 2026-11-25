//
//  ProfilePieceEditorCredits.swift
//  Pantopus
//
//  Naming people on a piece from the editor (CONTRACT P2.5): a person is asked to sign, a typed name stays Said.
//

import Foundation

// MARK: - Who was on it (P2.5)

extension ProfilePieceEditorModel {
    /// Asking a person needs the piece on Work: nobody is asked about a draft (the server refuses).
    var asksNeedWork: Bool {
        pieceId == nil || isDraft
    }

    /// Names a person (who gets one notification and is asked to sign) or a typed name. A person is asked only about
    /// a piece on Work, so a new piece or a draft goes on Work first; a typed name can sit on a draft. True when added.
    func addCredit(userId: String?, name: String?, role: String, relation: String) async -> Bool {
        if userId != nil, asksNeedWork {
            guard await save(draft: false) else { return false }
        } else if pieceId == nil {
            guard await save(draft: true) else { return false }
        }
        guard let pieceId else { return false }
        let trimmed = role.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = ProfileCreditBody(
            userId: userId,
            name: name,
            role: trimmed.isEmpty ? nil : String(trimmed.prefix(40)),
            relation: relation
        )
        do {
            _ = try await client.request(ProfilePageEndpoints.addCredit(pieceId: pieceId, body), as: EmptyResponse.self)
            await reloadCredits()
            NotificationCenter.default.post(name: .profilePiecesChanged, object: nil)
            return true
        } catch {
            problem = Self.sentence(error, otherwise: "Couldn't add them. Try again.")
            return false
        }
    }

    func removeCredit(_ credit: ProfileCreditDTO) async {
        guard let pieceId else { return }
        do {
            _ = try await client.request(
                ProfilePageEndpoints.removeCredit(pieceId: pieceId, creditId: credit.id),
                as: EmptyResponse.self
            )
            await reloadCredits()
            NotificationCenter.default.post(name: .profilePiecesChanged, object: nil)
        } catch {
            problem = Self.sentence(error, otherwise: "Couldn't take them off. Try again.")
        }
    }

    private func reloadCredits() async {
        guard let pieceId, case let .signedIn(user) = AuthManager.shared.state,
              let read: ProfilePieceReadDTO = try? await client.request(
                  ProfilePageEndpoints.piece(identifier: user.id, pieceId: pieceId)
              ) else { return }
        credits = read.piece.credits
        suggested = read.piece.suggestedCredits
        howItWillShow = read.piece.howItWillShow
    }
}
