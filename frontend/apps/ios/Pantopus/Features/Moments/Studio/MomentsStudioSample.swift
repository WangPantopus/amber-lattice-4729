//
//  MomentsStudioSample.swift
//  Pantopus
//
//  "Pulse, reinvented", phase 0 step 4: the inks the Studio takes from the
//  photo. When Text or Draw opens, what the marks sit on (the photo, its
//  placed canvas, or a video's first frame) is redrawn small, at most 256 px
//  on its longest side, off the main thread. The eyedropper reads the color
//  under a finger from it, and its own colors (up to five, the most seen and
//  the most vivid first) come from it once.
//

import AVFoundation
import UIKit

final class MomentsStudioSample: @unchecked Sendable {
    /// What it was made from: a new picture, or a new place on the canvas, makes it again.
    let source: Source
    let width: Int
    let height: Int
    /// RGBA, 8 bits each, premultiplied by an alpha that is always 255 (opaque).
    private let bytes: [UInt8]
    /// The picture's own colors, most telling first.
    let colors: [MomentMarks.Tint]

    struct Source: Equatable {
        let image: ObjectIdentifier?
        let video: URL?
        let placement: MomentPlacement?
    }

    private init(source: Source, image: CGImage) {
        self.source = source
        let longest = CGFloat(max(image.width, image.height, 1))
        let scale = min(1, 256 / longest)
        width = max(1, Int((CGFloat(image.width) * scale).rounded()))
        height = max(1, Int((CGFloat(image.height) * scale).rounded()))
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let space = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        let (wide, high) = (width, height)
        bytes.withUnsafeMutableBytes { raw in
            guard let context = CGContext(
                data: raw.baseAddress,
                width: wide,
                height: high,
                bitsPerComponent: 8,
                bytesPerRow: wide * 4,
                space: space,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return }
            context.interpolationQuality = .medium
            context.draw(image, in: CGRect(x: 0, y: 0, width: wide, height: high))
        }
        self.bytes = bytes
        colors = Self.palette(bytes, count: wide * high)
    }

    /// The color at `point` on the picture (0 to 1 across and down from its top-left corner), averaged over the pixels
    /// around it so one stray pixel doesn't decide it.
    func color(at point: CGPoint) -> MomentMarks.Tint {
        let column = min(max(Int(point.x * CGFloat(width)), 0), width - 1)
        let row = min(max(Int(point.y * CGFloat(height)), 0), height - 1)
        var (red, green, blue, count) = (0, 0, 0, 0)
        for y in max(row - 1, 0)...min(row + 1, height - 1) {
            for x in max(column - 1, 0)...min(column + 1, width - 1) {
                let at = (y * width + x) * 4
                red += Int(bytes[at])
                green += Int(bytes[at + 1])
                blue += Int(bytes[at + 2])
                count += 1
            }
        }
        let total = CGFloat(max(count, 1)) * 255
        return MomentMarks.Tint(red: CGFloat(red) / total, green: CGFloat(green) / total, blue: CGFloat(blue) / total)
    }

    /// Up to five colors: the pixels gathered into boxes of similar color, each box scored by how much of the picture
    /// it covers and how vivid it is, then the best kept while they look different from each other and from plain
    /// white and black (the six inks have those).
    private static func palette(_ bytes: [UInt8], count: Int) -> [MomentMarks.Tint] {
        struct Box {
            var red = 0, green = 0, blue = 0, count = 0
        }
        var boxes = [Int: Box]()
        for index in 0..<count {
            let at = index * 4
            let (red, green, blue) = (Int(bytes[at]), Int(bytes[at + 1]), Int(bytes[at + 2]))
            let key = (red >> 4) << 8 | (green >> 4) << 4 | blue >> 4
            var box = boxes[key, default: Box()]
            box.red += red
            box.green += green
            box.blue += blue
            box.count += 1
            boxes[key] = box
        }
        let scored = boxes.values.map { box -> (tint: MomentMarks.Tint, score: CGFloat) in
            let total = CGFloat(box.count) * 255
            let tint = MomentMarks.Tint(red: CGFloat(box.red) / total, green: CGFloat(box.green) / total, blue: CGFloat(box.blue) / total)
            let vivid = max(tint.red, tint.green, tint.blue) - min(tint.red, tint.green, tint.blue)
            return (tint, CGFloat(box.count) * (0.3 + vivid * 1.6))
        }
        .sorted { $0.score > $1.score }
        let plain = [MomentMarks.Tint(red: 1, green: 1, blue: 1), MomentMarks.Tint(red: 0.07, green: 0.09, blue: 0.15)]
        var kept: [MomentMarks.Tint] = []
        for candidate in scored where kept.count < 5 {
            guard (kept + plain).allSatisfy({ $0.distance(to: candidate.tint) > 0.16 }) else { continue }
            kept.append(candidate.tint)
        }
        return kept
    }

    // MARK: - Making it

    /// What the marks are on now, small: the photo (or the 2048 px copy), drawn on its canvas when it's placed; a
    /// video's first frame the same way.
    static func make(
        media: MomentsMarkedMedia,
        base: UIImage?,
        placement: MomentPlacement?,
        backdrop: MomentPlacement.Backdrop?
    ) async -> MomentsStudioSample? {
        switch media {
        case let .photo(image):
            let photo = base ?? image
            let source = Source(image: ObjectIdentifier(image), video: nil, placement: placement)
            return await Task.detached(priority: .userInitiated) {
                drawn(photo, placement: placement, backdrop: backdrop).map { MomentsStudioSample(source: source, image: $0) }
            }.value
        case let .video(url, _):
            let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 512, height: 512)
            guard let frame = try? await generator.image(at: .zero).image else { return nil }
            let source = Source(image: nil, video: url, placement: placement)
            return await Task.detached(priority: .userInitiated) {
                drawn(UIImage(cgImage: frame), placement: placement, backdrop: backdrop)
                    .map { MomentsStudioSample(source: source, image: $0) }
            }.value
        }
    }

    /// The picture as the marks see it, at most 256 px on its longest side.
    private static func drawn(_ image: UIImage, placement: MomentPlacement?, backdrop: MomentPlacement.Backdrop?) -> CGImage? {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        if let placement {
            let size = CGSize(width: 144, height: 256)
            let backdrop = backdrop ?? MomentPlacementDrawing.backdrop(of: image)
            return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
                MomentPlacementDrawing.draw(image, at: placement, backdrop: backdrop, in: renderer.cgContext, size: size)
            }.cgImage
        }
        let longest = max(image.size.width, image.size.height, 1)
        let scale = min(1, 256 / longest)
        let size = CGSize(width: max(1, (image.size.width * scale).rounded()), height: max(1, (image.size.height * scale).rounded()))
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }.cgImage
    }
}
