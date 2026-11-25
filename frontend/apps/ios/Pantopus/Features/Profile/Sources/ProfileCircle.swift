//
//  ProfileCircle.swift
//  Pantopus
//
//  The work circle opened (board 9; CONTRACT P2.6, p2.8); its card on Work is ProfileCircleCard.swift. The person in
//  the middle, those they taught or led above, those they work beside on either side, those they learned from below;
//  a solid line is a tie both sides confirmed, a dotted one a name typed and not confirmed. Choosing someone shows
//  the pieces the two share. "Hired by" closes it. At the largest text sizes each group is a list instead.
//

import SwiftUI

// MARK: - A face

/// A person's round face (or initials), a business's square badge, a typed name or place's dotted ring.
struct ProfileCircleFace: View {
    let person: ProfileCirclePersonDTO
    var size: CGFloat = 48
    var chosen = false

    private var initials: String {
        (person.name ?? "").split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    private var said: Bool {
        person.ink != "signed"
    }

    var body: some View {
        let shape = person.kind == "business"
            ? AnyShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
            : AnyShape(Circle())
        ZStack {
            shape.fill(person.kind == "business" ? Theme.Color.businessBg : Theme.Color.appSurfaceSunken)
            if let url = person.portraitURL.flatMap(URL.init(string:)) {
                CachedAsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                }
                .clipShape(shape)
            } else {
                Text(initials.isEmpty ? "·" : initials)
                    .font(.system(size: size * 0.32, weight: .semibold))
                    .foregroundStyle(person.kind == "business" ? Theme.Color.business : Theme.Color.appTextStrong)
            }
            if said {
                shape.stroke(Theme.Color.appTextSecondary, style: StrokeStyle(lineWidth: 1.2, dash: [2, 2.5]))
            } else {
                shape.stroke(chosen ? Theme.Color.primary600 : Theme.Color.appText, lineWidth: chosen ? 3 : 2)
            }
        }
        .frame(width: size, height: size)
        .background(Theme.Color.appBg, in: shape)
    }
}

// MARK: - The circle (board 9)

/// Where each face sits, to draw its line to the middle.
private struct ProfileCircleAnchors: PreferenceKey {
    static let defaultValue: [String: Anchor<CGRect>] = [:]

    static func reduce(value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]) {
        value.merge(nextValue()) { $1 }
    }
}

struct ProfileCircleScreen: View {
    let model: ProfilePageModel
    let onOpenPiece: (ProfilePieceDTO) -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    private var firstName: String {
        model.content?.header.firstName ?? ""
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let circle = model.circle {
                    content(circle)
                } else if model.circleFailed {
                    Text("Couldn't open the circle. Try again in a moment.")
                        .scaledFont(15)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .padding(Spacing.s6)
                } else {
                    VStack(spacing: Spacing.s3) {
                        Shimmer(height: 220, cornerRadius: 20)
                        Shimmer(height: 80, cornerRadius: 20)
                    }
                    .padding(Spacing.s4)
                    .accessibilityHidden(true)
                }
            }
            .background(Theme.Color.appBg)
            .navigationTitle("Work circle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { model.closeCircle() }
                }
            }
        }
        .accessibilityIdentifier("profileCircle")
    }

    private func content(_ circle: ProfileCircleDTO) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                Text("Who \(firstName) works with")
                    .scaledFont(22, weight: .bold)
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityAddTraits(.isHeader)
                Text("Drawn from the people named on \(firstName)'s pieces. A solid line is a tie both sides confirmed. "
                    + "A dotted line is one \(firstName) said, not yet confirmed.")
                    .scaledFont(14)
                    .foregroundStyle(Theme.Color.appTextStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }
            // At the largest sizes the drawing can't hold its names: each group becomes a list instead.
            if typeSize.isAccessibilitySize {
                list(circle)
            } else {
                diagram(circle)
            }
            if let person = model.circleChosen {
                shared(with: person)
            }
            if let hired = circle.hiredBy {
                ProfileBlockCard { ProfileInkLineView(line: hired.sourceLine(at: 0)) }
            }
            Text("People are here only for pieces they confirmed, or for names \(firstName) typed.")
                .scaledFont(13)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(Spacing.s3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Color.infoBg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .padding(Spacing.s4)
    }

    // MARK: The diagram

    private func diagram(_ circle: ProfileCircleDTO) -> some View {
        let beside = circle.group("works_beside")
        // Up to four beside the person, split around them (the first half on the left), so no line crosses a face.
        let besidePeople = Array((beside?.people ?? []).prefix(4))
        let left = Array(besidePeople.prefix((besidePeople.count + 1) / 2))
        let right = Array(besidePeople.dropFirst(left.count))
        return VStack(alignment: .leading, spacing: Spacing.s4) {
            if let led = circle.group("taught_or_led"), !led.people.isEmpty {
                section(led.title) { row(led, shown: Array(led.people.prefix(3))) }
            }
            if let beside {
                section(beside.title) {
                    HStack(alignment: .top, spacing: Spacing.s2) {
                        ForEach(Array(left.enumerated()), id: \.offset) { index, person in
                            bubble(person, key: "beside\(index)")
                        }
                        owner
                        ForEach(Array(right.enumerated()), id: \.offset) { index, person in
                            bubble(person, key: "beside\(index + left.count)")
                        }
                        if beside.count > left.count + right.count {
                            more(beside.count - left.count - right.count)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            } else {
                owner.frame(maxWidth: .infinity)
            }
            if let learned = circle.group("learned_from"), !learned.people.isEmpty {
                section(learned.title) { row(learned, shown: Array(learned.people.prefix(3))) }
            }
        }
        .backgroundPreferenceValue(ProfileCircleAnchors.self) { anchors in
            GeometryReader { proxy in
                lines(anchors, circle: circle, in: proxy)
            }
            .accessibilityHidden(true)
        }
    }

    private var owner: some View {
        let header = model.content?.header
        return VStack(spacing: Spacing.s1) {
            ZStack {
                Circle().fill(Theme.Color.appSurfaceSunken)
                Text(Self.initials(header?.name))
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(Theme.Color.appTextStrong)
                if let url = header?.portraitURL {
                    CachedAsyncImage(url: url) { phase in
                        if let image = phase.image { image.resizable().scaledToFill() } else { Color.clear }
                    }
                    .clipShape(Circle())
                }
                Circle().stroke(Theme.Color.appText, lineWidth: 3)
            }
            .frame(width: 72, height: 72)
            .background(Theme.Color.appBg, in: Circle())
            .anchorPreference(key: ProfileCircleAnchors.self, value: .bounds) { ["owner": $0] }
            Text(header?.name ?? "").scaledFont(13, weight: .semibold).foregroundStyle(Theme.Color.appText)
        }
        .accessibilityElement(children: .combine)
    }

    private static func initials(_ name: String?) -> String {
        (name ?? "").split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    private func section(_ title: String, @ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            ProfileBlockTitle(title: title)
            content()
        }
    }

    private func row(_ group: ProfileCircleGroupDTO, shown: [ProfileCirclePersonDTO]) -> some View {
        HStack(alignment: .top, spacing: Spacing.s3) {
            ForEach(Array(shown.enumerated()), id: \.offset) { index, person in
                bubble(person, key: "\(group.key)\(index)")
            }
            if group.count > shown.count {
                more(group.count - shown.count)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func bubble(_ person: ProfileCirclePersonDTO, key: String) -> some View {
        Button { Task { await model.choose(person) } } label: {
            VStack(spacing: Spacing.s1) {
                ProfileCircleFace(person: person, size: 52, chosen: model.circleChosen == person)
                    .anchorPreference(key: ProfileCircleAnchors.self, value: .bounds) { [key: $0] }
                Text(person.name ?? person.did ?? "Someone")
                    .scaledFont(13, weight: .semibold)
                    .foregroundStyle(Theme.Color.appText)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if person.name != nil, let did = person.did {
                    Text(did)
                        .scaledFont(11)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .multilineTextAlignment(.center)
                        .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                }
            }
            .frame(minWidth: 64, maxWidth: 96)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken(person))
        .accessibilityHint("Shows the pieces you share")
        .accessibilityAddTraits(model.circleChosen == person ? [.isButton, .isSelected] : .isButton)
    }

    private func more(_ count: Int) -> some View {
        VStack(spacing: Spacing.s1) {
            Text("+\(count)")
                .scaledFont(15, weight: .semibold)
                .foregroundStyle(Theme.Color.appTextStrong)
                .frame(width: 52, height: 52)
                .background(Theme.Color.appSurface, in: Circle())
                .overlay(Circle().stroke(Theme.Color.appBorder, lineWidth: 1))
            Text("\(count) more").scaledFont(11).foregroundStyle(Theme.Color.appTextSecondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func spoken(_ person: ProfileCirclePersonDTO) -> String {
        let ink = person.ink == "signed" ? "Signed" : "Said"
        let together = person.sharedPieces == 1 ? "1 piece together" : "\(person.sharedPieces) pieces together"
        return [person.name ?? person.did, person.name == nil ? nil : person.did, ink, person.sharedPieces > 0 ? together : nil]
            .compactMap(\.self)
            .joined(separator: ", ")
    }

    /// A line from each face to the middle: solid when both sides confirmed, dotted for a typed name.
    private func lines(_ anchors: [String: Anchor<CGRect>], circle: ProfileCircleDTO, in proxy: GeometryProxy) -> some View {
        Canvas { context, _ in
            guard let ownerAnchor = anchors["owner"] else { return }
            let middle = proxy[ownerAnchor]
            let centre = CGPoint(x: middle.midX, y: middle.midY)
            let people: [(String, ProfileCirclePersonDTO)] = circle.groups.flatMap { group -> [(String, ProfileCirclePersonDTO)] in
                if group.key == "works_beside" {
                    return Array(group.people.prefix(4).enumerated()).map { ("beside\($0.offset)", $0.element) }
                }
                return Array(group.people.prefix(3).enumerated()).map { ("\(group.key)\($0.offset)", $0.element) }
            }
            for (key, person) in people {
                guard let anchor = anchors[key] else { continue }
                let face = proxy[anchor]
                var path = Path()
                path.move(to: CGPoint(x: face.midX, y: face.midY))
                path.addLine(to: centre)
                let style = person.ink == "signed"
                    ? StrokeStyle(lineWidth: 1.5)
                    : StrokeStyle(lineWidth: 1.5, lineCap: .round, dash: [1, 4])
                context.stroke(path, with: .color(Theme.Color.appTextMuted), style: style)
            }
        }
    }

    // MARK: Shared pieces

    private func shared(with person: ProfileCirclePersonDTO) -> some View {
        ProfileBlockCard(padded: false) {
            HStack(spacing: Spacing.s3) {
                ProfileCircleFace(person: person, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text("With \(person.name ?? person.did ?? "them")")
                        .scaledFont(16, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                    HStack(spacing: 5) {
                        ProfileInkGlyph(ink: person.ink == "signed" ? .signed : .said, size: 9)
                        Text(person.sharedPieces == 1 ? "1 piece together" : "\(person.sharedPieces) pieces together")
                            .scaledFont(13)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                    }
                }
            }
            .padding(Spacing.s4)
            if let pieces = model.circleShared {
                ForEach(pieces) { piece in
                    ProfileRowDivider()
                    Button { onOpenPiece(piece) } label: {
                        HStack(spacing: Spacing.s3) {
                            ProfilePiecePicture(url: piece.coverURL)
                                .frame(width: 44, height: 44)
                                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(piece.title).scaledFont(15, weight: .semibold).foregroundStyle(Theme.Color.appText)
                                Text([piece.when, piece.line.how].compactMap(\.self).joined(separator: " · "))
                                    .scaledFont(12)
                                    .foregroundStyle(Theme.Color.appTextSecondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Icon(.chevronRight, size: 16, color: Theme.Color.appTextMuted)
                        }
                        .padding(.horizontal, Spacing.s4)
                        .padding(.vertical, Spacing.s3)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(Spacing.s3)
            }
        }
    }
}

// MARK: - The circle as lists (the largest text sizes)

extension ProfileCircleScreen {
    /// The groups as lists, for the largest text sizes: a face, the name, what they did and the ink in words.
    func list(_ circle: ProfileCircleDTO) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            ForEach(["taught_or_led", "works_beside", "learned_from"], id: \.self) { key in
                if let group = circle.group(key), !group.people.isEmpty {
                    section(group.title) {
                        VStack(alignment: .leading, spacing: Spacing.s2) {
                            ForEach(Array(group.people.enumerated()), id: \.offset) { _, person in
                                listRow(person)
                            }
                            if group.count > group.people.count {
                                Text("\(group.count - group.people.count) more")
                                    .scaledFont(13)
                                    .foregroundStyle(Theme.Color.appTextSecondary)
                            }
                        }
                    }
                }
            }
        }
    }

    func listRow(_ person: ProfileCirclePersonDTO) -> some View {
        Button { Task { await model.choose(person) } } label: {
            HStack(alignment: .top, spacing: Spacing.s3) {
                ProfileCircleFace(person: person, size: 44, chosen: model.circleChosen == person)
                VStack(alignment: .leading, spacing: 2) {
                    Text(person.name ?? person.did ?? "Someone")
                        .scaledFont(15, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                    if person.name != nil, let did = person.did {
                        Text(did).scaledFont(13).foregroundStyle(Theme.Color.appTextSecondary)
                    }
                    HStack(spacing: 5) {
                        ProfileInkGlyph(ink: person.ink == "signed" ? .signed : .said, size: 9)
                        Text(person.ink == "signed" ? "Signed" : "Said")
                            .scaledFont(13)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken(person))
        .accessibilityHint("Shows the pieces you share")
        .accessibilityAddTraits(model.circleChosen == person ? [.isButton, .isSelected] : .isButton)
    }
}
