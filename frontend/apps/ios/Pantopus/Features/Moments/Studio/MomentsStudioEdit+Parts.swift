//
//  MomentsStudioEdit+Parts.swift
//  Pantopus
//
//  "Pulse, reinvented": the 15-minute edit's tray, its stamps on the picture, and the viewer after a save
//  (`MomentsStudioEdit`).
//

import SwiftUI

/// The stamps' chips: on are placed, off are not; a tap puts one on or takes it off.
struct MomentsStudioEditTray: View {
    let model: MomentsStudioEditModel

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                Text("Checked by Pantopus")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityAddTraits(.isHeader)
                Text("Nobody can type these")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
            MomentsStudioTrayFlow(spacing: Spacing.s2) {
                ForEach(model.offered, id: \.self) { kind in
                    let on = model.stamps.contains { $0.kind == kind }
                    Button { model.toggle(kind, startScale: model.placing.startScale, safe: model.placing.safe) } label: {
                        HStack(spacing: 6) {
                            if on { Icon(.check, size: 14, strokeWidth: 2.6, color: Theme.Color.appText) }
                            Text(MomentStampView.name(kind))
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.Color.appText)
                        }
                        .padding(.horizontal, Spacing.s3)
                        .frame(minHeight: 40)
                        .background(Capsule().fill(on ? Theme.Color.appSurfaceRaised : Theme.Color.appSurfaceSunken))
                        .overlay(Capsule().strokeBorder(Theme.Color.appText.opacity(on ? 0.6 : 0.15), lineWidth: 1))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                    .accessibilityIdentifier("moments.edit.tray.\(kind.rawValue)")
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Spacing.s4)
        .padding(.top, Spacing.s5)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.edit.tray")
    }
}

/// One stamp on the picture in an edit: drag, pinch, twist; tap to pick, and the picked one can be taken off.
struct MomentsStudioEditStamp: View {
    let model: MomentsStudioEditModel
    let placement: MomentStampPlacement
    let frame: CGRect
    let safe: CGRect
    @GestureState private var drag: CGSize = .zero
    @GestureState private var pinch: CGFloat = 1
    @GestureState private var turn: Angle = .zero

    var body: some View {
        let picked = model.picked == placement.kind
        let unit = frame.width / 402
        MomentStampView(kind: placement.kind, value: model.values[placement.kind], wet: model.moment.live.isLive(at: Date()))
            .padding(6)
            .overlay {
                if picked {
                    RoundedRectangle(cornerRadius: 10).stroke(Color.white, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                }
            }
            .overlay(alignment: .topTrailing) {
                if picked {
                    Button {
                        model.stamps.removeAll { $0.kind == placement.kind }
                        model.picked = nil
                    } label: {
                        Icon(.x, size: 12, strokeWidth: 3, color: .white)
                            .frame(width: 24, height: 24)
                            .background(Circle().fill(Color.black.opacity(0.75)))
                            .overlay(Circle().stroke(Color.white, lineWidth: 1.5))
                            .contentShape(Circle().inset(by: -8))
                    }
                    .buttonStyle(.plain)
                    .offset(x: 11, y: -11)
                    .accessibilityLabel("Take it off")
                    .accessibilityIdentifier("moments.edit.stamp.remove")
                }
            }
            .scaleEffect(CGFloat(placement.scale) * pinch * unit)
            .rotationEffect(.degrees(placement.rotation) + turn)
            .position(
                x: frame.minX + placement.x * frame.width + drag.width,
                y: frame.minY + placement.y * frame.height + drag.height
            )
            .gesture(moving.simultaneously(with: pinching).simultaneously(with: turning))
            .onTapGesture { model.picked = picked ? nil : placement.kind }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(MomentStampView.name(placement.kind))
            .accessibilityHint("Drag to move it, pinch to size it")
            .accessibilityIdentifier("moments.edit.stamp.\(placement.kind.rawValue)")
    }

    private var moving: some Gesture {
        DragGesture(minimumDistance: 2)
            .updating($drag) { value, state, _ in state = value.translation }
            .onEnded { value in
                update {
                    $0.x = min(max($0.x + value.translation.width / max(frame.width, 1), safe.minX), safe.maxX)
                    $0.y = min(max($0.y + value.translation.height / max(frame.height, 1), safe.minY), safe.maxY)
                }
            }
    }

    private var pinching: some Gesture {
        MagnifyGesture()
            .updating($pinch) { value, state, _ in state = value.magnification }
            .onEnded { value in update { $0.scale = min(max($0.scale * Double(value.magnification), 0.25), 4) } }
    }

    private var turning: some Gesture {
        RotateGesture()
            .updating($turn) { value, state, _ in state = value.rotation }
            .onEnded { value in
                update { $0.rotation = (($0.rotation + value.rotation.degrees + 180).truncatingRemainder(dividingBy: 360)) - 180 }
            }
    }

    private func update(_ change: (inout MomentStampPlacement) -> Void) {
        guard let index = model.stamps.firstIndex(where: { $0.kind == placement.kind }) else { return }
        change(&model.stamps[index])
    }
}

// MARK: - The viewer after a save

extension MomentsViewerModel {
    /// The edit saved: the Moment is read again and shown as changed, with "Moment updated".
    func edited(_ moment: MomentDTO) {
        cache.forget(moment.id)
        retry()
        show(Toast(text: "Moment updated"))
    }
}
