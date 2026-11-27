//
//  MomentsPantopusAI.swift
//  Pantopus
//
//  The person's own Pantopus AI choice ("Pulse, reinvented" phase 2; CONTRACT 7d), read only while the switch is on
//  for them: `GET /api/reinvented/settings`. The Studio offers "a thing to name" only while it is on; Settings shows its
//  row (`SettingsPantopusAI`). Kept for the app run, per account.
//

import Observation

@Observable
@MainActor
final class MomentsStudioAI {
    static let shared = MomentsStudioAI()

    /// Nil until read (or when it couldn't be read).
    private(set) var on: Bool?
    private var account: String?

    /// The choice: the one read before, unless `force`; nil with the switch off (nothing is sent then).
    @discardableResult
    func read(force: Bool = false) async -> Bool? {
        let current = MomentsComposerModel.account
        if account != current { (on, account) = (nil, current) }
        guard PulseReinventedFlags.shared.isOn else { return nil }
        if on != nil, !force { return on }
        if let choices = try? await StudioPlayAPI.send(StudioPlayEndpoints.settings, as: ReinventedChoicesDTO.self) {
            on = choices.pantopusAI
        }
        return on
    }

    /// Saves the choice; the server's answer, or nil when it couldn't be saved.
    func set(_ wanted: Bool) async -> Bool? {
        guard let choices = try? await StudioPlayAPI.send(StudioPlayEndpoints.setPantopusAI(wanted), as: ReinventedChoicesDTO.self) else {
            return nil
        }
        on = choices.pantopusAI
        return on
    }
}
