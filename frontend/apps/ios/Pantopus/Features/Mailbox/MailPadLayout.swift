//
//  MailPadLayout.swift
//  Pantopus
//
//  Small layout pieces the Mail screens share on an iPad (founder,
//  2026-11-23: "take advantage of the iPad screen"). Each is a no-op on
//  phones and the iPhone Duo, so their layouts stay exactly as drawn.
//

import SwiftUI

extension View {
    /// Top padding added only while the screen's sections are in two columns (`WideColumns`): lines a column's first
    /// section up with the other column's first card, past that column's overline.
    func mailTopPaddingWhenSplit(_ amount: CGFloat) -> some View {
        modifier(MailTopPaddingWhenSplit(amount: amount))
    }

    /// A bottom bar's content (Save, Continue, Send) on an iPad: no wider than a form and centered, so it isn't
    /// stretched across a big window; its background, put on after this, still runs the screen's width.
    func mailPadBarWidth(_ width: CGFloat = MailPadLayout.barWidth) -> some View {
        modifier(MailPadBarWidth(width: width))
    }

    /// A form or a short column of cards on an iPad: no wider than `width`, centered in the room it has (`alignment`
    /// places what is narrower than that inside it).
    func mailPadFormWidth(_ width: CGFloat = MailPadLayout.formWidth, alignment: Alignment = .center) -> some View {
        modifier(MailPadBarWidth(width: width, alignment: alignment))
    }
}

enum MailPadLayout {
    /// A bottom bar's buttons on an iPad.
    static let barWidth: CGFloat = 560
    /// A one-column form on an iPad (Apple's forms keep about this width in a big window).
    static let formWidth: CGFloat = 640
    /// The narrowest page that holds a main column beside a side panel (`MailPadPanelPage`).
    static let panelPageWidth: CGFloat = 760

    /// A side panel's width: a phone's content width, a little more on a big page.
    static func panelWidth(in width: CGFloat) -> CGFloat {
        width >= 1000 ? 340 : 300
    }
}

/// A page with a side panel on an iPad page wide enough (`wide`, handed the panel's width), and the phone's layout
/// (`narrow`) everywhere else: phones, the iPhone Duo, narrow panes and windows, and the largest text sizes. Read in
/// layout, so the first pass already picks one.
struct MailPadPanelPage<Wide: View, Narrow: View>: View {
    /// The narrowest page that holds the main column beside the panel.
    var minimumWidth: CGFloat = MailPadLayout.panelPageWidth
    @ViewBuilder let wide: (_ panelWidth: CGFloat) -> Wide
    @ViewBuilder let narrow: () -> Narrow
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        if WideLayout.isPad, !dynamicTypeSize.isAccessibilitySize {
            GeometryReader { proxy in
                if proxy.size.width >= minimumWidth {
                    wide(MailPadLayout.panelWidth(in: proxy.size.width))
                } else {
                    narrow()
                }
            }
        } else {
            narrow()
        }
    }
}

private struct MailTopPaddingWhenSplit: ViewModifier {
    @Environment(\.wideColumnsSplit) private var split
    let amount: CGFloat

    func body(content: Content) -> some View {
        content.padding(.top, split ? amount : 0)
    }
}

private struct MailPadBarWidth: ViewModifier {
    let width: CGFloat
    var alignment: Alignment = .center

    func body(content: Content) -> some View {
        if WideLayout.isPad {
            content
                .frame(maxWidth: width, alignment: alignment)
                .frame(maxWidth: .infinity)
        } else {
            content
        }
    }
}
