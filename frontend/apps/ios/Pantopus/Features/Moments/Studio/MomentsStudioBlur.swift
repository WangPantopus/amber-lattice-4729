//
//  MomentsStudioBlur.swift
//  Pantopus
//
//  Blur before posting ("Pulse, reinvented" phase 2, PHASE-2 piece 3): the Studio looks for faces of people who
//  didn't ask to be in it, licence plates, house numbers and mail labels in the photo, on the phone itself (Vision: no
//  service, no key), and offers each one with a tap to blur it or leave it. The person can also drag a box by hand
//  over anything it missed. The blur is drawn into the photo itself before it goes up, so nobody can take it off; the
//  picture check on the server stays as it is. "Undo the blur" gives the photo back while it's still the one blurred.
//

import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit
import Vision

/// Something found (or drawn) to blur: its box on the photo, 0 to 1 from the top left.
struct MomentsStudioBlurSpot: Identifiable, Hashable {
    enum Kind: String {
        case face, plate, number, label, hand

        var words: String {
            switch self {
            case .face: "A face"
            case .plate: "A licence plate"
            case .number: "A house number"
            case .label: "A mail label"
            case .hand: "Your box"
            }
        }

        /// "a face" and "faces", for the line over the bar.
        var one: String {
            words.prefix(1).lowercased() + words.dropFirst()
        }

        var many: String {
            switch self {
            case .face: "faces"
            case .plate: "licence plates"
            case .number: "house numbers"
            case .label: "mail labels"
            case .hand: "boxes"
            }
        }
    }

    let id = UUID()
    let kind: Kind
    var box: CGRect
    var blur: Bool
}

/// The Studio's blur state for the photo now in it.
struct MomentsStudioBlurState {
    /// The photo the spots were found on: while the Studio's photo is that one (or the blurred one made from it), the
    /// spots hold.
    var photo: UIImage
    var spots: [MomentsStudioBlurSpot] = []
    var searching = true
    /// The photo the blur made, and the one it was made from.
    var blurred: UIImage?
}

extension MomentsComposerModel {
    /// Blur is offered on a photo (the web and a video draw no blur here).
    var offersBlur: Bool {
        guard case .photo = draft, studioPair == nil else { return false }
        return true
    }

    /// Which photo is in the Studio, for looking at each new one.
    var blurKey: ObjectIdentifier? {
        guard offersBlur, case let .photo(image) = draft else { return nil }
        return ObjectIdentifier(image)
    }

    /// The blur state for the photo now in the Studio, if it still holds.
    var studioBlur: MomentsStudioBlurState? {
        guard let blur = marking.studio?.blur, case let .photo(image) = draft else { return nil }
        return image === blur.photo || image === blur.blurred ? blur : nil
    }

    /// Looks for what to blur in the photo now in the Studio, once per photo.
    func findBlurSpots() async {
        guard offersBlur, case let .photo(image) = draft, studioBlur == nil else { return }
        if marking.studio == nil { marking.studio = MomentsStudioTools() }
        marking.studio?.blur = MomentsStudioBlurState(photo: image)
        let found = await Task.detached(priority: .utility) { MomentsBlurFinder.spots(in: image) }.value
        guard marking.studio?.blur?.photo === image else { return }
        marking.studio?.blur?.spots = found
        marking.studio?.blur?.searching = false
    }

    func setBlur(_ id: UUID, _ on: Bool) {
        guard let index = marking.studio?.blur?.spots.firstIndex(where: { $0.id == id }) else { return }
        marking.studio?.blur?.spots[index].blur = on
    }

    func addBlurBox(_ box: CGRect) {
        guard studioBlur != nil, box.width > 0.02, box.height > 0.02 else { return }
        marking.studio?.blur?.spots.append(MomentsStudioBlurSpot(kind: .hand, box: box, blur: true))
    }

    /// Draws the chosen spots blurred into the photo (from the photo before any blur).
    func applyBlur() async {
        guard let state = studioBlur, !isPosting else { return }
        let boxes = state.spots.filter(\.blur).map(\.box)
        guard !boxes.isEmpty else { return undoBlur() }
        let original = state.photo
        let made = await Task.detached(priority: .userInitiated) { MomentsBlurFinder.blur(original, boxes) }.value
        guard studioBlur?.photo === original else { return }
        marking.studio?.blur?.blurred = made
        use(marked: made, marking.marks, placement: marking.placement)
        // The blurred photo is the same photo: its spots go on holding (`studioBlur`).
    }

    /// The photo back as it was before the blur.
    func undoBlur() {
        guard let state = studioBlur, let blurred = state.blurred, case let .photo(image) = draft, image === blurred else { return }
        marking.studio?.blur?.blurred = nil
        use(marked: state.photo, marking.marks, placement: marking.placement)
    }
}

/// Finding and blurring, off the main thread.
enum MomentsBlurFinder {
    /// Faces, then text that reads as a plate, a house number or a mail label.
    static func spots(in image: UIImage) -> [MomentsStudioBlurSpot] {
        guard let cgImage = image.cgImage else { return [] }
        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation(image), options: [:])
        let faces = VNDetectFaceRectanglesRequest()
        let text = VNRecognizeTextRequest()
        text.recognitionLevel = .accurate
        text.usesLanguageCorrection = false
        try? handler.perform([faces, text])
        var found: [MomentsStudioBlurSpot] = (faces.results ?? []).map { face in
            MomentsStudioBlurSpot(kind: .face, box: padded(flip(face.boundingBox), by: 0.2), blur: true)
        }
        for line in text.results ?? [] {
            guard let words = line.topCandidates(1).first?.string, let kind = kind(of: words) else { continue }
            found.append(MomentsStudioBlurSpot(kind: kind, box: padded(flip(line.boundingBox), by: 0.12), blur: true))
        }
        return Array(found.prefix(12))
    }

    /// What a line of text is, if it's something to blur.
    static func kind(of words: String) -> MomentsStudioBlurSpot.Kind? {
        let trimmed = words.trimmingCharacters(in: .whitespacesAndNewlines)
        let compact = trimmed.replacingOccurrences(of: "[\\s-]", with: "", options: .regularExpression)
        let digits = compact.filter(\.isNumber).count
        let letters = compact.filter(\.isLetter).count
        // A house number: one to six digits, maybe a letter after.
        if compact.range(of: "^[0-9]{1,6}[A-Za-z]?$", options: .regularExpression) != nil { return .number }
        // A plate: five to eight letters and digits, both kinds in it, nothing else.
        if (5...8).contains(compact.count), digits > 0, letters > 0, compact.allSatisfy({ $0.isLetter || $0.isNumber }) {
            return .plate
        }
        // A mail label: a street line or a town line with a ZIP code.
        let street = "\\b[0-9]{1,6}\\s+\\w+.*\\b(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Way|Blvd|Ct|Court|Pl|Place)\\b"
        if trimmed.range(of: street, options: [.regularExpression, .caseInsensitive]) != nil { return .label }
        if trimmed.range(of: "\\b[A-Z]{2}\\s+[0-9]{5}(-[0-9]{4})?\\b", options: .regularExpression) != nil { return .label }
        return nil
    }

    /// The photo with each box blurred hard (its own size and look otherwise).
    static func blur(_ image: UIImage, _ boxes: [CGRect]) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = image.scale
        format.opaque = true
        let size = image.size
        let context = CIContext()
        return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
            image.draw(in: CGRect(origin: .zero, size: size))
            guard let drawn = renderer.currentImage.cgImage else { return }
            let input = CIImage(cgImage: drawn)
            let radius = max(input.extent.width, input.extent.height) / 40
            let filter = CIFilter.gaussianBlur()
            filter.inputImage = input.clampedToExtent()
            filter.radius = Float(radius)
            guard let output = filter.outputImage?.cropped(to: input.extent),
                  let soft = context.createCGImage(output, from: input.extent) else { return }
            let softImage = UIImage(cgImage: soft, scale: image.scale, orientation: .up)
            for box in boxes {
                let rect = CGRect(
                    x: box.minX * size.width,
                    y: box.minY * size.height,
                    width: box.width * size.width,
                    height: box.height * size.height
                )
                renderer.cgContext.saveGState()
                renderer.cgContext.addPath(UIBezierPath(roundedRect: rect, cornerRadius: min(rect.width, rect.height) * 0.2).cgPath)
                renderer.cgContext.clip()
                softImage.draw(in: CGRect(origin: .zero, size: size))
                renderer.cgContext.restoreGState()
            }
        }
    }

    /// Vision's boxes start at the bottom left; the Studio's at the top left.
    private static func flip(_ box: CGRect) -> CGRect {
        CGRect(x: box.minX, y: 1 - box.maxY, width: box.width, height: box.height)
    }

    private static func padded(_ box: CGRect, by share: CGFloat) -> CGRect {
        let grown = box.insetBy(dx: -box.width * share, dy: -box.height * share)
        return grown.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
    }

    private static func orientation(_ image: UIImage) -> CGImagePropertyOrientation {
        switch image.imageOrientation {
        case .up: .up
        case .down: .down
        case .left: .left
        case .right: .right
        case .upMirrored: .upMirrored
        case .downMirrored: .downMirrored
        case .leftMirrored: .leftMirrored
        case .rightMirrored: .rightMirrored
        @unknown default: .up
        }
    }
}
