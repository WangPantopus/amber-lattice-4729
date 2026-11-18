//
//  SkyFloatingIcon.swift
//  Pantopus
//
//  The Sky's floating icon (contract section 10.1): a dashed circle with a dot
//  in it, beside "Around …" on the Moment Post sheet and the Pulse
//  composer, where a pin icon stands for an exact place.
//

import SwiftUI

struct SkyFloatingIcon: View {
    var size: CGFloat = 18
    var color: Color = Theme.Color.primaryTint

    var body: some View {
        ZStack {
            Circle()
                .inset(by: size * 0.09)
                .stroke(color, style: StrokeStyle(lineWidth: size * 0.11, lineCap: .round, dash: [size * 0.14, size * 0.13]))
            Circle()
                .fill(color)
                .frame(width: size * 0.3, height: size * 0.3)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
