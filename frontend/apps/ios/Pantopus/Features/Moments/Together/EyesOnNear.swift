//
//  EyesOnNear.swift
//  Pantopus
//
//  "Eyes on near you" ("Pulse, reinvented" phase 3; CONTRACT 8f): the open Eyes-on Asks near where the reader is now,
//  each answered with a Live photo taken there (the Studio opens "Answering “…” with a Live photo", and the Moment
//  carries `eyes_on_for`). Read only when the reader picks the Ask chip, never beside what opens the tab; the phone's
//  position goes only in the body of `POST /api/reinvented/eyes-on/near`, never in an address, and is kept nowhere.
//  The section shows only when something is open nearby. Words as the web's.
//

import Observation
import SwiftUI

struct EyesOnAskDTO: Decodable, Identifiable, Hashable {
    let id: String
    let question: String
    let place: String?
    let author: MomentAuthorDTO?
    let until: String
    let answers: Int

    private enum CodingKeys: String, CodingKey {
        case id, question, place, author, until, answers
    }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        question = (try? c.decodeIfPresent(String.self, forKey: .question)) ?? ""
        place = try? c.decodeIfPresent(String.self, forKey: .place)
        author = try? c.decodeIfPresent(MomentAuthorDTO.self, forKey: .author)
        until = (try? c.decodeIfPresent(String.self, forKey: .until)) ?? ""
        answers = (try? c.decodeIfPresent(Int.self, forKey: .answers)) ?? 0
    }
}

private struct EyesOnNearAnswer: Decodable {
    let asks: [EyesOnAskDTO]
}

private struct EyesOnNearBody: Encodable {
    let latitude: Double
    let longitude: Double
}

enum EyesOnEndpoints {
    /// `POST /api/reinvented/eyes-on/near` `{ latitude, longitude }` (the reader's place in the body only). Route
    /// `backend/routes/reinvented.js` (eyes-on/near).
    static func near(latitude: Double, longitude: Double) -> Endpoint {
        Endpoint(method: .post, path: "/api/reinvented/eyes-on/near", body: EyesOnNearBody(latitude: latitude, longitude: longitude))
    }
}

@Observable
@MainActor
final class EyesOnNearModel {
    private(set) var asks: [EyesOnAskDTO] = []

    /// Others' open questions within reach of where the phone is now; one's own Ask isn't one to answer.
    func read(viewer: String?) async {
        guard let here = await DeviceLocationProvider.shared.requestCurrent(timeoutSeconds: 6) else {
            asks = []
            return
        }
        do {
            let answer: EyesOnNearAnswer = try await MomentsAPI.send(EyesOnEndpoints.near(
                latitude: here.latitude,
                longitude: here.longitude
            ))
            asks = answer.asks.filter { ask in
                ask.author?.id != viewer && (MomentTime.parse(ask.until) ?? .distantPast) > Date()
            }
        } catch {
            asks = []
            await PulseReinventedFlags.shared.recheck()
        }
    }
}

/// On the Ask chip, over the list: the open Eyes-on Asks near the reader, each with "Answer with a Live photo".
struct EyesOnNearSection: View {
    let viewer: String?
    @State private var model = EyesOnNearModel()

    var body: some View {
        // Always drawn (a clear line when nothing is open), so its read runs when the Ask chip is picked.
        VStack(alignment: .leading, spacing: Spacing.s2) {
            if !model.asks.isEmpty {
                Label { Text("Eyes on near you") } icon: { Icon(.eye, size: 15, strokeWidth: 2.2, color: Theme.Color.primaryTint) }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityAddTraits(.isHeader)
                ForEach(model.asks) { ask in row(ask) }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 1, alignment: .leading)
        .padding(.horizontal, model.asks.isEmpty ? 0 : Spacing.s4)
        .task { await model.read(viewer: viewer) }
        .accessibilityIdentifier("reinventedPulse.eyesOn")
    }

    private func row(_ ask: EyesOnAskDTO) -> some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            if let author = ask.author { MomentAvatar(author: author, size: 32) }
            VStack(alignment: .leading, spacing: 4) {
                Text(ask.question)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                Text(meta(ask))
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                Button { answer(ask) } label: {
                    Label { Text("Answer with a Live photo") } icon: { answerIcon }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.primaryTint)
                        .frame(minHeight: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("reinventedPulse.eyesOn.answer")
            }
            Spacer(minLength: 0)
        }
        .padding(Spacing.s3)
        .background(RoundedRectangle(cornerRadius: Radii.lg).fill(Theme.Color.appSurface))
        .overlay(RoundedRectangle(cornerRadius: Radii.lg).stroke(Theme.Color.appBorder, lineWidth: 1))
    }

    private var answerIcon: some View {
        Icon(.camera, size: 15, strokeWidth: 2.2, color: Theme.Color.primaryTint)
    }

    /// "Crown Park · Dana Ruiz · open until 4:30 PM · 2 Live answers".
    private func meta(_ ask: EyesOnAskDTO) -> String {
        let until = MomentTime.parse(ask.until)?.formatted(date: .omitted, time: .shortened) ?? ""
        var parts = [ask.place, ask.author?.name, "open until \(until)"].compactMap { $0 }
        if ask.answers > 0 { parts.append("\(ask.answers) \(ask.answers == 1 ? "Live answer" : "Live answers")") }
        return parts.joined(separator: " · ")
    }

    /// The Studio opens to answer it (`eyes_on_for`), as the web's Studio does.
    private func answer(_ ask: EyesOnAskDTO) {
        TogetherStudio.shared.reset()
        TogetherStudio.shared.context = .eyesOnAnswer(askId: ask.id, question: String(ask.question.prefix(80)))
        ReinventedStudioPresenter.shared.composing = MomentsComposeRequest(model: MomentsComposerModel(), studio: true)
    }
}
