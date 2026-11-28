//
//  SharePicker.swift
//  PantopusShare
//
//  The extension's one screen: "Sharing as <name>", then a card for each
//  place in Pantopus the shared thing can go, each a small picture of how it
//  will look there with its button underneath. Nobody signed in: a line
//  saying so and "Open Pantopus".
//

import SwiftUI

/// The extension is its own bundle, without the app's design tokens: these are the same colours.
private enum ShareColor {
    /// `Theme.Color.primaryFill`: white words on it in light and dark.
    static let fill = Color(red: 3 / 255, green: 105 / 255, blue: 161 / 255)
    static let line = Color(uiColor: .separator)
    static let ghost = Color(uiColor: .systemGray5)
    static let paper = Color(uiColor: .secondarySystemGroupedBackground)
    static let page = Color(uiColor: .systemGroupedBackground)
}

struct SharePicker: View {
    let model: ShareModel
    let onPick: (ShareInDestination) -> Void
    let onOpenApp: () -> Void
    let onDone: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            Group {
                if model.account == nil {
                    message(
                        "Sign in to Pantopus first",
                        "Open Pantopus and sign in, then share again.",
                        button: "Open Pantopus",
                        action: onOpenApp
                    )
                } else if model.waitsForApp {
                    message("Open Pantopus to finish", "What you shared is waiting there.", button: "Done", action: onDone)
                } else if let failure = model.failure {
                    message(failure, nil, button: "Close", action: onCancel)
                } else if let chat = model.suggestedChat {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Opening your chat with \(chat.name)")
                            .font(.system(size: 15))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    cards
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(ShareColor.page.ignoresSafeArea())
    }

    private var header: some View {
        ZStack {
            if let account = model.account {
                (Text("Sharing as ") + Text(account.name).fontWeight(.semibold))
                    .font(.system(size: 16))
                    .lineLimit(1)
                    .padding(.horizontal, 72)
                    .accessibilityIdentifier("shareIn.sharingAs")
            } else {
                Text("Pantopus").font(.system(size: 16, weight: .semibold))
            }
            HStack {
                Button("Cancel", action: onCancel)
                    .font(.system(size: 16))
                    .foregroundStyle(ShareColor.fill)
                    .accessibilityIdentifier("shareIn.cancel")
                Spacer()
            }
            .padding(.horizontal, 16)
        }
        .frame(height: 56)
    }

    private var cards: some View {
        GeometryReader { box in
            let destinations = model.destinations
            // All of them show at once: four across at the size of the phone's own share cards, five a little
            // smaller and closer. Sized for four when there are fewer, so two or three aren't oversized.
            let across = CGFloat(min(max(destinations.count, 4), 5))
            let gap: CGFloat = across > 4 ? 8 : 12
            let width = min(96, (box.size.width - 32 - gap * (across - 1)) / across)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: gap) {
                    ForEach(destinations, id: \.self) { destination in
                        card(destination, width: width)
                    }
                }
                .padding(.horizontal, 16)
                .frame(minWidth: box.size.width)
            }
            .frame(maxHeight: .infinity)
        }
    }

    private func card(_ destination: ShareInDestination, width: CGFloat) -> some View {
        Button {
            onPick(destination)
        } label: {
            VStack(spacing: 14) {
                ShareMock(destination: destination, thumbnail: model.thumbnail)
                    .frame(width: width, height: width * 1.75)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(ShareColor.line, lineWidth: 0.5))
                    .shadow(color: .black.opacity(0.12), radius: 8, y: 4)
                ZStack {
                    if model.sending == destination {
                        ProgressView().tint(.white)
                    } else {
                        Text(destination.title)
                            .font(.system(size: width < 76 ? 13 : 15, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                }
                .frame(width: width, height: 34)
                .background(ShareColor.fill, in: Capsule())
            }
        }
        .buttonStyle(.plain)
        .disabled(model.sending != nil)
        .accessibilityLabel(destination.spoken)
        .accessibilityIdentifier("shareIn.\(destination.rawValue)")
    }

    private func message(_ title: String, _ detail: String?, button: String, action: @escaping () -> Void) -> some View {
        VStack(spacing: 10) {
            Text(title)
                .font(.system(size: 18, weight: .semibold))
                .multilineTextAlignment(.center)
            if let detail {
                Text(detail)
                    .font(.system(size: 15))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            Button(action: action) {
                Text(button)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 24)
                    .frame(minHeight: 44)
                    .background(ShareColor.fill, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
            .accessibilityIdentifier("shareIn.messageButton")
        }
        .padding(.horizontal, 32)
    }
}

extension ShareInDestination {
    /// The button under the card.
    var title: String {
        switch self {
        case .moments: "Moment"
        case .pulse: "Pulse"
        case .messages: "Message"
        case .mail: "Mail"
        case .plans: "Plan"
        }
    }

    var spoken: String {
        switch self {
        case .moments: "Post as a Moment"
        case .pulse: "Post to Pulse"
        case .messages: "Send in a message"
        case .mail: "Send as a card in Mail"
        case .plans: "Share with a plan"
        }
    }
}

/// How the shared thing will look in one place, drawn small: the picture where it goes, grey bars for the rest.
private struct ShareMock: View {
    let destination: ShareInDestination
    let thumbnail: UIImage?

    var body: some View {
        GeometryReader { box in
            let size = box.size
            switch destination {
            case .moments:
                // Full screen, a time bar and the author across the top.
                ZStack(alignment: .top) {
                    picture(size.width, size.height)
                    VStack(alignment: .leading, spacing: 5) {
                        Capsule().fill(.white.opacity(0.85)).frame(height: 2)
                        HStack(spacing: 4) {
                            Circle().fill(.white.opacity(0.85)).frame(width: 9, height: 9)
                            Capsule().fill(.white.opacity(0.85)).frame(width: size.width * 0.3, height: 3)
                        }
                    }
                    .padding(6)
                }
            case .pulse:
                // A post: who, the picture, a line of words.
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        Circle().fill(ShareColor.ghost).frame(width: 10, height: 10)
                        bar(size.width * 0.35)
                    }
                    .padding(6)
                    picture(size.width, size.height * 0.56)
                    VStack(alignment: .leading, spacing: 4) {
                        bar(size.width * 0.7)
                        bar(size.width * 0.45)
                    }
                    .padding(6)
                    Spacer(minLength: 0)
                }
                .background(ShareColor.paper)
            case .messages:
                // A chat: bubbles on both sides, the picture as the last one sent.
                VStack(spacing: 5) {
                    Rectangle().fill(ShareColor.ghost.opacity(0.6)).frame(height: size.height * 0.12)
                    bubble(size.width * 0.4, leading: true)
                    bubble(size.width * 0.5, leading: false)
                    bubble(size.width * 0.55, leading: true)
                    HStack {
                        Spacer(minLength: 0)
                        picture(size.width * 0.55, size.width * 0.42)
                            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                    }
                    .padding(.horizontal, 6)
                    Spacer(minLength: 0)
                }
                .background(ShareColor.paper)
            case .mail:
                // A card: the picture on it, a stamp in the corner, the note's lines below.
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Spacer(minLength: 0)
                        RoundedRectangle(cornerRadius: 2).stroke(ShareColor.fill, lineWidth: 1).frame(width: 11, height: 13)
                    }
                    picture(size.width - 14, size.height * 0.45)
                        .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
                    bar(size.width * 0.6)
                    bar(size.width * 0.5)
                    bar(size.width * 0.3)
                    Spacer(minLength: 0)
                }
                .padding(7)
                .background(ShareColor.paper)
            case .plans:
                // A plan: its day and name on top, the picture in the plan's chat.
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 5) {
                        RoundedRectangle(cornerRadius: 3).fill(ShareColor.fill.opacity(0.85)).frame(width: 14, height: 15)
                        VStack(alignment: .leading, spacing: 3) {
                            bar(size.width * 0.45)
                            bar(size.width * 0.3)
                        }
                    }
                    Rectangle().fill(ShareColor.line).frame(height: 0.5)
                    bubble(size.width * 0.45, leading: true, inset: 0)
                    HStack {
                        Spacer(minLength: 0)
                        picture(size.width * 0.6, size.width * 0.46)
                            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                    }
                    Spacer(minLength: 0)
                }
                .padding(7)
                .background(ShareColor.paper)
            }
        }
    }

    /// The shared picture filling `width` by `height` and cut to it, or a grey block for a link or words.
    private func picture(_ width: CGFloat, _ height: CGFloat) -> some View {
        ShareColor.ghost
            .frame(width: width, height: height)
            .overlay {
                if let thumbnail { Image(uiImage: thumbnail).resizable().scaledToFill() }
            }
            .clipped()
    }

    private func bar(_ width: CGFloat) -> some View {
        Capsule().fill(ShareColor.ghost).frame(width: width, height: 4)
    }

    private func bubble(_ width: CGFloat, leading: Bool, inset: CGFloat = 6) -> some View {
        HStack {
            if !leading { Spacer(minLength: 0) }
            Capsule().fill(ShareColor.ghost).frame(width: width, height: 9)
            if leading { Spacer(minLength: 0) }
        }
        .padding(.horizontal, inset)
    }
}
