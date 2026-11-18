//
//  PlaceVerifyFastSheet.swift
//  Pantopus
//
//  Faster home verification (FASTVERIFY drawing 3, "Verify you live here"): the
//  verify sheet with the server's ways, while `home_fast_verify` is on. Same
//  sheet, same parts; the fast checks first, then mail and the landlord.
//

import SwiftUI

extension PlaceVerifySheet {
    /// The same sheet with the server's ways: the fast checks first, then mail and the landlord. Each row opens at
    /// a tap; "Not now" closes it. Only ways the server lists as available, and that this app can open, are drawn.
    func fastSheet(_ options: HomeVerifyOptions, documentInReview: Bool) -> some View {
        let fastRows = Self.fastRows(options, documentInReview: documentInReview)
        let mailRows = Self.mailRows(options, documentInReview: documentInReview)
        return VStack(spacing: 0) {
            Capsule().fill(Theme.Color.appBorderStrong).frame(width: 40, height: 5).padding(.top, 8).padding(.bottom, 12)
            header(title: "Verify you live here")
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 10) {
                        if options.level == .added {
                            PlaceChip(model: PlaceChipModel(tone: .success, text: "Home added"))
                                .accessibilityIdentifier("place.verifySheet.homeAdded")
                        }
                        // Only while a check that verifies at once is on offer.
                        if !fastRows.isEmpty {
                            Text("It takes under a minute. Then you can message homes near you, and your home gets the Verified mark.")
                                .font(.system(size: 14.5))
                                .lineSpacing(2)
                                .foregroundStyle(Theme.Color.appTextSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    if !fastRows.isEmpty { fastGroup("Fastest", rows: fastRows) }
                    if !mailRows.isEmpty { fastGroup("Or by mail", rows: mailRows) }
                }
                .padding(.bottom, 16)
            }
            VStack(spacing: 6) {
                Button(action: onClose) {
                    Text("Not now")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.primaryInk)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("place.verifySheet.notNow")
                Text("Your home tools work either way.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.Color.appTextMuted)
                    .multilineTextAlignment(.center)
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 30)
        .background(Theme.Color.appSurface)
        .accessibilityIdentifier("place.verifySheet.fast")
    }

    /// One row of the faster sheet.
    struct FastRow: Identifiable, Equatable {
        enum Kind: Equatable { case start(PlaceVerifyMethod), documentInReview }
        let kind: Kind
        let icon: PantopusIcon
        let label: String
        let sub: String
        let tone: PlaceIconTile.Tone
        var id: String {
            label
        }
    }

    /// The checks that verify at once and this app can open, in the SPEC's order (phone, location, bill).
    static func fastRows(_ options: HomeVerifyOptions, documentInReview: Bool) -> [FastRow] {
        var rows: [FastRow] = []
        if options.offers(.phone) {
            rows.append(FastRow(
                kind: .start(.phone),
                icon: .smartphone,
                label: PlaceVerifyMethod.phone.label,
                sub: PlaceVerifyMethod.phone.sub,
                tone: .sky
            ))
        }
        if options.offers(.location) {
            rows.append(FastRow(
                kind: .start(.location),
                icon: .mapPin,
                label: PlaceVerifyMethod.location.label,
                sub: PlaceVerifyMethod.location.sub,
                tone: .sky
            ))
        }
        let document = options.option(.document)
        if !documentWaitsOnReview(document, documentInReview: documentInReview), document?.available == true, document?.fast != false {
            rows.append(FastRow(
                kind: .start(.document),
                icon: .camera,
                label: "Take a photo of a bill",
                sub: "A utility bill or lease with your name and this address.",
                tone: .sky
            ))
        }
        return rows
    }

    /// A document a person is reviewing: the sheet shows where it stands instead of a second upload. The server's
    /// answer wins when it reads a bill at once (another photo is fine after an unreadable one); the app's own
    /// claims check only stands in for a review-only upload.
    static func documentWaitsOnReview(_ document: HomeVerifyOption?, documentInReview: Bool) -> Bool {
        document?.reason == "IN_REVIEW" || (documentInReview && document?.fast != true)
    }

    /// Mail, then a document a person reviews (today's upload when the bill isn't read at once, or one already
    /// waiting on review), then the landlord, in today's words for the last two, when the server offers them.
    static func mailRows(_ options: HomeVerifyOptions, documentInReview: Bool) -> [FastRow] {
        var rows: [FastRow] = []
        let document = options.option(.document)
        let waitsOnReview = documentWaitsOnReview(document, documentInReview: documentInReview)
        let reviewOnlyDocument = !waitsOnReview && document?.available == true && document?.fast == false
        if options.offers(.mail) {
            rows.append(FastRow(
                kind: .start(.mail),
                icon: .mail,
                label: "Mail me a code",
                sub: "A postcard to this home. It arrives in about a week.",
                tone: .muted
            ))
        }
        if waitsOnReview {
            rows.append(FastRow(
                kind: .documentInReview,
                icon: .hourglass,
                label: "Document under review",
                sub: "A person is reviewing your document. You'll get a notification when it's decided.",
                tone: .muted
            ))
        } else if reviewOnlyDocument {
            rows.append(FastRow(
                kind: .start(.document),
                icon: PlaceVerifyMethod.document.icon,
                label: PlaceVerifyMethod.document.label,
                sub: PlaceVerifyMethod.document.sub,
                tone: .sky
            ))
        }
        if options.offers(.landlord) {
            rows.append(FastRow(
                kind: .start(.landlord),
                icon: PlaceVerifyMethod.landlord.icon,
                label: PlaceVerifyMethod.landlord.label,
                sub: PlaceVerifyMethod.landlord.sub,
                tone: .sky
            ))
        }
        return rows
    }

    private func fastGroup(_ title: String, rows: [FastRow]) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            overline(title)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, item in
                    fastRow(item)
                    if index < rows.count - 1 { divider }
                }
            }
            .placeCard()
        }
    }

    @ViewBuilder
    private func fastRow(_ item: FastRow) -> some View {
        switch item.kind {
        case .documentInReview:
            documentReviewRow
        case let .start(method):
            Button { onStart(method) } label: {
                row(icon: item.icon, label: item.label, sub: item.sub, tone: item.tone, trailing: AnyView(PlaceChevron()))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("place.verifySheet.\(method.rawValue)")
        }
    }
}
