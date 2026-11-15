//
//  PlanPrivatePreview.swift
//  Pantopus
//
//  Board Preview (Plans step 1) for a private plan: what the people the host
//  invites see (the "Private" chip, the place by name), the "Invite" list of
//  the host's people with checkboxes, "Text a link" and "Email" (they post
//  the plan, then open the invite sheet), and "Post and invite 2". The people
//  chosen go with the plan as it is posted (`invite_user_ids`); the server
//  invites them and skips anyone it can't.
//

import SwiftUI

struct PlanPrivatePreviewScreen: View {
    let model: PlanComposerModel
    let step: String
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: "Preview", leading: .back, trailing: step, onLeading: onBack)
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.s4) {
                    Text.planOverline("What the people you invite see")
                    card
                    inviteHeader.padding(.top, Spacing.s1)
                    inviteList
                    HStack(spacing: 10) {
                        sheetButton(title: "Text a link", icon: .messageCircle, identifier: "planTextLink")
                        sheetButton(title: "Email", icon: .mail, identifier: "planEmailInvite")
                    }
                    PlanScopeLine(text: PlanPrivateCopy.previewScope)
                    if model.whereKind == .home { PlanScopeLine(text: PlanPrivateCopy.homeScope, icon: .home) }
                    if let error = model.postError {
                        Text(error)
                            .planFont(.small)
                            .foregroundStyle(Theme.Color.error)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("planPostError")
                    }
                }
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s1)
                .padding(.bottom, Spacing.s6)
            }
            footer
        }
        .background(Theme.Color.appBg)
        .task { await model.loadPreviewArea() }
        .task { if model.privacy.peoplePhase == .idle { await model.privacy.loadPeople() } }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planPreview")
    }

    // MARK: - The card

    private var card: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack(spacing: Spacing.s2) {
                PlanTypeTag(kind: model.kind)
                PlanPrivateChip()
            }
            Text(model.effectiveTitle)
                .planFont(.h3)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: Spacing.s1) {
                PlanFactRow(icon: .calendar, text: whenLine)
                if let line = model.repeatLine { PlanRepeatLine(text: line, spoken: model.repeatSpoken) }
                PlanFactRow(icon: model.whereKind == .home ? .home : .mapPin, text: whereLine)
            }
            HStack(spacing: 10) {
                PlanAvatar(name: model.hostName, size: 30)
                (Text(model.hostName).fontWeight(.semibold)
                    + Text(" · \(model.spots) \(model.kind == .playdate ? "families" : "spots")"))
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appText)
            }
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous).fill(Theme.Color.appSurface))
        .overlay(RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    /// "Tue, Nov 17 · 6:30–7:30 AM"; a playdate shows its part of the day, as on the public preview.
    private var whenLine: String {
        guard model.kind == .playdate else { return PlanFormat.when(start: model.effectiveStart, end: model.end) }
        let hour = Calendar.current.component(.hour, from: model.effectiveStart)
        let part: PlanDayPart = hour < 12 ? .morning : hour < 17 ? .afternoon : hour < 21 ? .evening : .night
        return PlanFormat.dayPartPhrase(part, day: model.effectiveStart)
    }

    /// "Heritage Park, Camas" (the place by name); at the host's home, the area until they're in.
    private var whereLine: String {
        let city = model.previewArea.map { $0.hasPrefix("Near ") ? String($0.dropFirst(5)) : $0 }
        if model.whereKind == .home {
            let first = PlanCardLines.firstName(model.hostName)
            return [model.previewArea, "at \(first)'s place"].compactMap { $0 }.joined(separator: " · ")
        }
        let name = model.place?.name ?? "The place"
        guard let city, !name.localizedCaseInsensitiveContains(city) else { return name }
        return "\(name), \(city)"
    }

    // MARK: - Invite

    private var inviteHeader: some View {
        HStack {
            Text.planOverline("Invite")
            Spacer()
            if !model.privacy.chosen.isEmpty {
                Text("\(model.privacy.chosen.count) chosen")
                    .planFont(.small)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .accessibilityIdentifier("planInviteChosenCount")
            }
        }
    }

    @ViewBuilder private var inviteList: some View {
        let privacy = model.privacy
        switch privacy.peoplePhase {
        case .idle, .loading:
            VStack(spacing: Spacing.s2) {
                ForEach(0..<3, id: \.self) { _ in Shimmer(width: nil, height: 52, cornerRadius: Radii.lg) }
            }
            .accessibilityElement()
            .accessibilityLabel("Loading your people")
        case let .error(message):
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text("Couldn't load your people").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                Text(message).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary).fixedSize(horizontal: false, vertical: true)
                Button("Try again") { Task { await privacy.loadPeople() } }
                    .planButton(.secondary, size: .small)
                    .fixedSize()
                    .accessibilityIdentifier("planInvitePeopleRetry")
            }
        case .loaded where privacy.people.isEmpty:
            Text("Your connections and people who came to your plans show here. You can text a link or email anyone once it's posted.")
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        case .loaded:
            PlanFormCard {
                ForEach(Array(privacy.people.enumerated()), id: \.element.id) { index, person in
                    if index > 0 { Divider().overlay(Theme.Color.appBorder) }
                    personRow(person)
                }
            }
        }
    }

    private func personRow(_ person: PlanInviteCandidateDTO) -> some View {
        let privacy = model.privacy
        let isOn = privacy.isChosen(person)
        let full = !isOn && privacy.chosen.count >= PlanPrivateDraft.inviteLimit
        return Button { privacy.toggle(person) } label: {
            HStack(spacing: Spacing.s3) {
                PlanAvatar(name: person.displayName, url: person.avatarUrl)
                VStack(alignment: .leading, spacing: 0) {
                    Text(person.displayName).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    Text(PlanInviteLines.reason(person.reason)).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                PlanCheckbox(isOn: isOn)
            }
            .padding(.vertical, 10)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(full || model.isPosting)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Invite \(person.displayName), \(PlanInviteLines.reason(person.reason))")
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("planInvitePerson.\(person.userId)")
    }

    /// "Text a link" and "Email": the plan has to exist for a link, so they post it, then the invite sheet opens.
    private func sheetButton(title: String, icon: PantopusIcon, identifier: String) -> some View {
        Button {
            Task {
                model.privacy.opensInviteSheet = true
                if await !model.post() { model.privacy.opensInviteSheet = false }
            }
        } label: {
            PlanButtonLabel(title: title, icon: icon, kind: .secondary)
        }
        .planButton(.secondary, size: .small)
        .disabled(model.isPosting)
        .accessibilityHint("Posts the plan, then opens invitations")
        .accessibilityIdentifier(identifier)
    }

    // MARK: - Footer

    private var footer: some View {
        let count = model.privacy.chosen.count
        return VStack(spacing: Spacing.s2) {
            Button { Task { _ = await model.post() } } label: {
                PlanButtonLabel(title: count == 0 ? "Post plan" : "Post and invite \(count)", kind: .primary, isLoading: model.isPosting)
            }
            .planButton(.primary)
            .disabled(model.isPosting)
            .accessibilityIdentifier("planPostAndInvite")
            Text("You can invite more people later")
                .planFont(.caption)
                .foregroundStyle(Theme.Color.appTextSecondary)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s3)
        .background(Theme.Color.appSurface)
        .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
    }
}
