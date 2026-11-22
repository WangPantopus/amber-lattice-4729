//
//  MomentPlacementDrawing.swift
//  Pantopus
//
//  A placed photo drawn on its 9:16 canvas: a top-to-bottom blend of two
//  colours from the picture where it doesn't reach, the picture at its
//  placement, then the marks. The upload is the canvas at 1152 x 2048, drawn
//  off the main thread from the best copy kept and handed to the usual photo
//  export. The editor and the Post screen lay the same picture out with the
//  same numbers (`MomentPlacement.pictureSize`, `pictureCenter`), so what the
//  author sees is what goes up.
//

import AVFoundation
import SwiftUI
import UIKit

extension MomentPlacement {
    /// The background where the picture doesn't cover the canvas: from the average colour of the upright picture's top
    /// third, before any turn, to its bottom third's.
    struct Backdrop: Equatable {
        let top: UIColor
        let bottom: UIColor

        /// Until the picture's own colours are read.
        static let dark = Backdrop(top: UIColor(white: 0.067, alpha: 1), bottom: UIColor(white: 0.067, alpha: 1))
    }
}

enum MomentPlacementDrawing {
    /// The picture's two colours, read from a copy 24 px square (top and bottom eight rows).
    static func backdrop(of image: UIImage) -> MomentPlacement.Backdrop {
        let side = 24
        let space = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: nil,
            width: side,
            height: side,
            bitsPerComponent: 8,
            bytesPerRow: side * 4,
            space: space,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return .dark }
        let square = CGRect(x: 0, y: 0, width: side, height: side)
        context.setFillColor(UIColor.black.cgColor)
        context.fill(square)
        context.interpolationQuality = .medium
        // Upright, top row first.
        context.translateBy(x: 0, y: CGFloat(side))
        context.scaleBy(x: 1, y: -1)
        UIGraphicsPushContext(context)
        image.draw(in: square)
        UIGraphicsPopContext()
        guard let data = context.data else { return .dark }
        let bytes = data.bindMemory(to: UInt8.self, capacity: side * side * 4)
        func average(_ rows: Range<Int>) -> UIColor {
            var sums: [CGFloat] = [0, 0, 0]
            for row in rows {
                for column in 0..<side {
                    let index = (row * side + column) * 4
                    for channel in 0..<3 {
                        sums[channel] += CGFloat(bytes[index + channel])
                    }
                }
            }
            let count = CGFloat(rows.count * side) * 255
            // Read from an sRGB bitmap, so an sRGB colour.
            return UIColor(cgColor: CGColor(srgbRed: sums[0] / count, green: sums[1] / count, blue: sums[2] / count, alpha: 1))
        }
        return MomentPlacement.Backdrop(top: average(0..<side / 3), bottom: average(side - side / 3..<side))
    }

    /// A video's two colours, from its first frame, upright. Nil when the frame can't be read.
    static func backdrop(ofVideo url: URL) async -> MomentPlacement.Backdrop? {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 240, height: 240)
        guard let frame = try? await generator.image(at: .zero).image else { return nil }
        return backdrop(of: UIImage(cgImage: frame))
    }

    /// Draws the canvas, `size` big, in `context` (origin at its top-left corner): the background, then `image` at
    /// `placement`. Nothing is drawn past the canvas's edges.
    static func draw(
        _ image: UIImage,
        at placement: MomentPlacement,
        backdrop: MomentPlacement.Backdrop,
        in context: CGContext,
        size: CGSize
    ) {
        context.saveGState()
        defer { context.restoreGState() }
        context.clip(to: CGRect(origin: .zero, size: size))
        let space = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        if let gradient = CGGradient(
            colorsSpace: space,
            colors: [backdrop.top.cgColor, backdrop.bottom.cgColor] as CFArray,
            locations: [0, 1]
        ) {
            context.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
        }
        let picture = placement.pictureSize(aspect: image.size.width / max(image.size.height, 1), on: size)
        let middle = placement.pictureCenter(on: size)
        context.saveGState()
        context.translateBy(x: middle.x, y: middle.y)
        context.rotate(by: placement.turn * .pi / 180)
        context.interpolationQuality = .high
        UIGraphicsPushContext(context)
        image.draw(in: CGRect(x: -picture.width / 2, y: -picture.height / 2, width: picture.width, height: picture.height))
        UIGraphicsPopContext()
        context.restoreGState()
    }

    /// The canvas as it goes up: 1152 x 2048, scale 1, opaque, with `marks` drawn over it in its coordinates.
    static func flatten(
        _ image: UIImage,
        at placement: MomentPlacement,
        backdrop: MomentPlacement.Backdrop,
        marks: MomentMarks
    ) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: MomentPlacement.pixels, format: format).image { renderer in
            draw(image, at: placement, backdrop: backdrop, in: renderer.cgContext, size: MomentPlacement.pixels)
            MomentMarksDrawing.draw(marks, in: renderer.cgContext, size: MomentPlacement.pixels, aspect: MomentPlacement.canvas)
        }
    }

    /// The placed photo with its marks, made ready to post in `folder` (the usual JPEG), off the main thread. The
    /// colours are read here when the editor hadn't read them yet.
    static func export(
        _ base: UIImage,
        at placement: MomentPlacement,
        backdrop: MomentPlacement.Backdrop?,
        _ marks: MomentMarks,
        into folder: URL
    ) async throws -> MomentPreparedMedia {
        try await Task.detached(priority: .userInitiated) {
            let colors = backdrop ?? Self.backdrop(of: base)
            return try MomentsMediaExport.photo(flatten(base, at: placement, backdrop: colors, marks: marks), into: folder)
        }.value
    }
}

/// The canvas with the picture at its placement, filling this view's frame (which has the canvas's shape): a photo, or
/// a video playing (`picture` fills the frame it's given, which has the picture's own shape `aspect`).
struct MomentPlacedCanvas<Picture: View>: View {
    let aspect: CGFloat
    let placement: MomentPlacement
    let backdrop: MomentPlacement.Backdrop?
    @ViewBuilder let picture: () -> Picture

    var body: some View {
        GeometryReader { geo in
            let colors = backdrop ?? .dark
            let size = placement.pictureSize(aspect: aspect, on: geo.size)
            ZStack(alignment: .topLeading) {
                LinearGradient(colors: [Color(uiColor: colors.top), Color(uiColor: colors.bottom)], startPoint: .top, endPoint: .bottom)
                picture()
                    .frame(width: size.width, height: size.height)
                    .rotationEffect(.degrees(placement.turn))
                    .position(placement.pictureCenter(on: geo.size))
            }
        }
        .clipped()
        .accessibilityHidden(true)
    }
}

extension MomentPlacedCanvas where Picture == MomentsPlacedImage {
    init(image: UIImage, placement: MomentPlacement, backdrop: MomentPlacement.Backdrop?) {
        self.init(aspect: image.size.width / max(image.size.height, 1), placement: placement, backdrop: backdrop) {
            MomentsPlacedImage(image: image)
        }
    }
}

/// A photo on its canvas.
struct MomentsPlacedImage: View {
    let image: UIImage

    var body: some View {
        Image(uiImage: image).resizable().interpolation(.high)
    }
}

/// A placed photo or video as the viewer shows it: the canvas filling this view (centered, cropped), with the marks
/// over it. One element, so the label given to it is read.
struct MomentsPlacedPicture<Picture: View>: View {
    let aspect: CGFloat
    let placement: MomentPlacement
    let backdrop: MomentPlacement.Backdrop?
    let marks: MomentMarks
    @ViewBuilder let picture: () -> Picture

    var body: some View {
        GeometryReader { geo in
            let canvas = MomentMarks.fill(MomentPlacement.pixels, in: geo.size)
            MomentPlacedCanvas(aspect: aspect, placement: placement, backdrop: backdrop, picture: picture)
                .overlay {
                    if !marks.isEmpty { MomentMarksCanvas(marks: marks, aspect: MomentPlacement.canvas) }
                }
                .frame(width: canvas.width, height: canvas.height)
                .offset(x: canvas.minX, y: canvas.minY)
        }
        .clipped()
        .accessibilityElement(children: .ignore)
    }
}
