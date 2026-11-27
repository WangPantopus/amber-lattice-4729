//
//  MomentsStudioDropper.swift
//  Pantopus
//
//  "Pulse, reinvented", phase 0 step 4: the eyedropper. While it's out, it
//  lies over the picture in the Studio's Text and Draw: a finger on the photo
//  shows the color under it in a loupe above the finger, and letting go takes
//  that color (for the words in Text, for the next lines in Draw). Nothing is
//  drawn while it's out.
//

import SwiftUI

struct MomentsStudioDropper: View {
    let marking: MomentsMarking
    /// What the marks are on (the picture's own size, or its canvas's), filling `size` as the editor shows it.
    let surface: CGSize
    let size: CGSize
    @State private var finger: CGPoint?
    @State private var color: MomentMarks.Tint?

    var body: some View {
        let fill = MomentMarks.fill(surface, in: size)
        ZStack(alignment: .topLeading) {
            Color.clear
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0, coordinateSpace: .local)
                        .onChanged { value in
                            finger = value.location
                            color = sample(value.location, fill: fill)
                        }
                        .onEnded { value in
                            if let taken = sample(value.location, fill: fill) { marking.dropped(taken) }
                            (finger, color) = (nil, nil)
                        }
                )
            if let finger, let color {
                loupe(color)
                    .position(x: finger.x, y: max(finger.y - 70, 36))
                    .allowsHitTesting(false)
            }
        }
        .frame(width: size.width, height: size.height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("The photo")
        .accessibilityHint("Touch it to take its color.")
        .accessibilityAddTraits(.allowsDirectInteraction)
        .accessibilityAction(named: "Take the color in the middle") {
            if let taken = sample(CGPoint(x: fill.midX, y: fill.midY), fill: fill) { marking.dropped(taken) }
        }
        .accessibilityIdentifier("moments.marks.dropper")
    }

    /// The color under `point` (this view's points), from the picture read small; nil until it's read.
    private func sample(_ point: CGPoint, fill: CGRect) -> MomentMarks.Tint? {
        guard let picture = marking.studio?.picture, fill.width > 0, fill.height > 0 else { return nil }
        let at = CGPoint(x: (point.x - fill.minX) / fill.width, y: (point.y - fill.minY) / fill.height)
        return picture.color(at: CGPoint(x: min(max(at.x, 0), 1), y: min(max(at.y, 0), 1)))
    }

    /// A 56-pt disc of the color in a white ring, with a dark edge so it shows on any picture.
    private func loupe(_ color: MomentMarks.Tint) -> some View {
        Circle()
            .fill(Color(uiColor: color.uiColor))
            .frame(width: 56, height: 56)
            .overlay(Circle().strokeBorder(Color.white, lineWidth: 4))
            .overlay(Circle().strokeBorder(Color.black.opacity(0.35), lineWidth: 1).padding(-1))
            .shadow(color: .black.opacity(0.4), radius: 4, x: 0, y: 2)
    }
}
