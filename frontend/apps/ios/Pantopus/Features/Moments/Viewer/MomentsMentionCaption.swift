//
//  MomentsMentionCaption.swift
//  Pantopus
//
//  A Moment's caption in the viewer with the people it mentions ("Pulse, reinvented"; CONTRACT 7h). While the switch
//  is on for the person watching and the Moment's answer names people (`mentions`), each "@Name" in the caption is a
//  button to that person's profile, opened over the Moment as the header's name opens the author's (a button, so the
//  tap is the name's, never the viewer's next). Otherwise it is today's caption pill, unchanged.
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
            MomentsCenteredFlow(spacing: 4, lineSpacing: 3) {
                ForEach(Array(Self.pieces(caption, people).enumerated()), id: \.offset) { _, piece in
                    if let person = piece.person {
                        Button { onPerson(person) } label: {
                            Text(piece.words).bold().underline()
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(person.name)
                        .accessibilityHint("Opens their profile")
                        .accessibilityIdentifier("moments.viewer.mention.\(person.id)")
                    } else {
                        Text(piece.words)
                    }
                }
            }
            .font(.system(size: 16, weight: .medium))
            .foregroundStyle(.white)
            .padding(.vertical, Spacing.s2)
            .padding(.horizontal, 14)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.black.opacity(0.48)))
            .padding(.horizontal, Spacing.s10)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(caption)
            .accessibilityIdentifier("moments.viewer.caption")
        }
    }

    struct Piece {
        let words: String
        let person: MomentAuthorDTO?
    }

    /// The caption as words and mentioned names, in order.
    static func pieces(_ caption: String, _ people: [MomentAuthorDTO]) -> [Piece] {
        var out: [Piece] = []
        var rest = Substring(caption)
        while !rest.isEmpty {
            let next = people.compactMap { person in rest.range(of: "@\(person.name)").map { ($0, person) } }
                .min { $0.0.lowerBound < $1.0.lowerBound }
            guard let (range, person) = next else {
                out += words(rest)
                break
            }
            out += words(rest[..<range.lowerBound])
            out.append(Piece(words: String(rest[range]), person: person))
            rest = rest[range.upperBound...]
        }
        return out
    }

    private static func words(_ text: Substring) -> [Piece] {
        text.split(whereSeparator: \.isWhitespace).map { Piece(words: String($0), person: nil) }
    }
}

/// Words in rows, each row as full as it fits and centred, as a caption reads.
struct MomentsCenteredFlow: Layout {
    var spacing: CGFloat = 4
    var lineSpacing: CGFloat = 2

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: rows.map(\.width).max() ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX + (bounds.width - row.width) / 2
            for index in row.items {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row {
        var items: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            var row = rows[rows.count - 1]
            if !row.items.isEmpty, row.width + spacing + size.width > width {
                rows.append(Row())
                row = Row()
            }
            row.width = row.items.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.items.append(index)
            rows[rows.count - 1] = row
        }
        return rows
    }
}
