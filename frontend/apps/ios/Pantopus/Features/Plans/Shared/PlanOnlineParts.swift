//
//  PlanOnlineParts.swift
//  Pantopus
//
//  Plans step 3, online plans (CONTRACT-step3-4.md section 1; board Online):
//  people join with a link. The server sends the link and its site
//  (`link_host`) only to the host and the people who are in; everyone else
//  reads "Online" where a plan shows its area, with no distance and no pin.
//  Here: the words, the phone's own check of a link (the server's, first),
//  the "Online" chip, the top of an online plan's page, the link card and the
//  "Join" footer.
//

import CoreLocation
import SwiftUI

/// The words online plans share (the same on Android).
enum PlanOnlineCopy {
    static let word = "Online"
    static let linkPlaceholder = "Paste the link people will join with"
    static let linkScope = "The link shows only to people who are in."
    /// The server's sentence for a link it can't take (planActions.js `ONLINE_LINK_MESSAGE`).
    static let linkProblem = "Add the link people will join with. It has to start with https://"
    static let sharedWhenIn = "The link is shared when you're in"
    static let onlyIn = "Only people who are in see the link"

    /// "The link Sam added", "The link you added".
    static func addedBy(_ card: PlanCardDTO) -> String {
        card.viewer?.isHost == true ? "The link you added" : "The link \(PlanCardLines.hostName(card)) added"
    }

    /// "Opens meet.google.com. Pantopus doesn't run the call."
    static func opens(_ linkHost: String?) -> String {
        "Opens \(linkHost ?? "the link"). Pantopus doesn't run the call."
    }

    /// "Online · hosted from Camas" when the card's area has a city; "Online" otherwise.
    static func whereLine(_ card: PlanCardDTO) -> String {
        guard let city = card.area.city?.trimmingCharacters(in: .whitespacesAndNewlines), !city.isEmpty else { return word }
        return "\(word) · hosted from \(city)"
    }
}

/// The server's check of a link, on the phone first (planPlace.js `parseOnlineLink`): https, a host name
/// with a dot that is not an IP address or localhost, at most 300 characters.
enum PlanOnlineLink {
    static let maxLength = 300

    /// The trimmed link and its site without `www.`, or nil when the server would refuse it.
    static func parse(_ raw: String) -> (link: String, host: String)? {
        let link = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !link.isEmpty, link.utf16.count <= maxLength,
              link.rangeOfCharacter(from: .whitespacesAndNewlines.union(.controlCharacters)) == nil,
              let url = URL(string: link), url.scheme?.lowercased() == "https",
              var host = url.host?.lowercased() else { return nil }
        if host.hasSuffix(".") { host.removeLast() }
        let isAddress = host.range(of: #"^\d{1,3}(\.\d{1,3}){3}$"#, options: .regularExpression) != nil
        guard host.contains("."), !host.contains(":"), !host.hasPrefix("["), !isAddress,
              host != "localhost", !host.hasSuffix(".localhost") else { return nil }
        return (link, host.hasPrefix("www.") ? String(host.dropFirst(4)) : host)
    }

    /// The link to open from "Join": https only, whatever the server sent.
    static func joinURL(_ link: String?) -> URL? {
        guard let link, let parsed = parse(link) else { return nil }
        return URL(string: parsed.link)
    }
}

extension PlanPlaceBody {
    /// An online plan's place: where it "is" (the host's home, or a fresh fix) is the server's to work out.
    static func online(link: String, timezone: String = TimeZone.current.identifier) -> PlanPlaceBody {
        var body = PlanPlaceBody(kind: .online, name: nil, address: nil, latitude: 0, longitude: 0, homeId: nil)
        body.link = link
        body.timezone = timezone
        return body
    }
}

extension PlanPlaceDTO {
    /// The exact point; nil for an online plan, which has none.
    var coordinate: CLLocationCoordinate2D? {
        guard let latitude, let longitude else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

extension PlanAreaDTO {
    /// The area's point; nil for an online plan posted with no area.
    var coordinate: CLLocationCoordinate2D? {
        guard let latitude, let longitude else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

extension PlanCardDTO {
    /// People join with a link (Plans step 3): no place, no pin, no distance.
    var isOnline: Bool {
        placeKind == .online
    }

    /// Where rows and cards name the area: "Online" for an online plan.
    var areaWord: String {
        isOnline ? PlanOnlineCopy.word : area.label
    }
}

/// "Online" with the video glyph, beside the kind (board Online), shaped as the "Private" chip.
struct PlanOnlineChip: View {
    var body: some View {
        HStack(spacing: 6) {
            Icon(.video, size: 14, color: Theme.Color.appTextStrong)
            Text(PlanOnlineCopy.word)
                .planFont(.label)
                .foregroundStyle(Theme.Color.appTextStrong)
                .lineLimit(1)
        }
        .padding(.leading, 10)
        .padding(.trailing, Spacing.s3)
        .frame(minHeight: 30)
        .background(Capsule().fill(Theme.Color.appSurfaceSunken))
        .overlay(Capsule().strokeBorder(Theme.Color.appBorderStrong, lineWidth: 1))
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Online plan")
        .accessibilityIdentifier("planOnlineChip")
    }
}

/// Board Online's top, where a plan shows its map: the kind's soft color and, on the kind's color, the video glyph.
struct PlanOnlineHero: View {
    let kind: PlanKind
    var height: CGFloat = PlanHeaderMap.height

    var body: some View {
        kind.tint
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .overlay {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(kind.color)
                    .frame(width: 84, height: 84)
                    .overlay(Icon(.video, size: 40, color: Theme.Color.categoryPlanPinInk))
                    .padding(.top, 26)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Online plan. There is no place to go: people join with a link.")
            .accessibilityIdentifier("planOnlineHero")
    }
}

/// The link, for the host and people who are in (board Online): its site, who added it, and who sees it.
struct PlanOnlineLinkCard: View {
    let card: PlanCardDTO
    let place: PlanPlaceDTO

    var body: some View {
        PlanCardBox {
            VStack(alignment: .leading, spacing: Spacing.s2) {
                HStack(spacing: Spacing.s3) {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(card.kind.tint)
                        .frame(width: 40, height: 40)
                        .overlay(Icon(.link, size: 20, color: card.kind.color))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(place.linkHost ?? "The link")
                            .planFont(.bodyStrong)
                            .foregroundStyle(Theme.Color.appText)
                            .lineLimit(1)
                        Text(PlanOnlineCopy.addedBy(card))
                            .planFont(.small)
                            .foregroundStyle(Theme.Color.appTextSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                PlanScopeLine(text: PlanOnlineCopy.onlyIn)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("planOnlineLinkCard")
    }
}

/// Board Online's footer for the host and people who are in: "Join" opens the link in the browser.
struct PlanOnlineJoin: View {
    let place: PlanPlaceDTO?

    @Environment(\.openURL) private var openURL

    var body: some View {
        let url = PlanOnlineLink.joinURL(place?.link)
        Button {
            if let url { openURL(url) }
        } label: {
            PlanButtonLabel(title: "Join", icon: .video, kind: .primary)
        }
        .planButton(.primary)
        .disabled(url == nil)
        .accessibilityHint(PlanOnlineCopy.opens(place?.linkHost))
        .accessibilityIdentifier("planJoinOnline")
        Text(PlanOnlineCopy.opens(place?.linkHost))
            .planFont(.caption)
            .foregroundStyle(Theme.Color.appTextSecondary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }
}
