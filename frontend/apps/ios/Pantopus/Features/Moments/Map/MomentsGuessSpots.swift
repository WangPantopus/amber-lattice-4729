//
//  MomentsGuessSpots.swift
//  Pantopus
//
//  Guess the spot on the Moments map ("Pulse, reinvented" phase 0 step 8; CONTRACT 5d), only while the switch is on
//  for the person. The map's read brings `guess_spots`: the live guess-the-spot Moments they may see whose 0.1° cell
//  overlaps the area, with no point. They are shown as a list for the area in view, never as marks on the map, and
//  say no more than the town. Today's spot (`GET /api/moments/daily-spot`) comes first. A row opens the Moment in the
//  viewer, where the guess is made (`MomentsGuessSpot.swift`).
//

import Observation
import SwiftUI

/// The spots from the latest map read, and today's spot for the area.
@Observable
@MainActor
final class MomentsGuessSpots {
    static let shared = MomentsGuessSpots()

    var spots: [MomentGuessSpotDTO] = []
    private(set) var daily: MomentDailySpotDTO?

    /// Today's spot first, then the rest as the server listed them (newest first).
    var ordered: [MomentGuessSpotDTO] {
        let dailyId = daily?.momentId
        return spots.filter { $0.daily || $0.momentId == dailyId } + spots.filter { !$0.daily && $0.momentId != dailyId }
    }

    /// Something to offer: a spot in the area, or today's spot.
    var any: Bool {
        !spots.isEmpty || daily != nil
    }

    /// Reads today's spot for where the map is. An older server or a refusal leaves it out.
    func readDaily(latitude: Double, longitude: Double) async {
        guard PulseReinventedFlags.shared.isOn else {
            daily = nil
            return
        }
        do {
            let endpoint = StudioEndpoints.dailySpot(latitude: latitude, longitude: longitude)
            let reply: MomentDailySpotResponse = try await MomentsAPI.send(endpoint)
            daily = reply.dailySpot
        } catch {
            daily = nil
        }
    }
}

/// Under the map's top row while the switch is on and there is a spot to guess: "Guess the spot · 3". It opens the list.
struct MomentsGuessSpotsChip: View {
    let viewModel: MomentsMapViewModel
    @State private var showsList = false
    private let store = MomentsGuessSpots.shared

    var body: some View {
        Group {
            if PulseReinventedFlags.shared.isOn, store.any {
                Button { showsList = true } label: {
                    HStack(spacing: 6) {
                        Icon(.mapPin, size: 15, strokeWidth: 2.4, color: Theme.Color.primaryTint)
                        Text(title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.Color.appText)
                    }
                    .padding(.horizontal, Spacing.s3)
                    .frame(height: 36)
                    .momentsGlass(Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("moments.guessSpots")
                .sheet(isPresented: $showsList) {
                    MomentsGuessSpotsList(spots: store.ordered, daily: store.daily) { id in
                        showsList = false
                        MomentsNavigator.shared.pending = id
                    }
                    .presentationDetents([.medium, .large])
                }
            }
        }
        .task(id: centerKey) {
            guard let center = viewModel.center else { return }
            await store.readDaily(latitude: center.latitude, longitude: center.longitude)
        }
    }

    private var title: String {
        let count = store.ordered.count
        return count > 1 ? "Guess the spot · \(count)" : "Guess the spot"
    }

    /// The area moved by more than about a kilometre: today's spot is read again.
    private var centerKey: String {
        guard let center = viewModel.center else { return "" }
        return String(format: "%.2f,%.2f,%d", center.latitude, center.longitude, PulseReinventedFlags.shared.isOn ? 1 : 0)
    }
}

/// The spots for the area in view: a small picture, who made it, and whether you guessed. Never where they are.
struct MomentsGuessSpotsList: View {
    let spots: [MomentGuessSpotDTO]
    let daily: MomentDailySpotDTO?
    let onOpen: (String) -> Void

    var body: some View {
        NavigationStack {
            List {
                if let daily, !spots.contains(where: { $0.momentId == daily.momentId }) {
                    Button { onOpen(daily.momentId) } label: {
                        row(title: "Today's spot", subtitle: dailySubtitle(daily), thumb: nil, isDaily: true)
                    }
                    .accessibilityIdentifier("moments.guessSpots.daily")
                }
                ForEach(spots) { spot in
                    Button { onOpen(spot.momentId) } label: {
                        row(
                            title: spot.daily || spot.momentId == daily?.momentId ? "Today's spot" : spot.author?.shortName ?? "Someone",
                            subtitle: spot.guessed ? "You guessed" : "Not guessed yet",
                            thumb: spot.thumb,
                            isDaily: spot.daily || spot.momentId == daily?.momentId
                        )
                    }
                    .accessibilityIdentifier("moments.guessSpots.row.\(spot.momentId)")
                }
            }
            .listStyle(.plain)
            .navigationTitle("Guess the spot")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .top) {
                Text("Others' photos from around here, without their place. Open one and drop a pin.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Spacing.s4)
                    .padding(.vertical, Spacing.s2)
            }
        }
    }

    private func dailySubtitle(_ daily: MomentDailySpotDTO) -> String {
        let town = daily.town.map { " · \($0)" } ?? ""
        return (daily.guessed ? "You guessed" : "Not guessed yet") + town
    }

    private func row(title: String, subtitle: String, thumb: URL?, isDaily: Bool) -> some View {
        HStack(spacing: Spacing.s3) {
            ZStack {
                RoundedRectangle(cornerRadius: Radii.md).fill(Theme.Color.appSurfaceRaised)
                if let thumb {
                    AsyncImage(url: thumb) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color.clear
                    }
                } else {
                    Icon(.mapPin, size: 20, strokeWidth: 2.2, color: Theme.Color.primaryTint)
                }
            }
            .frame(width: 52, height: 52)
            .clipShape(RoundedRectangle(cornerRadius: Radii.md))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 16, weight: isDaily ? .bold : .semibold))
                    .foregroundStyle(Theme.Color.appText)
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
            Spacer(minLength: 0)
            Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}
