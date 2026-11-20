//
//  MomentMarksDrawing.swift
//  Pantopus
//
//  One routine draws a Moment's marks, used twice so what the author sees is
//  what goes up: the live canvas over the picture (the editor, the Post
//  screen) and the photo flattened for the upload. The flatten works on a
//  copy at most 2048 px on its longest side, at scale 1 and opaque, off the
//  main thread, then hands it to the usual photo export.
//

import SwiftUI
import UIKit

enum MomentMarksDrawing {
    /// The longest side of what's drawn on and uploaded (the photo export's own limit).
    static let maxPixels: CGFloat = 2048

    /// Draws `marks` over a picture filling `size` in `context`, whose origin is the picture's top-left corner.
    static func draw(_ marks: MomentMarks, in context: CGContext, size: CGSize) {
        guard size.width > 0, size.height > 0, !marks.isEmpty else { return }
        context.saveGState()
        defer { context.restoreGState() }
        context.setLineCap(.round)
        context.setLineJoin(.round)
        for stroke in marks.strokes where !stroke.points.isEmpty {
            // The signature pen's smoothing: curves through the points, a dot for a tap.
            let points = stroke.points.map { CGPoint(x: $0.x * size.width, y: $0.y * size.height) }
            context.addPath(CardTableSignature.path([points]).cgPath)
            context.setStrokeColor(MomentsPalette.ink(stroke.ink.rawValue).cgColor)
            context.setLineWidth(max(stroke.width * size.width, 1))
            context.strokePath()
        }
    }

    /// `image` redrawn upright at most 2048 px on its longest side (scale 1, opaque), with `marks` drawn in.
    static func flatten(_ image: UIImage, _ marks: MomentMarks) -> UIImage {
        let pixels = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        let scale = min(1, maxPixels / max(pixels.width, pixels.height, 1))
        let size = CGSize(width: max(1, (pixels.width * scale).rounded()), height: max(1, (pixels.height * scale).rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
            image.draw(in: CGRect(origin: .zero, size: size))
            draw(marks, in: renderer.cgContext, size: size)
        }
    }

    /// The copy the editor works on: the photo itself when it is 2048 px or less already.
    static func base(_ image: UIImage) async -> UIImage {
        guard max(image.size.width, image.size.height) * image.scale > maxPixels else { return image }
        return await Task.detached(priority: .userInitiated) { flatten(image, MomentMarks()) }.value
    }

    /// The photo with its marks, made ready to post in `folder` (the usual JPEG), off the main thread.
    static func export(_ base: UIImage, _ marks: MomentMarks, into folder: URL) async throws -> MomentPreparedMedia {
        try await Task.detached(priority: .userInitiated) {
            try MomentsMediaExport.photo(flatten(base, marks), into: folder)
        }.value
    }
}

/// The marks over a picture that fills this view (an overlay on the picture as it's framed).
struct MomentMarksCanvas: View {
    let marks: MomentMarks

    var body: some View {
        Canvas { context, size in
            context.withCGContext { MomentMarksDrawing.draw(marks, in: $0, size: size) }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// A photo filling its frame as the viewer shows it (centered, cropped), with its marks on it.
struct MomentsMarkedPhoto: View {
    let image: UIImage
    let marks: MomentMarks

    var body: some View {
        Image(uiImage: image)
            .resizable()
            .scaledToFill()
            .overlay {
                if !marks.isEmpty { MomentMarksCanvas(marks: marks) }
            }
    }
}
