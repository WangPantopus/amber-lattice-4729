//
//  MomentSignals.swift
//  Pantopus
//
//  The five signals ("Pulse, reinvented", founder 2026-11-26; CONTRACT section 4): Learned, Want to go, Smile, Same,
//  Helpful. They take the seven emoji's place on the new screens while `pulse_reinvented` is on for the person; one
//  per person, stored where the emoji are, so choosing a signal replaces an emoji and the other way round. Older apps
//  and today's screens keep reading emoji (the server shows a signal there as its nearest emoji).
//

import Observation
import SwiftUI
import UIKit

enum MomentSignal: String, CaseIterable, Identifiable, Codable {
    case learned
    case wantToGo = "want_to_go"
    case smile
    case same
    case helpful

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .learned: "Learned"
        case .wantToGo: "Want to go"
        case .smile: "Smile"
        case .same: "Same"
        case .helpful: "Helpful"
        }
    }

    var icon: PantopusIcon {
        switch self {
        case .learned: .lightbulb
        case .wantToGo: .mapPin
        case .smile: .smile
        case .same: .repeat2
        case .helpful: .checkCircle
        }
    }
}

/// `{ "signal": "learned" }` or `{ "signal": null }` (CONTRACT 4).
struct MomentSignalBody: Encodable {
    let signal: String?

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(signal, forKey: .signal)
    }

    private enum CodingKeys: String, CodingKey { case signal }
}

/// The answer: the nearest emoji for older screens, and the signal.
struct MomentSignalResponse: Decodable {
    let myReaction: String?
    let mySignal: String?

    private enum CodingKeys: String, CodingKey {
        case myReaction = "my_reaction"
        case mySignal = "my_signal"
    }
}

extension MomentsViewer {
    /// The five signals take the emoji's place while `pulse_reinvented` is on for the person watching.
    var signalsOn: Bool {
        PulseReinventedFlags.shared.isOn
    }
}

/// The viewer's quick reactions while the switch is on: the five signals, each its icon over its word (board B3).
struct MomentsQuickSignals: View {
    let chosen: String?
    let onPick: (MomentSignal) -> Void

    var body: some View {
        VStack(spacing: 10) {
            Text("Quick reactions")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.75))
            HStack(spacing: 0) {
                ForEach(MomentSignal.allCases) { signal in
                    let isChosen = chosen == signal.rawValue
                    Button { onPick(signal) } label: {
                        VStack(spacing: 4) {
                            Icon(signal.icon, size: 24, strokeWidth: 2, color: .white)
                            Text(signal.title)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity, minHeight: 60)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(Color.white.opacity(isChosen ? 0.22 : 0))
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel(signal.title)
                    .accessibilityAddTraits(isChosen ? [.isButton, .isSelected] : .isButton)
                    .accessibilityIdentifier("moments.viewer.signal.\(signal.rawValue)")
                }
            }
            .padding(.horizontal, Spacing.s4)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Quick reactions")
            .accessibilityIdentifier("moments.viewer.signals")
        }
    }
}

/// The signals given in this run of the app, by Moment, over what each Moment answered (`my_signal`), so a signal shows
/// at once and stays when the viewer comes back to that Moment.
@Observable
@MainActor
final class MomentSignalStore {
    static let shared = MomentSignalStore()

    /// The signal given to a Moment in this run; "" when it was taken back.
    private(set) var given: [String: String] = [:]

    func set(_ signal: String?, for momentId: String) {
        given[momentId] = signal ?? ""
    }

    func forget(_ momentId: String) {
        given[momentId] = nil
    }
}

extension MomentsViewerModel {
    /// The signal you gave the Moment showing: one given in this run, else what the Moment says.
    var mySignal: String? {
        guard let moment else { return nil }
        if let given = MomentSignalStore.shared.given[moment.id] { return given.isEmpty ? nil : given }
        return moment.mySignal
    }

    /// One of the five signals, in a quick reaction's place; the one already given takes it back. It replaces any emoji
    /// you gave (CONTRACT 4).
    func signal(_ signal: MomentSignal) async {
        guard let moment else { return }
        let store = MomentSignalStore.shared
        let before = store.given[moment.id]
        let choice: String? = mySignal == signal.rawValue ? nil : signal.rawValue
        store.set(choice, for: moment.id)
        if choice != nil { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        do {
            let reply: MomentSignalResponse = try await MomentsAPI.send(StudioEndpoints.signal(momentId: moment.id, signal: choice))
            store.set(reply.mySignal, for: moment.id)
        } catch {
            if let before { store.set(before.isEmpty ? nil : before, for: moment.id) } else { store.forget(moment.id) }
            show(Toast(text: (error as? MomentsFailure)?.message ?? "Couldn't send that. Try again."))
            // A signal is the new screens' own: refused, the switch may be off now (CONTRACT 1); off, the emoji come back.
            await PulseReinventedFlags.shared.recheck()
        }
    }
}
