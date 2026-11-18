//
//  AddressSuggestions.swift
//  Pantopus
//
//  Address suggestions under a street field. Typing asks
//  `GET /api/geo/autocomplete` (debounced); picking one resolves it with
//  `POST /api/geo/resolve` so the form can fill its street, city, state
//  and ZIP. The field itself stays the screen's own, so every form keeps
//  its look; this adds the list under it. A failed lookup just shows no
//  list: the field still takes a typed address.
//  Parity: Android `AddressSuggestions` (ui/components/AddressSuggestions.kt).
//

import SwiftUI

@Observable
@MainActor
final class AddressSuggestions {
    private(set) var suggestions: [GeoSuggestion] = []
    private(set) var isResolving = false
    /// Favor suggestions near this point, e.g. the person's own home when
    /// they type a neighbor's address.
    var near: (latitude: Double, longitude: Double)?

    private let streetOnly: Bool
    private let api: APIClient
    private var searchTask: Task<Void, Never>?
    /// The address a pick wrote into the field: an answer, not a new question.
    private var pickedText: String?

    init(streetOnly: Bool = true, api: APIClient = .shared) {
        self.streetOnly = streetOnly
        self.api = api
    }

    /// Call on every change of the street field's text.
    func textChanged(_ text: String) {
        searchTask?.cancel()
        let query = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 4, text != pickedText else {
            suggestions = []
            return
        }
        pickedText = nil
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled, let self else { return }
            await fetch(query)
        }
    }

    private func fetch(_ query: String) async {
        let response: GeoAutocompleteResponse? = try? await api.request(
            GeoEndpoints.autocomplete(query: query, near: near, streetOnly: streetOnly)
        )
        guard !Task.isCancelled else { return }
        suggestions = response?.suggestions ?? []
    }

    /// Resolves a picked suggestion into its parts; nil when it can't be
    /// resolved, and the typed text stays as it was.
    func choose(_ suggestion: GeoSuggestion) async -> NormalizedAddress? {
        guard suggestions.contains(suggestion), !isResolving else { return nil }
        searchTask?.cancel()
        isResolving = true
        defer { isResolving = false }
        guard let result: GeoResolveResponse = try? await api.request(
            GeoEndpoints.resolve(suggestionId: suggestion.suggestionId)
        ) else { return nil }
        suggestions = []
        pickedText = result.normalized.address
        return result.normalized
    }

    func dismiss() {
        searchTask?.cancel()
        suggestions = []
    }

    /// Takes a suggestion as it reads, for a free-text location field that keeps the whole line (no resolve).
    func accept(_ suggestion: GeoSuggestion) {
        searchTask?.cancel()
        pickedText = suggestion.label
        suggestions = []
    }

    /// Your default Home's map point (else any of your homes'), for `near` on a screen that has no address of its
    /// own yet; nil when none is known.
    static func anyHomePoint() async -> (latitude: Double, longitude: Double)? {
        guard let response = try? await HomesStoreReads.myHomes().value else { return nil }
        return point(in: response, homeId: nil)
    }

    /// One of your homes' map point, for `near`; nil when it isn't known.
    static func homePoint(homeId: String) async -> (latitude: Double, longitude: Double)? {
        guard let response = try? await HomesStoreReads.myHomes().value else { return nil }
        return point(in: response, homeId: homeId)
    }

    /// That home's point in a list of your homes; with no `homeId`, your default Home's, else any home's.
    fileprivate static func point(in response: MyHomesResponse, homeId: String?) -> (latitude: Double, longitude: Double)? {
        let homes = response.homes
        if let homeId {
            guard let point = homes.first(where: { $0.home.id == homeId })?.location else { return nil }
            return (point.latitude, point.longitude)
        }
        let preferred = response.defaultHomeId.flatMap { id in homes.first { $0.home.id == id } }
        guard let point = preferred?.location ?? homes.compactMap(\.location).first else { return nil }
        return (point.latitude, point.longitude)
    }
}

/// A search area for a screen that runs its own address search (the task composers). A search never waits for
/// it: `find` answers from the list of your homes the app already holds, and otherwise asks for that list beside
/// the search, so `point` is nil until it is known and the search goes out without an area.
@MainActor
final class HomeSearchArea {
    private(set) var point: (latitude: Double, longitude: Double)?
    private var task: Task<Void, Never>?

    nonisolated init() {}

    /// `homeId` nil: your default Home (else any of your homes).
    func find(homeId: String? = nil) {
        guard point == nil, task == nil else { return }
        if let held = HomesStoreReads.peekMyHomes()?.value, let known = AddressSuggestions.point(in: held, homeId: homeId) {
            point = known
            return
        }
        task = Task { [weak self] in
            let found: (latitude: Double, longitude: Double)? = if let homeId {
                await AddressSuggestions.homePoint(homeId: homeId)
            } else {
                await AddressSuggestions.anyHomePoint()
            }
            self?.point = found
            self?.task = nil
        }
    }
}

/// The suggestions under a street field; tapping one hands it to `onChoose`.
struct AddressSuggestionList: View {
    let suggestions: AddressSuggestions
    /// Prefix for each row's accessibility identifier (`<prefix>.<index>`).
    let identifier: String
    let onChoose: (GeoSuggestion) -> Void

    var body: some View {
        if !suggestions.suggestions.isEmpty {
            VStack(spacing: Spacing.s0) {
                ForEach(Array(suggestions.suggestions.enumerated()), id: \.element.id) { index, suggestion in
                    if index > 0 {
                        Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1)
                    }
                    Button { onChoose(suggestion) } label: { row(suggestion) }
                        .buttonStyle(.plain)
                        .disabled(suggestions.isResolving)
                        .accessibilityLabel(
                            [suggestion.primaryText, suggestion.secondaryText].compactMap { $0 }.joined(separator: ", ")
                        )
                        .accessibilityIdentifier("\(identifier).\(index)")
                }
            }
            .background(Theme.Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                    .stroke(Theme.Color.appBorder, lineWidth: 1)
            )
        }
    }

    private func row(_ suggestion: GeoSuggestion) -> some View {
        HStack(spacing: Spacing.s3) {
            Icon(.mapPin, size: 15, color: Theme.Color.appTextSecondary)
                .frame(width: 32, height: 32)
                .background(Theme.Color.appSurfaceSunken)
                .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(suggestion.primaryText)
                    .pantopusTextStyle(.body)
                    .foregroundStyle(Theme.Color.appTextStrong)
                    .lineLimit(1)
                if let secondary = suggestion.secondaryText, !secondary.isEmpty {
                    Text(secondary)
                        .pantopusTextStyle(.caption)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, Spacing.s3)
        .padding(.vertical, Spacing.s2)
        .frame(minHeight: 48)
        .contentShape(Rectangle())
    }
}

/// Suggestions under a free-text location field ("Where?", a meeting address): it asks as the text changes,
/// nearby first, and a pick puts the suggestion's whole line in the field. The field stays the screen's own.
struct LocationSuggestionList: View {
    let text: String
    /// Prefix for each row's accessibility identifier (`<prefix>.<index>`).
    let identifier: String
    let onPick: (String) -> Void
    @State private var suggestions = AddressSuggestions(streetOnly: false)

    var body: some View {
        AddressSuggestionList(suggestions: suggestions, identifier: identifier) { suggestion in
            suggestions.accept(suggestion)
            onPick(suggestion.label)
        }
        .onChange(of: text) { _, value in suggestions.textChanged(value) }
        .task { if suggestions.near == nil { suggestions.near = await AddressSuggestions.anyHomePoint() } }
    }
}
