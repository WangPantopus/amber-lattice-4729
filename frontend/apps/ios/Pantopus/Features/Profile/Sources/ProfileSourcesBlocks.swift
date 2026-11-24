//
//  ProfileSourcesBlocks.swift
//  Pantopus
//
//  The blocks of the profile with sources (CONTRACT.md §3.2), one view each,
//  drawn as the boards draw them. A block the app doesn't know never reaches
//  here (the DTO skips it); a block with nothing in it isn't sent. Nothing on
//  this page says a part is off: what isn't sent simply isn't drawn.
//

import SwiftUI

/// What the blocks need from the screen around them.
struct ProfileBlockContext {
    let firstName: String
    let profileUserId: String
    let viewerId: String?
    let isOwner: Bool
    /// The pinned posts today's read found (`pinned_posts` draws them with the app's own card).
    let pinnedPosts: [FeedPostDTO]
    let openLink: (ProfilePageLinkDTO) -> Void
    let openPost: (String) -> Void
    let openTogether: (ProfileTogetherLine.Target) -> Void
    /// "Ask to connect" on `more_closer`; nil when there is nothing to ask.
    let askToConnect: (() -> Void)?
    /// Edit on your own Pinned and Get to know.
    let edit: (() -> Void)?
    /// A piece's ink, for the dots on the work rings.
    let pieceInk: (String) -> ProfileInk?
    /// The month open over Record, marked on the chart (board 13).
    var openedMonth: ProfileRingMonth?
}

/// A run of blocks, with Says and Known for sharing one card when they come together (board 1).
struct ProfileBlockList: View {
    let blocks: [ProfilePageBlockDTO]
    let context: ProfileBlockContext

    var body: some View {
        ForEach(groups, id: \.first?.id) { group in
            if group.count == 2 {
                ProfileBlockCard {
                    ProfileBlockView(block: group[0], context: context, inSharedCard: true)
                    Rectangle().fill(Theme.Color.appBorderSubtle).frame(height: 1).padding(.vertical, 14)
                    ProfileBlockView(block: group[1], context: context, inSharedCard: true)
                }
            } else if let block = group.first {
                ProfileBlockView(block: block, context: context, inSharedCard: false)
            }
        }
    }

    private var groups: [[ProfilePageBlockDTO]] {
        var out: [[ProfilePageBlockDTO]] = []
        var index = 0
        while index < blocks.count {
            let block = blocks[index]
            if case .says = block.content, index + 1 < blocks.count, case .knownFor = blocks[index + 1].content {
                out.append([block, blocks[index + 1]])
                index += 2
            } else {
                out.append([block])
                index += 1
            }
        }
        return out
    }
}

struct ProfileBlockView: View {
    let block: ProfilePageBlockDTO
    let context: ProfileBlockContext
    var inSharedCard = false

    var body: some View {
        content
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("profileBlock_\(block.id)")
    }

    @ViewBuilder private var content: some View {
        switch block.content {
        case let .lines(lines, more):
            ProfileLinesBlock(title: block.title, titleColor: laneColor, lines: lines, more: more, context: context)
        case let .says(line):
            card { ProfileSaysBlock(title: block.title ?? "Says", line: line) }
        case let .knownFor(lines, more):
            card { ProfileKnownForBlock(title: block.title ?? "Known for", lines: lines, more: more, context: context) }
        case let .inCommon(inCommon):
            let lines = ProfileTogetherLine.lines(
                from: inCommon,
                firstName: context.firstName,
                viewerId: context.viewerId,
                profileId: context.profileUserId
            )
            if !lines.isEmpty {
                ProfileTogetherSection(
                    firstName: context.firstName,
                    lines: lines,
                    onOpen: context.openTogether,
                    titleInCard: block.title ?? "You and \(context.firstName)"
                )
            }
        case let .doors(doors, leaveCard, signInNote):
            ProfileDoorsBlock(title: block.title, doors: doors, leaveCard: leaveCard, signInNote: signInNote, context: context)
        case let .shelf(objects):
            ProfileShelfBlock(title: block.title, objects: objects)
        case let .prompts(prompts):
            ProfilePromptsBlock(title: block.title ?? "Get to know \(context.firstName)", prompts: prompts)
        case .pinnedPosts:
            if !context.pinnedPosts.isEmpty {
                ProfilePinnedRow(posts: context.pinnedPosts, onEdit: context.edit.map { edit in { @MainActor in edit() } }) { id in
                    context.openPost(id)
                }
                .padding(.horizontal, -Spacing.s4)
            }
        case let .rows(rows):
            ProfileRowsBlock(rows: rows, context: context)
        case let .moreCloser(text, connects):
            ProfileMoreCloserBlock(
                title: block.title ?? "\(context.firstName) shows more to people closer",
                text: text,
                onConnect: connects ? context.askToConnect : nil
            )
        case let .canDo(subtitle, skills):
            ProfileCanDoBlock(title: block.title ?? "Can do", subtitle: subtitle, skills: skills)
        case let .pieces(pieces):
            ProfilePiecesBlock(title: block.title, block: pieces, context: context)
        case let .workRings(rings):
            ProfileWorkRingsBlock(title: block.title, rings: rings, context: context)
        case let .owns(lines):
            ProfileOwnsBlock(title: block.title ?? "Owns", lines: lines, context: context)
        case let .recordChart(chart):
            ProfileRecordChartBlock(title: block.title, chart: chart, context: context)
        }
    }

    /// Says and Known for draw their own card unless they share one.
    @ViewBuilder
    private func card(@ViewBuilder _ inner: () -> some View) -> some View {
        let content = inner()
        if inSharedCard {
            content
        } else {
            ProfileBlockCard { content }
        }
    }

    /// The Record tab's groups are titled in their lane's colour (board 12).
    private var laneColor: Color? {
        switch block.id {
        case "record_home": Theme.Color.home
        case "record_work": Theme.Color.business
        case "record_others": Theme.Color.personal
        default: nil
        }
    }
}

// MARK: - lines

struct ProfileLinesBlock: View {
    let title: String?
    var titleColor: Color?
    let lines: [ProfilePageLineDTO]
    let more: ProfilePageMoreDTO?
    let context: ProfileBlockContext

    var body: some View {
        ProfileBlockCard {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                if let title {
                    HStack(alignment: .firstTextBaseline) {
                        ProfileBlockTitle(title: title, color: titleColor ?? Theme.Color.appTextSecondary)
                        Spacer(minLength: Spacing.s2)
                        ProfileMoreLink(more: more, context: context)
                    }
                }
                ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                    if line.who != nil {
                        ProfileWrittenLineView(line: line, position: index, context: context)
                    } else {
                        ProfileInkLineView(line: line.sourceLine(at: index), onOpen: opener(line))
                    }
                }
                if title == nil {
                    ProfileMoreLink(more: more, context: context)
                }
            }
        }
    }

    private func opener(_ line: ProfilePageLineDTO) -> ((String) -> Void)? {
        guard let link = line.link else { return nil }
        return { _ in context.openLink(link) }
    }
}

/// "All 6 lines" and the like: what it counts is only what this viewer can open.
struct ProfileMoreLink: View {
    let more: ProfilePageMoreDTO?
    let context: ProfileBlockContext

    var body: some View {
        if let more {
            if let link = more.link {
                Button { context.openLink(link) } label: {
                    Text(more.text)
                        .scaledFont(13, weight: .semibold)
                        .foregroundStyle(Theme.Color.primaryInk)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Text(more.text)
                    .scaledFont(13, weight: .semibold)
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
    }
}

// MARK: - says

struct ProfileSaysBlock: View {
    let title: String
    let line: ProfilePageLineDTO

    var body: some View {
        let source = line.sourceLine(at: 0)
        VStack(alignment: .leading, spacing: 6) {
            ProfileBlockTitle(title: title)
            Text(line.text)
                .profileSaidFont(20)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
            Text(source.source)
                .scaledFont(ProfileSourceType.how)
                .foregroundStyle(Theme.Color.appTextSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title). \(source.spoken)")
    }
}

// MARK: - known_for

struct ProfileKnownForBlock: View {
    let title: String
    let lines: [ProfileKnownForLineDTO]
    let more: ProfilePageMoreDTO?
    let context: ProfileBlockContext

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            HStack(alignment: .firstTextBaseline) {
                ProfileBlockTitle(title: title)
                Spacer(minLength: Spacing.s2)
                ProfileMoreLink(more: more, context: context)
            }
            ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                ProfileWrittenLineView(line: line, position: index, context: context)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A line someone else wrote (Known for, a review): the words, then who and how we know it. The words open what
/// they're tied to (a gig); the writer's row opens their page where the server names them.
struct ProfileWrittenLineView: View {
    let line: ProfilePageLineDTO
    let position: Int
    let context: ProfileBlockContext

    var body: some View {
        let source = line.sourceLine(at: position)
        VStack(alignment: .leading, spacing: 6) {
            words(source)
            writer(source)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func words(_ source: ProfileSourceLine) -> some View {
        let text = Text(line.text)
            .scaledFont(ProfileSourceType.body)
            .foregroundStyle(Theme.Color.appText)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        if let link = line.link {
            Button { context.openLink(link) } label: { text.contentShape(Rectangle()) }
                .buttonStyle(.plain)
                .accessibilityLabel("\(line.text). \(source.ink.word)")
                .accessibilityHint(link.isGig ? "Opens the job" : "")
        } else {
            text.accessibilityLabel("\(line.text). \(source.ink.word)")
        }
    }

    @ViewBuilder
    private func writer(_ source: ProfileSourceLine) -> some View {
        let row = HStack(spacing: Spacing.s2) {
            if let url = line.who?.portraitURL.flatMap(URL.init(string:)) {
                CachedAsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Circle().fill(Theme.Color.appSurfaceSunken)
                    }
                }
                .frame(width: 22, height: 22)
                .clipShape(Circle())
                .accessibilityHidden(true)
            } else {
                ProfileInkGlyph(ink: source.ink)
            }
            Text(source.source)
                .scaledFont(12)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        if let who = line.who, let target = who.userId ?? who.username {
            Button { context.openLink(.profile(userId: who.userId, username: who.username)) } label: {
                row.frame(minHeight: 32).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(source.source)
            .accessibilityHint("Opens \(who.name ?? "their") profile")
            .accessibilityIdentifier("profileWriter_\(target)")
        } else {
            row.accessibilityElement(children: .ignore).accessibilityLabel(source.source)
        }
    }
}

extension ProfilePageLinkDTO {
    var isGig: Bool {
        if case .gig = self { return true }
        return false
    }
}

// MARK: - prompts

struct ProfilePromptsBlock: View {
    let title: String
    let prompts: [ProfilePromptLineDTO]

    /// Answers to questions this app knows; a key from a newer catalog is skipped.
    private var shown: [(question: String, prompt: ProfilePromptLineDTO)] {
        prompts.compactMap { prompt in
            ProfilePromptCatalog.text(for: prompt.key).map { ($0, prompt) }
        }
    }

    var body: some View {
        let shown = shown
        if !shown.isEmpty {
            let sameSource = Set(shown.map(\.prompt.line.how)).count == 1
            ProfileBlockCard {
                VStack(alignment: .leading, spacing: 14) {
                    ProfileBlockTitle(title: title)
                    ForEach(Array(shown.enumerated()), id: \.offset) { index, item in
                        let source = item.prompt.line.sourceLine(at: index)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.question)
                                .scaledFont(12)
                                .foregroundStyle(Theme.Color.appTextSecondary)
                            Text(item.prompt.answer)
                                .profileSaidFont()
                                .foregroundStyle(Theme.Color.appText)
                                .fixedSize(horizontal: false, vertical: true)
                            if !sameSource {
                                Text(source.source)
                                    .scaledFont(ProfileSourceType.how)
                                    .foregroundStyle(Theme.Color.appTextSecondary)
                            }
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(item.question): \(item.prompt.answer). \(source.ink.word)")
                    }
                    if sameSource, let first = shown.first {
                        Text(first.prompt.line.sourceLine(at: 0).source)
                            .scaledFont(ProfileSourceType.how)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                    }
                }
            }
        }
    }
}
