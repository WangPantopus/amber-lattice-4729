//
//  ShareInbox.swift
//  Pantopus
//
//  What another app's share sheet hands to Pantopus (founder, 2026-11-27).
//  `PantopusShare`, the share extension, copies the photos, videos, link or
//  words into a folder in the shared App Group and says where in Pantopus they
//  go; the app reads the folder when it comes forward and opens that composer
//  (`ShareInCoordinator`). The extension can't read the app's Keychain or
//  memory, so the app also leaves here who is signed in and which places they
//  can share to. Compiled into BOTH targets (see `project.yml`); keep it
//  Foundation-only.
//

import Foundation

/// Where in Pantopus a shared thing goes: the cards the extension shows.
public enum ShareInDestination: String, Codable, CaseIterable, Sendable {
    case moments
    case pulse
    case messages
    case mail
    case plans
}

/// One copied file, by its name in the share's folder.
public struct ShareInFile: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case image
        case video
    }

    public let kind: Kind
    public let name: String

    public init(kind: Kind, name: String) {
        self.kind = kind
        self.name = name
    }
}

/// One share: what was shared and where the person sent it.
public struct ShareInPayload: Codable, Equatable, Sendable {
    public let id: String
    public let createdAt: Date
    /// The account that was signed in when it was shared; another account never opens it.
    public let account: String
    public let destination: ShareInDestination
    public let files: [ShareInFile]
    /// Words shared with it, and a shared link.
    public let text: String?
    public let link: String?
    /// The chat a suggested person or group in the share sheet stands for.
    public let conversationId: String?

    public init(
        id: String,
        createdAt: Date = Date(),
        account: String,
        destination: ShareInDestination,
        files: [ShareInFile],
        text: String?,
        link: String?,
        conversationId: String?
    ) {
        self.id = id
        self.createdAt = createdAt
        self.account = account
        self.destination = destination
        self.files = files
        self.text = text
        self.link = link
        self.conversationId = conversationId
    }
}

/// Who is signed in, for the extension's "Sharing as" line, and the places they can share to.
public struct ShareInAccount: Codable, Equatable, Sendable {
    public let userId: String
    public let name: String
    public let destinations: [ShareInDestination]

    public init(userId: String, name: String, destinations: [ShareInDestination]) {
        self.userId = userId
        self.name = name
        self.destinations = destinations
    }
}

public enum ShareInbox {
    /// Declared in both targets' entitlements (`project.yml`).
    public static let appGroupId = "group.app.pantopus.ios"
    /// The link the extension opens the app with (`pantopus://share-in`).
    public static let linkHost = "share-in"
    /// A share nobody opened is dropped after this long.
    public static let keepsFor: TimeInterval = 60 * 60
    /// The most photos or videos one share carries (the extension's activation rule says the same).
    public static let mostFiles = 10

    private static let accountKey = "shareInAccountV1"
    private static let payloadName = "share.json"

    // MARK: - Who is signed in

    /// `nil` when nobody is signed in.
    public static func write(account: ShareInAccount?) {
        let defaults = UserDefaults(suiteName: appGroupId)
        guard let account, let data = try? JSONEncoder().encode(account) else {
            defaults?.removeObject(forKey: accountKey)
            return
        }
        defaults?.set(data, forKey: accountKey)
    }

    public static func account() -> ShareInAccount? {
        guard let data = UserDefaults(suiteName: appGroupId)?.data(forKey: accountKey) else { return nil }
        return try? JSONDecoder().decode(ShareInAccount.self, from: data)
    }

    // MARK: - The folders

    private static var root: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)?
            .appendingPathComponent("ShareIn", isDirectory: true)
    }

    public static func folder(id: String) -> URL? {
        root?.appendingPathComponent(id, isDirectory: true)
    }

    /// A new, empty folder for one share's files. Its name starts with when it was made, so a folder left half
    /// copied can be told from one still being filled without reading file dates.
    public static func newFolder(now: Date = Date()) throws -> (id: String, url: URL) {
        let id = "\(Int(now.timeIntervalSince1970))-\(UUID().uuidString)"
        guard let url = folder(id: id) else { throw CocoaError(.fileNoSuchFile) }
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return (id, url)
    }

    /// The share is ready for the app once this is written: files first, then this.
    public static func write(_ payload: ShareInPayload) throws {
        guard let url = folder(id: payload.id) else { throw CocoaError(.fileNoSuchFile) }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        try encoder.encode(payload).write(to: url.appendingPathComponent(payloadName), options: .atomic)
    }

    /// The newest share that is ready and still fresh.
    public static func latest(now: Date = Date()) -> ShareInPayload? {
        guard let root, let names = try? FileManager.default.contentsOfDirectory(atPath: root.path) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        return names
            .compactMap { name -> ShareInPayload? in
                let file = root.appendingPathComponent(name).appendingPathComponent(payloadName)
                guard let data = try? Data(contentsOf: file) else { return nil }
                return try? decoder.decode(ShareInPayload.self, from: data)
            }
            .filter { now.timeIntervalSince($0.createdAt) < keepsFor }
            .max { $0.createdAt < $1.createdAt }
    }

    public static func remove(id: String) {
        guard let url = folder(id: id) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    /// Drops every share but `keeping`: ones nobody opened, and folders a closed share sheet left half copied.
    public static func sweep(keeping: String? = nil, now: Date = Date()) {
        guard let root, let names = try? FileManager.default.contentsOfDirectory(atPath: root.path) else { return }
        for name in names where name != keeping {
            let made = name.split(separator: "-").first.flatMap { TimeInterval($0) } ?? 0
            // A folder still being copied into by an open share sheet is younger than this.
            if now.timeIntervalSince1970 - made > keepsFor {
                try? FileManager.default.removeItem(at: root.appendingPathComponent(name))
            }
        }
    }

    /// Nobody is signed in any more: nothing shared stays on the phone.
    public static func clear() {
        guard let root else { return }
        try? FileManager.default.removeItem(at: root)
    }
}
