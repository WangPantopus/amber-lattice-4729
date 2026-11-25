//
//  PublicProfileView+Sources.swift
//  Pantopus
//
//  The profile with sources inside today's profile screen (SPEC §5 phase 1).
//  While the `profile_sources` launch key is on and the server answers the new
//  page, the screen draws its blocks; anything else leaves the screen exactly
//  as it is today. Every button, sheet and confirm of today's page (Connect
//  sheet, Requested, Connected ▾, ⋯ with follow, block and report, Edit
//  profile, Preview as, the tips, your month, Your account, Log out) is the
//  same one here.
//

import SwiftUI

extension PublicProfileView {
    /// The new page for this person (`ProfileSourcesPage`), with today's buttons, sheets and owner parts.
    func sourcesLayout(_ payload: PublicProfileContent, page: ProfilePageModel, content: ProfileSourcesContent) -> some View {
        let isOwner = payload.isOwner && viewModel.previewAudience == nil
        let preview = viewModel.previewAudience
        return VStack(spacing: Spacing.s0) {
            if let preview {
                ProfilePreviewBanner(audience: preview, onDone: onBack)
            }
            sourcesPage(payload, page: page, content: content, isOwner: isOwner, preview: preview)
        }
        .background(Theme.Color.appBg)
        .accessibilityIdentifier(isOwner ? "profileOwnerPage" : "publicProfileSources")
        .modifier(SourcesSheets(view: self, payload: payload, page: page, content: content))
        .showsMomentsRingViewer(on: momentsOwnStage)
    }

    private func sourcesPage(
        _ payload: PublicProfileContent,
        page: ProfilePageModel,
        content: ProfileSourcesContent,
        isOwner: Bool,
        preview: ProfileAudience?
    ) -> some View {
        let leading: ProfileTopBar.Leading? = preview != nil ? nil : (isOwner && onClose != nil ? .close : .back)
        let back: @MainActor () -> Void = isOwner ? (onClose ?? onBack) : onBack
        let share: (@MainActor () -> Void)? = preview != nil ? nil : (isOwner ? openOwnShare : shareTheirProfile)
        let more: (@MainActor () -> Void)? = isOwner || preview != nil ? nil : openOverflow
        let refresh: @MainActor () async -> Void = isOwner ? refreshOwnPage : refreshProfile
        let pieces: (@MainActor () -> Void)? = isOwner ? openOwnerPieces : nil
        var editPiece: (@MainActor (ProfilePieceEditorStart) -> Void)?
        if isOwner, preview == nil { editPiece = { start in open(.piece(start)) } }
        let context = blockContext(payload, page: page, content: content, isOwner: isOwner)
        return ProfileSourcesPage(
            content: content,
            model: page,
            avatarColor: payload.header.avatarColor,
            context: context,
            leading: leading,
            onBack: back,
            onShare: share,
            onMore: more,
            moreLabel: "More: follow, block or report",
            onRefresh: refresh,
            onManagePieces: pieces,
            onEditPiece: editPiece,
            actions: { sourcesActions(payload, content: content, isOwner: isOwner, preview: preview) },
            ownerTop: { sourcesOwnerTop(payload, isOwner: isOwner) },
            ownerBottom: { sourcesOwnerBottom(isOwner: isOwner) }
        )
    }

    @ViewBuilder
    private func sourcesActions(
        _ payload: PublicProfileContent,
        content: ProfileSourcesContent,
        isOwner: Bool,
        preview: ProfileAudience?
    ) -> some View {
        if let preview {
            previewSourcesActions(content, audience: preview)
        } else if isOwner {
            ownerSourcesActions
        } else {
            visitorSourcesActions(content, payload: payload)
        }
    }

    @ViewBuilder
    private func sourcesOwnerTop(_ payload: PublicProfileContent, isOwner: Bool) -> some View {
        if isOwner, let owner { ownerTips(payload, owner: owner) }
    }

    @ViewBuilder
    private func sourcesOwnerBottom(isOwner: Bool) -> some View {
        if isOwner, let owner { ownerExtras(owner) }
    }

    private func openOwnShare() {
        showProfileShare = true
    }

    private func openOverflow() {
        viewModel.showOverflow = true
    }

    private func refreshProfile() async {
        await viewModel.refresh()
    }
}

/// The page's sheets: a month, a piece, the posts and the share sheet.
private struct SourcesSheets: ViewModifier {
    let view: PublicProfileView
    let payload: PublicProfileContent
    let page: ProfilePageModel
    let content: ProfileSourcesContent

    @Environment(\.dynamicTypeSize) private var typeSize

    func body(content body: Content) -> some View {
        body
            .sheet(
                item: Binding(get: { page.openedMonth }, set: { if $0 == nil { page.closeMonth() } })
            ) { _ in
                ProfileMonthSheet(model: page, firstName: content.header.firstName) { link in
                    page.closeMonth()
                    view.openSourcesLink(link, payload: payload, page: page)
                }
                .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .sheet(
                item: Binding(
                    get: { page.openingPieceId.map(ProfileOpenedPiece.init) },
                    set: { if $0 == nil { page.closePiece() } }
                )
            ) { _ in
                ProfilePieceSheet(model: page, isOwner: content.isOwner && view.viewModel.previewAudience == nil) { page.closePiece() }
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: view.$showOwnerPieces) {
                NavigationStack {
                    ScrollView {
                        ProfilePortfolioSection(
                            userId: content.header.userId,
                            isOwnProfile: true,
                            viewModel: view.viewModel.workModels(userId: content.header.userId, isOwnProfile: true).portfolio
                        )
                        .padding(Spacing.s4)
                    }
                    .background(Theme.Color.appBg)
                    .navigationTitle("Your pieces")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { view.showOwnerPieces = false }
                        }
                    }
                }
            }
            .sheet(isPresented: view.$showSourcesPosts) {
                view.sourcesPostsSheet(payload)
            }
            .sheet(isPresented: view.$showProfileShare) {
                ProfileShareSheet(
                    model: ProfileShareModel(),
                    name: content.header.name,
                    avatarURL: content.header.portraitURL,
                    avatarColor: payload.header.avatarColor,
                    userId: content.header.userId,
                    onClose: { view.showProfileShare = false },
                    onPickUsername: {
                        view.showProfileShare = false
                        Task { @MainActor in
                            try? await Task.sleep(for: .milliseconds(600))
                            view.usernameShare = UsernameShareSheetModel(currentUsername: view.viewModel.loadedUsername)
                        }
                    },
                    onSeeAsVisitor: {
                        view.showProfileShare = false
                        Task { @MainActor in
                            try? await Task.sleep(for: .milliseconds(600))
                            view.shownPreview = .anyone
                        }
                    }
                )
                .presentationDragIndicator(.visible)
            }
    }
}

extension PublicProfileView {
    /// What the blocks need from this screen.
    private func blockContext(
        _ payload: PublicProfileContent,
        page: ProfilePageModel,
        content: ProfileSourcesContent,
        isOwner: Bool
    ) -> ProfileBlockContext {
        let blocked = viewModel.connection == .blocked
        return ProfileBlockContext(
            firstName: content.header.firstName,
            profileUserId: content.header.userId,
            viewerId: PublicProfileViewModel.signedInUserId(),
            isOwner: isOwner,
            pinnedPosts: blocked ? [] : viewModel.pinnedPosts,
            openLink: { link in
                // A preview shows what they'd see without leaving it: tabs, months and pieces open; nothing else.
                if viewModel.previewAudience != nil {
                    switch link {
                    case .tab, .record, .month, .piece: break
                    default: return
                    }
                }
                openSourcesLink(link, payload: payload, page: page)
            },
            openPost: onOpenPost,
            openTogether: { target in
                switch target {
                case let .plan(id): DeepLinkRouter.shared.handle(path: "/plans/\(id)")
                case let .supportTrain(id): DeepLinkRouter.shared.handle(path: "/support-trains/\(id)")
                }
            },
            askToConnect: viewModel.relationshipLoaded && viewModel.connection == .none && viewModel.canFollow
                ? { showConnectSheet = true }
                : nil,
            edit: isOwner ? { showEditProfile = true } : nil,
            pieceInk: content.pieceInk,
            openedMonth: page.openedMonth
        )
    }

    // swiftlint:disable cyclomatic_complexity
    /// Where a line, a row or "All 6 lines" goes (CONTRACT.md §3.3). A link the app can't follow does nothing.
    func openSourcesLink(_ link: ProfilePageLinkDTO, payload: PublicProfileContent, page: ProfilePageModel) {
        switch link {
        case let .tab(key):
            if let key = ProfileSourcesTab.Key(rawValue: key) { page.selectedTab = key }
        case .record:
            page.selectedTab = .record
        case let .month(month):
            let bits = month.split(separator: "-").compactMap { Int($0) }
            guard bits.count == 2 else { return }
            Task { await page.open(month: ProfileRingMonth(year: bits[0], month: bits[1] - 1)) }
        case let .piece(id):
            Task { await page.open(pieceId: id) }
        case let .business(username):
            DeepLinkRouter.shared.handle(path: "/business/\(username)")
        case let .profile(userId, username):
            if let target = userId ?? username { onOpenProfile(target) }
        case let .plan(id):
            DeepLinkRouter.shared.handle(path: "/plans/\(id)")
        case let .supportTrain(id):
            DeepLinkRouter.shared.handle(path: "/support-trains/\(id)")
        case let .gig(id):
            onOpenGig(id)
        case .posts:
            if payload.isOwner, viewModel.previewAudience == nil {
                open(.myPosts)
            } else {
                showSourcesPosts = true
            }
        case let .moments(userId):
            // Their Moments play from the first one not watched yet, as a tap on their ring does; otherwise the tab.
            if let ring = MomentsPeopleRings.shared.ring(for: userId) {
                if let momentsStage, momentsStage.canShow {
                    momentsStage.play(ring, scheme: colorScheme)
                } else {
                    momentsOwnStage.play(ring, scheme: colorScheme)
                }
            } else {
                DeepLinkRouter.shared.handle(path: "/moments")
            }
        case let .url(url, _):
            openURL(url)
        }
    }

    // swiftlint:enable cyclomatic_complexity

    // MARK: - Buttons

    /// Edit profile and Preview as ▾, as on today's page; Share is in the top bar.
    private var ownerSourcesActions: some View {
        ProfileActionRow {
            ProfileActionButton(title: "Edit profile", icon: .pencil)
                .button { showEditProfile = true }
                .accessibilityIdentifier("publicProfileEditProfile")
            ProfileActionButton(title: "Preview as", icon: .eye, style: .secondary, showsChevron: true)
                .button(spoken: "Preview your profile as") { showPreviewMenu = true }
                .accessibilityIdentifier("profilePreviewAs")
        }
    }

    /// Connect and Message as today's rules allow (the server says which), today's buttons and confirms for each
    /// state, then Call and Email when the person shows them to this viewer.
    @ViewBuilder
    private func visitorSourcesActions(_ content: ProfileSourcesContent, payload: PublicProfileContent) -> some View {
        let offered = ProfileOfferedActions(content.page.actions)
        if viewModel.connection != .blocked, !content.page.actions.isEmpty {
            let state = liveConnectState(page: offered.connectState)
            VStack(alignment: .leading, spacing: Spacing.s3) {
                if state == "incoming" {
                    ProfileRequestBanner(
                        name: content.header.firstName,
                        isWorking: viewModel.connectState == .inFlight,
                        onAccept: { Task { await viewModel.connect() } },
                        onDecline: { Task { await viewModel.declineRequest() } }
                    )
                }
                ProfileActionRow {
                    connectButton(state: state)
                    if offered.canMessage {
                        ProfileActionButton(
                            title: "Message",
                            icon: .messageSquare,
                            style: state == "none" || state == "requested" ? .secondary : .primary
                        )
                        .button { onOpenMessages(payload.profile) }
                        .accessibilityIdentifier("publicProfileMessageCta")
                    }
                    if state == "connected" { connectedMenu }
                }
                contactRow(offered, firstName: content.header.firstName)
                sendCardButton(for: payload)
            }
            .task(id: "\(payload.profile.id)|\(HolidayCardDoors.shared.isOpen)") {
                canSendCard = await HolidayCardDoors.shared.canSend(to: payload.profile.id)
            }
        }
    }

    @ViewBuilder
    private func connectButton(state: String) -> some View {
        switch state {
        case "none":
            ProfileActionButton(title: "Connect", icon: .userPlus)
                .button { showConnectSheet = true }
                .disabled(viewModel.connectState == .inFlight)
                .accessibilityIdentifier("publicProfileConnectCta")
        case "requested":
            ProfileActionButton(title: "Requested", icon: .clock, style: .secondary)
                .button(spoken: "Requested. Withdraw request") { viewModel.showWithdrawConfirm = true }
                .disabled(viewModel.connectState == .inFlight)
                .accessibilityIdentifier("publicProfileConnectCta")
        default:
            EmptyView()
        }
    }

    /// Connected ▾ with Disconnect (and its confirm), as on today's page.
    private var connectedMenu: some View {
        Menu {
            Button("Disconnect", role: .destructive) { viewModel.showDisconnectConfirm = true }
        } label: {
            ProfileActionButton(title: "Connected", icon: .check, style: .secondary, showsChevron: true)
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .disabled(viewModel.connectState == .inFlight)
        .accessibilityLabel("Connected. Options")
        .accessibilityIdentifier("publicProfileConnectCta")
    }

    /// Call and Email: only when the person shows them to this viewer (never on a link, never to a member).
    @ViewBuilder
    private func contactRow(_ offered: ProfileOfferedActions, firstName: String) -> some View {
        let phone = offered.phone.flatMap { URL(string: "tel:\($0.filter { $0.isNumber || $0 == "+" })") }
        let email = offered.email.flatMap { URL(string: "mailto:\($0)") }
        if phone != nil || email != nil {
            ProfileActionRow {
                if let phone {
                    ProfileActionButton(title: "Call", icon: .phone, style: .secondary)
                        .button(spoken: "Call \(firstName)") { openURL(phone) }
                        .accessibilityIdentifier("profileSourcesCall")
                }
                if let email {
                    ProfileActionButton(title: "Email", icon: .mail, style: .secondary)
                        .button(spoken: "Email \(firstName)") { openURL(email) }
                        .accessibilityIdentifier("profileSourcesEmail")
                }
            }
        }
    }

    /// The relationship as the app last read it, once read; the page's word until then. "connected" when the page
    /// sent no Connect (a connection or someone you live with).
    private func liveConnectState(page state: String?) -> String {
        if viewModel.relationshipLoaded {
            switch viewModel.connection {
            case .none: return viewModel.canFollow ? "none" : "hidden"
            case .pendingSent: return "requested"
            case .pendingReceived: return "incoming"
            case .connected: return "connected"
            case .blocked: return "hidden"
            }
        }
        return state ?? "connected"
    }

    /// What that audience gets, drawn but not active.
    private func previewSourcesActions(_ content: ProfileSourcesContent, audience: ProfileAudience) -> some View {
        Group {
            switch audience {
            case .anyone:
                ProfileActionButton(title: "Join Pantopus to connect with \(content.header.firstName)", icon: .userPlus)
            case .neighbors:
                ProfileActionRow {
                    ProfileActionButton(title: "Connect", icon: .userPlus)
                    ProfileActionButton(title: "Message", icon: .messageSquare, style: .secondary)
                }
            case .connections:
                ProfileActionRow {
                    ProfileActionButton(title: "Message", icon: .messageSquare)
                    ProfileActionButton(title: "Connected", icon: .check, style: .secondary, showsChevron: true)
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
        .accessibilityHint("What they see. Buttons don't work in a preview.")
        .accessibilityIdentifier("profilePreviewButtons")
    }

    /// Someone else's profile: their link in the system share sheet, as today's ⋯ → Share profile.
    private func shareTheirProfile() {
        shareURL = viewModel.profileShareURL
    }

    // MARK: - Posts

    /// A post opened from the posts sheet opens on the page under it, once the sheet has gone.
    private func openPostFromSheet(_ id: String) {
        showSourcesPosts = false
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(450))
            onOpenPost(id)
        }
    }

    /// "Posts in Pulse" (the row that took the Posts tab's place): the same posts, drawn with the Pulse card.
    func sourcesPostsSheet(_ payload: PublicProfileContent) -> some View {
        NavigationStack {
            ScrollView {
                PublicProfilePostsFeed(
                    kind: .local,
                    posts: payload.posts,
                    onUnlock: { _ in },
                    onEmptyCTA: {
                        showSourcesPosts = false
                        onOpenMessages(payload.profile)
                    },
                    localName: payload.header.displayName,
                    loadFailed: viewModel.postsLoadFailed,
                    onRetry: retryLoad,
                    hiddenByBlock: viewModel.connection == .blocked,
                    isOwnProfile: payload.isOwner,
                    joinedRecently: payload.header.joinedRecently,
                    isLoading: viewModel.postsLoading,
                    pulseCards: viewModel.postCards,
                    onOpenPost: openPostFromSheet
                )
                .padding(.vertical, Spacing.s3)
            }
            .background(Theme.Color.appBg)
            .navigationTitle("\(payload.header.firstName)'s posts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { showSourcesPosts = false }
                }
            }
            .modifier(ProfilePostCardSurfaces(model: viewModel.postCards))
        }
    }
}

/// The piece a sheet is open for.
struct ProfileOpenedPiece: Identifiable {
    let id: String
}

/// What the page offers this viewer, read from its `actions`.
struct ProfileOfferedActions {
    var canMessage = false
    var connectState: String?
    var phone: String?
    var email: String?

    init(_ actions: [ProfilePageActionDTO]) {
        for action in actions {
            switch action {
            case .message: canMessage = true
            case let .connect(state): connectState = state
            case let .call(phone): self.phone = phone
            case let .email(email): self.email = email
            default: break
            }
        }
    }
}
