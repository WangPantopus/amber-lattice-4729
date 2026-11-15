//
//  PostPresentationHost.swift
//  Pantopus
//
//  A post's picture viewer and the browser sheet of its "Read at <outlet>"
//  link, presented by a screen that stays while the post's own screen is made
//  anew. On the iPhone Duo, Today's Around you shows the open post beside the
//  list while the Duo is open and held sideways, and pushed over the list
//  everywhere else, so a fold or a turn replaces the post's screen; a viewer
//  or a browser sheet that screen presented itself would close with it. The
//  screen that stays keeps a host, hands it down the environment and presents
//  for the pictures (`PostMediaGridView`) and the link (`PostSourceLink`)
//  under it. Without a host each presents for itself, as everywhere else.
//

import Observation
import SwiftUI

/// The pictures open in the viewer, and the one the reader is on.
struct PostMediaViewerPresentation: Identifiable {
    let id = UUID()
    let items: [PostMediaItem]
    let page: MediaViewerPage

    @MainActor
    init(items: [PostMediaItem], index: Int) {
        self.items = items
        page = MediaViewerPage(index)
    }
}

/// What is presented for the posts under one screen.
@Observable
@MainActor
final class PostPresentationHost {
    var viewer: PostMediaViewerPresentation?
    var source: PostSource?
}

private struct PostPresentationHostKey: EnvironmentKey {
    static var defaultValue: PostPresentationHost? {
        nil
    }
}

extension EnvironmentValues {
    /// The screen that presents the picture viewer and the story browser for the posts under it; nil where each
    /// post presents its own.
    var postPresentationHost: PostPresentationHost? {
        get { self[PostPresentationHostKey.self] }
        set { self[PostPresentationHostKey.self] = newValue }
    }
}

extension View {
    /// Presents the picture viewer and the story browser for the posts under this screen, and hands them `host`.
    /// A screen pushed over this one needs the host handed to it again (a stack's pushed screens don't inherit the
    /// environment of the screen that pushes them).
    func presentsPosts(_ host: PostPresentationHost) -> some View {
        @Bindable var host = host
        return environment(\.postPresentationHost, host)
            .fullScreenCover(item: $host.viewer) { viewer in
                MediaViewerView(items: viewer.items, page: viewer.page)
            }
            .postSourceBrowser($host.source)
    }
}
