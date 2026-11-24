//
//  HomeRecordPicture.swift
//  Pantopus
//
//  The record's pictures: Apple's Look Around at the home's street point, the
//  photo from above with the lot outlined, and the chips drawn over a photo.
//

import MapKit
import SwiftUI
import UIKit

// MARK: - picture

struct HomeRecordPictureBlock: View {
    let picture: HomeRecordPicture

    private enum Choice: Hashable { case street, above }

    /// Apple's Look Around scene at the block's street point; `.none` where
    /// Apple has no street picture there, and the Street choice is hidden.
    @State private var scene: LookAroundLookup = .asking
    @State private var choice: Choice = .above

    var body: some View {
        // The ask runs even while nothing is drawn yet (a street point and no photo from above).
        content.task(id: picture.street) { await lookAround() }
    }

    @ViewBuilder private var content: some View {
        if hasPicture {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                if showsSwitch {
                    HomeRecordSegmented(
                        options: [(Choice.street, "Street"), (Choice.above, "From above")],
                        selection: $choice,
                        label: "Picture of the home"
                    )
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
                Group {
                    if shows == .street, case let .found(found) = scene {
                        HomeRecordLookAround(scene: found)
                            .accessibilityIdentifier("homeRecord.picture.street")
                    } else if let above = picture.above {
                        aboveView(above)
                    }
                }
                .frame(height: 230)
                .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
                if let caption = picture.caption, !caption.isEmpty, shows == .above {
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
            .animation(.easeInOut(duration: 0.2), value: showsSwitch)
        } else {
            // Holds the ask's task; draws nothing.
            Color.clear.frame(height: 0)
        }
    }

    /// What is drawn: the street picture only once Apple has one; the photo from
    /// above otherwise, and always where there is no street point.
    private var shows: Choice {
        guard case .found = scene else { return .above }
        return picture.above == nil ? .street : choice
    }

    /// Both pictures are there: the switch offers them.
    private var showsSwitch: Bool {
        guard case .found = scene else { return false }
        return picture.above != nil
    }

    private var hasPicture: Bool {
        if picture.above != nil { return true }
        if case .found = scene { return true }
        return false
    }

    private func lookAround() async {
        guard let street = picture.street else {
            scene = .none
            return
        }
        scene = await LookAroundLookup.scene(latitude: street.lat, longitude: street.lng)
    }

    private func aboveView(_ above: HomeRecordPicture.Above) -> some View {
        HomeRecordAerialView(imageURL: above.imageURL, outline: above.outline, dimsOutside: true)
            .overlay(alignment: .bottom) { chips(above.chips) }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabel(above))
            .accessibilityAddTraits(.isImage)
            .accessibilityIdentifier("homeRecord.picture.above")
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

// MARK: - Street, from Apple's Look Around

/// Apple's answer for one street point: still asking, no street picture
/// there, or the scene to draw. Free inside the app; no key, no other source.
enum LookAroundLookup: Equatable {
    case asking
    case none
    case found(MKLookAroundScene)

    @MainActor
    static func scene(latitude: Double, longitude: Double) async -> LookAroundLookup {
        let request = MKLookAroundSceneRequest(coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude))
        guard let scene = try? await request.scene else { return .none }
        return .found(scene)
    }

    static func == (lhs: LookAroundLookup, rhs: LookAroundLookup) -> Bool {
        switch (lhs, rhs) {
        case (.asking, .asking), (.none, .none): true
        case let (.found(left), .found(right)): left === right
        default: false
        }
    }
}

/// The street picture: a still from Apple's Look Around at the scene, drawn
/// like the photo from above. A tap opens Apple's own full-screen viewer, where
/// the person can look around.
struct HomeRecordLookAround: View {
    let scene: MKLookAroundScene

    @State private var image: UIImage?
    @State private var failed = false
    @State private var opensViewer = false
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Theme.Color.appSurfaceSunken
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                } else if failed {
                    Icon(.image, size: 28, strokeWidth: 1.75, color: Theme.Color.appTextMuted)
                } else {
                    Shimmer(height: geo.size.height, cornerRadius: 0)
                }
            }
            .task(id: geo.size) { await snapshot(size: geo.size) }
        }
        // Apple's snapshot carries its own Maps mark.
        .contentShape(Rectangle())
        .onTapGesture { opensViewer = true }
        .lookAroundViewer(isPresented: $opensViewer, initialScene: scene, pointsOfInterest: .excludingAll)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Street picture of the home, from Apple's Look Around")
        .accessibilityHint("Opens Look Around")
        .accessibilityAddTraits([.isImage, .isButton])
        .accessibilityAction { opensViewer = true }
    }

    private func snapshot(size: CGSize) async {
        guard size.width > 1, size.height > 1, image == nil || image?.size != size else { return }
        let options = MKLookAroundSnapshotter.Options()
        options.size = size
        options.pointOfInterestFilter = .excludingAll
        options.traitCollection = UITraitCollection(displayScale: displayScale)
        let snapshotter = MKLookAroundSnapshotter(scene: scene, options: options)
        do {
            let shot = try await snapshotter.snapshot
            guard !Task.isCancelled else { return }
            image = shot.image
        } catch {
            guard !Task.isCancelled else { return }
            failed = image == nil
        }
    }
}

/// Two choices side by side, drawn as the app's other switches (Plans' and
/// Pulse's): a sunken track with the chosen one raised.
struct HomeRecordSegmented<Value: Hashable>: View {
    let options: [(Value, String)]
    @Binding var selection: Value
    let label: String

    var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                let isOn = option.0 == selection
                Button { selection = option.0 } label: {
                    Text(option.1)
                        .font(.system(size: 14, weight: isOn ? .semibold : .medium))
                        .foregroundStyle(isOn ? Theme.Color.appText : Theme.Color.appTextSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .fill(isOn ? Theme.Color.appSurface : Color.clear)
                                .shadow(color: .black.opacity(isOn ? 0.08 : 0), radius: 3, x: 0, y: 1)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous).fill(Theme.Color.appSurfaceSunken))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
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
