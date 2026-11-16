//
//  MomentsTimeFilter.swift
//  Pantopus
//
//  Under the Moments map's top row, at the left: a chip that shows only the
//  Moments posted in the last 30 minutes, the last hour or the last 24 hours
//  (founder, 2026-11-16), "All" to begin with. The pins, the bubbles, the row
//  of faces and Play all follow it. It works on what the map already reads
//  (each Moment's posting time), so nothing changes on the server.
//
//  The choice lasts while the app runs, across tabs, and is "All" again after
//  a relaunch: a filter left on from days ago would hide Moments without
//  anyone remembering why.
//

import SwiftUI

/// How far back the map shows Moments from.
enum MomentsTimeFilter: CaseIterable, Hashable {
    case all, halfHour, hour, day

    /// How far back, in seconds; nil for all of them.
    var seconds: TimeInterval? {
        switch self {
        case .all: nil
        case .halfHour: 30 * 60
        case .hour: 60 * 60
        case .day: 24 * 60 * 60
        }
    }

    /// The menu's words.
    var title: String {
        switch self {
        case .all: "All"
        case .halfHour: "Last 30 minutes"
        case .hour: "Last hour"
        case .day: "Last 24 hours"
        }
    }

    /// The chip's words: short, so the chip stays small over the map.
    var chipTitle: String {
        switch self {
        case .all: "All"
        case .halfHour: "30 min"
        case .hour: "1 hour"
        case .day: "24 hours"
        }
    }

    /// The oldest posting time shown, read against the map's clock; nil for all of them.
    func since(_ now: Date) -> Date? {
        seconds.map { now.addingTimeInterval(-$0) }
    }

    /// The empty card's line while the filter hides everything in view.
    var emptyLine: String? {
        switch self {
        case .all: nil
        case .halfHour: "Nothing posted in the last 30 minutes. Choose All to see older Moments."
        case .hour: "Nothing posted in the last hour. Choose All to see older Moments."
        case .day: "Nothing posted in the last 24 hours. Choose All to see older Moments."
        }
    }
}

extension MomentRingDTO {
    /// Keeps only the Moments posted since then (all of them for nil); nil when none is left.
    func posted(since: Date?) -> MomentRingDTO? {
        guard let since else { return self }
        var ring = self
        ring.moments = moments.filter { moment in
            // A Moment whose time can't be read stays: hiding it would look like it was never posted.
            guard let posted = MomentTime.parse(moment.createdAt) else { return true }
            return posted >= since
        }
        return ring.moments.isEmpty ? nil : ring
    }
}

/// The chip: a clock, how far back, and a menu. Filled while it hides something, like "Elevation" while it's on.
struct MomentsTimeChip: View {
    let viewModel: MomentsMapViewModel

    var body: some View {
        let filter = viewModel.timeFilter
        let on = filter != .all
        Menu {
            Picker("Show Moments from", selection: Binding(get: { viewModel.timeFilter }, set: { viewModel.timeFilter = $0 })) {
                ForEach(MomentsTimeFilter.allCases, id: \.self) { choice in
                    Text(choice.title).tag(choice)
                }
            }
        } label: {
            HStack(spacing: 6) {
                Icon(.clock, size: 15, strokeWidth: 2.25, color: on ? .white : Theme.Color.appText)
                Text(filter.chipTitle)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(on ? .white : Theme.Color.appText)
                    .lineLimit(1)
                Icon(.chevronDown, size: 13, strokeWidth: 2.25, color: on ? .white : Theme.Color.appTextSecondary)
            }
            .padding(.horizontal, 14)
            .frame(height: MomentsHeightsBar.chipHeight)
            .background { surface(on: on) }
            .frame(minHeight: 44)
            .contentShape(Capsule())
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .accessibilityLabel("Show Moments from")
        .accessibilityValue(on ? filter.title : "All times")
        .accessibilityIdentifier("moments.timeFilter")
    }

    @ViewBuilder
    private func surface(on: Bool) -> some View {
        if on {
            Capsule()
                .fill(Theme.Color.primarySolid)
                .shadow(color: Theme.Color.primarySolid.opacity(0.35), radius: 5, x: 0, y: 2)
        } else {
            Capsule().fill(.clear).momentsGlass(Capsule())
        }
    }
}
