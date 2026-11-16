//
//  PulseTabRoot+MyPosts.swift
//  Pantopus
//
//  My posts on the Pulse tab's stack: "View" on a "Saved." toast opens it on
//  the Saved tab (PULSEREPOST contract §5), the screen the side menu's My
//  Pulse opens, with the stack's system bar for its title, Back and filter.
//

import SwiftUI

extension PulseRoute {
    /// Every Pulse screen draws its own header but My posts, which keeps the stack's system bar.
    var drawsOwnHeader: Bool {
        if case .myPosts = self { return false }
        return true
    }
}

extension PulseTabRoot {
    /// My posts on the tab asked for (`MyPostsTab`); its posts, the composer and Edit open on this stack (`push`).
    static func myPostsScreen(initialTab: String, push: @escaping @MainActor (PulseRoute) -> Void) -> some View {
        MyPostsView(
            viewModel: MyPostsViewModel(
                initialTab: initialTab,
                onOpenPost: { dto in push(.post(postId: dto.id)) },
                // No preset purpose: the composer asks what the post is for.
                onCompose: { push(.compose(intent: PulseIntent.all.rawValue)) },
                onEditPost: { dto in push(.editPost(postId: dto.id)) }
            )
        )
    }
}
