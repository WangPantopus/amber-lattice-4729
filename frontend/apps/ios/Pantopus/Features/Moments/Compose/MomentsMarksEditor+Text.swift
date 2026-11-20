//
//  MomentsMarksEditor+Text.swift
//  Pantopus
//
//  Text (board T2): a label appears in the middle with the keyboard up. Three
//  looks (Plain, Label, Sign) and the six inks; drag to move, pinch anywhere
//  on the picture (or drag the corner circle) to resize; tap a label to change
//  it; one left empty goes.
//  Up to five labels of 80 characters, no rotation. Labels stay inside the
//  part of the picture every phone shows, and never shrink below what the
//  picture check can read. VoiceOver moves and resizes a label with actions.
//

import SwiftUI

extension MomentsMarksEditor {
    /// "Drag to move. Pinch to resize." over the three looks and the six inks. While typing, only the looks and inks,
    /// right above the keyboard.
    func textFooter(width: CGFloat, typing: Bool) -> some View {
        VStack(spacing: typing ? Spacing.s2 : 14) {
            if !typing {
                Text(marking.editing.labels.isEmpty ? "Tap the picture to add words." : "Drag to move. Pinch to resize.")
                    .scaledFont(13, weight: .medium)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .shadow(color: .black.opacity(0.6), radius: 2, x: 0, y: 1)
                    .accessibilityHidden(true)
            }
            HStack(spacing: Spacing.s2) {
                ForEach(MomentMarks.Style.allCases, id: \.self) { style in
                    styleButton(style, compact: typing)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Look")
            ViewThatFits(in: .horizontal) {
                textInks(MomentMarks.Ink.allCases)
                VStack(spacing: 0) {
                    textInks(Array(MomentMarks.Ink.allCases.prefix(3)))
                    textInks(Array(MomentMarks.Ink.allCases.suffix(3)))
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Text color")
        }
        .frame(width: width)
        // Picking a look or an ink while typing keeps the keyboard.
        .keepsKeyboardOnTap()
    }

    private func textInks(_ inks: [MomentMarks.Ink]) -> some View {
        HStack(spacing: 6) {
            ForEach(inks, id: \.self) { ink in
                swatch(ink, selected: marking.textInk == ink) { marking.setTextInk(ink) }
            }
        }
    }

    /// One look: "Aa" drawn in it over its name (board T2), 64 pt tall; 44 while typing.
    private func styleButton(_ style: MomentMarks.Style, compact: Bool) -> some View {
        let selected = marking.style == style
        let sample = MomentMarks.Label(id: UUID(), text: "Aa", style: style, ink: marking.textInk, center: .zero, size: 0)
        let look = MomentMarksDrawing.looks(sample)
        return Button { marking.setStyle(style) } label: {
            VStack(spacing: 4) {
                Text("Aa")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color(uiColor: look.ink))
                    .padding(.horizontal, look.plate == nil ? 0 : Spacing.s2)
                    .padding(.vertical, 1)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color(uiColor: look.plate ?? .clear)))
                    .shadow(color: .black.opacity(look.plate == nil ? 0.8 : 0), radius: 2, x: 0, y: 1)
                if !compact {
                    Text(style.rawValue.capitalized)
                        .scaledFont(12, weight: selected ? .bold : .semibold)
                        .foregroundStyle(.white)
                }
            }
            .frame(maxWidth: .infinity, minHeight: compact ? 44 : 64)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.black.opacity(0.42)))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(Color.white.opacity(selected ? 1 : 0.4), lineWidth: selected ? 2 : 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(style.rawValue.capitalized)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("moments.marks.style.\(style.rawValue)")
    }
}

/// Over the picture while Text is in use: a tap where there's no label adds one there, each label can be tapped to
/// type in it and dragged, a pinch resizes the picked one, and the one being typed in is a text field in its place
/// (raised above the keyboard and the row of looks when it would be under them).
struct MomentsMarksTextLayer: View {
    let marking: MomentsMarking
    let image: UIImage
    let size: CGSize
    /// Between the editor's top bar and its looks and inks, in this view's points: a label being typed in stays above
    /// the bottom, and one being dragged stays between the two.
    let free: ClosedRange<CGFloat>
    @FocusState private var focused: Bool
    private static let space = "moments.marks.text"

    var body: some View {
        let fill = MomentMarks.fill(image.size, in: size)
        let scale = fill.width / MomentMarksDrawing.unit
        ZStack(alignment: .topLeading) {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture(coordinateSpace: .local) { point in
                    let at = CGPoint(x: (point.x - fill.minX) / fill.width, y: (point.y - fill.minY) / fill.height)
                    if marking.addLabel(at: at, pictureWidth: fill.width) { focused = true }
                }
                // While typing, a tap there only closes the keyboard.
                .closesKeyboardFirst()
                .accessibilityHidden(true)
            ForEach(Array(marking.editing.labels.enumerated()), id: \.element.id) { index, label in
                if label.id != marking.typing { labelArea(label, index: index, fill: fill, scale: scale) }
            }
            if let label = marking.typing.flatMap(marking.label) {
                field(label, fill: fill, scale: scale)
            }
        }
        .frame(width: size.width, height: size.height)
        .coordinateSpace(.named(Self.space))
        .simultaneousGesture(
            MagnifyGesture()
                .onChanged { marking.pinch($0.magnification) }
                .onEnded { _ in marking.endPinch() }
        )
        .onAppear {
            // Text opened: a label in the middle of what shows above the keyboard, typed in at once.
            guard marking.addsLabel else { return }
            marking.addsLabel = false
            let at = CGPoint(x: (size.width / 2 - fill.minX) / fill.width, y: (size.height * 0.4 - fill.minY) / fill.height)
            if marking.addLabel(at: at, pictureWidth: fill.width) { focused = true }
        }
        .onChange(of: marking.typing, initial: true) { _, typing in
            if typing != nil, !focused { focused = true }
        }
        .onChange(of: focused) { _, isFocused in
            if !isFocused { marking.endTyping() }
        }
    }

    /// A label as the canvas draws it: here only its place, to tap, drag and read aloud, and the dashed frame and the
    /// resize mark when it's the picked one.
    private func labelArea(_ label: MomentMarks.Label, index: Int, fill: CGRect, scale: CGFloat) -> some View {
        let box = onScreen(MomentMarksDrawing.lay(label, aspect: marking.aspect).box, fill: fill, scale: scale)
        let picked = marking.picked == label.id
        let area: some View = Color.clear
            .frame(width: box.width, height: box.height)
            .overlay { if picked { pickedFrame } }
            .contentShape(Rectangle().inset(by: -8))
            .onTapGesture {
                marking.startTyping(label.id)
                focused = true
            }
            .gesture(moving(label.id, fill: fill))
        // After the label's own touch area, which would otherwise leave out the corner circle.
        let handled: some View = area.overlay(alignment: .bottomTrailing) {
            if picked { resizeMark(center: CGPoint(x: box.midX, y: box.midY)).offset(x: 28, y: 28) }
        }
        return spoken(handled.position(x: box.midX, y: box.midY), label: label, index: index)
    }

    /// The picked label's dashed frame (board T2).
    private var pickedFrame: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .strokeBorder(Color.white.opacity(0.95), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            .padding(-6)
            .allowsHitTesting(false)
    }

    /// A finger moving a label, in the layer's own space: the label moves under the finger, so its own space would
    /// shrink the drag. It stays between the editor's top bar and its controls.
    private func moving(_ id: UUID, fill: CGRect) -> some Gesture {
        let top = (free.lowerBound - fill.minY) / fill.height
        let rows = top...max(top, (free.upperBound - fill.minY) / fill.height)
        return DragGesture(minimumDistance: 4, coordinateSpace: .named(Self.space))
            .onChanged { value in
                let moved = CGSize(width: value.translation.width / fill.width, height: value.translation.height / fill.height)
                marking.drag(id, by: moved, within: rows)
            }
            .onEnded { _ in marking.endDrag() }
    }

    /// A label read aloud, with VoiceOver's moves and sizes.
    private func spoken(_ area: some View, label: MomentMarks.Label, index: Int) -> some View {
        let id = label.id
        let named: some View = area
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Words on the picture: \(label.text)")
            .accessibilityHint("Double-tap to change the words.")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { marking.startTyping(id) }
            .accessibilityIdentifier("moments.marks.label.\(index)")
        let moves: some View = named
            .accessibilityAction(named: "Move up") { marking.nudge(id, dx: 0, dy: -0.05) }
            .accessibilityAction(named: "Move down") { marking.nudge(id, dx: 0, dy: 0.05) }
            .accessibilityAction(named: "Move left") { marking.nudge(id, dx: -0.05, dy: 0) }
            .accessibilityAction(named: "Move right") { marking.nudge(id, dx: 0.05, dy: 0) }
        return moves
            .accessibilityAction(named: "Make larger") { marking.scale(id, by: 1.2) }
            .accessibilityAction(named: "Make smaller") { marking.scale(id, by: 1 / 1.2) }
            .accessibilityAction(named: "Delete") { marking.delete(id) }
    }

    /// The white circle at a picked label's corner (board T2), in a 44-pt touch area: dragging it resizes the label as
    /// a pinch does, by how much farther from the label's middle the finger goes.
    private func resizeMark(center: CGPoint) -> some View {
        Icon(.maximize, size: 14, strokeWidth: 2.6, color: Color(uiColor: MomentsPalette.ink(MomentMarks.Ink.black.rawValue)))
            .frame(width: 26, height: 26)
            .background(Circle().fill(Color.white))
            .shadow(color: .black.opacity(0.4), radius: 1.5, x: 0, y: 1)
            .frame(width: 44, height: 44)
            .contentShape(Circle())
            .gesture(
                DragGesture(minimumDistance: 1, coordinateSpace: .named(Self.space))
                    .onChanged { value in
                        let from = hypot(value.startLocation.x - center.x, value.startLocation.y - center.y)
                        let now = hypot(value.location.x - center.x, value.location.y - center.y)
                        if from > 1 { marking.pinch(now / from) }
                    }
                    .onEnded { _ in marking.endPinch() }
            )
            .accessibilityHidden(true)
    }

    /// The label being typed in: a field in its look, where the label is, or right above the looks when the keyboard
    /// would cover it there.
    private func field(_ label: MomentMarks.Label, fill: CGRect, scale: CGFloat) -> some View {
        let laid = MomentMarksDrawing.lay(label, aspect: marking.aspect)
        let box = onScreen(laid.box, fill: fill, scale: scale)
        let look = MomentMarksDrawing.looks(label)
        let em = label.size * MomentMarksDrawing.unit * scale
        let pad = MomentMarksDrawing.padding(label.style, em: em)
        // As wide as the words, with room for the cursor; the label grows as they're typed.
        let width = min(max(box.width - 2 * pad.width, label.text.isEmpty ? em * 5 : em * 2) + em * 0.3, fill.width)
        let center = CGPoint(x: box.midX, y: max(min(box.midY, free.upperBound - box.height / 2 - Spacing.s2), box.height / 2))
        return TextField(
            "",
            text: Binding(get: { label.text }, set: { marking.type($0) }),
            prompt: Text("Type here").foregroundColor(Color(uiColor: look.ink).opacity(0.6)),
            axis: .vertical
        )
        .font(.system(size: em, weight: .bold))
        .multilineTextAlignment(.center)
        .foregroundStyle(Color(uiColor: look.ink))
        .tint(Color(uiColor: look.ink))
        .focused($focused)
        .frame(width: width)
        .padding(.horizontal, pad.width)
        .padding(.vertical, pad.height)
        .background(RoundedRectangle(cornerRadius: laid.radius * scale, style: .continuous).fill(Color(uiColor: look.plate ?? .clear)))
        .shadow(color: .black.opacity(laid.plate == nil ? 0.6 : 0), radius: 2, x: 0, y: 1)
        .fixedSize()
        .position(center)
        .accessibilityLabel("Words on the picture")
        .accessibilityIdentifier("moments.marks.field")
    }

    private func onScreen(_ box: CGRect, fill: CGRect, scale: CGFloat) -> CGRect {
        CGRect(x: fill.minX + box.minX * scale, y: fill.minY + box.minY * scale, width: box.width * scale, height: box.height * scale)
    }
}
