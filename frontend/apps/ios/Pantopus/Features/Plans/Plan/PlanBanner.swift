//
//  PlanBanner.swift
//  Pantopus
//
//  A status banner on a plan (J5, J7, invitations): a 34 pt glyph square and
//  two lines. Moved out of PlanScreenSections.swift unchanged.
//

import SwiftUI

/// A status banner: a 34 pt glyph square and two lines.
struct PlanBanner: View {
    enum Tone { case neutral, success, warning }

    let tone: Tone
    let icon: PantopusIcon
    let title: String
    let message: String?
    /// "See what to bring" under a hairline, on "You're in" (JOURNEYS 2).
    var bring: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            words
            if let bring { PlanBringPointerRow(open: bring) }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, Spacing.s3)
        .background(RoundedRectangle(cornerRadius: Radii.xl, style: .continuous).fill(background))
    }

    private var words: some View {
        HStack(spacing: Spacing.s3) {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(tone == .success ? Theme.Color.successSolid : Theme.Color.appSurface)
                .overlay {
                    if tone != .success {
                        RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1)
                    }
                }
                .frame(width: 34, height: 34)
                .overlay(Icon(icon, size: 18, strokeWidth: tone == .success ? 2.6 : 2, color: glyph))
            VStack(alignment: .leading, spacing: 0) {
                Text(title).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                if let message {
                    Text(message)
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }

    private var background: Color {
        switch tone {
        case .neutral: Theme.Color.appSurfaceSunken
        case .success: Theme.Color.successBg
        case .warning: Theme.Color.warningBg
        }
    }

    private var glyph: Color {
        switch tone {
        case .success: Theme.Color.appTextInverse
        case .warning: Theme.Color.warning
        case .neutral: Theme.Color.appTextStrong
        }
    }
}
