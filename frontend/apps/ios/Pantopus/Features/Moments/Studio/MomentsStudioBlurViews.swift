//
//  MomentsStudioBlurViews.swift
//  Pantopus
//
//  The Studio's blur before posting, drawn (`MomentsStudioBlur` finds and blurs): a line over the bar when something was
//  found ("Blur before posting?"), the Blur sheet with each spot to blur or leave, and boxes on the picture, which the
//  person can also drag by hand.
//

import SwiftUI

/// Over the bar while spots were found and not blurred yet: one tap opens the Blur sheet.
struct MomentsStudioBlurOffer: View {
    let model: MomentsComposerModel
    let open: () -> Void

    var body: some View {
        if let state = model.studioBlur, state.blurred == nil, !state.searching, !state.spots.isEmpty {
            Button(action: open) {
                HStack(spacing: Spacing.s2) {
                    Icon(.eyeOff, size: 16, strokeWidth: 2.2, color: .white)
                    Text("Blur before posting? \(Self.summary(state.spots))")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, Spacing.s3)
                .padding(.vertical, Spacing.s2)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.black.opacity(0.55)))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("moments.studio.blurOffer")
        }
    }

    /// "2 faces and a licence plate".
    static func summary(_ spots: [MomentsStudioBlurSpot]) -> String {
        let counts = Dictionary(grouping: spots, by: \.kind).mapValues(\.count)
        let order: [MomentsStudioBlurSpot.Kind] = [.face, .plate, .number, .label]
        let parts = order.compactMap { kind -> String? in
            guard let count = counts[kind], count > 0 else { return nil }
            return count == 1 ? kind.one : "\(count) \(kind.many)"
        }
        guard let last = parts.last else { return "" }
        let words = parts.count == 1 ? last : parts.dropLast().joined(separator: ", ") + " and " + last
        return words.prefix(1).uppercased() + words.dropFirst() + "."
    }
}

/// The Blur sheet: each spot found, a tap to blur or leave it; drawing boxes by hand; blurring into the photo.
struct MomentsStudioBlurSheet: View {
    let model: MomentsComposerModel
    let drawByHand: () -> Void
    let onDone: () -> Void
    @State private var working = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s3) {
                Text("Blur before posting")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityAddTraits(.isHeader)
                Text("Faces of people who didn't ask to be in it, licence plates, house numbers and mail labels. "
                    + "Found on your phone. The blur is drawn into the photo, so nobody can take it off.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                spots
                MomentsStudioTrayFlow(spacing: Spacing.s2) {
                    Button(action: drawByHand) { chip("Draw a box by hand", icon: .pencil) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("moments.studio.blur.hand")
                    if model.studioBlur?.blurred != nil {
                        Button { model.undoBlur() } label: { chip("Undo the blur", icon: .x) }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("moments.studio.blur.undo")
                    }
                }
                Button {
                    working = true
                    Task {
                        await model.applyBlur()
                        working = false
                        onDone()
                    }
                } label: {
                    Text(working ? "Blurring…" : "Blur them into the photo")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                        .background(Capsule().fill(Theme.Color.primarySolid))
                }
                .buttonStyle(.plain)
                .disabled(working || !(model.studioBlur?.spots.contains(where: \.blur) ?? false))
                .opacity(model.studioBlur?.spots.contains(where: \.blur) ?? false ? 1 : 0.5)
                .accessibilityIdentifier("moments.studio.blur.apply")
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s5)
            .padding(.bottom, Spacing.s4)
        }
        .task { await model.findBlurSpots() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.studio.blur")
    }

    @ViewBuilder private var spots: some View {
        if let state = model.studioBlur {
            if state.searching {
                Text("Looking at the photo…")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            } else if state.spots.isEmpty {
                Text("Nothing found to blur. Draw a box by hand over anything you'd rather hide.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(Array(state.spots.enumerated()), id: \.element.id) { index, spot in
                    HStack {
                        Text("\(index + 1). \(spot.kind.words)")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.Color.appText)
                        Spacer()
                        Button { model.setBlur(spot.id, !spot.blur) } label: {
                            chip(spot.blur ? "Blur" : "Leave it", icon: spot.blur ? .eyeOff : .eye, on: spot.blur)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(spot.kind.words): \(spot.blur ? "blur" : "leave it")")
                        .accessibilityIdentifier("moments.studio.blur.spot.\(index + 1)")
                    }
                }
            }
        }
    }

    private func chip(_ words: String, icon: PantopusIcon, on: Bool = false) -> some View {
        HStack(spacing: 6) {
            Icon(icon, size: 15, strokeWidth: 2.2, color: on ? .white : Theme.Color.primaryTint)
            Text(words)
                .font(.system(size: 14.5, weight: .semibold))
                .foregroundStyle(on ? Color.white : Theme.Color.appText)
        }
        .padding(.horizontal, 12)
        .frame(height: 38)
        .background(Capsule().fill(on ? Theme.Color.primarySolid : Theme.Color.appSurfaceRaised))
        .overlay(Capsule().stroke(Theme.Color.appBorder, lineWidth: on ? 0 : 1))
        .contentShape(Capsule())
    }
}

/// The spots on the picture while blurring: those to blur shaded, those left dashed; by hand, a drag draws a box.
struct MomentsStudioBlurLayer: View {
    let model: MomentsComposerModel
    let picture: CGSize?
    /// Drawing boxes by hand: a drag on the picture draws one.
    let byHand: Bool
    let onFinished: () -> Void
    @State private var drawing: CGRect?

    var body: some View {
        if let state = model.studioBlur, byHand || state.blurred == nil {
            GeometryReader { geo in
                let frame = picture.map { MomentMarks.fill($0, in: geo.size) } ?? CGRect(origin: .zero, size: geo.size)
                ZStack(alignment: .topLeading) {
                    if byHand {
                        Color.clear
                            .contentShape(Rectangle())
                            .gesture(drawGesture(frame))
                    }
                    ForEach(state.spots) { spot in
                        box(spot.box, in: frame, on: spot.blur)
                    }
                    if let drawing {
                        box(drawing, in: frame, on: true)
                    }
                    if byHand {
                        handBar
                            .padding(.top, geo.safeAreaInsets.top + 64)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }

    private var handBar: some View {
        HStack(spacing: Spacing.s3) {
            Text("Drag over what to blur")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
            Button("Done", action: onFinished)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .accessibilityIdentifier("moments.studio.blur.handDone")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(Capsule().fill(Color.black.opacity(0.62)))
    }

    private func box(_ share: CGRect, in frame: CGRect, on: Bool) -> some View {
        let rect = CGRect(
            x: frame.minX + share.minX * frame.width,
            y: frame.minY + share.minY * frame.height,
            width: share.width * frame.width,
            height: share.height * frame.height
        )
        return RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(on ? Color.white.opacity(0.35) : Color.clear)
            .background(on ? AnyShapeStyle(.ultraThinMaterial) : AnyShapeStyle(Color.clear), in: RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 2, dash: on ? [] : [6, 4]))
            )
            .frame(width: rect.width, height: rect.height)
            .position(x: rect.midX, y: rect.midY)
            .allowsHitTesting(false)
    }

    private func drawGesture(_ frame: CGRect) -> some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { value in drawing = share(from: value.startLocation, to: value.location, in: frame) }
            .onEnded { value in
                model.addBlurBox(share(from: value.startLocation, to: value.location, in: frame))
                drawing = nil
            }
    }

    private func share(from start: CGPoint, to end: CGPoint, in frame: CGRect) -> CGRect {
        func clamp(_ value: CGFloat) -> CGFloat {
            min(max(value, 0), 1)
        }
        let x0 = clamp((min(start.x, end.x) - frame.minX) / max(frame.width, 1))
        let y0 = clamp((min(start.y, end.y) - frame.minY) / max(frame.height, 1))
        let x1 = clamp((max(start.x, end.x) - frame.minX) / max(frame.width, 1))
        let y1 = clamp((max(start.y, end.y) - frame.minY) / max(frame.height, 1))
        return CGRect(x: x0, y: y0, width: x1 - x0, height: y1 - y0)
    }
}
