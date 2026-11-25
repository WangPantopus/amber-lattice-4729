//
//  PublicProfileView+SourcesSheets.swift
//  Pantopus
//
//  The profile with sources' sheets: a month of the record, a piece, today's portfolio, the posts and the share sheet.
//

import SwiftUI

/// The page's sheets: a month, a piece, the posts and the share sheet.
struct SourcesSheets: ViewModifier {
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
                ProfilePieceSheet(
                    model: page,
                    isOwner: content.isOwner && view.viewModel.previewAudience == nil && page.openedPieceOwner == nil,
                    onOpenLink: { link in
                        page.closePiece()
                        view.openSourcesLink(link, payload: payload, page: page)
                    },
                    onClose: { page.closePiece() }
                )
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
