//
//  ReinventedReachDial.swift
//  Pantopus
//
//  "Pulse, reinvented" phase 1, the reach dial (PHASE-1 §2 piece 9; board B15), opened from the scope pill: Close
//  circle, Around me (1 to 25 miles) and Explore, each with one line saying what it shows and how it is ordered, and
//  "No hidden ranking" with the page anyone can read that says Explore's rules (the web's `/about/explore`).
//

import SwiftUI

struct ReinventedReachDial: View {
    let reach: String
    let miles: Int
    let onPick: (String, Int) -> Void
    @State private var pickedMiles: Double
    @Environment(\.openURL) private var openURL

    init(reach: String, miles: Int, onPick: @escaping (String, Int) -> Void) {
        self.reach = reach
        self.miles = miles
        self.onPick = onPick
        _pickedMiles = State(initialValue: Double(miles))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Text("What Pulse shows")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
            option("close", title: "Close circle", icon: .users, line: "The people you're connected with. Newest first.")
            VStack(alignment: .leading, spacing: Spacing.s2) {
                option(
                    "around",
                    title: "Around me",
                    icon: .mapPin,
                    line: "Within \(Int(pickedMiles)) \(Int(pickedMiles) == 1 ? "mile" : "miles") of you. Nearest first."
                )
                Slider(value: $pickedMiles, in: 1...25, step: 1) { editing in
                    if !editing { onPick("around", Int(pickedMiles)) }
                }
                .tint(Theme.Color.primarySolid)
                .padding(.horizontal, Spacing.s2)
                .accessibilityLabel("Miles around you")
                .accessibilityValue("\(Int(pickedMiles)) miles")
                .accessibilityIdentifier("reinventedPulse.dial.miles")
            }
            option(
                "explore",
                title: "Explore",
                icon: .globe,
                line: "Anywhere else, only what its author chose to show. Ten picked by people today, then the newest."
            )
            HStack(spacing: Spacing.s2) {
                Text("No hidden ranking.")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                Button("See the rules") {
                    if let url = Self.rulesURL { openURL(url) }
                }
                .font(.system(size: 14, weight: .semibold))
                .accessibilityIdentifier("reinventedPulse.dial.rules")
            }
            .padding(.top, Spacing.s2)
            Spacer(minLength: 0)
        }
        .padding(Spacing.s5)
        .accessibilityIdentifier("reinventedPulse.dial")
    }

    private func option(_ key: String, title: String, icon: PantopusIcon, line: String) -> some View {
        let on = reach == key
        return Button { onPick(key, Int(pickedMiles)) } label: {
            HStack(alignment: .top, spacing: Spacing.s3) {
                Icon(icon, size: 20, strokeWidth: 2.2, color: on ? .white : Theme.Color.primaryTint)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(on ? Theme.Color.primarySolid : Theme.Color.appSurfaceRaised))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Theme.Color.appText)
                    Text(line)
                        .font(.system(size: 13.5))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                if on { Icon(.check, size: 18, strokeWidth: 2.4, color: Theme.Color.primaryTint) }
            }
            .padding(Spacing.s3)
            .background(RoundedRectangle(cornerRadius: Radii.lg).fill(on ? Theme.Color.primary50 : Theme.Color.appSurface))
            .overlay(RoundedRectangle(cornerRadius: Radii.lg).stroke(Theme.Color.appBorder, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("reinventedPulse.dial.\(key)")
    }

    /// The rules page on this build's website (`PantopusPublicWebURL`), else production.
    static var rulesURL: URL? {
        let configured = (Bundle.main.object(forInfoDictionaryKey: "PantopusPublicWebURL") as? String).flatMap(URL.init(string:))
        let origin = configured.flatMap { ["http", "https"].contains($0.scheme ?? "") && $0.host != nil ? $0 : nil }
            ?? URL(string: "https://pantopus.com")
        return origin?.appendingPathComponent("about/explore")
    }
}
