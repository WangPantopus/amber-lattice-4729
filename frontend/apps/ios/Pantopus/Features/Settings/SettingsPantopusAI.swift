//
//  SettingsPantopusAI.swift
//  Pantopus
//
//  "Pulse, reinvented" phase 2 (CONTRACT 7d; PHASE-2 section 3): the person's own Pantopus AI switch, one row in
//  Settings' Privacy group, drawn only while `pulse_reinvented` is on for them (otherwise nothing is read and Settings is
//  today's). Off: no new field cards for them, and none of their photos go to the model; the safety checks stay on.
//

import Foundation

extension SettingsIndexViewModel {
    static let pantopusAIRow = "pantopusAI"

    var pantopusAIRows: [GroupedListRow] {
        guard PulseReinventedFlags.shared.isOn, let on = pantopusAI else { return [] }
        return [
            GroupedListRow(
                id: Self.pantopusAIRow,
                label: "Pantopus AI",
                subtext: "Names things in photos with a source, and suggests. Safety checks stay on.",
                control: .toggle(isOn: on),
                accessibilityIdentifier: "settings.pantopusAI"
            )
        ] + strandsChoiceRows // 8c: "Tell people when their post led me somewhere" (ReinventedStrandsMine.swift)
    }

    /// The choice, read only while the switch is on (nil otherwise, or when it can't be read: no row).
    static func readPantopusAI() async -> Bool? {
        guard PulseReinventedFlags.shared.isOn else { return nil }
        async let strands = ReinventedStrandsChoice.shared.read() // 8c: the strands row's choice, read beside it
        return await (MomentsStudioAI.shared.read(force: true), strands).0
    }

    /// The row's switch flipped: saved, or put back when the server says no. True when the rows should be drawn again.
    func togglePantopusAI(_ rowId: String, isOn: Bool) async -> Bool {
        if await toggleStrandsChoice(rowId, isOn: isOn) { return true } // 8c: the strands row
        guard rowId == Self.pantopusAIRow else { return false }
        pantopusAI = await MomentsStudioAI.shared.set(isOn) ?? pantopusAI
        return true
    }
}
