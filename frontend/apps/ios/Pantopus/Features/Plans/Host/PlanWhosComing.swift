//
//  PlanWhosComing.swift
//  Pantopus
//
//  Plans for the holidays, board 17 (Answers): the host's "Who's coming",
//  opened from the counts and the people line on the plan, and from the two
//  H1 notices. The three counts; "Waiting for you" with Not this time and Let
//  in; Coming; Maybe; Haven't answered; Can't make it; and "Remind {n} people".
//  Remove is on a long-press of any row.
//

import SwiftUI

struct PlanWhosComingScreen: View {
    @State private var model: PlanWhosComingModel
    let onBack: () -> Void
    let onOpenProfile: (String) -> Void
    let onOpenRequests: () -> Void
    @State private var showsInvite = false
    @Environment(\.dynamicTypeSize) private var typeSize
    /// A person from the link to let in at the host's home: the address goes with the yes, so it asks once.
    @State private var pendingAccept: PlanWhoRow?

    init(
        planId: String,
        onOpenProfile: @escaping (String) -> Void,
        onOpenRequests: @escaping () -> Void,
        onBack: @escaping () -> Void
    ) {
        _model = State(initialValue: PlanWhosComingModel(planId: planId))
        self.onOpenProfile = onOpenProfile
        self.onOpenRequests = onOpenRequests
        self.onBack = onBack
    }

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(
                title: "Who's coming",
                leading: .back,
                onLeading: onBack,
                trailingButton: model.card?.invites?.canInvite == true
                    ? PlanNavBar.TrailingButton(icon: .plus, label: "Invite people") { showsInvite = true }
                    : nil
            )
            switch model.phase {
            case .loading:
                loading
            case let .error(message):
                errorState(message)
            case .loaded:
                content
            }
        }
        .background(Theme.Color.appBg)
        .toolbar(.hidden, for: .navigationBar)
        .task { await model.load() }
        .refreshesOnStoreChange(affects: { PlansStoreReads.affects($0) }, perform: { await model.load() })
        .sheet(
            isPresented: $showsInvite,
            onDismiss: { Task { await model.load() } },
            content: { if let card = model.card { PlanInviteSheet(card: card) } }
        )
        .alert(
            "Remove \(model.confirmRemove?.name ?? "")?",
            isPresented: Binding(get: { model.confirmRemove != nil }, set: { if !$0 { model.confirmRemove = nil } }),
            presenting: model.confirmRemove
        ) { row in
            Button("Remove", role: .destructive) { Task { await model.remove(row) } }
            Button("Not now", role: .cancel) {}
        } message: { _ in
            Text("Their invitation will stop working.")
        }
        .alert(
            // The shipped Requests screen's words.
            "Accepting shares your address with them",
            isPresented: Binding(get: { pendingAccept != nil }, set: { if !$0 { pendingAccept = nil } }),
            presenting: pendingAccept
        ) { row in
            Button("Accept and share") {
                PlanHomeSharing.markConfirmed(model.planId)
                Task { await model.acceptAsk(row) }
            }
            Button("Not now", role: .cancel) {}
        } message: { row in
            let first = PlanCardLines.firstName(row.name)
            Text("\(first) will see your address, your note and who's going. You'll be asked once for this plan.")
        }
        .overlay(alignment: .bottom) { toastView }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planWhosComing")
    }

    // MARK: - States

    private var loading: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            HStack(spacing: Spacing.s2) {
                ForEach(0..<3, id: \.self) { _ in Shimmer(width: 110, height: 72, cornerRadius: 14) }
            }
            ForEach(0..<4, id: \.self) { _ in Shimmer(width: 360, height: 56, cornerRadius: Radii.lg) }
            Spacer()
        }
        .padding(Spacing.s4)
        .accessibilityElement()
        .accessibilityLabel("Loading who's coming")
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: Spacing.s3) {
            Text("Couldn't load who's coming").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
            Text(message).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary).multilineTextAlignment(.center)
            Button("Try again") { Task { await model.load() } }
                .planButton(.secondary, size: .small)
                .frame(maxWidth: 200)
                .accessibilityIdentifier("planWhosComingRetry")
            Spacer()
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity)
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                if let card = model.card, let answers = card.answerCounts {
                    PlanAnswerCounts(answers: answers, headcount: card.headcount, kidsWelcome: card.kidsWelcome)
                }
                if let error = model.error {
                    Text(error)
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("planWhosComingError")
                }
                let sections = model.sections
                if sections.isEmpty {
                    Text("Nobody's invited yet. Tap + to invite people.")
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                }
                ForEach(sections) { section in
                    VStack(alignment: .leading, spacing: Spacing.s1) {
                        Text.planOverline(section.title)
                        if section.id == "waiting" {
                            ForEach(section.rows) { waitingCard($0) }
                        } else {
                            PlanCardBox(padding: 0) {
                                VStack(spacing: 0) {
                                    ForEach(Array(section.rows.enumerated()), id: \.element.id) { index, row in
                                        if index > 0 { Divider().overlay(Theme.Color.appBorder).padding(.leading, 66) }
                                        personRow(row)
                                    }
                                }
                            }
                        }
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("planWho.\(section.id)")
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s2)
            .padding(.bottom, Spacing.s6)
        }
        .refreshable { await model.load() }
        .safeAreaInset(edge: .bottom, spacing: 0) { footer }
    }

    // MARK: - Rows

    private func waitingCard(_ row: PlanWhoRow) -> some View {
        PlanCardBox(padding: 14) {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack(spacing: Spacing.s3) {
                    leading(row)
                    words(row)
                }
                .accessibilityElement(children: .combine)
                if row.opensRequests {
                    Button("See request", action: onOpenRequests)
                        .planButton(.secondary, size: .small)
                        .accessibilityIdentifier("planWhoSeeRequest")
                } else if row.canLetIn {
                    // Side by side; one under the other at the largest text sizes, so "Not this time" isn't cut.
                    actionsLayout {
                        Button("Not this time") {
                            if row.answersAsk { Task { await model.declineAsk(row) } } else { model.confirmRemove = row }
                        }
                        .planButton(.secondary, size: .small)
                        .accessibilityLabel("Not this time for \(row.name)")
                        .accessibilityIdentifier("planWhoNotThisTime")
                        Button { letIn(row) } label: {
                            PlanButtonLabel(title: "Let in", kind: .primary, isLoading: model.working.contains(row.id))
                        }
                        .planButton(.primary, size: .small)
                        .accessibilityLabel("Let \(row.name) in")
                        .accessibilityIdentifier("planWhoLetIn")
                    }
                    .disabled(model.working.contains(row.id))
                }
            }
        }
        .contextMenu { removeButton(row) }
    }

    private var actionsLayout: AnyLayout {
        typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
    }

    /// A guest from the link is let in by their invitation; a person with an account by accepting their ask, which
    /// asks once first at the host's home (the address goes with the yes), as the shipped Requests screen does.
    private func letIn(_ row: PlanWhoRow) {
        if !row.answersAsk {
            Task { await model.letIn(row) }
        } else if model.isAtHome, !PlanHomeSharing.isConfirmed(model.planId) {
            pendingAccept = row
        } else {
            Task { await model.acceptAsk(row) }
        }
    }

    /// An account's row opens its profile; a guest's, an address's or a text invite's is plain.
    @ViewBuilder private func personRow(_ row: PlanWhoRow) -> some View {
        let content = HStack(spacing: Spacing.s3) {
            leading(row)
            words(row)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
        .contentShape(Rectangle())
        Group {
            if let userId = accountId(row) {
                Button { onOpenProfile(userId) } label: { content }
                    .buttonStyle(.plain)
            } else {
                content
            }
        }
        .accessibilityElement(children: .combine)
        .contextMenu { removeButton(row) }
        .accessibilityActions {
            if row.canRemove { Button("Remove \(row.name)") { model.confirmRemove = row } }
        }
        .accessibilityIdentifier("planWhoRow")
    }

    /// The account behind a row, for its profile; a guest without an account has none.
    private func accountId(_ row: PlanWhoRow) -> String? {
        model.list?.invites.first { $0.id == row.inviteId }?.person?.userId
    }

    @ViewBuilder private func removeButton(_ row: PlanWhoRow) -> some View {
        if row.canRemove {
            Button("Remove", role: .destructive) { model.confirmRemove = row }
        }
    }

    @ViewBuilder private func leading(_ row: PlanWhoRow) -> some View {
        switch row.leading {
        case let .person(name, avatarUrl):
            PlanAvatar(name: name, url: avatarUrl)
        case .email:
            iconCircle(.mail)
        case .text:
            iconCircle(.messageCircle)
        }
    }

    private func words(_ row: PlanWhoRow) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(row.name)
                .planFont(.bodyStrong)
                .foregroundStyle(Theme.Color.appText)
                .lineLimit(2)
                .truncationMode(.middle)
            Text(row.line)
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func iconCircle(_ icon: PantopusIcon) -> some View {
        Circle()
            .fill(Theme.Color.appSurfaceSunken)
            .frame(width: 40, height: 40)
            .overlay(Icon(icon, size: 18, color: Theme.Color.appTextStrong))
            .accessibilityHidden(true)
    }

    // MARK: - Footer

    @ViewBuilder private var footer: some View {
        if let title = model.remindTitle {
            let reminded = model.list?.remind?.remindedToday == true
            VStack(spacing: Spacing.s2) {
                Button { Task { await model.remind() } } label: {
                    PlanButtonLabel(title: title, kind: .primary, isLoading: model.working.contains("remind"))
                }
                .planButton(.primary)
                .disabled(reminded || model.working.contains("remind"))
                .accessibilityIdentifier("planWhoRemind")
                if (model.list?.remind?.unopenedLinks ?? 0) > 0, !reminded {
                    Text("A text invite that hasn't been opened has nobody to remind")
                        .planFont(.caption)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s3)
            .padding(.bottom, Spacing.s2)
            .frame(maxWidth: .infinity)
            .background(Theme.Color.appSurface.ignoresSafeArea(edges: .bottom))
            .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
        }
    }

    @ViewBuilder private var toastView: some View {
        if let toast = model.toast {
            ToastView(message: ToastMessage(text: toast))
                .padding(.bottom, 96)
                .dismissToast(after: toast, minimum: 2.5) { model.toast = nil }
        }
    }
}
