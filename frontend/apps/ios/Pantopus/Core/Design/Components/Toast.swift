//
//  Toast.swift
//  Pantopus
//
//  Lightweight transient banner used for success + error surfacing on
//  form submissions and CTA results.
//

import SwiftUI

/// Visual role for a `ToastView`.
public enum ToastKind: Sendable {
    case success
    case error
    case neutral
}

/// Payload for `ToastView`. Hold as `@State` on the host and set to nil
/// after the auto-dismiss delay.
public struct ToastMessage: Identifiable, Equatable, Sendable {
    public let id = UUID()
    public let text: String
    public let kind: ToastKind

    public init(text: String, kind: ToastKind = .neutral) {
        self.text = text
        self.kind = kind
    }

    /// Brief confirmations keep their existing dwell; explanatory messages get up to seven seconds.
    public static func duration(for text: String, minimum: Double = 3) -> Duration {
        .seconds(max(minimum, min(Double(text.count) * 0.06, 7)))
    }
}

/// A button at the end of a toast ("View", "Undo"): what the message just did
/// can be followed or taken back from it.
public struct ToastAction {
    public let title: String
    public let accessibilityIdentifier: String
    public let perform: @MainActor () -> Void

    public init(
        title: String,
        accessibilityIdentifier: String = "pulseFeedToastAction",
        perform: @escaping @MainActor () -> Void
    ) {
        self.title = title
        self.accessibilityIdentifier = accessibilityIdentifier
        self.perform = perform
    }
}

/// Banner floated at the bottom of the screen, clear of its edges. A message
/// that fits on one line is a pill; a longer one wraps, centred, in a rounded
/// rectangle whose corners stay clear of the first and last lines. An action,
/// when given, sits after the words in the same banner.
public struct ToastView: View {
    public let message: ToastMessage
    private let action: ToastAction?

    public init(message: ToastMessage, action: ToastAction? = nil) {
        self.message = message
        self.action = action
    }

    public var body: some View {
        if let action {
            actionBody(action)
        } else {
            ViewThatFits(in: .horizontal) {
                label
                    .fixedSize()
                    .clipShape(RoundedRectangle(cornerRadius: Radii.pill))
                label
                    .fixedSize(horizontal: false, vertical: true)
                    .clipShape(RoundedRectangle(cornerRadius: Radii.xl))
            }
            .padding(.horizontal, Spacing.s4)
            .accessibilityLabel(message.text)
        }
    }

    /// The words and the action's button, as one pill when they fit on a line.
    private func actionBody(_ action: ToastAction) -> some View {
        ViewThatFits(in: .horizontal) {
            actionLabel(action)
                .fixedSize()
                .clipShape(RoundedRectangle(cornerRadius: Radii.pill))
            actionLabel(action)
                .fixedSize(horizontal: false, vertical: true)
                .clipShape(RoundedRectangle(cornerRadius: Radii.xl))
        }
        .padding(.horizontal, Spacing.s4)
        // A container, so the words and the button keep their own names and identifiers.
        .accessibilityElement(children: .contain)
    }

    private func actionLabel(_ action: ToastAction) -> some View {
        HStack(spacing: Spacing.s3) {
            Text(message.text)
                .pantopusTextStyle(.small)
                .pantopusLineHeight(.small)
                .multilineTextAlignment(.leading)
                .foregroundStyle(foreground)
            Button(action: action.perform) {
                Text(action.title)
                    .pantopusTextStyle(.small)
                    .fontWeight(.bold)
                    .foregroundStyle(foreground)
                    .padding(.horizontal, Spacing.s1)
                    .frame(minHeight: 28)
                    .contentShape(Rectangle())
                    .hitArea(horizontal: 6, vertical: 8)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier(action.accessibilityIdentifier)
        }
        .padding(.leading, Spacing.s4)
        .padding(.trailing, Spacing.s3)
        .padding(.vertical, Spacing.s1)
        .background(background)
    }

    private var label: some View {
        Text(message.text)
            .pantopusTextStyle(.small)
            .pantopusLineHeight(.small)
            .multilineTextAlignment(.center)
            .foregroundStyle(foreground)
            .padding(.horizontal, Spacing.s4)
            .padding(.vertical, Spacing.s2)
            .background(background)
    }

    private var foreground: Color {
        switch message.kind {
        case .neutral: Theme.Color.appSurface
        case .success, .error: Theme.Color.appTextInverse
        }
    }

    private var background: Color {
        switch message.kind {
        case .success: Theme.Color.successSolid.opacity(0.95)
        case .error: Theme.Color.errorSolid.opacity(0.95)
        case .neutral: Theme.Color.appText.opacity(0.9)
        }
    }
}

public extension View {
    /// Floats an error toast when a refresh fails while the screen's content
    /// stays up, then clears the message. Screens keep what they loaded
    /// instead of swapping it for a full-screen error.
    func refreshFailureToast(_ message: Binding<String?>) -> some View {
        overlay(alignment: .bottom) {
            if let text = message.wrappedValue {
                ToastView(message: ToastMessage(text: text, kind: .error))
                    .padding(.bottom, Spacing.s10)
                    .task(id: text) {
                        do {
                            try await Task.sleep(for: ToastMessage.duration(for: text))
                        } catch {
                            return
                        }
                        guard message.wrappedValue == text else { return }
                        message.wrappedValue = nil
                    }
            }
        }
    }

    /// Runs `action` once `message` has been up long enough to read
    /// (`ToastMessage.duration`, never less than `minimum` seconds). A new
    /// message restarts the wait, and a wait cut short — the toast replaced
    /// or the screen gone — clears nothing.
    func dismissToast(
        after message: ToastMessage,
        minimum: Double = 3,
        action: @escaping @MainActor () -> Void
    ) -> some View {
        task(id: message.id) { @MainActor in
            do {
                try await Task.sleep(for: ToastMessage.duration(for: message.text, minimum: minimum))
            } catch {
                return
            }
            action()
        }
    }

    /// `dismissToast(after:minimum:action:)` for a screen that holds its
    /// message as plain text.
    func dismissToast(
        after text: String,
        minimum: Double = 3,
        action: @escaping @MainActor () -> Void
    ) -> some View {
        task(id: text) { @MainActor in
            do {
                try await Task.sleep(for: ToastMessage.duration(for: text, minimum: minimum))
            } catch {
                return
            }
            action()
        }
    }
}
