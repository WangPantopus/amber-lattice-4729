//
//  PlanChangeOnlineLink.swift
//  Pantopus
//
//  Plans step 3 on board H11: an online plan's host changes its link
//  (`PATCH /api/plans/:id` with `place: { kind: "online", link, timezone }`).
//  A new link asks everyone who's in "Still coming?", in the server's words
//  ("Sam changed the link"). Moving between online and a place isn't offered
//  here.
//

import SwiftUI

struct PlanChangeOnlineLink: View {
    /// The link the plan has now (the host reads it in the plan's detail).
    let current: String?
    /// The new link, or nil while it's the one the plan has.
    @Binding var newLink: String?

    @State private var text = ""
    @State private var loaded = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text.planOverline("Link")
            PlanTextInput(
                placeholder: PlanOnlineCopy.linkPlaceholder,
                text: $text,
                limit: 2000,
                identifier: "planOnlineLink",
                label: "The link people will join with"
            )
            .keyboardType(.URL)
            .textContentType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            PlanScopeLine(text: PlanOnlineCopy.linkScope)
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            text = newLink ?? current ?? ""
        }
        .onChange(of: current) { _, link in
            if newLink == nil { text = link ?? "" }
        }
        .onChange(of: text) { _, typed in
            let trimmed = typed.trimmingCharacters(in: .whitespacesAndNewlines)
            newLink = trimmed == (current ?? "") ? nil : trimmed
        }
    }

    /// The "Still coming?" push for a new link, word for word (planNotifications.js `changed`).
    static func pushWords(host: String, noun: String, now: String, timeMoved: Bool) -> (title: String, body: String) {
        timeMoved
            ? ("\(host) changed the \(noun)", "\(now), with a new link. Still coming?")
            : ("\(host) changed the link", "It has a new link now. Still coming?")
    }
}
