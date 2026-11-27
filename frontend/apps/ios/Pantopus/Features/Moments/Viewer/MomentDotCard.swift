//
//  MomentDotCard.swift
//  Pantopus
//
//  What a dot holds, opened by a tap in the viewer ("Pulse, reinvented" phase 2; CONTRACT 7c): a note's words, a
//  rating's stars, or a link that shows its site and opens only on a tap, and only as https or http. On one's own
//  Moment, "Remove this dot" takes it off for everyone (`DELETE /api/reinvented/dots/:id/:dot`).
//

import SwiftUI

struct MomentDotCard: View {
    let moment: MomentDTO
    let dot: MomentDotDTO
    @Environment(\.openURL) private var openURL
    @State private var removing = false
    @State private var problem: String?
    private let prompt = MomentDotPrompt.shared

    private var mine: Bool {
        guard case let .signedIn(user) = AuthManager.shared.state else { return false }
        return user.id == moment.author.id
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            content
            if let problem {
                Text(problem)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.white.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }
            if mine {
                Button { Task { await remove() } } label: {
                    Text(removing ? "Removing…" : "Remove this dot")
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(Color.white.opacity(0.9))
                        .underline()
                }
                .buttonStyle(.plain)
                .disabled(removing)
                .accessibilityIdentifier("moments.viewer.dot.remove")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.black.opacity(0.78)))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.18), lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.viewer.dotCard")
    }

    @ViewBuilder private var content: some View {
        switch dot.kind {
        case .note:
            Text(dot.text ?? "")
                .font(.system(size: 15.5, weight: .medium))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
        case .rating:
            VStack(alignment: .leading, spacing: 4) {
                Text(dot.label ?? "")
                    .font(.system(size: 15.5, weight: .bold))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 2) {
                    ForEach(1...5, id: \.self) { count in
                        Icon(count <= (dot.stars ?? 0) ? .starFill : .star, size: 16, strokeWidth: 2, color: .white)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(dot.stars ?? 0) of 5")
            }
        case .link:
            if let url = Self.openable(dot.url) {
                Button { openURL(url) } label: {
                    HStack(spacing: Spacing.s2) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Self.title(dot, url))
                                .font(.system(size: 15.5, weight: .bold))
                                .foregroundStyle(.white)
                                .lineLimit(2)
                            Text(url.host() ?? "")
                                .font(.system(size: 13))
                                .foregroundStyle(Color.white.opacity(0.75))
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        Icon(.externalLink, size: 16, strokeWidth: 2.2, color: .white)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens \(url.host() ?? "the site")")
                .accessibilityIdentifier("moments.viewer.dot.open")
            }
        case .thing, .whisper, .unknown:
            EmptyView()
        }
    }

    /// A link a tap may open: https or http only, never another scheme.
    static func openable(_ typed: String?) -> URL? {
        guard let typed, let url = URL(string: typed), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              url.host() != nil else { return nil }
        return url
    }

    static func title(_ dot: MomentDotDTO, _ url: URL) -> String {
        let title = dot.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return title.isEmpty ? url.host() ?? "Link" : title
    }

    /// What VoiceOver reads for a dot before it's opened.
    static func spoken(_ dot: MomentDotDTO) -> String {
        switch dot.kind {
        case .note: "A note"
        case .rating: "\(dot.label ?? "A rating"): \(dot.stars ?? 0) of 5"
        case .link: openable(dot.url).map { title(dot, $0) } ?? "A link"
        case .thing: dot.label.map { "What is this: \($0)?" } ?? "What is this?"
        case .whisper: "A whisper"
        case .unknown: "A dot"
        }
    }

    private func remove() async {
        removing = true
        problem = nil
        defer { removing = false }
        do {
            try await StudioPlayAPI.send(StudioPlayEndpoints.removeDot(postId: moment.id, dot: dot.id))
            prompt.removed.insert("\(moment.id)/\(dot.id)")
            prompt.open = nil
        } catch let failure as StudioPlayFailure {
            problem = failure.message("Couldn't remove it. Try again.")
        } catch {
            problem = "Couldn't remove it. Try again."
        }
    }
}
