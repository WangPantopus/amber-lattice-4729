//
//  ProfileCircleDiagram.swift
//  Pantopus
//
//  The work circle's drawing (board 9), laid out as the web lays it out: those the person taught or led above, with
//  their words ABOVE their faces; those beside them on either side, words below; those they learned from below,
//  words below. A line runs from the edge of the person's face to the edge of the other's and touches nothing else:
//  a line to the row below drops straight down past the words beside the person before it bends. Under (or over)
//  each face: the name, then what they did and the ink in a word ("Carpenter · Signed"). Up to the second text size
//  above the default; from the first accessibility size the screen shows lists instead.
//

import SwiftUI

/// The drawing's fixed geometry, in points of a 360 pt wide canvas (checked so no line meets a word, a title or another
/// face for every number of people in each group).
private enum CircleGeometry {
    static let width: CGFloat = 360
    static let height: CGFloat = 560
    static let centre = CGPoint(x: 180, y: 270)
    static let centreRadius: CGFloat = 34
    static let radius: CGFloat = 24
    /// Room for a two-line name and two lines of words at the largest size the drawing is used at.
    static let labelHeight: CGFloat = 68
    static let topY: CGFloat = 124
    static let bottomY: CGFloat = 456
    /// Where a line to the row below bends: under the words of the people beside the person.
    static let turnY: CGFloat = 372
    /// Beside: the nearer place on the left, the nearer on the right, then the farther ones.
    static let besideXs: [CGFloat] = [110, 250, 36, 324]
    static let titleYs: [String: CGFloat] = ["taught_or_led": 6, "works_beside": 190, "learned_from": 374]

    static func rowXs(_ count: Int) -> [CGFloat] {
        switch count {
        case 1: [180]
        case 2: [105, 255]
        default: [55, 180, 305]
        }
    }
}

private struct CircleSlot: Identifiable {
    let id: String
    let person: ProfileCirclePersonDTO?
    /// "+3": how many more there are, in the last place of a full row.
    let more: Int
    let point: CGPoint
    let group: String
}

struct ProfileCircleDiagram: View {
    let circle: ProfileCircleDTO
    let centreName: String?
    let centrePortrait: URL?
    let chosen: ProfileCirclePersonDTO?
    let onChoose: (ProfileCirclePersonDTO) -> Void

    private typealias Geo = CircleGeometry

    /// The width the drawing has; a narrower screen gets the whole drawing smaller, geometry and words alike.
    @State private var available: CGFloat = CircleGeometry.width

    var body: some View {
        let scale = min(1, available / Geo.width)
        canvas
            .frame(width: Geo.width, height: Geo.height)
            .scaleEffect(scale, anchor: .topLeading)
            .frame(width: Geo.width * scale, height: Geo.height * scale, alignment: .topLeading)
            .frame(maxWidth: .infinity)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { available = $0 }
            // The words' boxes hold up to here; from the first accessibility size the screen shows lists instead.
            .dynamicTypeSize(...DynamicTypeSize.xLarge)
    }

    private var slots: [CircleSlot] {
        var out: [CircleSlot] = []
        let top = fill("taught_or_led", places: 3)
        for (index, entry) in top.enumerated() {
            let point = CGPoint(x: Geo.rowXs(top.count)[index], y: Geo.topY)
            out.append(CircleSlot(
                id: "taught_or_led\(index)",
                person: entry.person,
                more: entry.more,
                point: point,
                group: "taught_or_led"
            ))
        }
        for (index, entry) in fill("works_beside", places: 4).enumerated() {
            let point = CGPoint(x: Geo.besideXs[index], y: Geo.centre.y)
            out.append(CircleSlot(id: "works_beside\(index)", person: entry.person, more: entry.more, point: point, group: "works_beside"))
        }
        let bottom = fill("learned_from", places: 3)
        for (index, entry) in bottom.enumerated() {
            let point = CGPoint(x: Geo.rowXs(bottom.count)[index], y: Geo.bottomY)
            out.append(CircleSlot(id: "learned_from\(index)", person: entry.person, more: entry.more, point: point, group: "learned_from"))
        }
        return out
    }

    /// Up to `places` faces for a group; when there are more, the last place says how many more.
    private func fill(_ key: String, places: Int) -> [(person: ProfileCirclePersonDTO?, more: Int)] {
        guard let group = circle.group(key) else { return [] }
        let count = max(group.count, group.people.count)
        if count <= places { return group.people.prefix(places).map { ($0, 0) } }
        return group.people.prefix(places - 1).map { ($0, 0) } + [(nil, count - (places - 1))]
    }

    private var canvas: some View {
        let slots = slots
        return ZStack(alignment: .topLeading) {
            lines(slots)
            ForEach(["taught_or_led", "works_beside", "learned_from"], id: \.self) { key in
                if let group = circle.group(key), let y = Geo.titleYs[key] {
                    ProfileBlockTitle(title: group.title)
                        .fixedSize()
                        .padding(.trailing, Spacing.s2)
                        .background(Theme.Color.appBg)
                        .offset(y: y)
                }
            }
            centreFace
                .position(Geo.centre)
            ForEach(slots) { slot in
                face(slot).position(slot.point)
                words(slot)
            }
        }
        .frame(width: Geo.width, height: Geo.height, alignment: .topLeading)
    }

    // MARK: Faces and words

    private var centreFace: some View {
        ZStack {
            Circle().fill(Theme.Color.appSurfaceSunken)
            Text(Self.initials(centreName))
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Theme.Color.appTextStrong)
            if let url = centrePortrait {
                CachedAsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                }
                .clipShape(Circle())
            }
            Circle().stroke(Theme.Color.appText, lineWidth: 3)
        }
        .frame(width: Geo.centreRadius * 2, height: Geo.centreRadius * 2)
        .background(Theme.Color.appBg, in: Circle())
        .accessibilityLabel(centreName ?? "")
    }

    @ViewBuilder
    private func face(_ slot: CircleSlot) -> some View {
        if let person = slot.person {
            Button { onChoose(person) } label: {
                ProfileCircleFace(person: person, size: Geo.radius * 2, chosen: chosen == person)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(person.spokenInCircle)
            .accessibilityHint("Shows the pieces you share")
            .accessibilityAddTraits(chosen == person ? [.isButton, .isSelected] : .isButton)
        } else {
            Text("+\(slot.more)")
                .scaledFont(14, weight: .semibold)
                .foregroundStyle(Theme.Color.appTextStrong)
                .frame(width: Geo.radius * 2, height: Geo.radius * 2)
                .background(Theme.Color.appSurface, in: Circle())
                .overlay(Circle().stroke(Theme.Color.appBorder, lineWidth: 1))
                .accessibilityLabel("\(slot.more) more")
        }
    }

    /// The name, then what they did and the ink's word: above the face in the row above the person, below elsewhere.
    private func words(_ slot: CircleSlot) -> some View {
        let above = slot.group == "taught_or_led"
        let width: CGFloat = slot.group == "works_beside" ? 72 : 90
        let centreY = above
            ? slot.point.y - Geo.radius - 4 - Geo.labelHeight / 2
            : slot.point.y + Geo.radius + 4 + Geo.labelHeight / 2
        return VStack(spacing: 0) {
            if let person = slot.person {
                Text(person.name ?? person.did ?? "Someone")
                    .scaledFont(12, weight: .semibold)
                    .foregroundStyle(Theme.Color.appText)
                    .lineLimit(2)
                    .layoutPriority(1)
                // The ink's word is never cut: "Carpenter · Signed" when it fits on a line, else what they did on
                // its own (shortened) line and the word under it.
                ViewThatFits(in: .horizontal) {
                    Text(person.circleWords).lineLimit(1).fixedSize()
                    VStack(spacing: 0) {
                        if person.name != nil, let did = person.did {
                            Text(did).lineLimit(1)
                        }
                        Text(person.inkWord).lineLimit(1)
                    }
                }
                .scaledFont(11)
                .foregroundStyle(Theme.Color.appTextSecondary)
            } else {
                Text("\(slot.more) more").scaledFont(11).foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
        .multilineTextAlignment(.center)
        .frame(width: width, height: Geo.labelHeight, alignment: above ? .bottom : .top)
        .contentShape(Rectangle())
        .onTapGesture { if let person = slot.person { onChoose(person) } }
        .accessibilityHidden(true)
        .position(x: slot.point.x, y: centreY)
    }

    private static func initials(_ name: String?) -> String {
        (name ?? "").split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    // MARK: Lines

    /// From the edge of the person's face to the edge of each other face: solid when both sides confirmed, dotted for
    /// one in the person's words. Faces beside the person on the same side are chained, nearer to farther.
    private func lines(_ slots: [CircleSlot]) -> some View {
        Canvas { context, _ in
            var previous: [Bool: CGPoint] = [:]
            for slot in slots {
                let path = path(to: slot, previous: slot.group == "works_beside" ? previous[slot.point.x < Geo.centre.x] : nil)
                if slot.group == "works_beside" { previous[slot.point.x < Geo.centre.x] = slot.point }
                let said = slot.person.map { $0.ink != "signed" } ?? false
                let style = said
                    ? StrokeStyle(lineWidth: 1.5, lineCap: .round, dash: [2, 4])
                    : StrokeStyle(lineWidth: 1.5, lineCap: .round)
                context.stroke(path, with: .color(Theme.Color.appTextMuted), style: style)
            }
        }
        .frame(width: Geo.width, height: Geo.height)
        .accessibilityHidden(true)
    }

    private func path(to slot: CircleSlot, previous: CGPoint?) -> Path {
        var path = Path()
        let centre = Geo.centre
        let point = slot.point
        switch slot.group {
        case "works_beside":
            let left = point.x < centre.x
            let fromX = previous.map { $0.x + (left ? -Geo.radius : Geo.radius) }
                ?? centre.x + (left ? -Geo.centreRadius : Geo.centreRadius)
            path.move(to: CGPoint(x: fromX, y: centre.y))
            path.addLine(to: CGPoint(x: point.x + (left ? Geo.radius : -Geo.radius), y: centre.y))
        case "taught_or_led":
            let start = CGPoint(x: centre.x, y: centre.y - Geo.centreRadius)
            let end = CGPoint(x: point.x, y: point.y + Geo.radius)
            let bend = (start.y + end.y) / 2
            path.move(to: start)
            path.addCurve(to: end, control1: CGPoint(x: start.x, y: bend), control2: CGPoint(x: end.x, y: bend))
        default:
            // Straight down past the words beside the person, then on to the face below.
            let start = CGPoint(x: centre.x, y: centre.y + Geo.centreRadius)
            let turn = CGPoint(x: centre.x, y: Geo.turnY)
            let end = CGPoint(x: point.x, y: point.y - Geo.radius)
            let bend = (turn.y + end.y) / 2
            path.move(to: start)
            path.addLine(to: turn)
            path.addCurve(to: end, control1: CGPoint(x: turn.x, y: bend), control2: CGPoint(x: end.x, y: bend))
        }
        return path
    }
}

extension ProfileCirclePersonDTO {
    /// What they did and the ink in a word, under their name: "Carpenter · Signed", "First boss · Said".
    var circleWords: String {
        [name == nil ? nil : did, inkWord].compactMap(\.self).joined(separator: " · ")
    }

    /// The ink in a word: "Signed" for a tie both sides confirmed, else "Said".
    var inkWord: String {
        ink == "signed" ? "Signed" : "Said"
    }

    /// For VoiceOver: name, what they did, the ink and how many pieces the two share.
    var spokenInCircle: String {
        let together = sharedPieces == 1 ? "1 piece together" : "\(sharedPieces) pieces together"
        return [name ?? did, name == nil ? nil : did, ink == "signed" ? "Signed" : "Said", sharedPieces > 0 ? together : nil]
            .compactMap(\.self)
            .joined(separator: ", ")
    }
}
