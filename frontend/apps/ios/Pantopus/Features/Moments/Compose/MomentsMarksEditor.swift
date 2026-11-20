//
//  MomentsMarksEditor.swift
//  Pantopus
//
//  Text and Draw on the photo being posted (boards T2, T3). The picture is
//  shown in the viewer's own frame (the phone's full width above the reply
//  bar, filled and cropped as people will see it), with the strip the
//  viewer's top bar covers marked. On the iPhone Duo it is the same card the
//  Post screen shows for each pose, with the controls over it. X drops what
//  changed in this visit (asking first when something did); Done keeps it.
//  The editor is a branch of the composer's stack and its state lives in the
//  composer's model (`MomentsMarking`), so a fold keeps it.
//

import SwiftUI

struct MomentsMarksEditor: View {
    let model: MomentsComposerModel
    let image: UIImage
    @Environment(\.momentsDuoScreen) var duo
    /// Where the keyboard's top is on the screen (the screen's bottom while it's down), and where the looks and inks
    /// begin: a label being typed in stays above both.
    @State var keyboardTop: CGFloat = .infinity
    @State var footerTop: CGFloat = .infinity

    var marking: MomentsMarking {
        model.marking
    }

    var body: some View {
        ZStack {
            // The safe area as this cover has it (the keyboard never moves the picture).
            GeometryReader { geo in
                let insets = geo.safeAreaInsets
                let width = geo.size.width + insets.leading + insets.trailing
                screen(size: CGSize(width: width, height: geo.size.height + insets.top + insets.bottom), insets: insets)
            }
            .ignoresSafeArea(.keyboard)
            // The keyboard's top, from a layer that gives way to it.
            Color.clear
                .ignoresSafeArea(.container)
                .allowsHitTesting(false)
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).maxY } action: { keyboardTop = $0 }
        }
        .alert("Discard your changes?", isPresented: Binding(get: { marking.asksCancel }, set: { marking.asksCancel = $0 })) {
            Button("Discard", role: .destructive) { marking.cancel() }
                .accessibilityIdentifier("moments.marks.discard")
            Button("Keep editing", role: .cancel) {}
                .accessibilityIdentifier("moments.marks.keep")
        }
        .accessibilityElement(children: .contain)
        .accessibilityAction(.escape) { model.cancelMarks() }
        .accessibilityIdentifier("moments.marks")
    }

    /// Everything in the screen's own points, from its top-left corner.
    private func screen(size: CGSize, insets: EdgeInsets) -> some View {
        let frame = pictureFrame(size)
        let full = controlRoom(frame, size: size, insets: insets)
        // With the keyboard up, the looks and inks sit right above it.
        let typing = keyboardTop < size.height - max(insets.bottom, 1) - 1
        let room = typing ? CGRect(
            x: full.minX,
            y: full.minY,
            width: full.width,
            height: max(min(full.maxY, keyboardTop - Spacing.s2) - full.minY, 0)
        ) : full
        return ZStack(alignment: .topLeading) {
            Color.black
            MomentsMarksDrawArea(marking: marking, image: image, size: frame.size)
                .overlay {
                    if marking.tool == .text {
                        MomentsMarksTextLayer(
                            marking: marking,
                            image: image,
                            size: frame.size,
                            free: (room.minY + 48 - frame.minY)...max(room.minY + 48 - frame.minY, footerTop - frame.minY - Spacing.s1)
                        )
                    }
                }
                .overlay(alignment: .top) { viewerStrip(frame, insets: insets) }
                .overlay(alignment: .bottom) {
                    LinearGradient(colors: [.clear, Color.black.opacity(0.5)], startPoint: .top, endPoint: .bottom)
                        .frame(height: min(200, frame.height / 3))
                        .allowsHitTesting(false)
                }
                .clipShape(pictureShape)
                .offset(x: frame.minX, y: frame.minY)
            VStack(spacing: 0) {
                topBar
                Spacer(minLength: Spacing.s2)
                Group {
                    if marking.tool == .text { textFooter(width: room.width, typing: typing) } else { drawFooter(width: room.width) }
                }
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { footerTop = $0 }
            }
            .frame(width: room.width, height: room.height)
            .overlay(alignment: .trailing) { if marking.tool == .draw { widthColumn } }
            .offset(x: room.minX, y: room.minY)
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .ignoresSafeArea()
    }

    // MARK: - Where things go

    /// The picture's frame on the screen: the viewer's on the phone (full width, above its 68-pt reply bar), the Post
    /// screen's card on the iPhone Duo.
    func pictureFrame(_ size: CGSize) -> CGRect {
        switch duo.pose {
        case .phone:
            return CGRect(x: 0, y: 0, width: size.width, height: max(size.height - 68, 200))
        case .closed:
            return duo.column
        case .wide:
            let card = duo.card
            return CGRect(x: ((duo.leftHalf.width - card.width) / 2).rounded(), y: card.minY, width: card.width, height: card.height)
        case .upright:
            let width = min(size.width, (size.height * 9 / 16).rounded())
            return CGRect(x: ((size.width - width) / 2).rounded(), y: 0, width: width, height: size.height)
        case .table:
            let fold = duo.fold ?? CGRect(x: 0, y: ((size.height - 40) / 2).rounded(), width: size.width, height: 40)
            let width = (fold.minY * 9 / 16).rounded()
            return CGRect(x: ((size.width - width) / 2).rounded(), y: 0, width: width, height: fold.minY)
        }
    }

    /// Where the controls go: inside the safe area on the phone (the swatches sit low, over the reply bar's place);
    /// over the card on the iPhone Duo, below anything the system keeps over it (upright, the clock corner).
    func controlRoom(_ frame: CGRect, size: CGSize, insets: EdgeInsets) -> CGRect {
        let inset = Spacing.s3
        if duo.pose == .phone {
            let top = insets.top + 2
            let bottom = size.height - max(insets.bottom, inset)
            return CGRect(x: inset, y: top, width: max(size.width - 2 * inset, 0), height: max(bottom - top, 0))
        }
        let top = max(frame.minY + inset, insets.top, duo.occludedBottom(from: frame.minX, to: frame.maxX) + Spacing.s2)
        let bottom = frame.maxY - (frame.maxY >= size.height - 1 ? max(insets.bottom, inset) : inset)
        return CGRect(x: frame.minX + inset, y: top, width: max(frame.width - 2 * inset, 0), height: max(bottom - top, 0))
    }

    /// The viewer's corners: rounded at the bottom on the phone, toward the side strip closed, all round open sideways.
    var pictureShape: UnevenRoundedRectangle {
        switch duo.pose {
        case .phone: UnevenRoundedRectangle(bottomLeadingRadius: 18, bottomTrailingRadius: 18, style: .continuous)
        case .closed: UnevenRoundedRectangle(bottomTrailingRadius: 24, topTrailingRadius: 24, style: .continuous)
        case .wide: UnevenRoundedRectangle(topLeadingRadius: 28, bottomLeadingRadius: 28, bottomTrailingRadius: 28, topTrailingRadius: 28)
        case .upright, .table: UnevenRoundedRectangle()
        }
    }

    /// The strip the viewer's top bar covers (its progress bars, face, name, place and buttons), as the viewer darkens
    /// it, with a dashed line where it ends.
    func viewerStrip(_ frame: CGRect, insets: EdgeInsets) -> some View {
        let barsTop = duo.pose == .phone
            ? insets.top + 8
            : max(12, insets.top, duo.occludedBottom(from: frame.minX, to: frame.maxX)) - frame.minY
        // Bars 3 pt, 9 pt to the header, the header 48 pt.
        let covered = max(barsTop + 60, 0)
        return ZStack(alignment: .top) {
            LinearGradient(colors: [Color.black.opacity(0.55), .clear], startPoint: .top, endPoint: .bottom)
                .frame(height: max(covered + 90, 170))
            Path { path in
                path.move(to: CGPoint(x: 0, y: 0.5))
                path.addLine(to: CGPoint(x: frame.width, y: 0.5))
            }
            .stroke(Color.white.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [5, 5]))
            .frame(height: 1)
            .offset(y: covered)
        }
        .frame(width: frame.width, alignment: .top)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    // MARK: - The top bar

    private var topBar: some View {
        HStack(spacing: Spacing.s2) {
            roundButton(.x, size: 22, label: "Cancel", id: "moments.marks.cancel") { model.cancelMarks() }
            Spacer(minLength: Spacing.s2)
            if marking.tool == .draw { MomentsMarksUndo(marking: marking) }
            Button { model.applyMarks() } label: {
                Text("Done")
                    .scaledFont(15, weight: .bold)
                    .foregroundStyle(Color(uiColor: MomentsPalette.ink(MomentMarks.Ink.black.rawValue)))
                    .padding(.horizontal, 18)
                    .padding(.vertical, Spacing.s1)
                    .frame(minHeight: 40)
                    .background(Capsule().fill(Color.white))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("moments.marks.done")
        }
    }

    /// A 44-pt round button on the picture (X, Undo).
    func roundButton(_ icon: PantopusIcon, size: CGFloat, label: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Icon(icon, size: size, strokeWidth: 2.4, color: .white)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Color.black.opacity(0.42)))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
    }
}

/// Undo, off while there's no line to take back. Its own view: it follows every line drawn, the rest of the editor
/// doesn't need to.
private struct MomentsMarksUndo: View {
    let marking: MomentsMarking

    var body: some View {
        let empty = marking.editing.strokes.isEmpty
        Button { marking.undo() } label: {
            Icon(.undo2, size: 20, strokeWidth: 2.4, color: .white)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Color.black.opacity(0.42)))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(empty)
        .opacity(empty ? 0.5 : 1)
        .accessibilityLabel("Undo")
        .accessibilityIdentifier("moments.marks.undo")
    }
}
