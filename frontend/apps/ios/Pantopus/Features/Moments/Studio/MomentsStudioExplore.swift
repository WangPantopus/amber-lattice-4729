//
//  MomentsStudioExplore.swift
//  Pantopus
//
//  "Also show in Explore" in the Studio's drawer ("Pulse, reinvented" phase 1, PHASE-1 §4; CONTRACT 6f): off by
//  default, per Moment, with one line under it. Not offered at home, under a made-up name, for a Moment with no place,
//  or for one that goes only to friends: those stay tied to the place and who lives there.
//

import SwiftUI

extension MomentsComposerModel {
    /// "Also show in Explore" may be chosen: people nearby, with a place, away from home, under the person's own name.
    var offersExplore: Bool {
        // As a Pulse post ("+ Ask / Kind"), only a Spot, Learning or Event (CONTRACT 6d).
        !postsUnderMadeUpName && !noLocationOn && pin != nil && audience == .nearby && place?.atHome != true
            && studioPostKind?.mayGoToExplore != false
    }

    /// The Studio's "Also show in Explore", held with its other tools; only the Studio sets it.
    var studioExplore: Bool {
        get { marking.studio?.explore ?? false }
        set {
            if marking.studio == nil { marking.studio = MomentsStudioTools() }
            marking.studio?.explore = newValue
        }
    }
}

struct MomentsStudioExploreRow: View {
    let model: MomentsComposerModel

    var body: some View {
        Toggle(isOn: Binding(get: { model.studioExplore }, set: { model.studioExplore = $0 })) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Also show in Explore")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Color.appText)
                Text("People anywhere can see this, with its place.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(Theme.Color.primarySolid)
        .padding(.horizontal, Spacing.s1)
        .frame(minHeight: 52)
        .accessibilityIdentifier("moments.studio.explore")
    }
}
