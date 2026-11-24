//
//  ProfileShareSheet.swift
//  Pantopus
//
//  "Share your profile" with its parts (board 21, CONTRACT.md §6): the main
//  link with Copy link, Send (the system share sheet, as today) and Show code,
//  then a switch for each part a link shows. On means anyone with the link; off
//  means people signed in to Pantopus. A part that is off simply isn't on the
//  link. Each switch saves at once. A made-up username is never shared: the
//  username prompt comes first. Links for one purpose wait for their phase.
//

import CoreImage.CIFilterBuiltins
import Observation
import SwiftUI

@Observable
@MainActor
final class ProfileShareModel {
    enum State: Equatable {
        case loading
        case loaded(ProfileShareDTO)
        case failed
    }

    private(set) var state: State = .loading
    /// A part whose save is on its way: its switch waits.
    private(set) var saving: Set<String> = []
    var toast: String?

    /// Each part's setting as first read, so switching one off again goes back to what it was (never wider).
    @ObservationIgnored private var firstSettings: [String: String] = [:]
    @ObservationIgnored private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    var share: ProfileShareDTO? {
        if case let .loaded(share) = state { return share }
        return nil
    }

    func load() async {
        do {
            let share: ProfileShareDTO = try await client.request(ProfilePageEndpoints.share)
            for part in share.parts where firstSettings[part.key] == nil {
                firstSettings[part.key] = part.setting
            }
            state = .loaded(share)
        } catch {
            if case .loaded = state { return }
            state = .failed
        }
    }

    func isOn(_ key: String) -> Bool {
        share?.parts.first { $0.key == key }?.setting == "anyone"
    }

    /// On: anyone with the link. Off: back to what it was when first read, or people signed in to Pantopus.
    func set(_ key: String, on: Bool) async {
        guard !saving.contains(key) else { return }
        let setting = if on {
            "anyone"
        } else if let first = firstSettings[key], first != "anyone" {
            first
        } else {
            "members"
        }
        await save(key: key, parts: [key: setting], searchEngines: nil)
    }

    func setLinksEnabled(_ on: Bool) async {
        saving.insert("links_enabled")
        defer { saving.remove("links_enabled") }
        do {
            let share: ProfileShareDTO = try await client.request(ProfilePageEndpoints.setLinksEnabled(on))
            state = .loaded(share)
        } catch {
            toast = "Couldn't save that. Try again."
        }
    }

    /// Makes a link; the server's sentence when it can't (ten working links at most).
    func createLink(_ body: ProfileShareLinkBody) async -> String? {
        do {
            _ = try await client.request(ProfilePageEndpoints.createLink(body), as: ProfileShareLinkDTO.self)
            await load()
            return nil
        } catch {
            return Self.sentence(error)
        }
    }

    func updateLink(_ id: String, _ body: ProfileShareLinkBody) async -> String? {
        do {
            _ = try await client.request(ProfilePageEndpoints.updateLink(id: id, body), as: ProfileShareLinkDTO.self)
            await load()
            return nil
        } catch {
            return Self.sentence(error)
        }
    }

    func deleteLink(_ id: String) async -> Bool {
        do {
            _ = try await client.request(ProfilePageEndpoints.deleteLink(id: id), as: EmptyResponse.self)
            await load()
            return true
        } catch {
            toast = "Couldn't delete that link. Try again."
            return false
        }
    }

    private static func sentence(_ error: any Error) -> String {
        if case let APIError.clientError(_, message?) = error, !message.isEmpty { return message }
        return "Couldn't save that. Try again."
    }

    func setSearchEngines(_ on: Bool) async {
        await save(key: "search_engines", parts: nil, searchEngines: on)
    }

    private func save(key: String, parts: [String: String]?, searchEngines: Bool?) async {
        saving.insert(key)
        defer { saving.remove(key) }
        do {
            let share: ProfileShareDTO = try await client.request(
                ProfilePageEndpoints.saveShare(parts: parts, searchEngines: searchEngines)
            )
            state = .loaded(share)
            // Your own page and everyone's next read show the change.
            NotificationCenter.default.post(name: .pantopusProfileDidChange, object: nil)
        } catch {
            toast = "Couldn't save that. Try again."
        }
    }
}

struct ProfileShareSheet: View {
    @State var model: ProfileShareModel
    let name: String
    let avatarURL: URL?
    let avatarColor: ProfileAvatarColor
    let userId: String
    let onClose: () -> Void
    /// The username prompt, for a link that still has the made-up name.
    let onPickUsername: () -> Void
    /// The page exactly as someone signed out sees it.
    let onSeeAsVisitor: () -> Void

    @State private var sendItems: [Any]?
    @State private var showCode = false
    @State private var copied = false
    /// The link for one purpose being made (nil inside) or looked after.
    @State private var editing: ProfileShareLinkEditing?
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s3) {
                    switch model.state {
                    case .loading:
                        Shimmer(height: 120, cornerRadius: 20)
                        Shimmer(height: 260, cornerRadius: 20)
                    case .failed:
                        EmptyState(
                            icon: .alertCircle,
                            headline: "Couldn't load your sharing",
                            subcopy: "Check your connection and try again.",
                            cta: EmptyState.CTA(title: "Try again") { await model.load() }
                        )
                    case let .loaded(share):
                        linkCard(share)
                        Text(Self.partsNote)
                            .scaledFont(14)
                            .foregroundStyle(Theme.Color.appText)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(Spacing.s3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.Color.infoBg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        parts(share)
                        ProfileShareLinksSection(model: model, share: share) { link in
                            editing = ProfileShareLinkEditing(link: link)
                        }
                        Button(action: onSeeAsVisitor) {
                            ProfileActionButton(title: "See it as a visitor", icon: .eye, style: .secondary)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, Spacing.s2)
                        .accessibilityIdentifier("profileShareSeeAsVisitor")
                    }
                }
                .padding(Spacing.s4)
            }
            .background(Theme.Color.appBg)
            .navigationTitle("Share your profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onClose) {
                        Icon(.x, size: 20, color: Theme.Color.appText)
                    }
                    .accessibilityLabel("Close")
                }
            }
        }
        .task { await model.load() }
        .overlay(alignment: .bottom) {
            if let toast = model.toast {
                ToastView(message: ToastMessage(text: toast, kind: .neutral))
                    .padding(.bottom, Spacing.s10)
                    .dismissToast(after: toast, minimum: 2) { model.toast = nil }
            }
        }
        .sheet(isPresented: Binding(get: { sendItems != nil }, set: { if !$0 { sendItems = nil } })) {
            if let sendItems { SystemShareSheet(items: sendItems) }
        }
        .sheet(item: $editing) { item in
            if let share = model.share {
                ProfileShareLinkEditor(model: model, share: share, link: item.link) { editing = nil }
            }
        }
        .fullScreenCover(isPresented: $showCode) {
            if let url = model.share.flatMap(Self.appURL) { ProfileLinkCode(url: url, name: name) { showCode = false } }
        }
        .accessibilityIdentifier("profileShareSheet")
    }

    // MARK: - The link

    private func linkCard(_ share: ProfileShareDTO) -> some View {
        let appURL = Self.appURL(share)
        let shown = appURL.map { Self.shown($0) } ?? share.username
        return ProfileBlockCard {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack(spacing: Spacing.s3) {
                    ProfileAvatarDisc(name: name, showsInitials: !name.isEmpty, imageURL: avatarURL, color: avatarColor, size: 40)
                        .momentsRing(of: userId, spoken: false)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(share.usernameIsMadeUp ? "Pick a username first" : shown)
                            .scaledFont(15, weight: .semibold)
                            .foregroundStyle(Theme.Color.appText)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(share.usernameIsMadeUp
                            ? "Your link uses a name Pantopus made up. Choose your own before you share it."
                            : "Anyone with this link can open it. No account needed.")
                            .scaledFont(12)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if share.usernameIsMadeUp {
                    Button(action: onPickUsername) {
                        ProfileActionButton(title: "Pick a username", icon: .atSign)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("profileSharePickUsername")
                } else if let url = appURL {
                    let layout = typeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(spacing: Spacing.s2))
                        : AnyLayout(HStackLayout(spacing: Spacing.s2))
                    layout {
                        ProfileActionButton(title: copied ? "Copied" : "Copy link", icon: nil)
                            .button {
                                UIPasteboard.general.url = url
                                copied = true
                                Task { @MainActor in
                                    try? await Task.sleep(for: .seconds(2))
                                    copied = false
                                }
                            }
                            .accessibilityIdentifier("profileShareCopy")
                        ProfileActionButton(title: "Send", icon: nil, style: .secondary)
                            .button { sendItems = [url] }
                            .accessibilityIdentifier("profileShareSend")
                        ProfileActionButton(title: "Show code", icon: nil, style: .secondary)
                            .button(spoken: "Show a code for your link") { showCode = true }
                            .accessibilityIdentifier("profileShareCode")
                    }
                }
            }
        }
    }

    /// The main link on this build's own web origin (the app's link builder), so a staging build shares staging.
    static func appURL(_ share: ProfileShareDTO) -> URL? {
        guard let url = share.url else { return nil }
        return URL(string: InviteLinks.publicPageURLString(path: url.path))
    }

    /// "pantopus.com/mariakovacs".
    static func shown(_ url: URL) -> String {
        (url.host ?? "") + (url.port.map { ":\($0)" } ?? "") + url.path
    }

    // MARK: - Parts

    private static let partsNote =
        "A part you switch off simply isn't there. Nothing on the page says it exists, and the page closes up around it."

    private struct PartRow {
        let key: String
        let title: String
        let detail: String?
    }

    private func parts(_ share: ProfileShareDTO) -> some View {
        let present = Dictionary(share.parts.map { ($0.key, $0) }) { first, _ in first }
        /// A part with nothing in it has no switch yet (CONTRACT §6).
        func shown(_ rows: [PartRow]) -> [PartRow] {
            rows.filter { present[$0.key]?.hasContent == true }
        }
        return VStack(alignment: .leading, spacing: Spacing.s3) {
            let about = shown([
                PartRow(key: "says", title: "Says", detail: "Your one line"),
                PartRow(key: "prompts", title: "Get to know", detail: "Your answers"),
                PartRow(key: "shelf", title: "Shelf", detail: nil),
                PartRow(key: "city", title: "City", detail: cityDetail(share))
            ])
            section("About you", always: "Portrait, name and rings", rows: about, share: share)
            let done = shown([
                PartRow(key: "work", title: "Work", detail: "What you can do and your pieces"),
                PartRow(key: "known_for", title: "Known for", detail: "Writers show by name only if they allow it."),
                PartRow(key: "reviews", title: "Reviews", detail: "All of them or none"),
                PartRow(key: "record_work", title: "Record: work and learning", detail: nil),
                PartRow(key: "record_home", title: "Record: home", detail: "That your home is verified. Never the address."),
                PartRow(key: "record_others", title: "Record: with others", detail: nil),
                PartRow(key: "met", title: "Met in person", detail: "A count. Names are never on a shared page.")
            ])
            section("What you've done", always: nil, rows: done, share: share)
            ProfileBlockCard(padded: false) {
                sectionTitle("Reaching you")
                ForEach(shown([PartRow(key: "doors", title: "Doors", detail: "A visitor signs in to use one.")]), id: \.key) { row in
                    partSwitch(row, share: share)
                    ProfileRowDivider(inset: 0)
                }
                ProfileTileRow(title: "Phone and email", detail: "Never on a link. Connections only.")
            }
            ProfileBlockCard(padded: false) {
                Toggle(isOn: Binding(
                    get: { share.searchEngines },
                    set: { on in Task { await model.setSearchEngines(on) } }
                )) {
                    rowText("Let search engines list this page", detail: "On unless you switch it off.")
                }
                .tint(Theme.Color.primarySolid)
                .disabled(model.saving.contains("search_engines"))
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
                .accessibilityIdentifier("profileSharePart_search_engines")
            }
        }
    }

    @ViewBuilder
    private func section(_ title: String, always: String?, rows: [PartRow], share: ProfileShareDTO) -> some View {
        if always != nil || !rows.isEmpty {
            ProfileBlockCard(padded: false) {
                sectionTitle(title)
                if let always {
                    ProfileTileRow(title: always, detail: "Always shown")
                }
                ForEach(Array(rows.enumerated()), id: \.element.key) { index, row in
                    if index > 0 || always != nil { ProfileRowDivider(inset: 0) }
                    partSwitch(row, share: share)
                }
            }
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        ProfileBlockTitle(title: title)
            .padding(.horizontal, Spacing.s4)
            .padding(.top, 14)
            .padding(.bottom, 2)
    }

    private func partSwitch(_ row: PartRow, share: ProfileShareDTO) -> some View {
        let lockedCity = row.key == "city" && share.cityLimit != "anyone"
        return Toggle(isOn: Binding(
            get: { model.isOn(row.key) && !lockedCity },
            set: { on in Task { await model.set(row.key, on: on) } }
        )) {
            rowText(row.title, detail: row.detail)
        }
        .tint(Theme.Color.primarySolid)
        .disabled(model.saving.contains(row.key) || lockedCity)
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s3)
        .accessibilityIdentifier("profileSharePart_\(row.key)")
    }

    private func rowText(_ title: String, detail: String?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .scaledFont(14, weight: .semibold)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
            if let detail {
                Text(detail)
                    .scaledFont(12)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// The city follows Settings' "Who sees your city": a link shows it only where that allows anyone.
    private func cityDetail(_ share: ProfileShareDTO) -> String {
        switch share.cityLimit {
        case "anyone": model.isOn("city") ? "City and state, never more" : "Off, the page names no place"
        case "connections": "Your city shows to connections only (Settings, Privacy)"
        default: "Your city shows to no one (Settings, Privacy)"
        }
    }
}

// MARK: - Show code

/// The link as a code to scan, full screen.
struct ProfileLinkCode: View {
    let url: URL
    let name: String
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: Spacing.s5) {
            HStack {
                Spacer()
                Button("Done", action: onDone)
                    .scaledFont(17, weight: .semibold)
                    .foregroundStyle(Theme.Color.primaryInk)
                    .frame(minHeight: 44)
            }
            Spacer()
            if let image = Self.code(url.absoluteString) {
                Image(decorative: image, scale: 1)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 280)
                    .padding(Spacing.s4)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .accessibilityLabel("Code for \(name)'s profile link")
            }
            Text(ProfileShareSheet.shown(url))
                .scaledFont(17, weight: .semibold)
                .foregroundStyle(Theme.Color.appText)
            Spacer()
        }
        .padding(Spacing.s5)
        .background(Theme.Color.appBg)
    }

    static func code(_ string: String) -> CGImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)) else { return nil }
        return CIContext().createCGImage(output, from: output.extent)
    }
}

/// A link sheet: making one (`link` nil) or looking after one.
struct ProfileShareLinkEditing: Identifiable {
    let link: ProfileShareLinkDTO?

    var id: String {
        link?.id ?? "new"
    }
}
