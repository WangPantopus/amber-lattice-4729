//
//  ProfileShareLinks.swift
//  Pantopus
//
//  Links for one purpose in "Share your profile" (board 21, CONTRACT.md
//  v1.3): each link shows its own parts, can end on a date and can be switched
//  off; it counts how often it was opened and the last day, never by whom. The
//  link itself (its key) shows only here, to its owner.
//

import SwiftUI

/// The parts a link can show, in board 21's order, with the words the share sheet uses.
enum ProfileSharePart {
    static let order = [
        "says", "prompts", "shelf", "city", "work", "known_for", "reviews", "record_work", "record_home", "record_others",
        "met", "doors"
    ]

    private static let titles = [
        "says": "Says",
        "prompts": "Get to know",
        "shelf": "Shelf",
        "city": "City",
        "work": "Work",
        "known_for": "Known for",
        "reviews": "Reviews",
        "record_work": "Record: work and learning",
        "record_home": "Record: home",
        "record_others": "Record: with others",
        "met": "Met in person",
        "doors": "Doors"
    ]

    static func title(_ key: String) -> String {
        titles[key] ?? key
    }

    /// Short names for a link's row: "Work, Known for, Record".
    static func summary(_ parts: [String: Bool]) -> String {
        var names: [String] = []
        for key in order where parts[key] == true {
            let name = key.hasPrefix("record_") ? "Record" : title(key)
            if !names.contains(name) { names.append(name) }
        }
        return names.isEmpty ? "Portrait, name and rings" : names.joined(separator: ", ")
    }
}

extension ProfileShareLinkDTO {
    /// The link on this build's own web origin (staging builds share staging links).
    var appURL: URL? {
        guard let url else { return nil }
        return URL(string: InviteLinks.publicPageURLString(path: url.path))
    }

    /// "Work, Known for, Record · ends December 31 · opened 3 times".
    var detail: String {
        var bits = [ProfileSharePart.summary(parts)]
        if switchedOff {
            bits.append("switched off")
        } else if !live {
            bits.append("ended")
        } else if let ends = Self.day(endsOn) {
            bits.append("ends \(ends.formatted(.dateTime.month(.wide).day()))")
        }
        bits.append(opens == 0 ? "not opened yet" : (opens == 1 ? "opened once" : "opened \(opens) times"))
        return bits.joined(separator: " · ")
    }

    /// "Opened 3 times, last on November 20": a count and the last day, never who (9.6).
    var opensLine: String {
        guard opens > 0 else { return "Not opened yet. You'll see how often, never by whom." }
        let times = opens == 1 ? "Opened once" : "Opened \(opens) times"
        guard let last = Self.day(lastOpenedOn) else { return "\(times). Never by whom." }
        return "\(times), last on \(last.formatted(.dateTime.month(.wide).day())). Never by whom."
    }

    static func day(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        let bits = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard bits.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: bits[0], month: bits[1], day: bits[2]))
    }
}

/// The section at the foot of the share sheet.
struct ProfileShareLinksSection: View {
    private static let note =
        "Each link shows its own parts, can end on a date, and can be switched off. You see how often it was opened, never by whom."

    let model: ProfileShareModel
    let share: ProfileShareDTO
    let onOpen: (ProfileShareLinkDTO?) -> Void

    var body: some View {
        if let enabled = share.linksEnabled {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                ProfileBlockTitle(title: "Links for one purpose")
                    .padding(.horizontal, Spacing.s1)
                ProfileBlockCard(padded: false) {
                    if enabled {
                        ForEach(Array(share.links.enumerated()), id: \.element.id) { index, link in
                            if index > 0 { ProfileRowDivider(inset: 0) }
                            ProfileTileRow(title: link.name, detail: link.detail) { onOpen(link) }
                                .accessibilityIdentifier("profileShareLink_\(index)")
                        }
                        if !share.links.isEmpty { ProfileRowDivider(inset: 0) }
                        Button { onOpen(nil) } label: {
                            HStack(spacing: Spacing.s2) {
                                Icon(.plus, size: 18, color: Theme.Color.primaryInk)
                                Text("Make a link for one purpose")
                                    .scaledFont(14, weight: .semibold)
                                    .foregroundStyle(Theme.Color.primaryInk)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("profileShareMakeLink")
                        ProfileRowDivider(inset: 0)
                    }
                    Toggle(isOn: Binding(
                        get: { enabled },
                        set: { on in Task { await model.setLinksEnabled(on) } }
                    )) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Use links for one purpose")
                                .scaledFont(14, weight: .semibold)
                                .foregroundStyle(Theme.Color.appText)
                            Text(enabled
                                ? "Switch off and none of your links open. They're kept."
                                : "Off: none of your links open, and none can be made. They're kept.")
                                .scaledFont(12)
                                .foregroundStyle(Theme.Color.appTextSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .tint(Theme.Color.primarySolid)
                    .disabled(model.saving.contains("links_enabled"))
                    .padding(.horizontal, Spacing.s4)
                    .padding(.vertical, Spacing.s3)
                    .accessibilityIdentifier("profileShareLinksEnabled")
                }
                Text(Self.note)
                    .scaledFont(12)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Spacing.s1)
            }
        }
    }
}

/// Make a link, or look after one: its parts, its end date, Copy / Send / Show code, switch it off, delete it.
struct ProfileShareLinkEditor: View {
    let model: ProfileShareModel
    let share: ProfileShareDTO
    /// Nil makes a new link.
    let link: ProfileShareLinkDTO?
    let onClose: () -> Void

    @State private var name = ""
    @State private var parts: [String: Bool] = [:]
    @State private var ends = false
    @State private var endsOn = Calendar.current.date(byAdding: .month, value: 1, to: Date()) ?? Date()
    @State private var working = false
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var sendItems: [Any]?
    @State private var showCode = false

    /// The link as last saved: a change made here (switched off, a new end date) shows at once.
    private var current: ProfileShareLinkDTO? {
        guard let link else { return nil }
        return model.share?.links.first { $0.id == link.id } ?? link
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            Form {
                if let link = current, let url = link.appURL {
                    Section {
                        Text(link.detail).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                        Text(link.opensLine).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                        Button("Copy link") { UIPasteboard.general.url = url }
                        Button("Send") { sendItems = [url] }
                        Button("Show code") { showCode = true }
                    }
                }
                Section("Name, only you see it") {
                    TextField("For the Hartley job", text: $name)
                        .textInputAutocapitalization(.sentences)
                        .onChange(of: name) { _, value in if value.count > 60 { name = String(value.prefix(60)) } }
                        .accessibilityIdentifier("profileShareLinkName")
                }
                Section("What this link shows") {
                    Text("Portrait, name and rings are always on it.")
                        .scaledFont(13)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                    ForEach(shownParts, id: \.self) { key in
                        Toggle(ProfileSharePart.title(key), isOn: Binding(
                            get: { parts[key] ?? false },
                            set: { parts[key] = $0 }
                        ))
                        .tint(Theme.Color.primarySolid)
                        .accessibilityIdentifier("profileShareLinkPart_\(key)")
                    }
                }
                Section {
                    Toggle("Ends on a date", isOn: $ends).tint(Theme.Color.primarySolid)
                    if ends {
                        DatePicker("Works through", selection: $endsOn, in: Date()..., displayedComponents: .date)
                    }
                }
                if let link = current {
                    Section {
                        Toggle("Link works", isOn: Binding(
                            get: { !link.switchedOff },
                            set: { on in Task { await save(ProfileShareLinkBody(switchedOff: !on)) } }
                        ))
                        .tint(Theme.Color.primarySolid)
                        Button("Delete this link", role: .destructive) { confirmDelete = true }
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(Theme.Color.error) }
                }
            }
            .navigationTitle(link == nil ? "New link" : link?.name ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onClose) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(link == nil ? "Make link" : "Save") { Task { await saveAll() } }
                        .disabled(trimmedName.isEmpty || working)
                        .accessibilityIdentifier("profileShareLinkSave")
                }
            }
        }
        .onAppear(perform: fill)
        .alert("Delete \(link?.name ?? "this link")?", isPresented: $confirmDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task {
                    if let link, await model.deleteLink(link.id) { onClose() }
                }
            }
        } message: {
            Text("Anyone who has it can't open it any more. This can't be undone.")
        }
        .sheet(isPresented: Binding(get: { sendItems != nil }, set: { if !$0 { sendItems = nil } })) {
            if let sendItems { SystemShareSheet(items: sendItems) }
        }
        .fullScreenCover(isPresented: $showCode) {
            if let url = link?.appURL { ProfileLinkCode(url: url, name: link?.name ?? "") { showCode = false } }
        }
    }

    /// Parts with something in them, and any this link already shows.
    private var shownParts: [String] {
        let present = Dictionary(share.parts.map { ($0.key, $0.hasContent) }) { first, _ in first }
        return ProfileSharePart.order.filter { present[$0] == true || parts[$0] == true }
    }

    private func fill() {
        guard let link else { return }
        name = link.name
        parts = link.parts
        if let day = ProfileShareLinkDTO.day(link.endsOn) {
            ends = true
            endsOn = day
        }
    }

    private var endsOnString: String? {
        guard ends else { return nil }
        let bits = Calendar.current.dateComponents([.year, .month, .day], from: endsOn)
        return String(format: "%04d-%02d-%02d", bits.year ?? 2026, bits.month ?? 1, bits.day ?? 1)
    }

    private func saveAll() async {
        await save(ProfileShareLinkBody(name: trimmedName, parts: parts, endsOn: .some(endsOnString)), closes: true)
    }

    private func save(_ body: ProfileShareLinkBody, closes: Bool = false) async {
        working = true
        defer { working = false }
        let failure = if let link {
            await model.updateLink(link.id, body)
        } else {
            await model.createLink(body)
        }
        error = failure
        if failure == nil, closes { onClose() }
    }
}
