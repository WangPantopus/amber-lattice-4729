//
//  PlaceHomeCard+Verified.swift
//  Pantopus
//
//  Faster home verification (FASTVERIFY) on the home card: "Verified resident"
//  with how and when, and the mailed-code line after a fast check. Drawn only
//  while the server's `verify-options` answers (its switch on).
//

import SwiftUI

extension PlaceHomeCard {
    /// "Verified resident" and how: "by phone · November 17" (FASTVERIFY, SPEC words).
    func verifiedResident(by: String) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                verifiedChip
                byText(by)
            }
            VStack(alignment: .leading, spacing: 4) {
                verifiedChip
                byText(by)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("place.homeCard.verifiedResident")
    }

    var verifiedChip: some View {
        PlaceChip(model: PlaceChipModel(tone: .success, text: "Verified resident", icon: .circleCheck))
    }

    @ViewBuilder
    func byText(_ by: String) -> some View {
        if !by.isEmpty {
            Text(by)
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// "Residency letters and home Mail need a mailed code." and its "Mail me a code".
    func mailCodeLine(_ mail: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Icon(.lock, size: 13, strokeWidth: 2.25, color: Theme.Color.appTextMuted)
                Text("Residency letters and home Mail need a mailed code.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            PlaceTextButton(title: "Mail me a code", arrow: false, minHeight: 44, action: mail)
                .accessibilityIdentifier("place.homeCard.mailCode")
        }
        .accessibilityElement(children: .contain)
    }

    /// The "by …" words for a verified resident while the faster-verification switch is on; nil keeps today's
    /// standing line. Empty when the server didn't say how (a proof other than mail).
    static func verifiedResident(_ options: HomeVerifyOptions?, intel: PlaceIntelligence, claimInReview: Bool) -> String? {
        guard let options, options.isVerified, !claimInReview, intel.viewer?.role != "nonresident" else { return nil }
        // The SPEC's words name four ways; a document or landlord proof shows the chip alone.
        guard let word = options.verifiedBy, ["phone", "location", "bill", "mail"].contains(word) else { return "" }
        let timeZone = intel.timeZone.flatMap(TimeZone.init(identifier:))
        guard let day = Self.monthDay(options.verifiedAt, timeZone: timeZone) else { return "by \(word)" }
        return "by \(word) · \(day)"
    }

    /// "November 17" from an ISO date, in the Home's time zone.
    static func monthDay(_ iso: String?, timeZone: TimeZone?) -> String? {
        guard let iso else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = timeZone ?? .current
        formatter.setLocalizedDateFormatFromTemplate("MMMMd")
        return formatter.string(from: date)
    }
}
