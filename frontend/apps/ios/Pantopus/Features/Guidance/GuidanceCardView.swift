//
//  GuidanceCardView.swift
//  Pantopus
//
//  Shape 1, the centre card (GUIDE spec §1, drawings "The two shapes"): in the
//  middle of the dimmed screen, a title with an X at its right, up to three
//  rows of an outlined icon beside its text, and one full-width button. The
//  button, the X and a tap on the dimmed area all close it. It fades and scales
//  in from 96% over 200 ms (only fades with Reduce Motion). At large text sizes
//  the rows scroll inside the card while the title and the button stay.
//

import SwiftUI

/// The overlay's root: the centre card or the pointer, whichever shows.
struct GuidanceOverlayView: View {
    let model: GuidanceOverlayModel

    var body: some View {
        switch model.presentation {
        case let .centre(card, replay)?:
            GuidanceCardView(card: card, isShown: model.isShown) {
                GuidanceCenter.shared.close(.centre(card, replay: replay))
            }
        case let .pointer(card)?:
            GuidancePointerView(card: card, model: model)
        case nil:
            Color.clear
        }
    }
}

struct GuidanceCardView: View {
    let card: GuidanceCentreCard
    let isShown: Bool
    let onClose: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AccessibilityFocusState private var titleFocused: Bool
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 26
    @ScaledMetric(relativeTo: .title) private var closeSize: CGFloat = 24
    /// The rows' own height: the card wraps them, and scrolls them when the screen is too short.
    @State private var rowsHeight: CGFloat = 0

    /// On a wide screen (the iPhone Duo open, held sideways) the card keeps a phone's width.
    private static let maxWidth: CGFloat = 480

    var body: some View {
        ZStack {
            dim
                .ignoresSafeArea()
                .opacity(isShown ? 1 : 0)
                .contentShape(Rectangle())
                .onTapGesture(perform: onClose)
                .accessibilityHidden(true)
            cardBody
                .frame(maxWidth: Self.maxWidth)
                .padding(.horizontal, Spacing.s6)
                .padding(.vertical, Spacing.s6)
                .scaleEffect(isShown || reduceMotion ? 1 : 0.96)
                // Shown once its rows are measured, so it never grows while it fades in.
                .opacity(isShown && rowsHeight > 0 ? 1 : 0)
                .centeredClearOfFold()
        }
        .animation(.easeOut(duration: 0.2), value: isShown)
        .task {
            // VoiceOver starts on the title.
            try? await Task.sleep(for: .milliseconds(250))
            titleFocused = true
        }
    }

    /// The screen behind: the app's ink at 52% in light, black at 62% in dark.
    private var dim: Color {
        colorScheme == .dark ? Color.black.opacity(0.62) : Theme.Color.appText.opacity(0.52)
    }

    /// White in light; the app's raised surface in dark.
    private var surface: Color {
        colorScheme == .dark ? Theme.Color.appSurfaceRaised : Theme.Color.appSurface
    }

    /// Title, rows, button, then the X: the order VoiceOver reads them in (the sort priorities; on screen the X sits
    /// at the title's end).
    private var cardBody: some View {
        VStack(alignment: .leading, spacing: Spacing.s5) {
            titleRow
            ScrollView {
                rows.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { rowsHeight = $0 }
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(maxHeight: rowsHeight)
            .accessibilitySortPriority(3)
            primaryButton
                .padding(.top, Spacing.s1)
                .accessibilitySortPriority(2)
        }
        .padding(.top, 26)
        .padding(.horizontal, Spacing.s6)
        .padding(.bottom, 22)
        .overlay(alignment: .topTrailing) { closeButton }
        .background(surface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: Color.black.opacity(0.35), radius: 30, x: 0, y: 24)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, onClose)
        .accessibilityIdentifier("guidance.card.\(card.id.rawValue)")
    }

    /// The title keeps 32 pt beside it for the X, whose 24 pt glyph sits 10 pt in from the card's margin (as drawn);
    /// its 44 pt tap area reaches past it. iOS sets "Welcome to Pantopus" a little wider than the drawing did.
    private var titleRow: some View {
        Text(card.title)
            .scaledFont(27, weight: .heavy)
            .kerning(-0.68)
            .foregroundStyle(Theme.Color.appText)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.trailing, 32)
            .accessibilityAddTraits(.isHeader)
            .accessibilityFocused($titleFocused)
            .accessibilitySortPriority(4)
    }

    /// Centred 14 pt below the title's top and 10 pt in from the card's margin.
    private var closeButton: some View {
        Button(action: onClose) {
            Icon(.x, size: closeSize, strokeWidth: 2, color: Theme.Color.appText)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 18)
        .padding(.trailing, Spacing.s3)
        .accessibilityLabel("Close")
        .accessibilityIdentifier("guidance.card.\(card.id.rawValue).close")
        .accessibilitySortPriority(1)
    }

    private var rows: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            ForEach(card.rows, id: \.self) { row in
                HStack(alignment: .top, spacing: 14) {
                    // A 26 pt column, the glyph drawn at 22 pt: a Lucide icon's own inner margin. It grows with
                    // the text, up to 40 pt, so the words keep the room at the largest sizes.
                    let column = min(iconSize, 40)
                    Icon(row.icon, size: column * 22 / 26, strokeWidth: 1.75, color: Theme.Color.appText)
                        .frame(width: column, height: column)
                        .padding(.top, 1)
                    Text(row.text)
                        .scaledFont(16.5)
                        .lineSpacing(3)
                        .foregroundStyle(Theme.Color.appTextStrong)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private var primaryButton: some View {
        Button(action: onClose) {
            Text(card.button)
                .scaledFont(17, weight: .semibold)
                .foregroundStyle(Theme.Color.appTextInverse)
                .multilineTextAlignment(.center)
                .padding(.vertical, Spacing.s3)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(Theme.Color.primarySolid, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("guidance.card.\(card.id.rawValue).primary")
    }
}
