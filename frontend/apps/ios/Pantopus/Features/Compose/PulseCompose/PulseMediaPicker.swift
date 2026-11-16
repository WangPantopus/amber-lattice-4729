import AVFoundation
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// The system picker grants access only to the selected assets. Loading a
/// PHLivePhoto preserves its paired resources without asking for library access.
struct PulseMediaPicker: UIViewControllerRepresentable {
    let limit: Int
    let onPicked: ([PulseComposePhoto], String?) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onPicked: onPicked)
    }

    func makeUIViewController(context: Context) -> PHPickerViewController {
        let picker = Self.picker(limit: limit)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_: PHPickerViewController, context _: Context) {}

    /// Photos, Live Photos and videos, up to `limit` at once.
    static func picker(limit: Int) -> PHPickerViewController {
        var config = PHPickerConfiguration()
        config.selectionLimit = max(1, limit)
        config.filter = .any(of: [.images, .videos, .livePhotos])
        config.preferredAssetRepresentationMode = .current
        return PHPickerViewController(configuration: config)
    }

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let onPicked: ([PulseComposePhoto], String?) -> Void

        init(onPicked: @escaping ([PulseComposePhoto], String?) -> Void) {
            self.onPicked = onPicked
        }

        func picker(_: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            Task { @MainActor in
                var media: [PulseComposePhoto] = []
                var failed = false
                for result in results {
                    do {
                        try await media.append(PulsePickedMedia.load(result.itemProvider))
                    } catch {
                        failed = true
                    }
                }
                onPicked(
                    media,
                    failed ?
                        "Couldn't load some attachments. Choose photos under 10 MB or videos under 100 MB, then try again." :
                        nil
                )
            }
        }
    }
}

/// The composer's Photos and Files pickers, presented with UIKit over the screen the composer is on rather than as
/// SwiftUI sheets. Both pickers run outside the app. Opened as a sheet from a composer shown over a tab's first screen
/// (Repost with your words from Today's Around you, a Sports starter over the Pulse feed), the picker closed again at
/// once: as it came up SwiftUI took the composer's view out and put it back, and dropped the sheet with it. UIKit keeps
/// a picker it presented open until the person picks or cancels.
@MainActor
final class PulseSystemPickers {
    /// A view in the composer: the pickers open over the screen it is on.
    fileprivate weak var anchor: UIView?
    /// The open picker's delegate, which UIKit holds only weakly.
    private var delegate: NSObject?
    private weak var photosPicker: UIViewController?
    /// A picker waiting for the + menu to finish closing.
    private var pending: (picker: UIViewController, onUnavailable: () -> Void)?

    /// The Photos picker. It stays up while what was picked loads, then closes and `onPicked` gets it (nothing on
    /// Cancel). Swiping it down does nothing, as with the sheet it replaces: Cancel and Add close it.
    func openPhotos(limit: Int, onPicked: @escaping ([PulseComposePhoto], String?) -> Void) {
        let coordinator = PulseMediaPicker.Coordinator { [weak self] media, error in
            self?.photosPicker?.dismiss(animated: true)
            self?.delegate = nil
            onPicked(media, error)
        }
        let picker = PulseMediaPicker.picker(limit: limit)
        picker.delegate = coordinator
        picker.isModalInPresentation = true
        delegate = coordinator
        photosPicker = picker
        present(picker) { onPicked([], nil) }
    }

    /// The Files picker for PDFs. `onPicked` gets the chosen files, `onCancel` runs when it closes without any.
    func openDocuments(onPicked: @escaping ([URL]) -> Void, onCancel: @escaping () -> Void) {
        let documents = DocumentsDelegate(
            onPicked: { [weak self] urls in
                self?.delegate = nil
                onPicked(urls)
            },
            onCancel: { [weak self] in
                self?.delegate = nil
                onCancel()
            }
        )
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.pdf], asCopy: false)
        picker.allowsMultipleSelection = true
        picker.delegate = documents
        delegate = documents
        present(picker, onUnavailable: onCancel)
    }

    /// Presents over the composer's screen once the + menu that asked has finished closing (UIKit won't present over
    /// a screen whose menu is still on its way out). Without a screen to present on, `onUnavailable` runs.
    private func present(_ picker: UIViewController, onUnavailable: @escaping () -> Void) {
        pending = (picker, onUnavailable)
        presentPending(tries: 20)
    }

    private func presentPending(tries: Int) {
        guard let pending else { return }
        guard var top = anchor?.nearestViewController else {
            self.pending = nil
            delegate = nil
            pending.onUnavailable()
            return
        }
        while let above = top.presentedViewController, !above.isBeingDismissed {
            top = above
        }
        if top.presentedViewController != nil || top.transitionCoordinator != nil, tries > 0 {
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .milliseconds(50))
                self?.presentPending(tries: tries - 1)
            }
            return
        }
        self.pending = nil
        top.present(pending.picker, animated: true)
    }

    private final class DocumentsDelegate: NSObject, UIDocumentPickerDelegate {
        let onPicked: ([URL]) -> Void
        let onCancel: () -> Void

        init(onPicked: @escaping ([URL]) -> Void, onCancel: @escaping () -> Void) {
            self.onPicked = onPicked
            self.onCancel = onCancel
        }

        func documentPicker(_: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            onPicked(urls)
        }

        func documentPickerWasCancelled(_: UIDocumentPickerViewController) {
            onCancel()
        }
    }
}

/// Puts `PulseSystemPickers` on the composer's screen: a hidden view the pickers present from.
struct PulseSystemPickersAnchor: UIViewRepresentable {
    let pickers: PulseSystemPickers

    func makeUIView(context _: Context) -> UIView {
        let view = UIView()
        view.isHidden = true
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: UIView, context _: Context) {
        pickers.anchor = view
    }
}

private extension UIView {
    /// The view controller whose view holds this one.
    var nearestViewController: UIViewController? {
        var responder = next
        while let current = responder {
            if let controller = current as? UIViewController { return controller }
            responder = current.next
        }
        return nil
    }
}

@MainActor
private enum PulsePickedMedia {
    /// What the Photos picker registers for a Live Photo: `com.apple.live-photo-bundle`
    /// (PHLivePhoto's readable type), which doesn't conform to `UTType.livePhoto`.
    private static let livePhotoTypes = ["com.apple.live-photo-bundle", UTType.livePhoto.identifier]

    static func load(_ provider: NSItemProvider) async throws -> PulseComposePhoto {
        // Only request Live Photo objects when the selected item advertises
        // that representation. Probing PHLivePhoto for an ordinary still can
        // raise an Objective-C exception on the current simulator runtime,
        // so the check reads the provider's own types, never PHLivePhoto's.
        if livePhotoTypes.contains(where: provider.hasItemConformingToTypeIdentifier) {
            let live: PHLivePhoto = try await withCheckedThrowingContinuation { continuation in
                provider.loadObject(ofClass: PHLivePhoto.self) { object, error in
                    if let live = object as? PHLivePhoto {
                        continuation.resume(returning: live)
                    } else {
                        continuation.resume(throwing: error ?? URLError(.cannotDecodeContentData))
                    }
                }
            }
            let resources = PHAssetResource.assetResources(for: live)
            guard let still = resources.first(where: { $0.type == .photo || $0.type == .fullSizePhoto }),
                  let clip = resources.first(where: { $0.type == .pairedVideo || $0.type == .fullSizePairedVideo }) else {
                throw URLError(.cannotDecodeContentData)
            }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: directory) }
            let stillURL = directory.appendingPathComponent("still")
            let clipURL = directory.appendingPathComponent("clip.mov")
            try await write(still, to: stillURL)
            try await write(clip, to: clipURL)
            let bytes = try imageData(at: stillURL)
            let motion = try await videoData(at: clipURL)
            let location = try await MediaLocationExtractor.imageLocation(from: boundedData(at: stillURL, megabytes: 30))
            return PulseComposePhoto(
                data: bytes,
                capturedLatitude: location?.latitude,
                capturedLongitude: location?.longitude,
                capturedAt: location?.capturedAt,
                mimeType: "image/jpeg",
                filename: "live-photo.jpg",
                liveVideo: motion
            )
        }
        let isVideo = provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier)
        let type = isVideo ? UTType.movie.identifier : UTType.image.identifier
        let url: URL = try await withCheckedThrowingContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: type) { original, error in
                do {
                    guard let original else { throw error ?? URLError(.fileDoesNotExist) }
                    let copy = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString).appendingPathExtension(original.pathExtension)
                    try FileManager.default.copyItem(at: original, to: copy)
                    continuation.resume(returning: copy)
                } catch { continuation.resume(throwing: error) }
            }
        }
        defer { try? FileManager.default.removeItem(at: url) }
        if isVideo {
            return try await video(at: url)
        }
        let original = try boundedData(at: url, megabytes: 30)
        let location = await MediaLocationExtractor.imageLocation(from: original)
        // Preserve transparency; the server removes image metadata before storage.
        if original.starts(with: [0x89, 0x50, 0x4E, 0x47]) {
            guard original.count <= 10 * 1024 * 1024 else { throw URLError(.dataLengthExceedsMaximum) }
            return PulseComposePhoto(
                data: original,
                capturedLatitude: location?.latitude,
                capturedLongitude: location?.longitude,
                capturedAt: location?.capturedAt,
                mimeType: "image/png",
                filename: "photo.png"
            )
        }
        // Keep animated formats; HEIC stills become JPEG for all clients.
        if original.starts(with: [0x47, 0x49, 0x46]) {
            guard original.count <= 10 * 1024 * 1024 else { throw URLError(.dataLengthExceedsMaximum) }
            return PulseComposePhoto(data: original, mimeType: "image/gif", filename: "photo.gif")
        }
        return try PulseComposePhoto(
            data: imageData(at: url),
            capturedLatitude: location?.latitude,
            capturedLongitude: location?.longitude,
            capturedAt: location?.capturedAt,
            mimeType: "image/jpeg",
            filename: "photo.jpg"
        )
    }

    /// A picked video. Where it was taken is read off the original; the upload is exported without metadata.
    private static func video(at url: URL) async throws -> PulseComposePhoto {
        let location = await MediaLocationExtractor.videoLocation(at: url)
        return try await PulseComposePhoto(
            data: videoData(at: url),
            capturedLatitude: location?.latitude,
            capturedLongitude: location?.longitude,
            capturedAt: location?.capturedAt,
            mimeType: "video/mp4",
            filename: "video.mp4"
        )
    }

    private static func write(_ resource: PHAssetResource, to url: URL) async throws {
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            PHAssetResourceManager.default().writeData(for: resource, toFile: url, options: options) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    static func boundedData(at url: URL, megabytes: Int) throws -> Data {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0, size <= megabytes * 1024 * 1024 else { throw URLError(.dataLengthExceedsMaximum) }
        return try Data(contentsOf: url)
    }

    private static func imageData(at url: URL) throws -> Data {
        let original = try boundedData(at: url, megabytes: 30)
        guard let image = UIImage(data: original), let jpeg = image.jpegData(compressionQuality: 0.9),
              jpeg.count <= 10 * 1024 * 1024 else { throw URLError(.cannotDecodeContentData) }
        return jpeg
    }

    private static func videoData(at url: URL) async throws -> Data {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0, size <= 100 * 1024 * 1024 else { throw URLError(.dataLengthExceedsMaximum) }
        let output = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("mp4")
        defer { try? FileManager.default.removeItem(at: output) }
        guard let exporter = AVAssetExportSession(asset: AVURLAsset(url: url), presetName: AVAssetExportPreset1920x1080) else {
            throw URLError(.cannotDecodeContentData)
        }
        exporter.outputURL = output
        exporter.outputFileType = .mp4
        exporter.metadata = []
        exporter.shouldOptimizeForNetworkUse = true
        await exporter.export()
        guard exporter.status == .completed else { throw exporter.error ?? URLError(.cannotDecodeContentData) }
        return try boundedData(at: output, megabytes: 100)
    }
}
