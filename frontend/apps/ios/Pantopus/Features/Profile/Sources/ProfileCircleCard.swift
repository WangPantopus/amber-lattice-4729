//
//  ProfileCircleCard.swift
//  Pantopus
//
//  The work circle's card on Work (board 7; CONTRACT P2.6): faces, the server's sentence and the three groups
//  counted, with "Open the circle". The circle itself is ProfileCircle.swift.
//

import SwiftUI

// MARK: - The card on Work (board 7)

struct ProfileCircleCard: View {
    let title: String?
    let circle: ProfileCircleDTO
    let onOpen: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    private static let order = ["learned_from", "works_beside", "taught_or_led"]

    private var faces: [ProfileCirclePersonDTO] {
        Array(circle.groups.flatMap(\.people).prefix(5))
    }

    /// At the largest sizes each part goes one under another: three tiles in a row would break their words.
    private var large: Bool {
        typeSize.isAccessibilitySize
    }

    private var headerLayout: AnyLayout {
        large ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0)) : AnyLayout(HStackLayout(alignment: .firstTextBaseline))
    }

    private var facesLayout: AnyLayout {
        large ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.s2)) : AnyLayout(HStackLayout(spacing: Spacing.s3))
    }

    private var tilesLayout: AnyLayout {
        large
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.s2))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Spacing.s2))
    }

    private var tileLayout: AnyLayout {
        large
            ? AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: Spacing.s2))
            : AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
    }

    var body: some View {
        ProfileBlockCard {
            headerLayout {
                ProfileBlockTitle(title: title ?? "Work circle")
                if !large { Spacer(minLength: Spacing.s2) }
                if circle.opens {
                    Button("Open the circle", action: onOpen)
                        .scaledFont(14, weight: .semibold)
                        .foregroundStyle(Theme.Color.primary600)
                        .frame(minHeight: 44)
                }
            }
            facesLayout {
                HStack(spacing: -10) {
                    ForEach(Array(faces.enumerated()), id: \.offset) { _, person in
                        ProfileCircleFace(person: person, size: 34)
                    }
                }
                .accessibilityHidden(true)
                if let text = circle.text {
                    Text(text)
                        .scaledFont(14)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, Spacing.s2)
            tilesLayout {
                ForEach(Self.order, id: \.self) { key in
                    if let group = circle.group(key) {
                        tile(group)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func tile(_ group: ProfileCircleGroupDTO) -> some View {
        tileLayout {
            Text(verbatim: String(group.count)).scaledFont(20, weight: .bold).foregroundStyle(Theme.Color.appText)
            Text(group.title)
                .scaledFont(12)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.s3)
        .background(Theme.Color.appSurfaceSunken, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
