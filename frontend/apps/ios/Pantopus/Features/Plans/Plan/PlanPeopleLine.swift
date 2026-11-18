//
//  PlanPeopleLine.swift
//  Pantopus
//
//  Who's going on a plan you're in: overlapping photos (each opens that
//  person's profile) and "Sam (host), you + 1, Alex, Jordan and 2 more".
//

import SwiftUI

/// "Sam (host), you + 1, Alex, Jordan and 2 more", with overlapping avatars.
struct PlanPeopleLine: View {
    let people: [PlanPersonDTO]
    let myPartySize: Int
    /// Opens a person's profile from their photo; nil leaves the photos plain.
    var onOpenPerson: ((String) -> Void)?
    /// A business hosts the plan: the host is the business, by its whole name and shape (Plans with businesses).
    var business: PlanBusinessDTO?
    /// Plans for the holidays: each name with its numbers ("Dana + 2 kids", "Priya + 1"); `kidsTotal` adds
    /// "· 3 kids" at the end (a guest's page, board 20).
    var kidsWelcome = false
    var kidsTotal = false

    var body: some View {
        HStack(spacing: Spacing.s3) {
            HStack(spacing: -8) {
                ForEach(people.prefix(4)) { person in
                    photo(person)
                }
            }
            Text(summary)
                .planFont(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
        .accessibilityActions {
            if let onOpenPerson {
                ForEach(people.prefix(4).filter { !$0.isGuest }) { person in
                    Button("Open \(person.displayName)'s profile") { onOpenPerson(person.userId) }
                }
            }
        }
    }

    @ViewBuilder
    private func photo(_ person: PlanPersonDTO) -> some View {
        if person.isHost, let business {
            // The business's shape; it opens the business's page, not a person's profile.
            Button { DeepLinkRouter.shared.handle(path: "/business/\(business.userId)") } label: {
                PlanBusinessShape(url: business.avatarUrl, size: 30)
                    .overlay(RoundedRectangle(cornerRadius: 30 * 0.28 + 1, style: .continuous).stroke(Theme.Color.appSurface, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("planPersonPhoto_\(person.userId)")
        } else {
            personPhoto(person)
        }
    }

    @ViewBuilder
    private func personPhoto(_ person: PlanPersonDTO) -> some View {
        let avatar = PlanAvatar(name: person.displayName, url: person.avatarUrl, size: 30)
            .overlay(Circle().stroke(Theme.Color.appSurface, lineWidth: 2))
        // A guest without an account has no profile to open.
        if let onOpenPerson, !person.isGuest {
            Button { onOpenPerson(person.userId) } label: { avatar }
                .buttonStyle(.plain)
                .accessibilityIdentifier("planPersonPhoto_\(person.userId)")
        } else {
            avatar
        }
    }

    private var summary: String {
        let me = PlansStoreReads.viewerId
        var names: [String] = []
        for person in people {
            if person.userId == me {
                names.append(kidsWelcome ? withNumbers("you", person) : myPartySize > 1 ? "you + \(myPartySize - 1)" : "you")
            } else {
                // A business is named in full ("Lacamas Pickleball Club (host)"), a neighbor by first name.
                let first = person.isHost && business != nil ? person.displayName : PlanCardLines.firstName(person.displayName)
                let name = person.isHost ? "\(first) (host)" : kidsWelcome ? withNumbers(first, person)
                    : person.partySize > 1 ? "\(first) + \(person.partySize - 1)" : first
                names.append(name)
            }
        }
        let shown = names.prefix(4)
        let more = names.count - shown.count
        let line: String = if more > 0 {
            shown.joined(separator: ", ") + " and \(more) more"
        } else if shown.count > 1 {
            shown.dropLast().joined(separator: ", ") + " and " + (shown.last ?? "")
        } else {
            shown.first ?? ""
        }
        let kids = people.reduce(0) { $0 + ($1.kidsCount ?? 0) }
        guard kidsTotal, kidsWelcome, kids > 0 else { return line }
        return line + " · \(kids) kid\(kids == 1 ? "" : "s")"
    }

    /// "Dana + 1 + 2 kids", "Priya + 1", "Sam + 2 kids", "Sam": the other adults, then the kids.
    private func withNumbers(_ first: String, _ person: PlanPersonDTO) -> String {
        let adults = max(person.partySize - 1, 0)
        let kids = person.kidsCount ?? 0
        var name = first
        if adults > 0 { name += " + \(adults)" }
        if kids > 0 { name += " + \(kids) kid\(kids == 1 ? "" : "s")" }
        return name
    }
}
