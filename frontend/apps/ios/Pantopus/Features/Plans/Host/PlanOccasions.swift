//
//  PlanOccasions.swift
//  Pantopus
//
//  Plans for the holidays, board 2 (Type): "Coming up" above the kinds, one
//  tile for each occasion the server says is in season, in its order. Tapping
//  one opens the host form with the occasion's things filled in (a headcount
//  with kids, a bring list, the time) and its name as the screen's title;
//  everything stays editable. No occasions, or the call failed: no section.
//

import SwiftUI

struct PlanComingUpSection: View {
    let occasions: [PlanOccasionDTO]
    let onPick: (PlanOccasionDTO) -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text.planOverline("Coming up")
            LazyVGrid(columns: columns, spacing: Spacing.s2) {
                ForEach(occasions) { tile($0) }
            }
            Text("Each one starts a plan with the usual things filled in: a headcount with kids, a bring list, the right words.")
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planComingUp")
    }

    /// Three across; one at the largest text sizes.
    private var columns: [GridItem] {
        let count = typeSize.isAccessibilitySize ? 1 : 3
        return Array(repeating: GridItem(.flexible(), spacing: Spacing.s2), count: count)
    }

    private func tile(_ occasion: PlanOccasionDTO) -> some View {
        Button { onPick(occasion) } label: {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(occasion.kind.color)
                    .frame(width: 30, height: 30)
                    .overlay(Icon(PlanOccasionStyle.glyph(occasion), size: 17, strokeWidth: 2, color: Theme.Color.appTextInverse))
                    .accessibilityHidden(true)
                Text(occasion.text)
                    .planFont(.smallStrong)
                    .foregroundStyle(Theme.Color.appText)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(Spacing.s3)
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.Color.appSurfaceSunken))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(occasion.text)
        .accessibilityHint("Starts a plan with the usual things filled in")
        .accessibilityIdentifier("planOccasion.\(occasion.key)")
    }
}

/// Each occasion's glyph (06-screens A2): Thanksgiving the Food & drinks one, Friendsgiving two people, Holiday
/// party a tree, Gift exchange a gift, New Year's Eve a four-point star, Birthday a cake; any other its kind's.
enum PlanOccasionStyle {
    static func glyph(_ occasion: PlanOccasionDTO) -> PantopusIcon {
        switch occasion.key {
        case "friendsgiving": .users
        case "holiday_party": .trees
        case "gift_exchange": .gift
        case "new_years_eve": .sparkle
        case "birthday": .cake
        default: occasion.kind.icon
        }
    }
}

extension PlanComposerModel {
    /// The form filled in from an occasion (board 2): its kind, title, who it's for, the place, kids welcome, a
    /// starter bring list and the time, each only where this host may use it. Everything stays editable.
    func start(from occasion: PlanOccasionDTO) {
        choose(occasion.kind)
        privacy.occasion = occasion
        if let details = occasion.details { more.restore(from: details) }
        guard let fills = occasion.fills else { return }
        // The occasion's title is the automatic one: another kind chosen afterwards drops it while unchanged.
        if let title = fills.title, !title.isEmpty {
            self.title = title
            autoTitle = title
        }
        if fills.audience == .invited, offersPrivate { privacy.audience = .invited }
        if fills.placeKind == "home", canHostAtHome { setWhere(.home) }
        // Each occasion sets its own extras: going back and picking another doesn't keep the last one's.
        privacy.kidsWelcome = fills.kidsWelcome && offersGuestAnswers
        // The occasion's room (server #4227), within what this form allows once who it's for is set.
        if let room = fills.spots, room > 0 { spots = min(room, spotsLimit) }
        if let bring = fills.bring, offersBringList, !bring.labels.isEmpty {
            privacy.bring = PlanBringEditor(labels: bring.labels, guestsCanAdd: bring.guestsCanAdd)
        } else {
            privacy.bring = nil
        }
        if let starts = PlanTime.parse(fills.startsAt), starts > Date() {
            start = starts
            startsNow = false
            end = PlanTime.parse(fills.endsAt).flatMap { $0 > starts ? $0 : nil } ?? starts.addingTimeInterval(3 * 3600)
        }
    }
}
