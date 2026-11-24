//
//  HomeRecordPicture.swift
//  Pantopus
//
//  The record's pictures: the photo from above with the lot outlined, and
//  the chips drawn over a photo.
//

import SwiftUI
import UIKit

// MARK: - picture

struct HomeRecordPictureBlock: View {
    let picture: HomeRecordPicture

    var body: some View {
        if let above = picture.above {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HomeRecordAerialView(imageURL: above.imageURL, outline: above.outline, dimsOutside: true)
                    .frame(height: 230)
                    .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
                    .overlay(alignment: .bottom) { chips(above.chips) }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(accessibilityLabel(above))
                    .accessibilityAddTraits(.isImage)
                    .accessibilityIdentifier("homeRecord.picture.above")
                if let caption = picture.caption, !caption.isEmpty {
                    Text(caption)
                        .font(.system(size: 12))
                        .lineSpacing(4)
                        .foregroundStyle(Theme.Color.appTextMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, Spacing.s1)
                        .padding(.bottom, 2)
                }
            }
            .padding(Spacing.s3)
            .homeRecordCard()
        }
    }

    private func chips(_ chips: [HomeRecordPicture.Above.Chip]) -> some View {
        HStack(alignment: .bottom) {
            if let left = chips.first(where: { $0.at == "bl" }) {
                HomeRecordPhotoChip(text: left.text, dark: false)
            }
            Spacer(minLength: Spacing.s2)
            if let right = chips.first(where: { $0.at == "br" }) {
                HomeRecordPhotoChip(text: right.text, dark: true)
            }
        }
        .padding(10)
    }

    private func accessibilityLabel(_ above: HomeRecordPicture.Above) -> String {
        let chips = above.chips.map(\.text).joined(separator: ", ")
        let lot = above.outline == nil ? "" : ", with this home's lot outlined"
        return "Photo from above\(lot)" + (chips.isEmpty ? "" : ". \(chips)")
    }
}

// MARK: - Chip over a photo

/// A pill over a photo: light at the bottom left, dark at the bottom right.
struct HomeRecordPhotoChip: View {
    let text: String
    let dark: Bool

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .semibold))
            .lineLimit(1)
            .foregroundStyle(dark ? Color.white : Theme.Color.appText)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(dark ? Color.black.opacity(0.82) : Theme.Color.appSurface))
            .shadow(color: .black.opacity(dark ? 0 : 0.12), radius: 3, x: 0, y: 2)
    }
}

// MARK: - Photo from above, lot outlined

/// A photo drawn to fill its frame (cropped like CSS `object-fit: cover`), with
/// the lot's outline placed on the photo itself, so the crop never moves it.
struct HomeRecordAerialView: View {
    let imageURL: String
    let outline: [HomeRecordPoint]?
    /// The lookup's picture darkens everything outside the lot.
    let dimsOutside: Bool
    var thumbnail = false

    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Theme.Color.appSurfaceSunken
                if let image {
                    let placed = Self.placement(image: image.size, frame: geo.size)
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                    if let outline, outline.count >= 3 {
                        let points = outline.map {
                            CGPoint(x: placed.origin.x + $0.x * placed.width, y: placed.origin.y + $0.y * placed.height)
                        }
                        lot(points: points, frame: geo.size)
                    }
                } else if failed || HomeRecordImageAddress.url(imageURL) == nil {
                    Icon(.image, size: thumbnail ? 16 : 28, strokeWidth: 1.75, color: Theme.Color.appTextMuted)
                } else {
                    Shimmer(height: geo.size.height, cornerRadius: 0)
                }
            }
        }
        .task(id: "\(imageURL)#\(thumbnail)") { await load() }
    }

    @ViewBuilder
    private func lot(points: [CGPoint], frame: CGSize) -> some View {
        let shape = Path { path in
            path.addLines(points)
            path.closeSubpath()
        }
        if dimsOutside {
            Path { path in
                path.addRect(CGRect(origin: .zero, size: frame))
                path.addPath(shape)
            }
            .fill(Color.black.opacity(0.34), style: FillStyle(eoFill: true))
        }
        let scale: CGFloat = thumbnail ? 0.5 : 1
        shape.stroke(Color.white, style: StrokeStyle(lineWidth: 4.5 * scale, lineJoin: .round))
        shape.stroke(Theme.Color.homeSolid, style: StrokeStyle(lineWidth: 2 * scale, lineJoin: .round))
    }

    /// Where an image of `image` size lands when it fills `frame` and is centered.
    static func placement(image: CGSize, frame: CGSize) -> CGRect {
        guard image.width > 0, image.height > 0 else { return CGRect(origin: .zero, size: frame) }
        let scale = max(frame.width / image.width, frame.height / image.height)
        let size = CGSize(width: image.width * scale, height: image.height * scale)
        return CGRect(x: (frame.width - size.width) / 2, y: (frame.height - size.height) / 2, width: size.width, height: size.height)
    }

    private func load() async {
        guard let url = HomeRecordImageAddress.url(imageURL) else {
            image = nil
            return
        }
        if url.isFileURL {
            image = UIImage(contentsOfFile: url.path)
            failed = image == nil
            return
        }
        let size = thumbnail ? 240 : 1400
        if let cached = PantopusImagePipeline.shared.cachedImage(for: url, maxPixelSize: size) {
            image = cached
            return
        }
        let loaded = await PantopusImagePipeline.shared.image(for: url, maxPixelSize: size)
        guard !Task.isCancelled else { return }
        image = loaded
        failed = loaded == nil
    }
}

/// The record's image addresses: an https URL, or a path the API serves.
/// Debug builds also read `fixture://` names from the bundle's sample files.
enum HomeRecordImageAddress {
    static func url(_ raw: String) -> URL? {
        if raw.hasPrefix("https://") { return URL(string: raw) }
        if raw.hasPrefix("/"), !raw.hasPrefix("//") {
            return URL(string: raw, relativeTo: AppEnvironment.current.apiBaseURL)?.absoluteURL
        }
        #if DEBUG
        if raw.hasPrefix("fixture://") {
            let name = String(raw.dropFirst("fixture://".count))
            let file = (name as NSString).deletingPathExtension
            let ext = (name as NSString).pathExtension
            return Bundle.main.url(forResource: file, withExtension: ext.isEmpty ? nil : ext)
        }
        #endif
        return nil
    }
}
