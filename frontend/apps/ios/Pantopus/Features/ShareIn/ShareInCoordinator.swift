//
//  ShareInCoordinator.swift
//  Pantopus
//
//  What another app's share sheet handed to Pantopus, opened in the app
//  (founder, 2026-11-27). The share extension (`PantopusShare`) leaves the
//  photos, videos, link or words in the shared App Group with the place the
//  person picked (`ShareInbox`) and brings the app forward. Here the app
//  reads it whenever it comes forward, as well as on the extension's link, so
//  a share still opens if the link never arrived, and sends it on:
//
//  - Moments: the composer, with the photo or video as its draft. While
//    "Pulse, reinvented" is on, every Moment is made in Pulse's Studio, so
//    Pulse's card opens the Studio the same way.
//  - Pulse: the post composer, with the photos attached and the words written.
//  - Message: the chat picker, then that chat with it all in its composer.
//  - Plans: one of the person's plans, then that plan's chat the same way
//    (`ShareInPlanFlow`).
//  - Mail: the Christmas card flow; the photo goes on the card at "Write on
//    the back" (`ShareInCardPhoto`).
//
//  Only the account that shared it opens it, and only within the hour.
//

import SwiftUI

@Observable
@MainActor
final class ShareInCoordinator {
    static let shared = ShareInCoordinator()

    /// The share a cover over the tabs is showing (Pulse's composer, a chat, a plan's chat).
    var presented: ShareInArrival?
    /// Counts the extension's link arriving, for the tabs to read the App Group again.
    private(set) var arrivals = 0

    private init() {}

    /// `pantopus://share-in`, the link the extension opens the app with. True when `url` is that link.
    func take(_ url: URL) -> Bool {
        guard url.scheme == "pantopus", url.host == ShareInbox.linkHost else { return false }
        arrivals += 1
        return true
    }

    /// "Pulse, reinvented" is on for the person: Moments are made in Pulse's Studio and the Moments tab isn't drawn.
    static var studioIsPulse: Bool {
        PulseReinventedFlags.shared.isOn && !ReinventedServer.shared.behind
    }

    /// What the extension shows this account: its name and the places it can share to.
    static func publish(account: String?, places: ShareInPlaces) {
        guard let account, case let .signedIn(user) = AuthManager.shared.state, user.id == account else { return }
        // The name the person goes by, or their username until they have one.
        let name = user.displayName.flatMap { $0.isEmpty ? nil : $0 } ?? user.username
        var destinations: [ShareInDestination] = [.pulse, .messages]
        // One camera while "Pulse, reinvented" is on: Pulse's card is the Studio, and there is no second one.
        if places.moments, !studioIsPulse { destinations.insert(.moments, at: 0) }
        if places.cards { destinations.append(.mail) }
        if places.plans { destinations.append(.plans) }
        ShareInbox.write(account: ShareInAccount(userId: account, name: name, destinations: destinations))
    }

    /// The app came forward, or the extension's link arrived: open the newest share, if there is one for `account`.
    func arrive(account: String?, tabs: RootTabModel, places: ShareInPlaces) {
        guard let account, presented == nil else { return }
        guard let payload = ShareInbox.latest() else {
            ShareInbox.sweep()
            return
        }
        ShareInbox.sweep(keeping: payload.id)
        // Shared while another account was signed in: never this account's to open.
        guard payload.account == account else {
            ShareInbox.remove(id: payload.id)
            return
        }
        let media = payload.files.first
        switch payload.destination {
        case .moments where places.moments, .pulse where places.moments && Self.studioIsPulse && media != nil:
            openComposer(payload, tabs: tabs)
        case .mail where places.cards:
            openCards(payload)
        case .pulse, .messages:
            present(payload)
        case .plans where places.plans:
            present(payload)
        case .moments, .mail, .plans:
            // That place went off since it was shared: nothing opens.
            ShareInbox.remove(id: payload.id)
        }
    }

    /// The cover's content starts reading at once, and keeps what it read however often the cover is built: a sheet
    /// already up (a first-run notice on a cold start) makes SwiftUI build it before it can show.
    private func present(_ payload: ShareInPayload) {
        let arrival = ShareInArrival(payload: payload)
        presented = arrival
        Task { await arrival.read() }
    }

    /// The Christmas card flow in Mail, with the first photo waiting for "Write on the back".
    private func openCards(_ payload: ShareInPayload) {
        defer { ShareInbox.remove(id: payload.id) }
        guard let first = payload.files.first(where: { $0.kind == .image }),
              let folder = ShareInbox.folder(id: payload.id),
              let data = try? Data(contentsOf: folder.appendingPathComponent(first.name)) else { return }
        ShareInCardPhoto.shared.leave(data)
        DeepLinkRouter.shared.handle(path: "/app/mailbox/cards")
    }

    /// The Moments composer (or the Studio from Pulse) with the first photo or video as its draft.
    private func openComposer(_ payload: ShareInPayload, tabs: RootTabModel) {
        defer { ShareInbox.remove(id: payload.id) }
        guard let first = payload.files.first, let folder = ShareInbox.folder(id: payload.id) else { return }
        // Out of the App Group, which is emptied now: the composer reads it when its gate opens.
        let copy = FileManager.default.temporaryDirectory
            .appendingPathComponent("shared-\(UUID().uuidString)-\(first.name)")
        guard (try? FileManager.default.copyItem(at: folder.appendingPathComponent(first.name), to: copy)) != nil else { return }
        let shared = MomentsSharedMedia(file: copy, isVideo: first.kind == .video)
        if Self.studioIsPulse {
            tabs.selected = RootTab.pulseHome
            ReinventedStudioPresenter.shared.composing = MomentsComposeRequest(
                model: MomentsComposerModel(), studio: true, shared: shared
            )
        } else {
            tabs.selected = .moments
            MomentsNavigator.shared.pendingShare = shared
        }
    }
}

/// The places a person can share to right now, as the tabs know them.
struct ShareInPlaces: Equatable {
    /// The Moments switch is on for the person.
    var moments = false
    /// The Plans switch is on for the person.
    var plans = false
    /// Christmas cards are open and take a photo of the person's own.
    var cards = false
}

/// On the tabs' root: tells the extension who is signed in, opens a share when the app comes forward, and holds
/// the cover Pulse's composer and the chat flows show in.
struct ShareInLanding: ViewModifier {
    /// The signed-in account and its name.
    let account: String?
    let name: String
    let tabs: RootTabModel
    let places: ShareInPlaces
    /// Closes the tabs' own covers (the profile, an invitation), which would hide what opens.
    let closeCovers: () -> Void

    @State private var coordinator = ShareInCoordinator.shared
    @Environment(\.scenePhase) private var scenePhase

    private var published: String {
        "\(account ?? "")|\(name)|\(places)|\(ShareInCoordinator.studioIsPulse)"
    }

    func body(content: Content) -> some View {
        content
            .task(id: published) {
                ShareInCoordinator.publish(account: account, places: places)
                arrive()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { arrive() }
            }
            .onChange(of: coordinator.arrivals) { _, _ in arrive() }
            .fullScreenCover(item: $coordinator.presented) { arrival in
                ShareInCover(arrival: arrival) { coordinator.presented = nil }
                    .readableColumn()
            }
    }

    private func arrive() {
        let before = coordinator.presented
        coordinator.arrive(account: account, tabs: tabs, places: places)
        if coordinator.presented !== before { closeCovers() }
    }
}

/// One share on its way into a cover: what was shared, read from the App Group once. Held by the coordinator, not
/// by the cover's screen, which SwiftUI may build more than once before it shows.
@Observable
@MainActor
final class ShareInArrival: Identifiable {
    let payload: ShareInPayload
    /// The photos and videos, read as ones picked from the album are; nil while reading.
    private(set) var media: [PulseComposePhoto]?
    private(set) var failed = false
    private var started = false

    init(payload: ShareInPayload) {
        self.payload = payload
    }

    /// The words and the link, one under the other.
    var words: String {
        [payload.text, payload.link]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
    }

    /// The same pictures as a chat's composer takes them; a video goes as the album's are sent there.
    var attachments: [ChatQueuedAttachment] {
        (media ?? []).map { photo in
            let mimeType = photo.mimeType ?? "image/jpeg"
            return ChatQueuedAttachment(
                id: photo.id.uuidString,
                kind: mimeType.hasPrefix("image/") ? .image : .document,
                filename: photo.filename ?? "photo.jpg",
                mimeType: mimeType,
                data: photo.data,
                liveVideo: photo.liveVideo
            )
        }
    }

    /// Reads the files into memory, then empties the App Group folder: the composer owns them from here.
    func read() async {
        guard !started else { return }
        started = true
        defer { ShareInbox.remove(id: payload.id) }
        guard let folder = ShareInbox.folder(id: payload.id) else {
            failed = true
            return
        }
        // A post carries nine, a chat message five; the rest stay behind.
        let most = payload.destination == .pulse ? pulseComposeMaxPhotos : 5
        var read: [PulseComposePhoto] = []
        for file in payload.files.prefix(most) {
            let url = folder.appendingPathComponent(file.name)
            if let photo = try? await PulseComposePhoto.shared(file: url, isVideo: file.kind == .video) { read.append(photo) }
        }
        if read.isEmpty, !payload.files.isEmpty {
            failed = true
            return
        }
        media = read
    }
}

/// Pulse's composer, a chat or a plan's chat, once what was shared is read.
private struct ShareInCover: View {
    let arrival: ShareInArrival
    let onClose: @MainActor () -> Void

    var body: some View {
        Group {
            if let media = arrival.media {
                switch arrival.payload.destination {
                case .messages:
                    ShareInChatFlow(
                        attachments: arrival.attachments,
                        text: arrival.words,
                        roomId: arrival.payload.conversationId,
                        onClose: onClose
                    )
                case .plans:
                    ShareInPlanFlow(attachments: arrival.attachments, text: arrival.words, onClose: onClose)
                default:
                    PulseComposeFlowView(
                        prefillBody: arrival.words.isEmpty ? nil : arrival.words,
                        prefillPhotos: media,
                        onCancel: onClose
                    ) { _ in onClose() }
                }
            } else {
                reading
            }
        }
        .task { await arrival.read() }
    }

    private var reading: some View {
        VStack(spacing: Spacing.s4) {
            if arrival.failed {
                Text("Couldn't open what you shared.")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.Color.appText)
                Text("Share it again from the other app.")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            } else {
                ProgressView()
                    .accessibilityLabel("Opening what you shared")
            }
            GhostButton(title: arrival.failed ? "Close" : "Cancel") { onClose() }
                .frame(maxWidth: 200)
                .accessibilityIdentifier("shareIn.cover.close")
        }
        .padding(Spacing.s5)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Color.appBg.ignoresSafeArea())
    }
}
