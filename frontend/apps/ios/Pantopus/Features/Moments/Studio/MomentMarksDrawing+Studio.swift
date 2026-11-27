//
//  MomentMarksDrawing+Studio.swift
//  Pantopus
//
//  "Pulse, reinvented", phase 0 step 4: how the Studio's marks are drawn, by
//  the same routine as every mark (`MomentMarksDrawing`), so the canvas over
//  the picture and the photo that goes up match. Used only for marks that
//  carry something the Studio set; every other mark is drawn as before.
//

import SwiftUI
import UIKit

extension MomentMarksDrawing {
    /// The lines, when one of them is the Studio's: on a layer of their own, so the eraser takes out lines and never
    /// the picture under them. In order, as drawn: a line drawn after an erase is whole.
    static func drawStudio(_ strokes: [MomentMarks.Stroke], in context: CGContext, size: CGSize) {
        context.saveGState()
        defer { context.restoreGState() }
        context.beginTransparencyLayer(auxiliaryInfo: nil)
        defer { context.endTransparencyLayer() }
        for stroke in strokes where !stroke.points.isEmpty {
            let points = stroke.points.map { CGPoint(x: $0.x * size.width, y: $0.y * size.height) }
            let width = max(stroke.width * size.width, 1)
            let ink = stroke.tint?.uiColor ?? MomentsPalette.ink(stroke.ink.rawValue)
            context.saveGState()
            defer { context.restoreGState() }
            switch stroke.pen {
            case .marker:
                line(points, width: width, color: ink, in: context)
            case .highlighter:
                // See-through, with flat ends, as even where the line crosses itself as a felt highlighter.
                context.setLineCap(.butt)
                context.setLineJoin(.round)
                line(points, width: width, color: ink.withAlphaComponent(0.42), in: context, round: false)
            case .arrow:
                arrow(points, width: width, color: ink, in: context)
            case .eraser:
                context.setBlendMode(.clear)
                line(points, width: width, color: .black, in: context)
            }
        }
    }

    private static func line(_ points: [CGPoint], width: CGFloat, color: UIColor, in context: CGContext, round: Bool = true) {
        if round {
            context.setLineCap(.round)
            context.setLineJoin(.round)
        }
        context.addPath(CardTableSignature.path([points]).cgPath)
        context.setStrokeColor(color.cgColor)
        context.setLineWidth(width)
        context.strokePath()
    }

    /// A line with a filled head where the finger lifted, pointing the way the line last went. A tap is a dot.
    private static func arrow(_ points: [CGPoint], width: CGFloat, color: UIColor, in context: CGContext) {
        guard let tip = points.last, points.count > 1 else { return line(points, width: width, color: color, in: context) }
        let head = max(width * 3.2, 12)
        // The direction from a point at least one head back, so a wobble at the end doesn't turn the head.
        var back = points[0]
        for point in points.reversed().dropFirst() where hypot(tip.x - point.x, tip.y - point.y) >= head {
            back = point
            break
        }
        let length = hypot(tip.x - back.x, tip.y - back.y)
        guard length > 0.5 else { return line(points, width: width, color: color, in: context) }
        let along = CGPoint(x: (tip.x - back.x) / length, y: (tip.y - back.y) / length)
        let across = CGPoint(x: -along.y, y: along.x)
        let base = CGPoint(x: tip.x - along.x * head, y: tip.y - along.y * head)
        // The line stops inside the head, so its round end never shows past the tip.
        var body = points
        while let last = body.last, body.count > 1, hypot(tip.x - last.x, tip.y - last.y) < head * 0.7 {
            body.removeLast()
        }
        body.append(CGPoint(x: tip.x - along.x * head * 0.7, y: tip.y - along.y * head * 0.7))
        line(body, width: width, color: color, in: context)
        let half = head * 0.62
        context.move(to: tip)
        context.addLine(to: CGPoint(x: base.x + across.x * half, y: base.y + across.y * half))
        context.addLine(to: CGPoint(x: base.x - across.x * half, y: base.y - across.y * half))
        context.closePath()
        context.setFillColor(color.cgColor)
        context.setLineJoin(.round)
        context.setLineWidth(max(width * 0.35, 1))
        context.setStrokeColor(color.cgColor)
        context.drawPath(using: .fillStroke)
    }

    /// A label's colors in an ink from the photo, as `looks` gives them for the six: plain letters with an edge that
    /// stands out from them, a dark (or, for a darker ink, light) label under them, or a sign in the ink with letters
    /// that read on it. Photos give many middling dark inks (olive, slate): from 0.4 down they take the light label, so
    /// the words always read.
    static func studioLook(_ label: MomentMarks.Label, tint: MomentMarks.Tint) -> Look {
        let ink = tint.uiColor
        let dark = MomentsPalette.ink(MomentMarks.Ink.black.rawValue)
        let deep = tint.lightness < 0.4
        switch label.style {
        case .plain:
            return Look(ink: ink, plate: nil, edge: deep ? UIColor.white.withAlphaComponent(0.7) : UIColor.black.withAlphaComponent(0.45))
        case .label:
            return Look(ink: ink, plate: deep ? UIColor.white.withAlphaComponent(0.88) : UIColor.black.withAlphaComponent(0.66), edge: nil)
        case .sign:
            return Look(ink: tint.isLight ? dark : .white, plate: ink, edge: nil)
        }
    }
}
