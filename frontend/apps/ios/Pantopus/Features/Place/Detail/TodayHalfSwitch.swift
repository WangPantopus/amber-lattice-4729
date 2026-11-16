//
//  TodayHalfSwitch.swift
//  Pantopus
//
//  Today's two halves and the big two-part switch between them (founder
//  decision 2026-11-14): "At home" is Today as it was, "Around you" lists
//  local headlines for the same place (`TodayAroundYou.swift`). The switch is
//  drawn as Pulse's List | Map.
//

import SwiftUI

/// Which half of Today shows.
enum TodayHalf: String, CaseIterable {
    case home
    case around

    var label: String {
        switch self {
        case .home: "At home"
        case .around: "Around you"
        }
    }

    var icon: PantopusIcon {
        switch self {
        case .home: .home
        case .around: .megaphone
        }
    }
}

/// The big two-part switch under Today's title, drawn as Pulse's List | Map.
struct TodayHalfSwitch: View {
    @Binding var half: TodayHalf

    var body: some View {
        HStack(spacing: 2) {
            ForEach(TodayHalf.allCases, id: \.rawValue) { option in
                let active = half == option
                Button {
                    withAnimation(.easeOut(duration: 0.15)) { half = option }
                } label: {
                    HStack(spacing: 6) {
                        Icon(
                            option.icon,
                            size: 17,
                            strokeWidth: 2.2,
                            color: active ? Theme.Color.appTextInverse : Theme.Color.appTextSecondary
                        )
                        Text(option.label)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(active ? Theme.Color.appTextInverse : Theme.Color.appTextSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 38)
                    .background(active ? Theme.Color.primarySolid : Color.clear)
                    .clipShape(Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("todayHalfSegment_\(option.rawValue)")
                .accessibilityLabel(option.label)
                .accessibilityAddTraits(active ? [.isSelected] : [])
            }
        }
        .padding(3)
        .background(Theme.Color.appSurfaceSunken)
        .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: 1))
        .clipShape(Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("todayHalfToggle")
    }
}
