//
//  MyPostsView.swift
//  Pantopus
//
//  T5.3.3 — My posts. Thin wrapper around the shared `ListOfRowsView`.
//  The shell renders the back chevron, centered title, trailing filter
//  action, the tabs and the 52pt secondary-create FAB. Each post is drawn
//  as its Pulse card (`PulsePostCard`), as on the Pulse tab, with the
//  card's controls; a post the build can't read as a card keeps the
//  shell's row.
//
//  The screen-bespoke pieces are the kebab confirmation dialog your own
//  posts' ⋯ opens (Edit, Pin, Archive/Restore + Delete), the destructive
//  delete confirmation alert, and the Saved and Reposts cards' menus
//  (Share…, Report post) — all attached at the bottom of the view.
//

import SwiftUI

public struct MyPostsView: View {
    @State private var viewModel: MyPostsViewModel

    public init(viewModel: MyPostsViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    public var body: some View {
        @Bindable var bindable = viewModel
        return ListOfRowsView(dataSource: viewModel)
            .rowContent { row in
                viewModel.visibleCards.cards.first { $0.id == row.id }.map { AnyView(postCard($0, row: row)) }
            }
            .overlay(alignment: .bottom) {
                // A failed archive, restore or delete says so (the row is already back); so does a pin.
                if let toast = viewModel.toastMessage {
                    ToastView(message: ToastMessage(text: toast, kind: viewModel.toastKind))
                        .padding(.bottom, 96)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .dismissToast(after: toast, minimum: 2.5) {
                            viewModel.toastMessage = nil
                        }
                }
            }
            .overlay(alignment: .bottom) {
                // A failed Remove on the Saved tab says so (the row stays).
                if let toast = viewModel.saved.toastMessage {
                    ToastView(message: ToastMessage(text: toast, kind: .error))
                        .padding(.bottom, 96)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .dismissToast(after: toast, minimum: 2.5) {
                            viewModel.saved.toastMessage = nil
                        }
                }
            }
            .overlay(alignment: .bottom) {
                // A failed Undo repost on the Reposts tab says so (the row stays).
                if let toast = viewModel.reposts.toastMessage {
                    ToastView(message: ToastMessage(text: toast, kind: .error))
                        .padding(.bottom, 96)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .dismissToast(after: toast, minimum: 2.5) {
                            viewModel.reposts.toastMessage = nil
                        }
                }
            }
            .accessibilityIdentifier("my-posts")
            .onReceive(NotificationCenter.default.publisher(for: .pulsePostsDidChange)) { _ in
                Task { await viewModel.refresh() }
            }
            .confirmationDialog(
                "Post options",
                isPresented: Binding(
                    get: { bindable.kebabTarget != nil },
                    set: { newValue in if !newValue { bindable.kebabTarget = nil } }
                ),
                titleVisibility: .hidden,
                presenting: bindable.kebabTarget
            ) { target in
                if !target.isArchived, !target.isPlanPost {
                    // The row's Edit, now that each post is its Pulse card.
                    Button("Edit post") {
                        viewModel.editPost(postId: target.postId)
                    }
                    .accessibilityIdentifier("kebab-edit")
                }
                if target.isPlanPost {
                    // A plan's own post changes or is cancelled from its plan, which
                    // tells everyone; the server refuses archiving or deleting it.
                    Button("Open plan") {
                        viewModel.openPlan(postId: target.postId)
                    }
                    .accessibilityIdentifier("kebab-open-plan")
                    if target.isArchived, !target.isRemovedByModerator {
                        Button("Restore post") {
                            restore(postId: target.postId)
                        }
                        .accessibilityIdentifier("kebab-restore")
                    }
                } else {
                    if target.isArchived {
                        // A post a moderator removed can't be restored (the backend refuses).
                        if !target.isRemovedByModerator {
                            Button("Restore post") {
                                restore(postId: target.postId)
                            }
                            .accessibilityIdentifier("kebab-restore")
                        }
                    } else {
                        if let pinTitle = viewModel.profilePinTitle(postId: target.postId) {
                            Button(pinTitle) {
                                Task { await viewModel.toggleProfilePin(postId: target.postId) }
                            }
                            .accessibilityIdentifier("kebab-profile-pin")
                        }
                        Button("Archive post") {
                            archive(postId: target.postId)
                        }
                        .accessibilityIdentifier("kebab-archive")
                    }
                    Button("Delete post", role: .destructive) {
                        deleteRequest(postId: target.postId)
                    }
                    .accessibilityIdentifier("kebab-delete")
                }
                Button("Cancel", role: .cancel) {
                    viewModel.cancelKebab()
                }
            }
            .alert(
                "Delete this post?",
                isPresented: Binding(
                    get: { bindable.deleteTarget != nil },
                    set: { newValue in if !newValue { bindable.deleteTarget = nil } }
                ),
                presenting: bindable.deleteTarget
            ) { target in
                Button("Delete", role: .destructive) {
                    Task { await viewModel.confirmDelete(target) }
                }
                .accessibilityIdentifier("delete-confirm")
                Button("Cancel", role: .cancel) {
                    viewModel.cancelDelete()
                }
                .accessibilityIdentifier("delete-cancel")
            } message: { _ in
                Text("This post will be permanently removed from your profile and the Pulse feed.")
            }
            .sheet(isPresented: $bindable.isFilterPresented) {
                ActivityFilterSheet(
                    statusTitle: viewModel.statusFilterTitle,
                    statusOptions: viewModel.statusFilterOptions,
                    sortOptions: viewModel.sortFilterOptions,
                    filter: viewModel.activityFilter,
                    onApply: { viewModel.applyFilter($0) },
                    onClose: { viewModel.isFilterPresented = false }
                )
            }
            // Saved and Reposts cards: Post options (Share…, Report post) and the report reasons, as on a profile.
            .modifier(ProfilePostCardSurfaces(model: viewModel.saved.cards))
            .modifier(ProfilePostCardSurfaces(model: viewModel.reposts.cards))
            // "Repost with your words" on one of your own posts.
            .modifier(ProfilePostQuoteComposer(model: viewModel.cards))
    }

    // MARK: - Post cards

    /// One post as its Pulse card, with the controls the Pulse feed gives it. Your own posts' ⋯ opens this screen's
    /// menu; a saved or reposted post's opens Post options, as on a profile.
    private func postCard(_ card: PulsePostCardContent, row: RowModel) -> some View {
        let model = viewModel.visibleCards
        let ownPost = model === viewModel.cards
        let postId = card.id
        var options: (@MainActor () -> Void)?
        if ownPost {
            options = { viewModel.requestKebab(postId: postId) }
        } else if model.hasOptions(card) {
            options = { model.overflowPostId = postId }
        }
        let going: @MainActor () -> Void = { Task { await model.tapReaction(postId: postId) } }
        let onTap = row.onTap
        return VStack(alignment: .leading, spacing: Spacing.s0) {
            if ownPost, viewModel.isRemovedByModerator(postId: postId) {
                removedNote
            }
            PulsePostCard(
                content: card,
                onTap: { onTap() },
                onPickReaction: { emoji in Task { await model.pickReaction(postId: postId, emoji: emoji) } },
                onRSVP: card.attendees == nil ? nil : going,
                onOverflow: options,
                onToggleSave: { Task { await model.toggleSave(postId: postId) } },
                // ↻ opens the Repost chooser, as on every Pulse card.
                onToggleRepost: { model.openRepostChooser(postId: postId) },
                onOpenQuotedPost: { viewModel.openPost(postId: $0) },
                repostChooser: PulseCardRepostChooser(
                    target: Binding(get: { model.repostChooser }, set: { model.repostChooser = $0 }),
                    onToggle: { postId in Task { await model.toggleRepost(postId: postId) } },
                    onQuote: { postId in model.beginQuote(postId: postId) }
                )
            )
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("myPostsCard_\(postId)")
    }

    /// Above an archived post a moderator removed: why its menu has no Restore (the old row's REMOVED chip).
    private var removedNote: some View {
        HStack(spacing: Spacing.s1) {
            Icon(.shieldAlert, size: 14, color: Theme.Color.warning)
            Text("Removed by a moderator")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.warning)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.top, Spacing.s3)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Action helpers

    /// Look up the DTO for a post id from the VM's current cache via the
    /// kebab target metadata. The VM exposes archive / unarchive / delete
    /// by full DTO; tests assert against VM methods directly.
    private func archive(postId: String) {
        // The VM expects the DTO; we already know the id matches a row.
        // Look up via the loaded state.
        if let dto = currentDTO(for: postId) {
            Task { @MainActor in await viewModel.archive(dto) }
        }
    }

    private func restore(postId: String) {
        if let dto = currentDTO(for: postId) {
            Task { @MainActor in await viewModel.unarchive(dto) }
        }
    }

    private func deleteRequest(postId: String) {
        if let dto = currentDTO(for: postId) {
            viewModel.requestDelete(dto)
        }
    }

    /// Scan the VM's loaded state for a DTO matching the kebab target.
    /// Since the kebab target carries enough info on its own (id +
    /// archive state), this can also be omitted — but we keep it because
    /// the archive endpoint will eventually take other DTO fields too
    /// (e.g. archive reason) and the lookup centralises that future hook.
    private func currentDTO(for postId: String) -> MyPostDTO? {
        // We only need an id + archive state to drive the VM today, so
        // synthesise a minimal DTO. When the archive endpoint accepts
        // more fields, this becomes a real lookup.
        MyPostDTO(
            id: postId,
            userId: "",
            createdAt: ""
        )
    }
}

#Preview {
    NavigationStack {
        MyPostsView(viewModel: MyPostsViewModel())
    }
}
