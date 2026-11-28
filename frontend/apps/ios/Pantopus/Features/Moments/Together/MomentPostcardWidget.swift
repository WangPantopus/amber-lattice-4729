//
//  MomentPostcardWidget.swift
//  Pantopus
//
//  The app's side of the postcard widget ("Pulse, reinvented" phase 3, PHASE-3 piece 9; CONTRACT 8j;
//  `PantopusWidgets/PostcardWidget.swift`). It reads what the Mail tab reads (`GET /api/mailbox`), finds the newest
//  postcard (a letter "A postcard from …": a morning postcard or a Mail it letter), and writes its sender's name, its day
//  and a small copy of its enclosed picture into the app group for the widget to draw. Only while `pulse_reinvented` is
//  on and the Mailbox is: otherwise the flag that puts the widget in the gallery and the snapshot are cleared
//  (`PulseReinventedFlags` calls `clear()` when the switch reads off), so a switched-off phone draws today's gallery.
//

import Foundation
import UIKit
import WidgetKit

/// What the widget draws (`PostcardWidgetEntryData` there; the same keys).
struct PostcardWidgetSnapshot: Codable, Equatable {
    let mailId: String
    let from: String
    let deliveredAt: Date
    let hasPicture: Bool
}

@MainActor
enum PostcardWidgetStore {
    static let kind = "PantopusPostcard"
    static let snapshotKey = "pantopus.widget.postcard.v1"
    static let onKey = "pantopus.widget.postcard.on"
    static let pictureName = "postcard-widget.jpg"
    static let subjectStart = "A postcard from "
    /// Reads closer together than this reuse the last one.
    private static let every: TimeInterval = 300
    private static var lastRead: Date?

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: GigWidgetSnapshotContract.appGroupId)
    }

    private static var pictureURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: GigWidgetSnapshotContract.appGroupId)?
            .appendingPathComponent(pictureName)
    }

    /// The newest postcard read again (at most every five minutes unless `force`), written for the widget.
    static func refresh(force: Bool = false) async {
        guard PulseReinventedFlags.shared.isOn, LaunchFeatures.mailbox, MomentsComposerModel.account != nil else {
            clear()
            return
        }
        if !force, let lastRead, Date().timeIntervalSince(lastRead) < every { return }
        lastRead = Date()
        let wasOn = defaults?.bool(forKey: onKey) ?? false
        defaults?.set(true, forKey: onKey)
        guard let page: PostcardListPage = try? await APIClient.shared.request(MailboxEndpoints.list(limit: 30)) else {
            if !wasOn { WidgetCenter.shared.reloadTimelines(ofKind: kind) }
            return
        }
        guard let newest = page.mail.first(where: { $0.subject?.hasPrefix(subjectStart) == true }) else {
            write(nil)
            return
        }
        if let current = stored(), current.mailId == newest.id, wasOn { return }
        let picture = await picture(of: newest.id)
        let from = String(newest.subject?.dropFirst(subjectStart.count) ?? "")
        write(PostcardWidgetSnapshot(
            mailId: newest.id,
            from: from.isEmpty ? "someone close" : from,
            deliveredAt: MomentTime.parse(newest.deliveredAt) ?? Date(),
            hasPicture: picture
        ))
    }

    /// The switch went off (or the person signed out): the widget leaves the gallery and draws nothing of theirs.
    static func clear() {
        guard let defaults, defaults.object(forKey: onKey) != nil || defaults.data(forKey: snapshotKey) != nil else { return }
        defaults.removeObject(forKey: onKey)
        defaults.removeObject(forKey: snapshotKey)
        if let pictureURL { try? FileManager.default.removeItem(at: pictureURL) }
        lastRead = nil
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }

    private static func stored() -> PostcardWidgetSnapshot? {
        guard let data = defaults?.data(forKey: snapshotKey) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(PostcardWidgetSnapshot.self, from: data)
    }

    private static func write(_ snapshot: PostcardWidgetSnapshot?) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let snapshot, let data = try? encoder.encode(snapshot) {
            defaults?.set(data, forKey: snapshotKey)
        } else {
            defaults?.removeObject(forKey: snapshotKey)
        }
        if snapshot?.hasPicture != true, let pictureURL { try? FileManager.default.removeItem(at: pictureURL) }
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }

    /// The letter's first enclosed picture, a small copy saved for the widget. True when it was saved.
    private static func picture(of mailId: String) async -> Bool {
        guard let pictureURL,
              let detail: MailDetailResponse = try? await APIClient.shared.request(MailboxEndpoints.detail(mailId: mailId)),
              let enclosure = detail.mail.item.enclosures.first(where: { ($0.mimeType ?? "").hasPrefix("image/") }),
              let link: MailEnclosureLink = try? await APIClient.shared.request(
                  MailboxEndpoints.enclosureLink(mailId: mailId, enclosureId: enclosure.id)
              ),
              let url = URL(string: link.url),
              let fetched = try? await URLSession.shared.data(from: url),
              let image = UIImage(data: fetched.0),
              let small = smaller(image).jpegData(compressionQuality: 0.8)
        else { return false }
        return (try? small.write(to: pictureURL, options: .atomic)) != nil
    }

    /// A widget draws in little memory: at most 700 points on the longest side.
    private static func smaller(_ image: UIImage) -> UIImage {
        let side = max(image.size.width, image.size.height)
        guard side > 700 else { return image }
        let scale = 700 / side
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }
}

/// Only what the widget needs of `GET /api/mailbox`.
private struct PostcardListPage: Decodable {
    struct Item: Decodable {
        let id: String
        let subject: String?
        let deliveredAt: String?

        private enum CodingKeys: String, CodingKey {
            case id, subject
            case deliveredAt = "delivered_at"
        }
    }

    let mail: [Item]
}
