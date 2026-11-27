//
//  MomentsMentionCaption.swift
//  Pantopus
//
//  A Moment's caption in the viewer with the people it mentions ("Pulse, reinvented"; CONTRACT 7h). While the switch
//  is on for the person watching and the Moment's answer names people (`mentions`), each "@Name" in the caption is a
//  link to that person's profile, opened over the Moment as the header's name opens the author's. Otherwise it is
//  today's caption pill, unchanged.
//

import SwiftUI

struct MomentsMentionCaption: View {
    let caption: String
    let moment: MomentDTO?
    let onPerson: (MomentAuthorDTO) -> Void
    @State private var flags = PulseReinventedFlags.shared

    /// The people whose "@Name" is in the caption, longest names first (so "@Ana Quinn" wins over "@Ana").
    private var named: [MomentAuthorDTO] {
        guard flags.isOn, let moment else { return [] }
        return moment.layers.mentions
            .filter { !$0.name.isEmpty && caption.contains("@\($0.name)") }
            .sorted { $0.name.count > $1.name.count }
    }

    var body: some View {
        let people = named
        if people.isEmpty {
            MomentsCaptionPill(caption: caption)
        } else {
            Text(Self.linked(caption, people))
                .font(.system(size: 16, weight: .medium))
                .lineSpacing(3)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .tint(.white)
                .padding(.vertical, Spacing.s2)
                .padding(.horizontal, 14)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.black.opacity(0.48)))
                .padding(.horizontal, Spacing.s10)
                .environment(\.openURL, OpenURLAction { url in
                    guard url.scheme == Self.scheme, let person = people.first(where: { $0.id == url.host() }) else {
                        return .discarded
                    }
                    onPerson(person)
                    return .handled
                })
                .accessibilityIdentifier("moments.viewer.caption")
        }
    }

    private static let scheme = "pantopus-mention"

    /// The caption with each "@Name" a bold, underlined link that only this view opens.
    static func linked(_ caption: String, _ people: [MomentAuthorDTO]) -> AttributedString {
        var text = AttributedString(caption)
        var taken: [Range<AttributedString.Index>] = []
        for person in people {
            guard let link = URL(string: "\(scheme)://\(person.id)") else { continue }
            var from = text.startIndex
            while from < text.endIndex, let found = text[from...].range(of: "@\(person.name)") {
                if !taken.contains(where: { $0.overlaps(found) }) {
                    text[found].link = link
                    text[found].inlinePresentationIntent = .stronglyEmphasized
                    text[found].underlineStyle = .single
                    taken.append(found)
                }
                from = found.upperBound
            }
        }
        return text
    }
}
