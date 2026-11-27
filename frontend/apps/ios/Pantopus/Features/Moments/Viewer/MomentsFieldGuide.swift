//
//  MomentsFieldGuide.swift
//  Pantopus
//
//  The reader's own field guide ("Pulse, reinvented" phase 2; CONTRACT 7f): the field cards they collected, newest
//  first, 30 a page. Only the card's words are kept (no picture), so a card stays after the post ends. It is private
//  to its owner: nobody else sees who collected what. Opened from a collected card in the viewer. Step decks saved
//  with "Save the steps" (CONTRACT 7g) are listed first: only their words, each step's caption and voice tip.
//

import SwiftUI

struct MomentsFieldGuide: View {
    let onClose: () -> Void
    @Environment(\.openURL) private var openURL
    @State private var entries: [FieldGuidePageDTO.Entry] = []
    @State private var decks: [SavedDeckDTO] = []
    @State private var next: String?
    @State private var reading = true
    @State private var failed = false

    var body: some View {
        // No NavigationStack: shown as a sheet from inside the viewer, a guide with one was shown again about once a
        // second; a plain header with Done holds still.
        VStack(spacing: 0) {
            ZStack {
                Text("Your field guide")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityAddTraits(.isHeader)
                HStack {
                    Spacer()
                    Button("Done", action: onClose)
                        .font(.system(size: 17, weight: .semibold))
                        .accessibilityIdentifier("moments.fieldGuide.done")
                }
            }
            .padding(.horizontal, Spacing.s4)
            .frame(height: 52)
            Group {
                if reading, entries.isEmpty, decks.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel("Loading your field guide")
                } else if failed, entries.isEmpty, decks.isEmpty {
                    EmptyState(
                        icon: .bookmark,
                        headline: "Your field guide couldn't load",
                        subcopy: "Check your connection and try again.",
                        cta: EmptyState.CTA(title: "Try again") { await load(reset: true) }
                    )
                } else if entries.isEmpty, decks.isEmpty {
                    EmptyState(
                        icon: .bookmark,
                        headline: "Nothing here yet",
                        subcopy: "Tap a dot on a thing in someone's photo, then Collect its card."
                    )
                } else {
                    list
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Theme.Color.appBg.ignoresSafeArea())
        .task { await load(reset: true) }
        .accessibilityIdentifier("moments.fieldGuide")
    }

    private var list: some View {
        List {
            if !decks.isEmpty {
                Section("Steps you saved") {
                    ForEach(decks) { deck in MomentsSavedDeckRow(deck: deck) { Task { await letGo(deck) } } }
                }
            }
            Section {
                ForEach(entries) { entry in row(entry) }
                if next != nil {
                    Button("Show more") { Task { await load(reset: false) } }
                        .disabled(reading)
                        .accessibilityIdentifier("moments.fieldGuide.more")
                }
            } footer: {
                Text("Only you see your field guide. Cards stay here after the post ends.")
            }
        }
    }

    private func row(_ entry: FieldGuidePageDTO.Entry) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            (Text("Likely \(entry.card.name ?? "something")").bold() + Text(entry.card.scientific.map { "  \($0)" } ?? "").italic())
                .font(.system(size: 16))
                .foregroundStyle(Theme.Color.appText)
            Text(entry.card.why)
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.appTextSecondary)
            if let caution = entry.card.caution {
                Text(caution)
                    .font(.system(size: 13.5, weight: .bold))
                    .foregroundStyle(Theme.Color.warningStrong)
            }
            if let source = entry.card.source, let url = MomentDotCard.openable(source.url) {
                Button(source.title) { openURL(url) }
                    .font(.system(size: 13.5, weight: .semibold))
                    .buttonStyle(.borderless)
            }
            // Also as a swipe; here so it can be found.
            Button("Let it go", role: .destructive) { Task { await letGo(entry) } }
                .font(.system(size: 13.5, weight: .semibold))
                .buttonStyle(.borderless)
                .accessibilityIdentifier("moments.fieldGuide.letGo")
        }
        .padding(.vertical, 4)
        .swipeActions {
            Button("Let it go", role: .destructive) { Task { await letGo(entry) } }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.fieldGuide.card")
    }

    private func load(reset: Bool) async {
        reading = true
        failed = false
        defer { reading = false }
        do {
            let page = try await StudioPlayAPI.send(StudioPlayEndpoints.fieldGuide(cursor: reset ? nil : next), as: FieldGuidePageDTO.self)
            entries = reset ? page.cards : entries + page.cards.filter { card in !entries.contains { $0.id == card.id } }
            decks = reset ? page.decks : decks + page.decks.filter { deck in !decks.contains { $0.id == deck.id } }
            next = page.nextCursor
        } catch {
            failed = true
        }
    }

    private func letGo(_ deck: SavedDeckDTO) async {
        do {
            try await StudioPlayAPI.send(StudioPlayEndpoints.saveSteps(momentId: deck.firstMomentId, keep: false))
            decks.removeAll { $0.id == deck.id }
            if let deckId = deck.deckId { MomentDeckSaves.shared.saved.remove(deckId) }
        } catch {
            failed = entries.isEmpty && decks.isEmpty
        }
    }

    private func letGo(_ entry: FieldGuidePageDTO.Entry) async {
        do {
            try await StudioPlayAPI.send(StudioPlayEndpoints.collect(postId: entry.postId, dot: entry.dotId, keep: false))
            entries.removeAll { $0.id == entry.id }
        } catch {
            failed = entries.isEmpty
        }
    }
}
