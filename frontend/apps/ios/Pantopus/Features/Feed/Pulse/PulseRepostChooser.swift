//
//  PulseRepostChooser.swift
//  Pantopus
//
//  The Repost chooser (PULSEREPOST contract §2): ↻ on a card, the ⋯ menu's
//  Repost item and Repost on the post page open it instead of reposting at
//  once. "Repost" (or "Undo repost" once reposted) and "Repost with your
//  words", which opens the Pulse composer with the post quoted. The ids are
//  Android's test tags too.
//

import SwiftUI

/// The post the chooser is open for, and whether the viewer already reposted it.
public struct PulseRepostTarget: Identifiable, Sendable, Hashable {
    public let id: String
    public let isReposted: Bool

    public init(postId: String, isReposted: Bool) {
        id = postId
        self.isReposted = isReposted
    }
}

private struct PulseRepostChooser: ViewModifier {
    @Binding var target: PulseRepostTarget?
    /// Reposts the post, or undoes the viewer's repost.
    let onToggle: @MainActor (String) -> Void
    /// "Repost with your words".
    let onQuote: @MainActor (String) -> Void

    func body(content: Content) -> some View {
        content.confirmationDialog(
            "Repost",
            isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }),
            titleVisibility: .hidden,
            presenting: target
        ) { shown in
            if shown.isReposted {
                Button("Undo repost") { onToggle(shown.id) }
                    .accessibilityIdentifier("pulseRepostChooserUndo")
            } else {
                Button("Repost") { onToggle(shown.id) }
                    .accessibilityIdentifier("pulseRepostChooserRepost")
            }
            Button("Repost with your words") { onQuote(shown.id) }
                .accessibilityIdentifier("pulseRepostChooserQuote")
            Button("Cancel", role: .cancel) {}
        }
    }
}

/// A card's own Repost chooser: it opens from the card's ↻, so it points at the button the person tapped (or the
/// card whose ⋯ menu they used) instead of the middle of the screen.
public struct PulseCardRepostChooser {
    let target: Binding<PulseRepostTarget?>
    let onToggle: @MainActor (String) -> Void
    let onQuote: @MainActor (String) -> Void

    public init(
        target: Binding<PulseRepostTarget?>,
        onToggle: @escaping @MainActor (String) -> Void,
        onQuote: @escaping @MainActor (String) -> Void
    ) {
        self.target = target
        self.onToggle = onToggle
        self.onQuote = onQuote
    }
}

/// Hosts a card's chooser on its ↻: open only while the chooser's post is this card's.
struct PulseCardRepostChooserHost: ViewModifier {
    let chooser: PulseCardRepostChooser?
    let postId: String

    func body(content: Content) -> some View {
        if let chooser {
            content.pulseRepostChooser(
                Binding(
                    get: { chooser.target.wrappedValue?.id == postId ? chooser.target.wrappedValue : nil },
                    set: { shown in
                        if shown == nil, chooser.target.wrappedValue?.id == postId { chooser.target.wrappedValue = nil }
                    }
                ),
                onToggle: chooser.onToggle,
                onQuote: chooser.onQuote
            )
        } else {
            content
        }
    }
}

extension View {
    /// The Repost chooser, open while `target` is set.
    func pulseRepostChooser(
        _ target: Binding<PulseRepostTarget?>,
        onToggle: @escaping @MainActor (String) -> Void,
        onQuote: @escaping @MainActor (String) -> Void
    ) -> some View {
        modifier(PulseRepostChooser(target: target, onToggle: onToggle, onQuote: onQuote))
    }
}
