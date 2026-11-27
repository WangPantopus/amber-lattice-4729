//
//  StudioPalette.swift
//  Pantopus
//
//  The Studio's ink ("Pulse, reinvented" phase 0, boards B1, B2, B3, B5): the postmark's wet red and dried ink on
//  its paper, and the chips Pantopus-checked stamps are drawn on.
//

import SwiftUI

enum StudioPalette {
    /// The postmark while the Moment reads "Live from here" (B1, B2).
    static let wetInk = Color(red: 0xC8 / 255, green: 0x1E / 255, blue: 0x1E / 255)
    /// The postmark once it reads "Taken here" (B3).
    static let driedInk = Color(red: 0x33 / 255, green: 0x41 / 255, blue: 0x55 / 255)
    /// The postmark's paper.
    static let paper = Color(red: 1, green: 251 / 255, blue: 240 / 255).opacity(0.94)
    /// A stamp chip over the picture (B2's "180 ft").
    static let chip = Color(red: 0x0B / 255, green: 0x12 / 255, blue: 0x20 / 255).opacity(0.55)
}
