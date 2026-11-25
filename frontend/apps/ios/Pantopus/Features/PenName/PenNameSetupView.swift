//
//  PenNameSetupView.swift
//  Pantopus
//
//  The made-up name screen (contract "What each app builds", 2): a field for the name the person wants; left empty,
//  Pantopus gives one (a suggestion with Shuffle); the picture, always drawn by Pantopus; the promise; "Use this name".
//  Settings opens it to change the name (`replace: true`; the server's sentence when it is too soon).
//

import Observation
import SwiftUI

@Observable
@MainActor
final class PenNameSetupViewModel {
    enum State: Equatable {
        case loading
        case ready
        case error(String)
    }

    private(set) var state: State = .loading
    /// Giving up the name in use for another (Settings).
    let replacing: Bool
    /// The name being typed; a new one clears the last refusal.
    var typed = "" {
        didSet { if typed != oldValue { errorMessage = nil } }
    }

    private(set) var me: PenNameMeResponse?
    private(set) var suggestions: [String] = []
    private(set) var suggestionIndex = 0
    private(set) var isSaving = false
    private(set) var isShuffling = false
    /// The server's sentence for a refused name, shown under the field as it is.
    private(set) var errorMessage: String?
    private let store: PenNameStore
    private let api: APIClient

    init(replacing: Bool, store: PenNameStore = .shared, api: APIClient = .shared) {
        self.replacing = replacing
        self.store = store
        self.api = api
    }

    /// The name Pantopus would give while the field is empty.
    var suggestion: String? {
        suggestions.indices.contains(suggestionIndex) ? suggestions[suggestionIndex] : nil
    }

    var trimmed: String {
        typed.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The name the picture and the button stand for: the typed one, else the suggestion.
    var shownName: String {
        trimmed.isEmpty ? (suggestion ?? "") : trimmed
    }

    var nameMax: Int {
        me?.nameMax ?? 24
    }

    var nameMin: Int {
        me?.nameMin ?? 3
    }

    /// The account may take a name (or, in Settings, change the one it has).
    var canTake: Bool {
        me?.allowed == true
    }

    func load() async {
        state = .loading
        guard let read = await store.load(force: true) else {
            state = .error("Couldn't load your made-up name. Try again.")
            return
        }
        me = read
        suggestions = read.suggestions
        suggestionIndex = 0
        state = .ready
        if suggestions.isEmpty, read.allowed { await fetchSuggestions() }
    }

    /// Shuffle: the next name Pantopus could give; four more are read when these run out.
    func shuffle() async {
        errorMessage = nil
        if suggestionIndex + 1 < suggestions.count {
            suggestionIndex += 1
        } else {
            await fetchSuggestions()
        }
    }

    private func fetchSuggestions() async {
        guard !isShuffling else { return }
        isShuffling = true
        defer { isShuffling = false }
        if let response = try? await api.request(PenNamesEndpoints.suggestions, as: PenNameSuggestionsResponse.self),
           !response.suggestions.isEmpty {
            suggestions = response.suggestions
            suggestionIndex = 0
        }
    }

    /// "Use this name": the typed name, else the suggestion shown (else Pantopus picks one). Returns the name taken.
    func use() async -> PenNameDTO? {
        guard !isSaving else { return nil }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let response: PenNameTakeResponse = try await api.request(
                PenNamesEndpoints.take(name: trimmed.isEmpty ? (suggestion ?? "") : trimmed, replace: replacing)
            )
            store.adopt(response.penName)
            return response.penName
        } catch {
            errorMessage = PenNameRefusal.from(error)?.message
                ?? (error as? APIError)?.errorDescription
                ?? "Couldn't keep that name. Try again."
            return nil
        }
    }
}

struct PenNameSetupView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: PenNameSetupViewModel
    @FocusState private var fieldFocused: Bool
    private let onDone: @MainActor (PenNameDTO) -> Void

    init(replacing: Bool = false, onDone: @escaping @MainActor (PenNameDTO) -> Void = { _ in }) {
        _viewModel = State(initialValue: PenNameSetupViewModel(replacing: replacing))
        self.onDone = onDone
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s5) {
                    content
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Spacing.s4)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.Color.appBg)
            .navigationTitle("Made-up name")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("penNameSetupCancel")
                }
            }
        }
        .task { await viewModel.load() }
        .accessibilityIdentifier("penNameSetup")
    }

    @ViewBuilder private var content: some View {
        switch viewModel.state {
        case .loading:
            VStack(alignment: .leading, spacing: Spacing.s3) {
                Shimmer(width: 72, height: 72, cornerRadius: 36)
                Shimmer(width: 220, height: 20, cornerRadius: Radii.sm)
                Shimmer(height: 44, cornerRadius: Radii.md)
                Shimmer(height: 96, cornerRadius: Radii.md)
            }
            .accessibilityIdentifier("penNameSetupLoading")
        case let .error(message):
            EmptyState(
                icon: .alertCircle,
                headline: "Couldn't load your made-up name",
                subcopy: message,
                cta: EmptyState.CTA(title: "Try again") { await viewModel.load() }
            )
            .accessibilityIdentifier("penNameSetupError")
        case .ready:
            if viewModel.canTake {
                form
            } else {
                EmptyState(
                    icon: .lock,
                    headline: "A made-up name isn't open to you yet",
                    subcopy: viewModel.me?.refusal?.message ?? "",
                    cta: EmptyState.CTA(title: "Close") { await MainActor.run { dismiss() } }
                )
                .accessibilityIdentifier("penNameSetupRefused")
            }
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: Spacing.s5) {
            if viewModel.replacing, let current = viewModel.me?.penName {
                HStack(spacing: Spacing.s3) {
                    PenNameAvatar(name: current.name, url: current.avatar, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Your made-up name")
                            .pantopusTextStyle(.caption)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                        Text(current.name)
                            .pantopusTextStyle(.body)
                            .fontWeight(.semibold)
                            .foregroundStyle(Theme.Color.appText)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("penNameSetupCurrent")
            }
            HStack {
                Spacer()
                PenNameAvatar(name: viewModel.shownName.isEmpty ? "?" : viewModel.shownName, url: nil, size: 72)
                Spacer()
            }
            Text(viewModel.replacing ? "What name do you want to go by now?" : "What name do you want to go by?")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            nameField
            if viewModel.trimmed.isEmpty, let suggestion = viewModel.suggestion {
                HStack(spacing: Spacing.s2) {
                    Text("Leave it empty and Pantopus gives you \(suggestion).")
                        .pantopusTextStyle(.caption)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("penNameSuggestion")
                    Spacer(minLength: Spacing.s2)
                    Button {
                        Task { await viewModel.shuffle() }
                    } label: {
                        HStack(spacing: Spacing.s1) {
                            Icon(.shuffle, size: 14, strokeWidth: 2, color: Theme.Color.primaryInk)
                            Text("Shuffle")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.Color.primaryInk)
                        }
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.isShuffling)
                    .accessibilityIdentifier("penNameShuffle")
                }
            }
            if let error = viewModel.errorMessage {
                HStack(alignment: .top, spacing: Spacing.s2) {
                    Icon(.alertCircle, size: 16, strokeWidth: 2, color: Theme.Color.error)
                    Text(error)
                        .pantopusTextStyle(.caption)
                        .foregroundStyle(Theme.Color.error)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("penNameError")
            }
            promise
            PrimaryButton(title: "Use this name", isLoading: viewModel.isSaving) {
                guard let taken = await viewModel.use() else { return }
                onDone(taken)
                dismiss()
            }
            .accessibilityIdentifier("penNameUse")
        }
    }

    private var nameField: some View {
        VStack(alignment: .leading, spacing: Spacing.s1) {
            TextField(viewModel.suggestion ?? "Type a name", text: $viewModel.typed)
                .focused($fieldFocused)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .submitLabel(.done)
                .font(.system(size: 16))
                .foregroundStyle(Theme.Color.appText)
                .padding(.horizontal, Spacing.s3)
                .frame(minHeight: 44)
                .typesInFieldOnTap($fieldFocused)
                .background(Theme.Color.appSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                        .stroke(fieldFocused ? Theme.Color.primary600 : Theme.Color.appBorder, lineWidth: 1)
                )
                .onChange(of: viewModel.typed) { _, value in
                    if value.count > viewModel.nameMax { viewModel.typed = String(value.prefix(viewModel.nameMax)) }
                }
                .accessibilityLabel("Made-up name")
                .accessibilityIdentifier("penNameField")
            Text("\(viewModel.nameMin) to \(viewModel.nameMax) characters. Pantopus draws the picture.")
                .pantopusTextStyle(.caption)
                .foregroundStyle(Theme.Color.appTextMuted)
        }
    }

    /// The promise, in the server's own three sentences (`/me`'s `promise`).
    private var promise: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            ForEach(Array((viewModel.me?.promise ?? []).enumerated()), id: \.offset) { index, sentence in
                HStack(alignment: .top, spacing: Spacing.s2) {
                    Icon(promiseIcon(index), size: 16, strokeWidth: 2, color: Theme.Color.magic)
                    Text(sentence)
                        .pantopusTextStyle(.caption)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurfaceSunken)
        .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
        .accessibilityIdentifier("penNamePromise")
    }

    private func promiseIcon(_ index: Int) -> PantopusIcon {
        switch index {
        case 0: .eyeOff
        case 1: .shieldCheck
        default: .alertCircle
        }
    }
}
