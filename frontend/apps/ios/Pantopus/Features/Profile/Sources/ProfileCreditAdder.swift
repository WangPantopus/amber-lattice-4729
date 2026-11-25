//
//  ProfileCreditAdder.swift
//  Pantopus
//
//  "Who was on it?" in the piece editor (board 10; CONTRACT P2.5): your own part, each person named with their status,
//  and "Add a person and ask them to sign": someone suggested (the person who hired you), one of your connections,
//  or a typed name (Said, never asked). Pushed inside the editor's own stack.
//

import SwiftUI

// MARK: - The editor's section

struct ProfileEditorCredits: View {
    @Bindable var model: ProfilePieceEditorModel
    let onAdd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Text("Who was on it?").scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text("Your part").scaledFont(13, weight: .semibold).foregroundStyle(Theme.Color.appTextSecondary)
                TextField("Lead carpenter", text: $model.ownerRole)
                    .submitLabel(.done)
                    .onChange(of: model.ownerRole) { _, value in
                        if value.count > 40 { model.ownerRole = String(value.prefix(40)) }
                    }
                    .profileEditorBox()
            }
            VStack(spacing: Spacing.s0) {
                ForEach(model.credits) { credit in
                    row(credit)
                    ProfileRowDivider(inset: 0)
                }
                Button(action: onAdd) {
                    HStack(spacing: Spacing.s2) {
                        Icon(.plus, size: 18, color: Theme.Color.primary600)
                        Text("Add a person and ask them to sign")
                            .scaledFont(15, weight: .semibold)
                            .foregroundStyle(Theme.Color.primary600)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, Spacing.s3)
                    .frame(minHeight: 52)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("profileAddCredit")
            }
            .background(Theme.Color.appSurface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
        }
    }

    private func row(_ credit: ProfileCreditDTO) -> some View {
        HStack(spacing: Spacing.s3) {
            ProfileCreditAvatar(
                name: credit.party.name,
                url: credit.party.portraitURL.flatMap(URL.init(string:)),
                typed: credit.party.typed
            )
            VStack(alignment: .leading, spacing: 2) {
                Text(credit.party.name ?? credit.party.did ?? "Someone")
                    .scaledFont(15, weight: .semibold)
                    .foregroundStyle(Theme.Color.appText)
                if let role = credit.role ?? ProfileCreditWords.relation(credit.relation, owner: "you") {
                    Text(role).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            status(credit)
            Menu {
                Button("Take them off", role: .destructive) { Task { await model.removeCredit(credit) } }
            } label: {
                Icon(.moreHorizontal, size: 18, color: Theme.Color.appTextSecondary).frame(width: 44, height: 44)
            }
            .accessibilityLabel("More for \(credit.party.name ?? "this name")")
        }
        .padding(.leading, Spacing.s3)
        .padding(.vertical, Spacing.s2)
        .accessibilityElement(children: .contain)
    }

    /// Board 10: "Signed" in green, "Asked today" in grey, a typed name "Said".
    @ViewBuilder
    private func status(_ credit: ProfileCreditDTO) -> some View {
        switch credit.status {
        case "signed":
            pill("Signed", fill: Theme.Color.successBg, ink: Theme.Color.success)
        case "asked":
            pill(credit.how ?? "Asked", fill: Theme.Color.appSurfaceSunken, ink: Theme.Color.appTextStrong)
        case "did_not_confirm", "declined":
            pill("Did not confirm", fill: Theme.Color.appSurfaceSunken, ink: Theme.Color.appTextSecondary)
        default:
            pill("Said", fill: Theme.Color.appSurfaceSunken, ink: Theme.Color.appTextSecondary)
        }
    }

    private func pill(_ text: String, fill: Color, ink: Color) -> some View {
        Text(text)
            .scaledFont(12, weight: .semibold)
            .foregroundStyle(ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(fill, in: Capsule())
    }
}

// MARK: - Adding a person

/// Pick who, then say what they did and how: a person is asked to sign; a typed name stays Said.
struct ProfileCreditAdder: View {
    let model: ProfilePieceEditorModel

    private struct Pick: Hashable {
        let userId: String?
        let name: String
        let portraitURL: String?
        let relation: String?
        let role: String?
    }

    @State private var search = ""
    @State private var connections: [RelationshipUserDTO] = []
    @State private var pick: Pick?
    @State private var role = ""
    @State private var relation = "with"
    @State private var working = false
    @State private var problem: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            if let pick {
                details(pick)
            } else {
                chooser
            }
        }
        .background(Theme.Color.appBg)
        .navigationTitle(pick == nil ? "Who was on it?" : "What they did")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            let answer: RelationshipsListResponse? = try? await APIClient.shared.request(
                RelationshipsEndpoints.list(status: "accepted", limit: 100)
            )
            connections = (answer?.relationships ?? []).compactMap(\.otherUser)
        }
    }

    private var credited: Set<String> {
        Set(model.credits.compactMap(\.party.userId))
    }

    private var chooser: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            TextField("A name", text: $search)
                .textInputAutocapitalization(.words)
                .submitLabel(.done)
                .profileEditorBox()
            let suggested = model.suggested.filter { !credited.contains($0.userId) && matches($0.name) }
            if !suggested.isEmpty {
                section("Suggested") {
                    ForEach(suggested) { person in
                        personRow(name: person.name, detail: person.why, portrait: person.portraitURL) {
                            choose(Pick(
                                userId: person.userId,
                                name: person.name,
                                portraitURL: person.portraitURL,
                                relation: person.relation,
                                role: person.role
                            ))
                        }
                    }
                }
            }
            let mine = connections.filter { !credited.contains($0.id) && matches(Self.name(of: $0)) }
            if !mine.isEmpty {
                section("Your connections") {
                    ForEach(mine) { person in
                        personRow(name: Self.name(of: person), detail: nil, portrait: person.profilePictureURL) {
                            choose(Pick(
                                userId: person.id,
                                name: Self.name(of: person),
                                portraitURL: person.profilePictureURL,
                                relation: nil,
                                role: nil
                            ))
                        }
                    }
                }
            }
            let typed = search.trimmingCharacters(in: .whitespacesAndNewlines)
            section("Not on Pantopus, or not connected") {
                if typed.isEmpty {
                    Text("Type their name above. A typed name shows as Said, and nobody is asked.")
                        .scaledFont(13)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .padding(Spacing.s3)
                } else {
                    personRow(name: "Add “\(typed)” as a name", detail: "Said: nobody is asked", portrait: nil, typed: true) {
                        choose(Pick(userId: nil, name: String(typed.prefix(60)), portraitURL: nil, relation: nil, role: nil))
                    }
                }
            }
        }
        .padding(Spacing.s4)
    }

    private func matches(_ name: String) -> Bool {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return query.isEmpty || name.localizedCaseInsensitiveContains(query)
    }

    private static func name(of person: RelationshipUserDTO) -> String {
        if let name = person.name, !name.isEmpty { return name }
        return [person.firstName, person.lastName].compactMap(\.self).joined(separator: " ")
    }

    private func choose(_ pick: Pick) {
        self.pick = pick
        role = pick.role ?? ""
        relation = pick.relation ?? "with"
    }

    private func details(_ pick: Pick) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            HStack(spacing: Spacing.s3) {
                ProfileCreditAvatar(name: pick.name, url: pick.portraitURL.flatMap(URL.init(string:)), typed: pick.userId == nil)
                Text(pick.name).scaledFont(17, weight: .semibold).foregroundStyle(Theme.Color.appText)
                Spacer(minLength: 0)
                Button("Change") { self.pick = nil }
                    .scaledFont(15)
                    .frame(minHeight: 44)
            }
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text("What they did").scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
                TextField("Carpenter", text: $role)
                    .submitLabel(.done)
                    .onChange(of: role) { _, value in if value.count > 40 { role = String(value.prefix(40)) } }
                    .profileEditorBox()
            }
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text("How you were together").scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
                Picker("How you were together", selection: $relation) {
                    ForEach(ProfileCreditWords.choices, id: \.key) { choice in
                        Text(choice.words).tag(choice.key)
                    }
                }
                .pickerStyle(.menu)
                .tint(Theme.Color.appText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .profileEditorBox()
            }
            Text(pick.userId == nil
                ? "A typed name shows as Said. On a page opened by a link it shows as what they did, never the name."
                : model.asksNeedWork
                ? "The piece goes on your Work, then \(pick.name) gets one notification and signs if it's right."
                : "\(pick.name) gets one notification and signs if it's right. Until then only you and they see it.")
                .scaledFont(13)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let problem {
                Text(problem).scaledFont(14).foregroundStyle(Theme.Color.error).fixedSize(horizontal: false, vertical: true)
            }
            PrimaryButton(
                title: pick.userId == nil ? "Add their name" : model.asksNeedWork ? "Add to Work and ask them" : "Ask them to sign",
                isLoading: working
            ) {
                working = true
                defer { working = false }
                problem = nil
                let added = await model.addCredit(
                    userId: pick.userId,
                    name: pick.userId == nil ? pick.name : nil,
                    role: role,
                    relation: relation
                )
                if added { dismiss() } else { problem = model.problem }
            }
        }
        .padding(Spacing.s4)
    }

    private func section(_ title: String, @ViewBuilder _ rows: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            ProfileBlockTitle(title: title).padding(.horizontal, 4)
            VStack(spacing: Spacing.s0) { rows() }
                .background(Theme.Color.appSurface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
        }
    }

    private func personRow(
        name: String,
        detail: String?,
        portrait: String?,
        typed: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: Spacing.s3) {
                ProfileCreditAvatar(name: typed ? nil : name, url: portrait.flatMap(URL.init(string:)), typed: typed)
                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .scaledFont(15, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.leading)
                    if let detail {
                        Text(detail).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
            }
            .padding(Spacing.s3)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
