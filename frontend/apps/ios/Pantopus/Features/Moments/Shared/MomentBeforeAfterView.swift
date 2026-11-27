//
//  MomentBeforeAfterView.swift
//  Pantopus
//
//  Before and after ("Pulse, reinvented"; CONTRACT 7g, the lead's answer of 2026-11-27 05:19). The picture is the two
//  photos side by side, the same size and shape (left before, right after): that is what today's screens, the apps in
//  the stores and anyone whose switch is off see. Here, for a reader whose switch is on (and in the Studio), the two
//  halves are cut from that one picture and shown one over the other, filling the frame as a photo does, with a curtain
//  between them that a finger drags. A tap away from the curtain is left to the screen under it (the viewer's next and
//  back). Stamps, items and dots sit on one half's frame, so they stay put as the curtain moves.
//

import SwiftUI
import UIKit

/// The two halves of a side-by-side picture.
struct MomentBeforeAfterHalves {
    let before: UIImage
    let after: UIImage

    init?(_ picture: UIImage) {
        guard let image = picture.cgImage, image.width >= 2, picture.imageOrientation == .up else { return nil }
        let half = image.width / 2
        guard let left = image.cropping(to: CGRect(x: 0, y: 0, width: half, height: image.height)),
              let right = image.cropping(to: CGRect(x: image.width - half, y: 0, width: half, height: image.height))
        else { return nil }
        before = UIImage(cgImage: left, scale: picture.scale, orientation: .up)
        after = UIImage(cgImage: right, scale: picture.scale, orientation: .up)
    }

    /// One half's own size: the frame stamps, items and dots are placed on.
    static func size(of picture: CGSize) -> CGSize {
        CGSize(width: picture.width / 2, height: picture.height)
    }
}

struct MomentBeforeAfterView: View {
    let picture: UIImage
    let before: String
    let after: String
    /// Drawn at the middle with nothing to drag (the 15-minute edit).
    var still = false
    /// How much of the before shows, from the left: 0 to 1.
    @State private var at: CGFloat = 0.5
    @State private var halves: MomentBeforeAfterHalves?

    init(picture: UIImage, item: MomentPlayItem?, still: Bool = false) {
        self.picture = picture
        before = Self.word(item?.before, or: "Before")
        after = Self.word(item?.after, or: "After")
        self.still = still
    }

    init(picture: UIImage, before: String, after: String) {
        self.picture = picture
        self.before = Self.word(before, or: "Before")
        self.after = Self.word(after, or: "After")
    }

    static func word(_ typed: String?, or fallback: String) -> String {
        let trimmed = typed?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? fallback : trimmed
    }

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            ZStack(alignment: .topLeading) {
                if let halves {
                    filled(halves.after, size)
                        .accessibilityLabel(after)
                    filled(halves.before, size)
                        .mask(alignment: .leading) { Rectangle().frame(width: size.width * at) }
                        .accessibilityLabel(before)
                    labels(size)
                    curtain(size)
                } else {
                    // A picture that can't be cut (not upright): the side-by-side picture as it is.
                    filled(picture, size)
                }
            }
            .frame(width: size.width, height: size.height)
            .coordinateSpace(name: Self.space)
        }
        .onChange(of: ObjectIdentifier(picture), initial: true) { _, _ in halves = MomentBeforeAfterHalves(picture) }
    }

    private static let space = "moments.beforeAfter"

    private func filled(_ image: UIImage, _ size: CGSize) -> some View {
        Image(uiImage: image)
            .resizable()
            .scaledToFill()
            .frame(width: size.width, height: size.height)
            .clipped()
    }

    /// "Before" and "After" beside the knob, each fading as the curtain nears its own edge.
    private func labels(_ size: CGSize) -> some View {
        let line = size.width * at
        return ZStack(alignment: .topLeading) {
            chip(before)
                .frame(width: max(line - 34, 0), alignment: .trailing)
                .opacity(at < 0.18 ? 0 : 1)
                .position(x: max(line - 34, 0) / 2, y: size.height / 2)
            chip(after)
                .frame(width: max(size.width - line - 34, 0), alignment: .leading)
                .opacity(at > 0.82 ? 0 : 1)
                .position(x: line + 34 + max(size.width - line - 34, 0) / 2, y: size.height / 2)
        }
        .animation(.easeOut(duration: 0.15), value: at < 0.18)
        .animation(.easeOut(duration: 0.15), value: at > 0.82)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func chip(_ words: String) -> some View {
        Text(words)
            .font(.system(size: 12.5, weight: .bold))
            .foregroundStyle(.white)
            .lineLimit(1)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(Capsule().fill(Color.black.opacity(0.6)))
    }

    /// The line, its knob halfway down, and a 44 pt strip around it to grab.
    private func curtain(_ size: CGSize) -> some View {
        let line = size.width * at
        return ZStack {
            Rectangle()
                .fill(Color.white)
                .frame(width: 2, height: size.height)
                .shadow(color: .black.opacity(0.45), radius: 3)
            HStack(spacing: 0) {
                Icon(.chevronLeft, size: 14, strokeWidth: 2.6, color: .black)
                Icon(.chevronRight, size: 14, strokeWidth: 2.6, color: .black)
            }
            .frame(width: 38, height: 38)
            .background(Circle().fill(Color.white))
            .shadow(color: .black.opacity(0.35), radius: 4, x: 0, y: 1)
        }
        .frame(width: 44, height: size.height)
        .contentShape(Rectangle())
        .position(x: line, y: size.height / 2)
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .named(Self.space))
                .onChanged { value in at = min(max(value.location.x / max(size.width, 1), 0), 1) }
        )
        .allowsHitTesting(!still)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Curtain between \(before.lowercased()) and \(after.lowercased())")
        .accessibilityValue("\(Int((at * 100).rounded())) percent \(before.lowercased())")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: at = min(at + 0.1, 1)
            case .decrement: at = max(at - 0.1, 0)
            @unknown default: break
            }
        }
        .accessibilityIdentifier("moments.beforeAfter.curtain")
    }
}

/// Drawing the one picture that posts.
enum MomentsBeforeAfterDrawing {
    /// The posted photo's longest side (`MomentsMediaExport.photo`): both halves together fit it, so it isn't scaled
    /// again on the way out.
    static let longest: CGFloat = 2048

    /// `before` on the left and `after` cut to the before's size and shape (filling it, centred) on the right.
    static func sideBySide(_ before: UIImage, _ after: UIImage) -> UIImage {
        let pixels = CGSize(width: before.size.width * before.scale, height: before.size.height * before.scale)
        let shrink = min(1, longest / max(pixels.width * 2, 1), longest / max(pixels.height, 1))
        let half = CGSize(width: max(1, (pixels.width * shrink).rounded()), height: max(1, (pixels.height * shrink).rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: half.width * 2, height: half.height), format: format).image { context in
            before.draw(in: CGRect(origin: .zero, size: half))
            let frame = CGRect(x: half.width, y: 0, width: half.width, height: half.height)
            let fill = max(frame.width / max(after.size.width, 1), frame.height / max(after.size.height, 1))
            let size = CGSize(width: after.size.width * fill, height: after.size.height * fill)
            context.cgContext.saveGState()
            context.cgContext.clip(to: frame)
            after.draw(in: CGRect(x: frame.midX - size.width / 2, y: frame.midY - size.height / 2, width: size.width, height: size.height))
            context.cgContext.restoreGState()
        }
    }
}
