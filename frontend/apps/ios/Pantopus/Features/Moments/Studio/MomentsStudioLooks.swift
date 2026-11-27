//
//  MomentsStudioLooks.swift
//  Pantopus
//
//  Film looks in the Studio ("Pulse, reinvented" phase 0 step 5): a photo can take one look, colour and tone only.
//  Nothing ever changes a face's shape: no warping, smoothing or reshaping of any kind (founder, 2026-11-26). The look
//  is drawn into the photo on the phone, like every mark, so nothing changes on the server. The photo before any look
//  is kept, so picking another look, or Original, starts from it again.
//

import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

enum MomentsStudioLook: String, CaseIterable, Identifiable {
    case original, warm, cool, fade, chrome, instant, mono, noir

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .original: "Original"
        case .warm: "Warm"
        case .cool: "Cool"
        case .fade: "Fade"
        case .chrome: "Chrome"
        case .instant: "Instant"
        case .mono: "Mono"
        case .noir: "Noir"
        }
    }

    private static let context = CIContext(options: [.useSoftwareRenderer: false])

    /// The photo in this look; the photo itself for Original, or when the look can't be drawn.
    func apply(to image: UIImage) -> UIImage {
        guard self != .original, let input = CIImage(image: image) else { return image }
        guard let output = filtered(input), let cgImage = Self.context.createCGImage(output, from: input.extent) else {
            return image
        }
        return UIImage(cgImage: cgImage, scale: image.scale, orientation: image.imageOrientation)
    }

    /// Colour and tone only, over the whole picture.
    private func filtered(_ input: CIImage) -> CIImage? {
        switch self {
        case .original:
            return input
        case .warm, .cool:
            let filter = CIFilter.temperatureAndTint()
            filter.inputImage = input
            filter.neutral = CIVector(x: 6500, y: 0)
            filter.targetNeutral = CIVector(x: self == .warm ? 5200 : 8200, y: 0)
            return filter.outputImage
        case .fade:
            let filter = CIFilter.photoEffectFade()
            filter.inputImage = input
            return filter.outputImage
        case .chrome:
            let filter = CIFilter.photoEffectChrome()
            filter.inputImage = input
            return filter.outputImage
        case .instant:
            let filter = CIFilter.photoEffectInstant()
            filter.inputImage = input
            return filter.outputImage
        case .mono:
            let filter = CIFilter.photoEffectMono()
            filter.inputImage = input
            return filter.outputImage
        case .noir:
            let filter = CIFilter.photoEffectNoir()
            filter.inputImage = input
            return filter.outputImage
        }
    }
}

extension MomentsComposerModel {
    /// Film looks are offered for a photo (a video's frames are not redrawn for a look).
    var offersLooks: Bool {
        if case .photo = draft { return true }
        return false
    }

    /// The photo now in the Studio.
    private var studioPhoto: UIImage? {
        if case let .photo(image) = draft { return marking.base ?? image }
        return nil
    }

    /// A look holds while the photo is the one it made; a new photo starts with none.
    private var lookHolds: Bool {
        guard let made = marking.studio?.lookResult, let photo = studioPhoto else { return false }
        return made === photo
    }

    /// The look picked for the photo now in the Studio.
    var studioLook: MomentsStudioLook {
        lookHolds ? marking.studio?.look ?? .original : .original
    }

    /// The photo the looks start from: the one before any look.
    var lookOriginal: UIImage? {
        lookHolds ? marking.studio?.lookOriginal : studioPhoto
    }

    /// Picks a look: the photo before any look, in this look, carrying the marks it has.
    func pickStudioLook(_ look: MomentsStudioLook) {
        guard offersLooks, let original = lookOriginal, studioLook != look else { return }
        let made = look.apply(to: original)
        if marking.studio == nil { marking.studio = MomentsStudioTools() }
        marking.studio?.lookOriginal = original
        marking.studio?.look = look
        marking.studio?.lookResult = made
        use(marked: made, marking.marks, placement: marking.placement)
    }
}

/// The tray's "Film looks" row: each look on a small copy of the photo; the one picked is ringed.
struct MomentsStudioLooksRow: View {
    let model: MomentsComposerModel
    @State private var previews: [MomentsStudioLook: UIImage] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("Film looks")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.Color.appText)
                .accessibilityAddTraits(.isHeader)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.s2) {
                    ForEach(MomentsStudioLook.allCases) { look in cell(look) }
                }
            }
        }
        .task { await makePreviews() }
    }

    private func cell(_ look: MomentsStudioLook) -> some View {
        let picked = model.studioLook == look
        return Button { model.pickStudioLook(look) } label: {
            VStack(spacing: 4) {
                ZStack {
                    RoundedRectangle(cornerRadius: Radii.md).fill(Theme.Color.appSurfaceRaised)
                    if let preview = previews[look] {
                        Image(uiImage: preview).resizable().scaledToFill()
                    }
                }
                .frame(width: 60, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: Radii.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Radii.md)
                        .stroke(picked ? Theme.Color.primarySolid : Color.clear, lineWidth: 3)
                )
                Text(look.title)
                    .font(.system(size: 12, weight: picked ? .bold : .medium))
                    .foregroundStyle(picked ? Theme.Color.primaryTint : Theme.Color.appTextSecondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(look.title)
        .accessibilityAddTraits(picked ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("moments.studio.look.\(look.rawValue)")
    }

    /// Small copies of the photo in every look, made once off the main thread.
    private func makePreviews() async {
        guard previews.isEmpty, let original = model.lookOriginal else { return }
        let small = await Task.detached(priority: .userInitiated) { () -> [String: UIImage] in
            let side: CGFloat = 180
            let scale = min(side / max(original.size.width, 1), side / max(original.size.height, 1), 1)
            let size = CGSize(width: original.size.width * scale, height: original.size.height * scale)
            let thumb = UIGraphicsImageRenderer(size: size).image { _ in original.draw(in: CGRect(origin: .zero, size: size)) }
            var made: [String: UIImage] = [:]
            for look in MomentsStudioLook.allCases {
                made[look.rawValue] = look.apply(to: thumb)
            }
            return made
        }.value
        var keyed: [MomentsStudioLook: UIImage] = [:]
        for (key, image) in small {
            if let look = MomentsStudioLook(rawValue: key) { keyed[look] = image }
        }
        previews = keyed
    }
}
