//
//  MomentsStudioYourCutouts.swift
//  Pantopus
//
//  "Pulse, reinvented", phase 0 step 4: Your cutouts in the Stamps and Play tray (board B5; `MomentsStudioCutouts`).
//

import SwiftUI

/// "Your cutouts" in the Stamps and Play tray (board B5): the ones lifted on this phone, newest first. A tap puts one in
/// the middle of the picture; holding one offers to remove it from this phone.
struct MomentsStudioYourCutouts: View {
    let model: MomentsComposerModel
    let onPlaced: () -> Void
    @State private var shelf = MomentsCutoutShelf.shared

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
                Text("Your cutouts")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityAddTraits(.isHeader)
                Text("Long-press anything in a photo to lift it")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.s2) {
                    if shelf.kept.isEmpty {
                        ForEach(0..<3, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Theme.Color.appTextSecondary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                                .frame(width: 56, height: 56)
                                .accessibilityHidden(true)
                        }
                    }
                    ForEach(Array(shelf.kept.enumerated()), id: \.element.id) { index, kept in
                        Button { place(kept) } label: {
                            Image(uiImage: kept.image)
                                .resizable()
                                .scaledToFit()
                                .padding(4)
                                .frame(width: 56, height: 56)
                                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.Color.appSurfaceSunken))
                                .contentShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button("Remove from your cutouts", role: .destructive) { shelf.remove(kept.id) }
                        }
                        .accessibilityLabel("Cutout \(index + 1)")
                        .accessibilityHint("Puts it on the picture.")
                        .accessibilityAction(named: "Remove from your cutouts") { shelf.remove(kept.id) }
                        .accessibilityIdentifier("moments.studio.cutouts.\(index)")
                    }
                }
            }
        }
        .padding(.top, Spacing.s2)
        .onAppear { shelf.load() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.studio.cutouts")
    }

    /// One kept cutout in the middle of the picture, a third of its width (as wide as it is tall at most half).
    private func place(_ kept: MomentsCutoutShelf.Kept) {
        guard let surface = model.studioCutoutSurface, surface.width > 0 else { return }
        let aspect = kept.image.size.height / max(kept.image.size.width, 1)
        let width = min(1.0 / 3, 0.5 * surface.height / max(surface.width * aspect, 1))
        model.placeStudioCutout(MomentMarks.Cutout(id: UUID(), image: kept.image, center: CGPoint(x: 0.5, y: 0.5), width: width))
        onPlaced()
    }
}
