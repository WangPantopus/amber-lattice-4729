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
                ProfileCircleDiagram(
                    circle: circle,
                    centreName: model.content?.header.name,
                    centrePortrait: model.content?.header.portraitURL,
                    chosen: model.circleChosen
                ) { person in Task { await model.choose(person) } }
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

    private func section(_ title: String, @ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            ProfileBlockTitle(title: title)
            content()
        }
    }

    private func spoken(_ person: ProfileCirclePersonDTO) -> String {
        person.spokenInCircle
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
                        Text([person.circleWords, person.sharedPieces == 1 ? "1 piece together" : "\(person.sharedPieces) pieces together"]
                            .joined(separator: " · "))
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
