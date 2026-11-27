//
//  MomentsStudioMentions.swift
//  Pantopus
//
//  Mentions in the Studio's caption ("Pulse, reinvented" phase 0 step 5; CONTRACT 7h). Typing "@" offers the author's
//  connections; picking one writes "@First Last " in the caption, which stays plain words, so today's screens and the
//  apps in the stores show it as written. The ids go beside it (`mentions`, up to five), only for the people whose
//  "@Name" is still in the caption at Post. The server keeps only connections who may see the Moment. Never under a
//  made-up name: a mention says who the author knows. Nobody is told for now (no notice kind fits; CONTRACT 7h).
//

import Observation
import SwiftUI

/// Someone picked after "@".
struct MomentsStudioMention: Hashable {
    let id: String
    let name: String
}

/// The author's connections, read once while the Studio is open, for the "@" picker.
@Observable
@MainActor
final class MomentsStudioConnections {
    enum Reading: Equatable {
        case idle, reading, read, failed
    }

    static let shared = MomentsStudioConnections()

    private(set) var reading = Reading.idle
    private(set) var people: [MomentsStudioMention] = []
    private var account: String?

    /// Reads them the first time "@" is typed (again for another account, or after a failure).
    func readIfNeeded() async {
        let current = MomentsComposerModel.account
        if account != current { (reading, people, account) = (.idle, [], current) }
        guard reading == .idle || reading == .failed else { return }
        reading = .reading
        do {
            let response: RelationshipsListResponse = try await APIClient.shared.request(
                RelationshipsEndpoints.list(status: "accepted", limit: 200)
            )
            var seen = Set<String>()
            people = response.relationships.compactMap { relationship in
                guard let user = relationship.otherUser, seen.insert(user.id).inserted else { return nil }
                let name = Self.name(user)
                return name.isEmpty ? nil : MomentsStudioMention(id: user.id, name: name)
            }
            reading = .read
        } catch {
            reading = .failed
        }
    }

    private static func name(_ user: RelationshipUserDTO) -> String {
        let full = user.name ?? [user.firstName, user.lastName].compactMap { $0 }.joined(separator: " ")
        let named = full.isEmpty ? user.username ?? "" : full
        return named.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
}

extension MomentsComposerModel {
    /// Up to five people in one post.
    static let mentionLimit = 5

    /// Mentions are offered under the person's own name only.
    var offersMentions: Bool {
        !postsUnderMadeUpName && draft != nil && draft != .text
    }

    /// The "@name" being typed at the end of the caption (letters, spaces, dots, apostrophes and dashes, up to 30).
    var typingMention: String? {
        guard offersMentions, let at = caption.lastIndex(of: "@") else { return nil }
        if at != caption.startIndex, !caption[caption.index(before: at)].isWhitespace { return nil }
        let query = caption[caption.index(after: at)...]
        guard query.count <= 30, query.allSatisfy({ $0.isLetter || $0 == " " || $0 == "." || $0 == "'" || $0 == "-" }) else {
            return nil
        }
        // A name already picked and followed by its space is finished, and so is what comes after it.
        if marking.studio?.mentioned.contains(where: { query.hasPrefix("\($0.name) ") }) == true { return nil }
        return String(query)
    }

    /// Writes "@Name " in place of what was typed after the last "@".
    func pickMention(_ person: MomentsStudioMention) {
        guard let at = caption.lastIndex(of: "@") else { return }
        caption = String(caption[..<at]) + "@\(person.name) "
        if marking.studio == nil { marking.studio = MomentsStudioTools() }
        if marking.studio?.mentioned.contains(person) == false { marking.studio?.mentioned.append(person) }
    }

    /// The ids that go out: the people picked whose "@Name" is still in `caption`, in the order picked, up to five.
    func studioMentions(in caption: String) -> [String]? {
        guard offersMentions, let picked = marking.studio?.mentioned, !picked.isEmpty else { return nil }
        var ids: [String] = []
        for person in picked where caption.contains("@\(person.name)") && !ids.contains(person.id) {
            ids.append(person.id)
        }
        return ids.isEmpty ? nil : Array(ids.prefix(Self.mentionLimit))
    }
}

/// Over the caption while an "@name" is being typed: the matching connections; a tap writes the name in.
struct MomentsStudioMentionPicker: View {
    let model: MomentsComposerModel
    let query: String
    private let connections = MomentsStudioConnections.shared

    private var matches: [MomentsStudioMention] {
        let typed = query.trimmingCharacters(in: .whitespaces).lowercased()
        let found = connections.people.filter { person in
            let name = person.name.lowercased()
            return typed.isEmpty || name.hasPrefix(typed) || name.split(separator: " ").contains { $0.hasPrefix(typed) }
        }
        return Array(found.prefix(6))
    }

    private var full: Bool {
        (model.studioMentions(in: model.caption)?.count ?? 0) >= MomentsComposerModel.mentionLimit
    }

    var body: some View {
        Group {
            if full {
                note("Up to \(MomentsComposerModel.mentionLimit) people in one post.")
            } else if connections.reading == .reading || connections.reading == .idle {
                note("Reading your connections…")
            } else if connections.reading == .failed {
                note("Couldn't read your connections. Type on, or try again later.")
            } else if matches.isEmpty {
                note(query.isEmpty ? "None of your connections yet." : "None of your connections by that name.")
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.s2) {
                        ForEach(matches, id: \.id) { person in chip(person) }
                    }
                }
            }
        }
        .task { await connections.readIfNeeded() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Mention someone you're connected with")
        .accessibilityIdentifier("moments.studio.mentions")
    }

    private func chip(_ person: MomentsStudioMention) -> some View {
        Button { model.pickMention(person) } label: {
            HStack(spacing: 6) {
                Text(String(person.name.prefix(1)))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(Theme.Color.primarySolid))
                Text(person.name)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
            .padding(.leading, 6)
            .padding(.trailing, 12)
            .frame(height: 38)
            .background(Capsule().fill(Color.black.opacity(0.62)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        // The caption keeps its keyboard: the tap writes the name and typing goes on.
        .keepsKeyboardOnTap()
        .accessibilityLabel("Mention \(person.name)")
        .accessibilityIdentifier("moments.studio.mention.\(person.id)")
    }

    private func note(_ words: String) -> some View {
        Text(words)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Capsule().fill(Color.black.opacity(0.62)))
    }
}
