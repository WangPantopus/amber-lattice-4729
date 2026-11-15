import SafariServices
import SwiftUI

/// "Read at The Columbian": where a post's story was published (`PostSource`), under its text on the Pulse card and
/// on the post page. A tap opens the story in the app's own browser sheet, as a link in a post's text does
/// (`PostLinkText`); the view that shows the row owns that sheet (`postSourceBrowser`). Parity twin of Android's
/// `PostSourceLink`.
struct PostSourceLink: View {
    let source: PostSource
    let accessibilityID: String
    let onOpen: @MainActor () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: Spacing.s2) {
                Icon(.link, size: 14, strokeWidth: 2.2, color: Theme.Color.primary600)
                Text(source.label)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(Theme.Color.primary600)
                    .lineLimit(1)
                Spacer(minLength: Spacing.s2)
                Icon(.externalLink, size: 13, color: Theme.Color.primary600)
            }
            .padding(.horizontal, Spacing.s3)
            .padding(.vertical, Spacing.s2)
            .background(Theme.Color.appSurfaceSunken)
            .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                    .strokeBorder(Theme.Color.appBorder, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(source.label)
        .accessibilityHint("Opens the story where it was published.")
        .accessibilityIdentifier(accessibilityID)
    }
}

extension PostSource: Identifiable {
    public var id: String {
        url.absoluteString
    }
}

extension View {
    /// The browser sheet a `PostSourceLink` opens: the story at its outlet.
    func postSourceBrowser(_ opened: Binding<PostSource?>) -> some View {
        sheet(item: opened) { source in
            PostSourceBrowser(url: source.url).ignoresSafeArea()
        }
    }
}

private struct PostSourceBrowser: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context _: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_: SFSafariViewController, context _: Context) {}
}
