//
//  SupportTrainWhereSection.swift
//  Pantopus
//
//  Where help goes, for the Start wizard and Manage (A1): one of the organizer's homes, or another address
//  picked from the app's address suggestions (`AddressSuggestions`). Only the city shows to people who aren't
//  helping; the organizer shares the exact address with each helper.
//

import Observation
import SwiftUI

@Observable
@MainActor
final class SupportTrainWhereModel {
    struct HomeChoice: Identifiable, Hashable {
        let id: String
        let label: String
        /// "Vancouver, WA": all of the home that people who aren't helping see.
        var place: String?
    }

    /// The homes the organizer belongs to (the server accepts only those).
    private(set) var homes: [HomeChoice] = []
    private(set) var selectedHomeId: String?
    /// A picked address (not one of the homes).
    private(set) var picked: NormalizedAddress?
    var query = ""
    let suggestions = AddressSuggestions()

    func loadHomes() async {
        suggestions.findNear()
        guard homes.isEmpty, let response = try? await HomesStoreReads.myHomes().value else { return }
        homes = response.sharedHomes.map { home in
            let line = [home.home.address, home.home.city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
            return HomeChoice(
                id: home.id,
                label: line.isEmpty ? (home.home.name ?? "My home") : line,
                place: Self.place(city: home.home.city, state: home.home.state)
            )
        }
    }

    func selectHome(_ id: String) {
        selectedHomeId = id
        picked = nil
        query = ""
        suggestions.dismiss()
    }

    func queryChanged(_ text: String) {
        query = text
        if let picked, text != picked.address { self.picked = nil }
        selectedHomeId = nil
        suggestions.textChanged(text)
    }

    func choose(_ suggestion: GeoSuggestion) async {
        guard let address = await suggestions.choose(suggestion), address.latitude != nil, address.longitude != nil else { return }
        picked = address
        selectedHomeId = nil
        query = address.address ?? query
    }

    /// The choice as the API takes it; nil until a home or a resolved address is picked.
    var body: SupportTrainDeliveryLocationBody? {
        if let selectedHomeId { return .home(selectedHomeId) }
        guard let picked, let lat = picked.latitude, let lng = picked.longitude,
              let line = picked.address, line.count >= 3 else { return nil }
        return SupportTrainDeliveryLocationBody(
            mode: "address",
            homeId: nil,
            latitude: lat,
            longitude: lng,
            address: line,
            city: picked.city,
            state: picked.state,
            zip: picked.zipcode,
            placeId: picked.placeId
        )
    }

    /// One line naming the choice ("123 Main St, Vancouver").
    var summary: String? {
        if let selectedHomeId { return homes.first { $0.id == selectedHomeId }?.label }
        guard let picked else { return nil }
        return [picked.address, picked.city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    /// The city of the choice ("Vancouver, WA"), as the train's page shows it to people who aren't helping; nil until
    /// one is picked. The Start wizard's iPad preview reads it.
    var place: String? {
        if let selectedHomeId { return homes.first { $0.id == selectedHomeId }?.place }
        guard let picked else { return nil }
        return Self.place(city: picked.city, state: picked.state)
    }

    /// "City, ST", either alone, or nil.
    private static func place(city: String?, state: String?) -> String? {
        let parts = [city, state].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }
}

/// The section itself: a row per home, then an address field with suggestions.
struct SupportTrainWhereSection: View {
    let model: SupportTrainWhereModel
    let identifier: String

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            ForEach(model.homes) { home in
                Button { model.selectHome(home.id) } label: {
                    HStack(spacing: Spacing.s3) {
                        Icon(
                            .home,
                            size: 16,
                            color: model.selectedHomeId == home.id ? Theme.Color.primaryInk : Theme.Color.appTextSecondary
                        )
                        Text(home.label)
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundStyle(Theme.Color.appText)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: Spacing.s2)
                        if model.selectedHomeId == home.id {
                            Icon(.check, size: 16, color: Theme.Color.primaryInk)
                        }
                    }
                    .padding(Spacing.s3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(model.selectedHomeId == home.id ? Theme.Color.primary50 : Theme.Color.appSurface)
                    .overlay(
                        RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                            .stroke(model.selectedHomeId == home.id ? Theme.Color.primary600 : Theme.Color.appBorder, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("\(identifier).home.\(home.id)")
            }
            TextField(
                model.homes.isEmpty ? "Delivery address" : "Or another address",
                text: Binding(get: { model.query }, set: { model.queryChanged($0) })
            )
            .textContentType(.fullStreetAddress)
            .font(.system(size: 14))
            .padding(Spacing.s3)
            .typesInFieldOnTap()
            .background(Theme.Color.appSurfaceSunken)
            .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
            .accessibilityLabel("Delivery address")
            .accessibilityIdentifier("\(identifier).field")
            AddressSuggestionList(suggestions: model.suggestions, identifier: "\(identifier).suggestion") { suggestion in
                Task { await model.choose(suggestion) }
            }
            if model.picked != nil, let summary = model.summary {
                HStack(spacing: Spacing.s2) {
                    Icon(.checkCircle, size: 14, color: Theme.Color.success)
                    Text(summary)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.Color.success)
                }
            }
            Text("Only the city shows to people who aren't helping. You share the exact address with each helper.")
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .task { await model.loadHomes() }
    }
}
