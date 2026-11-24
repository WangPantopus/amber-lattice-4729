//
//  ProfileInkLine.swift
//  Pantopus
//
//  One line of the profile with sources (SPEC §3): the ink mark, the text, and
//  under it "Seen · by mail, June 2026". Said lines are in the person's own
//  words, so they are set in the serif italic the boards use. The word is
//  always there; the mark only repeats it.
//

import SwiftUI

/// The shape of every line on the page.
struct ProfileSourceLine: Hashable, Identifiable {
    let ink: ProfileInk
    let text: String
    /// How we know it: "by mail, June 2026". May be empty.
    let how: String?
    let lane: ProfileLane?
    /// Where a tap goes (a plan, a post, a piece); nil leaves the line as text.
    let link: String?
    /// Lines repeat (two "Hosted a plan" lines); the place in the block keeps them apart.
    let position: Int

    var id: String {
        "\(position)|\(text)"
    }

    /// "Seen · by mail, June 2026".
    var source: String {
        guard let how = how?.trimmingCharacters(in: .whitespacesAndNewlines), !how.isEmpty else { return ink.word }
        return "\(ink.word) · \(how)"
    }

    /// Read aloud: the line, then how we know it.
    var spoken: String {
        "\(text). \(source)"
    }
}

/// The type the boards set lines in. Each grows with the reader's text size.
enum ProfileSourceType {
    /// A line's text: 15/21.
    static let body: CGFloat = 15
    /// "Seen · …": 12/16.
    static let how: CGFloat = 12
    /// A said line: serif italic 16/22.
    static let said: CGFloat = 16
}

extension View {
    /// The serif italic of a person's own words (the boards' `.said`), growing with the reader's text size.
    func profileSaidFont(_ size: CGFloat = ProfileSourceType.said) -> some View {
        modifier(ProfileSaidFont(size: size))
    }
}

private struct ProfileSaidFont: ViewModifier {
    @ScaledMetric private var size: CGFloat

    init(size: CGFloat) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: Font.TextStyle.nearest(to: size))
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, design: .serif).italic())
    }
}

/// The mark, the line and how we know it.
struct ProfileInkLineView: View {
    let line: ProfileSourceLine
    /// Lines in a group that share one "how" (With others) leave it to the group.
    var showsSource = true
    var onOpen: ((String) -> Void)?

    var body: some View {
        if let link = line.link, let onOpen {
            Button { onOpen(link) } label: { content(chevron: true) }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(line.spoken)
                .accessibilityAddTraits(.isButton)
        } else {
            content(chevron: false)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(showsSource ? line.spoken : "\(line.text). \(line.ink.word)")
        }
    }

    private func content(chevron: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            ProfileInkGlyph(ink: line.ink)
                .frame(minWidth: 16, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                text
                if showsSource {
                    Text(line.source)
                        .scaledFont(ProfileSourceType.how)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if chevron {
                Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
            }
        }
        .contentShape(Rectangle())
    }

    @ViewBuilder private var text: some View {
        if line.ink == .said {
            Text(line.text)
                .profileSaidFont()
                .foregroundStyle(Theme.Color.appTextStrong)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            Text(line.text)
                .scaledFont(ProfileSourceType.body)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// The small upper-case title over a block ("SAYS", "YOU AND MARIA").
struct ProfileBlockTitle: View {
    let title: String
    var color: Color = Theme.Color.appTextSecondary

    var body: some View {
        Text(title, style: .overline)
            .foregroundStyle(color)
            .accessibilityAddTraits(.isHeader)
    }
}

/// The white card every block sits in (the boards' `.card`).
struct ProfileBlockCard<Content: View>: View {
    var padded = true
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s0) {
            content()
        }
        .padding(.horizontal, padded ? Spacing.s5 : 0)
        .padding(.vertical, padded ? Spacing.s4 : 0)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
