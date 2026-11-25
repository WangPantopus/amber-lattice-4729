//
//  ProfileRoleEditor.swift
//  Pantopus
//
//  Adding and changing a role or school for "Worked and learned" (CONTRACT P2.6, in board 10's form shape): what it
//  was, whether you worked or learned there, where (a business on Pantopus, which is asked to confirm it, or a typed
//  name, which stays Said), and from when to when or now. Pushed, never presented from a cover. Only while the
//  server's ties are on.
//

import SwiftUI

public enum ProfileRoleEditorStart: Hashable, Sendable {
    case new
    case change(ProfileRoleFieldsDTO)
}

@Observable
@MainActor
final class ProfileRoleEditorModel {
    struct Business: Hashable, Identifiable {
        let id: String
        let name: String
        let pictureURL: String?
    }

    static let titleMost = 40
    static let nameMost = 60

    let start: ProfileRoleEditorStart
    var title = ""
    var relation = "worked"
    var search = ""
    var business: Business?
    var typedName: String?
    var fromMonth: Int?
    var fromYear: Int?
    var toMonth: Int?
    var toYear: Int?
    var isNow = true
    private(set) var results: [Business] = []
    private(set) var saving = false
    var problem: String?

    @ObservationIgnored private var searching: Task<Void, Never>?

    init(start: ProfileRoleEditorStart) {
        self.start = start
        if case let .change(role) = start {
            title = role.title
            relation = role.relation
            (fromYear, fromMonth) = Self.split(role.from)
            (toYear, toMonth) = Self.split(role.to)
            isNow = role.to == nil
        }
    }

    var isNew: Bool {
        if case .new = start { return true }
        return false
    }

    var existing: ProfileRoleFieldsDTO? {
        if case let .change(role) = start { return role }
        return nil
    }

    var hasPlace: Bool {
        !isNew || business != nil || typedName != nil
    }

    var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && hasPlace && fromMonth != nil && fromYear != nil
            && (isNow || (toMonth != nil && toYear != nil)) && !saving
    }

    private static func split(_ month: String?) -> (Int?, Int?) {
        let bits = (month ?? "").split(separator: "-").compactMap { Int($0) }
        return bits.count == 2 ? (bits[0], bits[1]) : (nil, nil)
    }

    private static func month(_ year: Int?, _ month: Int?) -> String? {
        guard let year, let month else { return nil }
        return String(format: "%04d-%02d", year, month)
    }

    /// Businesses on Pantopus that match the words typed, a moment after the last key.
    func find() {
        searching?.cancel()
        let words = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard words.count >= 2 else {
            results = []
            return
        }
        searching = Task {
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            let answer: BusinessDiscoverySearchResponse? = try? await APIClient.shared.request(
                BusinessDiscoveryEndpoints.search(q: words, pageSize: 8)
            )
            guard !Task.isCancelled else { return }
            results = (answer?.results ?? []).map { Business(id: $0.businessUserId, name: $0.name, pictureURL: $0.profilePictureUrl) }
        }
    }

    func save() async -> Bool {
        guard canSave, let from = Self.month(fromYear, fromMonth) else { return false }
        saving = true
        problem = nil
        defer { saving = false }
        let trimmed = String(title.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.titleMost))
        var place: [String: String]?
        if isNew {
            if let business { place = ["business_user_id": business.id] }
            if let typedName { place = ["name": String(typedName.prefix(Self.nameMost))] }
        }
        let body = ProfileRoleBody(
            title: trimmed,
            relation: relation,
            from: from,
            to: isNow ? nil : Self.month(toYear, toMonth),
            place: place
        )
        do {
            if let existing {
                _ = try await APIClient.shared.request(ProfilePageEndpoints.updateRole(id: existing.id, body), as: EmptyResponse.self)
            } else {
                _ = try await APIClient.shared.request(ProfilePageEndpoints.createRole(body), as: EmptyResponse.self)
            }
            NotificationCenter.default.post(name: .profilePiecesChanged, object: nil)
            return true
        } catch {
            problem = ProfilePieceEditorModel.sentence(error, otherwise: "Couldn't save that. Try again.")
            return false
        }
    }

    func remove() async -> Bool {
        guard let existing else { return true }
        do {
            _ = try await APIClient.shared.request(ProfilePageEndpoints.deleteRole(id: existing.id), as: EmptyResponse.self)
            NotificationCenter.default.post(name: .profilePiecesChanged, object: nil)
            return true
        } catch {
            problem = ProfilePieceEditorModel.sentence(error, otherwise: "Couldn't remove that. Try again.")
            return false
        }
    }
}

struct ProfileRoleEditor: View {
    let onFinished: () -> Void

    @State private var model: ProfileRoleEditorModel
    @State private var confirmingRemove = false

    init(start: ProfileRoleEditorStart, onFinished: @escaping () -> Void) {
        _model = State(initialValue: ProfileRoleEditorModel(start: start))
        self.onFinished = onFinished
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s5) {
                label("What was it?", counter: "\(model.title.count) of \(ProfileRoleEditorModel.titleMost)") {
                    TextField("Apprentice carpenter", text: $model.title)
                        .submitLabel(.done)
                        .onChange(of: model.title) { _, value in
                            if value.count > ProfileRoleEditorModel.titleMost {
                                model.title = String(value.prefix(ProfileRoleEditorModel.titleMost))
                            }
                        }
                        .profileEditorBox()
                }
                label("You") {
                    Picker("You", selection: $model.relation) {
                        Text("Worked there").tag("worked")
                        Text("Learned there").tag("learned")
                    }
                    .pickerStyle(.segmented)
                }
                ProfileRolePlace(model: model)
                ProfileRoleMonths(model: model)
                if let problem = model.problem {
                    Text(problem)
                        .scaledFont(14)
                        .foregroundStyle(Theme.Color.error)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !model.isNew {
                    PantopusButton(title: "Remove", kind: .destructive) { confirmingRemove = true }
                }
            }
            .padding(Spacing.s4)
        }
        .background(Theme.Color.appBg)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            PrimaryButton(title: model.isNew ? "Add" : "Save changes", isLoading: model.saving, isEnabled: model.canSave) {
                if await model.save() { onFinished() }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.vertical, Spacing.s3)
            .background(Theme.Color.appBg)
        }
        .navigationTitle(model.isNew ? "Where you worked or learned" : "Change it")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Remove this?", isPresented: $confirmingRemove, titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                Task { if await model.remove() { onFinished() } }
            }
            Button("Keep it", role: .cancel) {}
        }
        .accessibilityIdentifier("profileRoleEditor")
    }

    private func label(_ text: String, counter: String? = nil, @ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack(alignment: .firstTextBaseline) {
                Text(text).scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
                Spacer()
                if let counter {
                    Text(counter).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            content()
        }
    }
}

/// Where: a business on Pantopus found by name (asked to confirm), or a typed name (Said). Fixed once added.
private struct ProfileRolePlace: View {
    @Bindable var model: ProfileRoleEditorModel

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("Where").scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
            if let existing = model.existing {
                Text(existing.place?.name ?? "A place")
                    .scaledFont(15)
                    .foregroundStyle(Theme.Color.appText)
                    .profileEditorBox()
                Text("To change the place, remove this and add it again.")
                    .scaledFont(12)
                    .foregroundStyle(Theme.Color.appTextSecondary)
            } else if let business = model.business {
                chosen(business.name, detail: "A business on Pantopus: it is asked to confirm it.")
            } else if let typed = model.typedName {
                chosen(typed, detail: "A typed name shows as Said.")
            } else {
                TextField("A business on Pantopus, or a name", text: $model.search)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.done)
                    .onChange(of: model.search) { _, _ in model.find() }
                    .profileEditorBox()
                VStack(spacing: Spacing.s0) {
                    ForEach(model.results) { business in
                        row(business.name, detail: "On Pantopus") { model.business = business }
                        ProfileRowDivider(inset: 0)
                    }
                    let typed = model.search.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !typed.isEmpty {
                        row("Use “\(typed)” as the name", detail: "Said: nobody is asked") {
                            model.typedName = String(typed.prefix(ProfileRoleEditorModel.nameMost))
                        }
                    }
                }
            }
        }
    }

    private func chosen(_ name: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s1) {
            HStack {
                Text(name).scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
                Spacer(minLength: Spacing.s2)
                Button("Change") {
                    model.business = nil
                    model.typedName = nil
                }
                .scaledFont(15)
                .frame(minHeight: 44)
            }
            .profileEditorBox()
            Text(detail).scaledFont(12).foregroundStyle(Theme.Color.appTextSecondary)
        }
    }

    private func row(_ title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .scaledFont(15, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.leading)
                    Text(detail).scaledFont(12).foregroundStyle(Theme.Color.appTextSecondary)
                }
                Spacer(minLength: 0)
                Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
            }
            .padding(.vertical, Spacing.s2)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// From (a month and a year) and to (a month and a year, or now).
private struct ProfileRoleMonths: View {
    @Bindable var model: ProfileRoleEditorModel

    private static let names = Calendar.current.standaloneMonthSymbols

    private var years: [Int] {
        let now = Calendar.current.component(.year, from: Date())
        return Array((now - 70)...now).reversed()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            field("From", month: $model.fromMonth, year: $model.fromYear)
            Toggle("I'm still there", isOn: $model.isNow)
                .scaledFont(15)
                .tint(Theme.Color.primary600)
                .frame(minHeight: 44)
            if !model.isNow {
                field("To", month: $model.toMonth, year: $model.toYear)
            }
        }
    }

    private func field(_ label: String, month: Binding<Int?>, year: Binding<Int?>) -> some View {
        let words = month.wrappedValue.flatMap { m in year.wrappedValue.map { "\(Self.names[m - 1]) \(String($0))" } }
        return VStack(alignment: .leading, spacing: Spacing.s2) {
            Text(label).scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
            Menu {
                Picker("Month", selection: month) {
                    ForEach(1...12, id: \.self) { Text(Self.names[$0 - 1]).tag(Int?.some($0)) }
                }
                .pickerStyle(.menu)
                Picker("Year", selection: year) {
                    ForEach(years, id: \.self) { Text(verbatim: String($0)).tag(Int?.some($0)) }
                }
                .pickerStyle(.menu)
            } label: {
                HStack {
                    Text(words ?? "Month and year")
                        .scaledFont(16)
                        .foregroundStyle(words == nil ? Theme.Color.appTextMuted : Theme.Color.appText)
                    Spacer(minLength: Spacing.s2)
                    Icon(.chevronDown, size: 16, color: Theme.Color.appTextSecondary)
                }
                .profileEditorBox()
                .contentShape(Rectangle())
            }
            .accessibilityLabel("\(label), \(words ?? "not set")")
            .onChange(of: month.wrappedValue) { _, value in
                if value != nil, year.wrappedValue == nil { year.wrappedValue = Calendar.current.component(.year, from: Date()) }
            }
        }
    }
}

// MARK: - The owner's "Worked and learned"

/// Your own roles and schools: each line as it shows (its ink and how we know it), a tap to change it, and a way to
/// add one. With none yet, just the way to add one.
struct ProfileOwnerRolesBlock: View {
    let title: String?
    let lines: [ProfilePageLineDTO]
    let onEdit: (ProfileRoleEditorStart) -> Void

    var body: some View {
        ProfileBlockCard(padded: false) {
            ProfileBlockTitle(title: title ?? "Worked and learned")
                .padding(.horizontal, Spacing.s4)
                .padding(.top, 14)
                .padding(.bottom, Spacing.s1)
            ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                if let role = line.role {
                    Button { onEdit(.change(role)) } label: {
                        ProfileInkLineView(line: line.sourceLine(at: index))
                            .padding(.horizontal, Spacing.s4)
                            .padding(.vertical, Spacing.s3)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Changes it")
                } else {
                    ProfileInkLineView(line: line.sourceLine(at: index))
                        .padding(.horizontal, Spacing.s4)
                        .padding(.vertical, Spacing.s3)
                }
                ProfileRowDivider()
            }
            ProfileTileRow(
                tile: ProfileTile(icon: .plus, tint: .work),
                title: "Add where you worked or learned",
                detail: "A business on Pantopus confirms it; a typed place stays Said"
            ) { onEdit(.new) }
                .accessibilityIdentifier("profileAddRole")
        }
    }
}
