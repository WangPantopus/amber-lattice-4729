//
//  ShareModel.swift
//  PantopusShare
//
//  What the share sheet handed over, copied into the shared App Group while
//  the cards show, and the hand-off to the app once a card is tapped
//  (`ShareInbox`). Photos and videos are copied as files, never decoded here:
//  a share extension has little memory.
//

import AVFoundation
import ImageIO
import Intents
import Observation
import UIKit
import UniformTypeIdentifiers

@Observable
@MainActor
final class ShareModel {
    /// Who is signed in to Pantopus on this phone, as the app last left it.
    let account: ShareInAccount?
    /// The first photo, or the first video's first frame, small.
    private(set) var thumbnail: UIImage?
    /// True once everything is copied.
    private(set) var isReady = false
    private(set) var failure: String?
    /// The card that was tapped: it spins until the copy is done and the app opens.
    private(set) var sending: ShareInDestination?
    /// A person or group the share sheet suggested: the photo goes straight to that chat.
    private(set) var suggestedChat: (id: String, name: String)?

    /// The share is ready but the app couldn't be brought forward: the screen says to open Pantopus.
    var waitsForApp = false

    private var files: [ShareInFile] = []
    private var text: String?
    private var link: String?
    private var folder: (id: String, url: URL)?
    private var copying: Task<Void, Never>?
    private var hasMedia = false
    private var hasPhoto = false

    init() {
        account = ShareInbox.account()
    }

    /// The cards to show: the places the person can share to that take what was shared.
    var destinations: [ShareInDestination] {
        guard let account else { return [] }
        let order: [ShareInDestination] = [.moments, .pulse, .messages, .mail, .plans]
        return order.filter { destination in
            guard account.destinations.contains(destination) else { return false }
            switch destination {
            // A Moment is a photo or a video; a card carries a photo.
            case .moments: return hasMedia
            case .mail: return hasPhoto
            case .pulse, .messages, .plans: return true
            }
        }
    }

    // MARK: - Reading what was shared

    func start(items: [NSExtensionItem], intent: INIntent?) {
        if let message = intent as? INSendMessageIntent, let id = message.conversationIdentifier {
            let name = message.speakableGroupName?.spokenPhrase ?? message.recipients?.first?.displayName ?? "the chat"
            suggestedChat = (id, name)
        }
        let providers = items.flatMap { $0.attachments ?? [] }
        hasPhoto = providers.contains { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
        hasMedia = hasPhoto || providers.contains { $0.hasItemConformingToTypeIdentifier(UTType.movie.identifier) }
        // Safari's page title, a note's words.
        let words = items.compactMap { $0.attributedContentText?.string }.joined(separator: "\n")
        if !words.isEmpty { text = words }
        guard account != nil else { return }
        copying = Task { await copy(providers) }
    }

    private func copy(_ providers: [NSItemProvider]) async {
        do {
            let folder = try ShareInbox.newFolder()
            self.folder = folder
            for provider in providers {
                if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
                    guard files.count < ShareInbox.mostFiles else { continue }
                    let name = try await Self.copyFile(of: provider, type: .movie, into: folder.url, index: files.count)
                    files.append(ShareInFile(kind: .video, name: name))
                    if thumbnail == nil { thumbnail = await Self.frame(of: folder.url.appendingPathComponent(name)) }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    guard files.count < ShareInbox.mostFiles else { continue }
                    let name = try await Self.copyImage(of: provider, into: folder.url, index: files.count)
                    files.append(ShareInFile(kind: .image, name: name))
                    if thumbnail == nil { thumbnail = Self.small(folder.url.appendingPathComponent(name)) }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL, !url.isFileURL {
                        link = url.absoluteString
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let words = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                        text = [text, words].compactMap { $0 }.joined(separator: "\n")
                    }
                }
            }
            guard !files.isEmpty || link != nil || !(text ?? "").isEmpty else {
                failure = "Pantopus can't open this."
                return
            }
            isReady = true
        } catch {
            failure = "Couldn't read what you shared. Try again."
        }
    }

    private static func copyFile(of provider: NSItemProvider, type: UTType, into folder: URL, index: Int) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            // The file exists only inside this callback: it's copied before returning.
            provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { original, error in
                do {
                    guard let original else { throw error ?? CocoaError(.fileNoSuchFile) }
                    let ending = original.pathExtension.isEmpty ? (type == .movie ? "mov" : "jpg") : original.pathExtension
                    let name = "\(index).\(ending.lowercased())"
                    try FileManager.default.copyItem(at: original, to: folder.appendingPathComponent(name))
                    continuation.resume(returning: name)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    /// A photo as its file; a screenshot's share sheet hands a picture with no file, which is written as one.
    private static func copyImage(of provider: NSItemProvider, into folder: URL, index: Int) async throws -> String {
        if let name = try? await copyFile(of: provider, type: .image, into: folder, index: index) { return name }
        let item = try await provider.loadItem(forTypeIdentifier: UTType.image.identifier)
        let name = "\(index).jpg"
        let target = folder.appendingPathComponent(name)
        if let url = item as? URL {
            let ending = url.pathExtension.isEmpty ? "jpg" : url.pathExtension.lowercased()
            let named = "\(index).\(ending)"
            try FileManager.default.copyItem(at: url, to: folder.appendingPathComponent(named))
            return named
        }
        if let data = item as? Data {
            try data.write(to: target)
            return name
        }
        if let image = item as? UIImage, let data = image.jpegData(compressionQuality: 0.92) {
            try data.write(to: target)
            return name
        }
        throw CocoaError(.fileReadUnknown)
    }

    /// The picture at 600 px on its long side, turned upright, without decoding the whole file.
    private static func small(_ url: URL) -> UIImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 600
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary).map { UIImage(cgImage: $0) }
    }

    private static func frame(of url: URL) async -> UIImage? {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 600, height: 600)
        return try? await UIImage(cgImage: generator.image(at: .zero).image)
    }

    // MARK: - Handing over

    /// The card tapped: once the copy is done the share is marked ready for the app. False when it couldn't be.
    func send(to destination: ShareInDestination) async -> Bool {
        guard sending == nil, let account else { return false }
        sending = destination
        await copying?.value
        guard isReady, let folder else {
            sending = nil
            return false
        }
        do {
            try ShareInbox.write(ShareInPayload(
                id: folder.id,
                account: account.userId,
                destination: destination,
                files: files,
                text: text,
                link: link,
                conversationId: destination == .messages ? suggestedChat?.id : nil
            ))
            return true
        } catch {
            failure = "Couldn't hand this to Pantopus. Try again."
            sending = nil
            return false
        }
    }

    /// Closed without picking: nothing copied stays.
    func discard() {
        copying?.cancel()
        if let folder { ShareInbox.remove(id: folder.id) }
    }
}
