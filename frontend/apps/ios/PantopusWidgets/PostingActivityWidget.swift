//
//  PostingActivityWidget.swift
//  PantopusWidgets
//
//  The posting card on the Lock Screen and in the Dynamic Island (founder,
//  2026-11-27): "Posting your Moment" with how far it is while the app can
//  read that, then "Your Moment is live" and View. The app drives it
//  (`PostingLiveActivityController`); this file only draws what it is told.
//  The extension cannot import the app target, so its few colours live here
//  (`PostingCardPalette`); the app's Theme / Icon / token guards do not apply
//  (extension-only code, outside `Pantopus/Features/**`).
//

import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

struct PostingActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PostingActivityAttributes.self) { context in
            let face = PostingCardFace(context)
            PostingCardLockScreenView(face: face)
                .activityBackgroundTint(nil)
                .activitySystemActionForegroundColor(PostingCardPalette.accent)
                .widgetURL(face.link)
        } dynamicIsland: { context in
            let face = PostingCardFace(context)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    PostingCardTile(face: face, size: 40)
                }
                DynamicIslandExpandedRegion(.center) {
                    PostingCardWords(face: face)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    PostingCardTrailing(face: face)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let percent = face.percent {
                        PostingCardBar(percent: percent)
                    }
                }
            } compactLeading: {
                PostingCardGlyph(face: face, size: 16)
            } compactTrailing: {
                Text(face.short)
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(face.tint)
                    .lineLimit(1)
            } minimal: {
                PostingCardGlyph(face: face, size: 14)
            }
            .widgetURL(face.link)
            .keylineTint(face.tint)
        }
    }
}

// MARK: - What the card says

/// The card's state read into what is drawn. One rule lives here: a card still "posting" past the date the
/// app set (`staleDate`) was not heard from again (the app was swiped away, which stops its uploads), so it
/// says the Moment didn't post and how to finish it.
struct PostingCardFace {
    let phase: PostingActivityPhase
    let percent: Int?
    let title: String
    let detail: String?
    let link: URL?
    let isVideo: Bool
    let thumbnail: String?

    init(_ context: ActivityViewContext<PostingActivityAttributes>) {
        self.init(state: context.state, attributes: context.attributes, isStale: context.isStale)
    }

    init(state: PostingActivityAttributes.ContentState, attributes: PostingActivityAttributes, isStale: Bool) {
        let unheard = isStale && state.phase == .posting
        let phase = unheard ? PostingActivityPhase.failed : state.phase
        self.phase = phase
        percent = phase == .posting ? state.percent.map { min(max($0, 0), 100) } : nil
        switch phase {
        case .posting:
            title = phase.title
            detail = state.percent == nil ? PostingActivityContract.away : nil
        case .uploaded:
            title = phase.title
            detail = PostingActivityContract.checking
        case .later:
            // The app's own sentence says when ("Your Moment shares at 8:00 PM."): it is the whole card.
            title = state.detail ?? phase.title
            detail = nil
        case .failed:
            title = phase.title
            detail = unheard ? PostingActivityContract.unfinished : (state.detail ?? PostingActivityContract.unfinished)
        case .live, .held:
            title = phase.title
            detail = state.detail
        }
        link = PostingActivityContract.link(momentId: phase == .live ? state.momentId : nil)
        isVideo = attributes.isVideo
        thumbnail = attributes.thumbnail
    }

    var tint: Color {
        switch phase {
        case .live: PostingCardPalette.success
        case .failed: PostingCardPalette.danger
        default: PostingCardPalette.accent
        }
    }

    /// The few characters the Dynamic Island has room for.
    var short: String {
        switch phase {
        case .posting: percent.map { "\($0)%" } ?? "Posting"
        case .uploaded: "Sent"
        case .live: "Live"
        case .held: "Review"
        case .later: "Saved"
        case .failed: "Open"
        }
    }

    /// The word at the card's trailing edge: what a tap does, when it does more than open the app.
    var action: String? {
        switch phase {
        case .live: "View"
        case .failed: "Open"
        default: nil
        }
    }

    var symbol: String {
        switch phase {
        case .posting, .uploaded: "arrow.up.circle.fill"
        case .live: "checkmark.circle.fill"
        case .held, .later: "clock.fill"
        case .failed: "exclamationmark.circle.fill"
        }
    }
}

// MARK: - Lock Screen

private struct PostingCardLockScreenView: View {
    let face: PostingCardFace

    var body: some View {
        HStack(spacing: 12) {
            PostingCardTile(face: face, size: 44)
            VStack(alignment: .leading, spacing: 6) {
                PostingCardWords(face: face)
                if let percent = face.percent {
                    PostingCardBar(percent: percent)
                }
            }
            Spacer(minLength: 0)
            PostingCardTrailing(face: face)
        }
        .padding(14)
        .accessibilityElement(children: .combine)
    }
}

/// The title and, under it, the second line when there is one.
private struct PostingCardWords: View {
    let face: PostingCardFace

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(face.title)
                .font(.system(size: 14, weight: .bold))
                .lineLimit(2)
            if let detail = face.detail {
                Text(detail)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
    }
}

/// How far it is, or what a tap does.
private struct PostingCardTrailing: View {
    let face: PostingCardFace

    var body: some View {
        if let percent = face.percent {
            Text("\(percent)%")
                .font(.system(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(face.tint)
        } else if let action = face.action {
            Text(action)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(face.phase == .live ? PostingCardPalette.accent : face.tint)
        }
    }
}

private struct PostingCardBar: View {
    let percent: Int

    var body: some View {
        ProgressView(value: Double(percent), total: 100)
            .progressViewStyle(.linear)
            .tint(PostingCardPalette.accent)
            .accessibilityHidden(true)
    }
}

/// The picture of what is posting (or the brand tile without one), with a small mark once it is live or stopped.
private struct PostingCardTile: View {
    let face: PostingCardFace
    let size: CGFloat

    var body: some View {
        picture
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
            .overlay(alignment: .bottomTrailing) {
                if face.phase == .live || face.phase == .failed {
                    Image(systemName: face.symbol)
                        .font(.system(size: size * 0.4, weight: .semibold))
                        .foregroundStyle(.white, face.tint)
                        .offset(x: size * 0.12, y: size * 0.12)
                }
            }
            .accessibilityHidden(true)
    }

    @ViewBuilder private var picture: some View {
        if let image = PostingCardPicture.load(face.thumbnail) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
        } else {
            PostingCardPalette.accent
                .overlay(
                    Image(systemName: face.isVideo ? "video.fill" : "photo.fill")
                        .font(.system(size: size * 0.42, weight: .semibold))
                        .foregroundStyle(.white)
                )
        }
    }
}

/// The Dynamic Island's small mark: a ring that fills while the number is known, else the phase's symbol.
private struct PostingCardGlyph: View {
    let face: PostingCardFace
    let size: CGFloat

    var body: some View {
        if let percent = face.percent {
            ProgressView(value: Double(percent), total: 100)
                .progressViewStyle(.circular)
                .tint(face.tint)
                .frame(width: size + 4, height: size + 4)
        } else {
            Image(systemName: face.symbol)
                .font(.system(size: size, weight: .semibold))
                .foregroundStyle(face.tint)
        }
    }
}

// MARK: - Picture + palette (extension-local)

enum PostingCardPicture {
    /// The small picture the app wrote for this card, read from the shared container.
    static func load(_ name: String?) -> UIImage? {
        guard let name, let url = PostingActivityContract.thumbnailURL(name) else { return nil }
        return UIImage(contentsOfFile: url.path)
    }
}

/// Mirrors the app's `primary600`, `success` and `error` tokens. Keep these values in the extension ONLY —
/// feature code must keep using design tokens.
enum PostingCardPalette {
    static let accent = Color(red: 0x02 / 255, green: 0x84 / 255, blue: 0xC7 / 255)
    static let success = Color(red: 0x16 / 255, green: 0xA3 / 255, blue: 0x4A / 255)
    static let danger = Color(red: 0xDC / 255, green: 0x26 / 255, blue: 0x26 / 255)
}
