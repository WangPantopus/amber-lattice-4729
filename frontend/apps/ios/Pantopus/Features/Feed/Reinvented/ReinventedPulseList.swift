//
//  ReinventedPulseList.swift
//  Pantopus
//
//  The new Pulse's list (PHASE-1 §2 pieces 3 and 4): two looks for two lifetimes. A Moment that fades is borderless
//  and full width with its time left; a post that stays is today's Pulse card (`PulsePostCard`, its reactions, Save,
//  Repost and Reply as everywhere) under a status line ("Question, 3 answers", "Solved", "Spot", "Plan"). A thin line
//  with the band's label where the distance band changes ("Your street", "Camas", "2 mi"); the end line from the
//  server ("Caught up around you. Keep exploring?").
//

import SwiftUI

struct ReinventedPulseList: View {
    let model: ReinventedPulseModel
    /// Alive right now, over the list; nil or empty draws nothing.
    let strip: ReinventedStripResponse?
    let onOpenPost: (String) -> Void
    let onOpenMoment: (MomentDTO) -> Void
    let onOpenRing: (MomentRingDTO) -> Void
    let onRefreshStrip: () async -> Void

    var body: some View {
        switch model.load {
        case .loading:
            ScrollView {
                VStack(spacing: Spacing.s3) {
                    ForEach(0..<3, id: \.self) { _ in FeedSkeletonCard(withTitle: true) }
                }
                .padding(.horizontal, Spacing.s4)
            }
            .accessibilityLabel("Loading Pulse")
        case let .failed(message):
            EmptyState(
                icon: .alertTriangle,
                headline: "Pulse didn't load",
                subcopy: message,
                cta: EmptyState.CTA(title: "Try again") { await model.refresh() }
            )
            .padding(.top, Spacing.s5)
        case .needsPlace:
            EmptyState(
                icon: .mapPin,
                headline: "Where should Pulse look?",
                subcopy: "Turn on location for Pantopus in Settings, or add your home in Place, to see what's around you.",
                cta: EmptyState.CTA(title: "Show my circle instead") { await model.pick(reach: "close", miles: model.miles) }
            )
            .padding(.top, Spacing.s5)
        case .loaded:
            list
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Spacing.s3) {
                if let strip, !strip.isEmpty {
                    ReinventedAliveStrip(strip: strip, onOpenMoment: onOpenMoment, onOpenRing: onOpenRing)
                }
                if model.isEmpty {
                    emptyNote
                }
                ForEach(model.rows) { row in
                    switch row {
                    case let .band(band): bandLine(band)
                    case let .moment(moment): ReinventedMomentRow(moment: moment) { onOpenMoment(moment) }
                    case let .post(card): postCard(card)
                    }
                }
                if model.hasMore {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.s4)
                        .task { await model.loadMore() }
                } else if let end = model.end {
                    Text(end)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                        .padding(.vertical, Spacing.s5)
                        .accessibilityIdentifier("reinventedPulse.end")
                }
            }
            .padding(.bottom, 120)
        }
        .refreshable {
            await model.refresh()
            await onRefreshStrip()
        }
        .accessibilityIdentifier("reinventedPulse.list")
    }

    /// Nothing here: what there is to do.
    private var emptyNote: some View {
        VStack(spacing: Spacing.s2) {
            Text(model.reach == "close" ? "Nothing from your circle right now" : "Quiet around here right now")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
            Text("Post a Moment with + and it shows here first. Or widen what Pulse shows from the pill at the top.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Spacing.s5)
        .padding(.top, Spacing.s5)
        .accessibilityIdentifier("reinventedPulse.empty")
    }

    private func bandLine(_ band: ReinventedBandDTO) -> some View {
        HStack(spacing: Spacing.s2) {
            Rectangle().fill(Theme.Color.appBorder).frame(height: 1)
            Text(band.label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize()
            Rectangle().fill(Theme.Color.appBorder).frame(height: 1)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.top, Spacing.s2)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("reinventedPulse.band.\(band.band)")
    }

    /// A post that stays: its status line over today's Pulse card, in a border.
    private func postCard(_ card: PulsePostCardContent) -> some View {
        let cards = model.cards
        let postId = card.id
        let reply: @MainActor () -> Void = { onOpenPost(postId) }
        return VStack(alignment: .leading, spacing: 0) {
            if let status = Self.status(of: card) {
                Text(status)
                    .font(.system(size: 12.5, weight: .bold))
                    .foregroundStyle(Theme.Color.primaryTint)
                    .padding(.horizontal, Spacing.s4)
                    .padding(.top, Spacing.s3)
                    .accessibilityIdentifier("reinventedPulse.status.\(postId)")
            }
            PulsePostCard(
                content: card,
                onTap: { onOpenPost(postId) },
                onPickReaction: { emoji in Task { await cards.pickReaction(postId: postId, emoji: emoji) } },
                onRSVP: card.attendees == nil ? nil : { Task { await cards.tapReaction(postId: postId) } },
                onToggleSave: { Task { await cards.toggleSave(postId: postId) } },
                onToggleRepost: { cards.openRepostChooser(postId: postId) },
                repostChooser: PulseCardRepostChooser(
                    target: Binding(get: { cards.repostChooser }, set: { cards.repostChooser = $0 }),
                    onToggle: { postId in Task { await cards.toggleRepost(postId: postId) } },
                    onQuote: { postId in cards.beginQuote(postId: postId) }
                ),
                onReply: reply
            )
        }
        .background(Theme.Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
        .padding(.horizontal, Spacing.s3)
    }

    /// The status line for a post that stays, from the kinds today's Pulse has.
    static func status(of card: PulsePostCardContent) -> String? {
        let replies = card.commentCount
        switch card.intent {
        case .ask:
            if card.actions.isSolved { return "Solved" }
            return replies == 1 ? "Question, 1 answer" : "Question, \(replies) answers"
        case .recommend:
            return "Spot"
        case .event:
            let going = card.reaction.likeCount
            return going > 0 ? "Plan, \(going) going" : "Plan"
        default:
            return nil
        }
    }
}

/// A Moment that fades: borderless, full width, its picture (or its card), who and where, and its time left.
struct ReinventedMomentRow: View {
    let moment: MomentDTO
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                picture
                    .frame(maxWidth: .infinity)
                    .frame(height: 380)
                    .clipped()
                    .overlay(alignment: .topLeading) { header.padding(Spacing.s3) }
                if let caption = moment.caption, !caption.isEmpty {
                    Text(caption)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.Color.appText)
                        .lineLimit(2)
                        .padding(.horizontal, Spacing.s4)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(spoken)
        .accessibilityHint("Opens the Moment")
        .accessibilityIdentifier("reinventedPulse.moment.\(moment.id)")
    }

    @ViewBuilder private var picture: some View {
        switch moment.kind {
        case .text:
            MomentsTextCard(text: moment.text ?? "", background: moment.background)
        case .photo, .video:
            AsyncImage(url: moment.kind == .video ? moment.poster ?? moment.media : moment.media) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Theme.Color.appSurfaceRaised
            }
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Text(moment.author.shortName)
                .font(.system(size: 13, weight: .bold))
            Text("·")
            Text(timeLeft)
                .font(.system(size: 13, weight: .semibold))
            if !moment.placeLabel.isEmpty {
                Text("·")
                Text(moment.placeLabel)
                    .font(.system(size: 13, weight: .medium))
                    .lineLimit(1)
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(Color.black.opacity(0.5)))
    }

    /// "5h left", "40m left".
    private var timeLeft: String {
        guard let end = MomentTime.parse(moment.expiresAt) else { return "" }
        let minutes = max(Int(end.timeIntervalSinceNow / 60), 0)
        return minutes >= 60 ? "\(minutes / 60)h left" : "\(minutes)m left"
    }

    private var spoken: String {
        var parts = ["\(moment.author.shortName)'s Moment", timeLeft]
        if !moment.placeLabel.isEmpty { parts.append(moment.placeLabel) }
        if let caption = moment.caption, !caption.isEmpty { parts.append(caption) }
        return parts.joined(separator: ", ")
    }
}
