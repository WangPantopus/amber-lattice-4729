//
//  ProfileCredits.swift
//  Pantopus
//
//  Credits (CONTRACT P2.5, boards 8 and 10): "Who was on it" on a piece, with the owner first and each credit's ink;
//  the signer's own two choices and "Take my name off" on a piece they signed; and "Asked of you" at the top of the
//  asked person's own Work, with "Sign" (and its two choices) and "Not me". Drawn only while the server sends them.
//

import SwiftUI

// MARK: - Who was on it (board 8)

struct ProfileWhoWasOnIt: View {
    let piece: ProfilePieceReadDTO.Piece
    let ownerName: String
    let ownerPortrait: URL?
    /// The piece is this page's person's ("This profile"); else it is another's, one this person signed ("Their piece").
    var onThisProfile = true
    var onOpenPerson: ((ProfileCreditDTO.Party) -> Void)?
    var onChanged: (() -> Void)?

    @State private var working = false
    @State private var confirmingRemove: ProfileCreditDTO?
    @State private var problem: String?

    var body: some View {
        ProfileBlockCard(padded: false) {
            ProfileBlockTitle(title: "Who was on it")
                .padding(.horizontal, Spacing.s4)
                .padding(.top, 14)
                .padding(.bottom, Spacing.s1)
            ownerRow
            ForEach(piece.credits) { credit in
                ProfileRowDivider()
                row(credit)
                if let mine = credit.mine {
                    ProfileMyCreditChoices(
                        credit: credit,
                        mine: mine,
                        working: $working,
                        problem: $problem,
                        onRemove: { confirmingRemove = credit },
                        onChanged: { onChanged?() }
                    )
                }
            }
            if let keptOnce = piece.keptOnce {
                ProfileRowDivider()
                Text(keptOnce)
                    .scaledFont(13)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Spacing.s4)
                    .padding(.vertical, Spacing.s3)
            }
            if let problem {
                Text(problem).scaledFont(13).foregroundStyle(Theme.Color.error).padding(Spacing.s4)
            }
        }
        .confirmationDialog(
            "Take your name off this piece?",
            isPresented: Binding(get: { confirmingRemove != nil }, set: { if !$0 { confirmingRemove = nil } }),
            titleVisibility: .visible
        ) {
            Button("Take my name off", role: .destructive) {
                guard let credit = confirmingRemove else { return }
                Task { await takeNameOff(credit) }
            }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text("It leaves this piece, your own Work and the circle at once.")
        }
    }

    private func takeNameOff(_ credit: ProfileCreditDTO) async {
        working = true
        defer { working = false }
        do {
            _ = try await APIClient.shared.request(ProfilePageEndpoints.removeTie(id: credit.id), as: EmptyResponse.self)
            NotificationCenter.default.post(name: .profilePiecesChanged, object: nil)
            onChanged?()
        } catch {
            problem = ProfilePieceEditorModel.sentence(error, otherwise: "Couldn't take your name off. Try again.")
        }
    }

    private var ownerRow: some View {
        HStack(spacing: Spacing.s3) {
            ProfileCreditAvatar(name: ownerName, url: ownerPortrait)
            VStack(alignment: .leading, spacing: 2) {
                Text(ownerName).scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
                if let role = piece.ownerRole {
                    Text(role).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(onThisProfile ? "This profile" : "Their piece").scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s3)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func row(_ credit: ProfileCreditDTO) -> some View {
        let name = credit.party.name ?? credit.party.did ?? "Someone"
        let content = HStack(spacing: Spacing.s3) {
            ProfileCreditAvatar(
                name: credit.party.name,
                url: credit.party.portraitURL.flatMap(URL.init(string:)),
                typed: credit.party.typed
            )
            VStack(alignment: .leading, spacing: 2) {
                Text(name).scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
                if let role = credit.role ?? ProfileCreditWords.relation(credit.relation, owner: ownerName) {
                    Text(role).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            ProfileCreditStatus(credit: credit)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s3)
        .contentShape(Rectangle())
        if credit.party.userId != nil || credit.party.username != nil, let onOpenPerson {
            Button { onOpenPerson(credit.party) } label: { content }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
        } else {
            content.accessibilityElement(children: .combine)
        }
    }
}

/// The words for a credit's relation, when it has no role of its own.
enum ProfileCreditWords {
    /// "Hired Maria", "Someone Maria led", "Taught Maria" (the server's words for these relations).
    static func relation(_ relation: String?, owner: String) -> String? {
        let first = owner.split(separator: " ").first.map(String.init) ?? owner
        switch relation {
        case "led": return "Someone \(first) led"
        case "learned_from": return "Taught \(first)"
        case "for": return "Hired \(first)"
        default: return nil
        }
    }

    /// The owner's choice when naming someone, in the owner's own voice.
    static let choices: [(key: String, words: String)] = [
        ("with", "Worked with me"),
        ("led", "I led them"),
        ("learned_from", "I learned from them"),
        ("for", "Hired me")
    ]
}

/// "◉ Signed", "◌ Said", or for the owner "Asked today" / "Did not confirm".
private struct ProfileCreditStatus: View {
    let credit: ProfileCreditDTO

    var body: some View {
        switch credit.status {
        case "asked":
            pill(credit.how ?? "Asked", ink: Theme.Color.appTextStrong)
        case "did_not_confirm", "declined":
            pill("Did not confirm", ink: Theme.Color.appTextSecondary)
        default:
            let ink = ProfileInk(rawValue: credit.ink) ?? .said
            HStack(spacing: 5) {
                ProfileInkGlyph(ink: ink, size: 9)
                Text(ink.word).scaledFont(13).foregroundStyle(Theme.Color.appTextStrong)
            }
        }
    }

    private func pill(_ text: String, ink: Color) -> some View {
        Text(text)
            .scaledFont(12, weight: .semibold)
            .foregroundStyle(ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Theme.Color.appSurfaceSunken, in: Capsule())
    }
}

/// A person's small round picture, their initials, or a typed name's dotted ring.
struct ProfileCreditAvatar: View {
    let name: String?
    let url: URL?
    var typed = false

    private var initials: String {
        (name ?? "").split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    var body: some View {
        ZStack {
            Circle().fill(Theme.Color.appSurfaceSunken)
            if let url {
                CachedAsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                }
                .clipShape(Circle())
            } else {
                Text(initials.isEmpty ? "·" : initials).scaledFont(13, weight: .semibold).foregroundStyle(Theme.Color.appTextStrong)
            }
            if typed {
                Circle().strokeBorder(Theme.Color.appTextSecondary, style: StrokeStyle(lineWidth: 1.2, dash: [2, 2.5]))
            }
        }
        .frame(width: 40, height: 40)
        .accessibilityHidden(true)
    }
}

/// On a piece the viewer signed: their two choices and "Take my name off" (p2.7).
private struct ProfileMyCreditChoices: View {
    let credit: ProfileCreditDTO
    let mine: ProfileCreditDTO.Mine
    @Binding var working: Bool
    @Binding var problem: String?
    let onRemove: () -> Void
    let onChanged: () -> Void

    @State private var onMyWork: Bool
    @State private var nameOnLinks: Bool

    init(
        credit: ProfileCreditDTO,
        mine: ProfileCreditDTO.Mine,
        working: Binding<Bool>,
        problem: Binding<String?>,
        onRemove: @escaping () -> Void,
        onChanged: @escaping () -> Void
    ) {
        self.credit = credit
        self.mine = mine
        _working = working
        _problem = problem
        self.onRemove = onRemove
        self.onChanged = onChanged
        _onMyWork = State(initialValue: mine.showOnMyWork)
        _nameOnLinks = State(initialValue: mine.showNameOnLinks)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s1) {
            Toggle("Show this piece on my Work", isOn: $onMyWork)
                .frame(minHeight: 44)
                .onChange(of: onMyWork) { _, value in save(ProfileTieChoicesBody(showOnMyWork: value, showNameOnLinks: nil)) }
            Toggle("Show my name on pages opened by a link", isOn: $nameOnLinks)
                .frame(minHeight: 44)
                .onChange(of: nameOnLinks) { _, value in save(ProfileTieChoicesBody(showOnMyWork: nil, showNameOnLinks: value)) }
            Button("Take my name off", role: .destructive, action: onRemove)
                .scaledFont(15, weight: .semibold)
                .frame(minHeight: 44)
                .disabled(working)
        }
        .scaledFont(15)
        .tint(Theme.Color.primary600)
        .padding(.horizontal, Spacing.s4)
        .padding(.bottom, Spacing.s2)
    }

    private func save(_ choices: ProfileTieChoicesBody) {
        Task {
            working = true
            defer { working = false }
            do {
                _ = try await APIClient.shared.request(ProfilePageEndpoints.updateTie(id: credit.id, choices), as: EmptyResponse.self)
                onChanged()
            } catch {
                problem = ProfilePieceEditorModel.sentence(error, otherwise: "Couldn't change that. Try again.")
                onMyWork = mine.showOnMyWork
                nameOnLinks = mine.showNameOnLinks
            }
        }
    }
}

// MARK: - Asked of you

/// At the top of the asked person's own Work: each ask, with "Sign" (then its two choices) and "Not me".
struct ProfileAskedOfYou: View {
    let asks: [ProfileAskDTO]
    let model: ProfilePageModel
    var onOpenPiece: ((ProfileAskDTO) -> Void)?

    var body: some View {
        ProfileBlockCard(padded: false) {
            ProfileBlockTitle(title: "Asked of you")
                .padding(.horizontal, Spacing.s4)
                .padding(.top, 14)
                .padding(.bottom, Spacing.s1)
            ForEach(Array(asks.enumerated()), id: \.element.id) { index, ask in
                if index > 0 { ProfileRowDivider() }
                ProfileAskRow(ask: ask, model: model, onOpenPiece: onOpenPiece)
            }
        }
        .accessibilityIdentifier("profileAskedOfYou")
    }
}

private struct ProfileAskRow: View {
    let ask: ProfileAskDTO
    let model: ProfilePageModel
    var onOpenPiece: ((ProfileAskDTO) -> Void)?

    @State private var signing = false
    @State private var onMyWork = true
    @State private var nameOnLinks = false
    @State private var working = false
    @State private var problem: String?

    private var what: String {
        if ask.kind == "role" {
            let place = ask.business?.name.map { " at \($0)" } ?? ""
            return [ask.role.map { $0 + place }, ask.when].compactMap(\.self).joined(separator: ", ")
        }
        let piece = ask.piece.map { "“\($0.title)”" } ?? "a piece"
        return ask.role.map { "\(piece), as \($0)" } ?? piece
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            HStack(alignment: .top, spacing: Spacing.s3) {
                ProfileCreditAvatar(name: ask.from.name, url: ask.from.portraitURL.flatMap(URL.init(string:)))
                VStack(alignment: .leading, spacing: 3) {
                    Text(ask.kind == "role" ? "\(ask.from.name) asks you to sign their role" : "\(ask.from.name) named you on their work")
                        .scaledFont(15, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(what)
                        .scaledFont(14)
                        .foregroundStyle(Theme.Color.appTextStrong)
                        .fixedSize(horizontal: false, vertical: true)
                    if ask.piece != nil, let onOpenPiece {
                        Button("See the piece") { onOpenPiece(ask) }
                            .scaledFont(14, weight: .semibold)
                            .frame(minHeight: 44)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            choices
            if let problem {
                Text(problem).scaledFont(13).foregroundStyle(Theme.Color.error)
            }
        }
        .padding(Spacing.s4)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder private var choices: some View {
        if signing {
            VStack(alignment: .leading, spacing: Spacing.s1) {
                if ask.kind != "role" {
                    Toggle("Show this piece on my Work too", isOn: $onMyWork).frame(minHeight: 44)
                    Toggle("Show my name on pages opened by a link", isOn: $nameOnLinks).frame(minHeight: 44)
                }
                HStack(spacing: Spacing.s2) {
                    PrimaryButton(title: "Sign", isLoading: working) { await sign() }
                    PantopusButton(title: "Back", kind: .ghost) { signing = false }
                }
            }
            .scaledFont(15)
            .tint(Theme.Color.primary600)
        } else {
            HStack(spacing: Spacing.s2) {
                PrimaryButton(title: "Sign") { signing = true }
                PantopusButton(title: "Not me", kind: .ghost, isLoading: working) { await decline() }
            }
        }
    }

    private func sign() async {
        working = true
        defer { working = false }
        do {
            let choices = ProfileTieChoicesBody(
                showOnMyWork: ask.kind == "role" ? nil : onMyWork,
                showNameOnLinks: ask.kind == "role" ? nil : nameOnLinks
            )
            _ = try await APIClient.shared.request(ProfilePageEndpoints.signAsk(id: ask.id, choices), as: EmptyResponse.self)
            await model.reloadAsks()
        } catch {
            problem = ProfilePieceEditorModel.sentence(error, otherwise: "Couldn't sign. Try again.")
        }
    }

    private func decline() async {
        working = true
        defer { working = false }
        do {
            _ = try await APIClient.shared.request(ProfilePageEndpoints.declineAsk(id: ask.id), as: EmptyResponse.self)
            await model.reloadAsks()
        } catch {
            problem = ProfilePieceEditorModel.sentence(error, otherwise: "Couldn't answer. Try again.")
        }
    }
}
