//
//  TodaySkyHouseButtons.swift
//  Pantopus
//
//  The house on Today (JOURNEYS section 3): each thing that is true in the
//  picture is a button, built the way the bins' is: an invisible 44-point
//  target laid over it (`TodaySkyHero`). The flag opens Mail, the note opens
//  the first "Needs you" row's own link, the lantern opens the first of
//  Today's Plans cards' plans. Where each stands: `SkyHouseSpots`.
//

import SwiftUI

/// What is true now, what a screen reader says for each thing, and what a tap on it does.
struct SkyHouseButtons {
    var things = SkyHouseThings()
    /// The flag is up: the Mail tab.
    var onMail: () -> Void = {}
    /// The first "Needs you" row's words, and its own link.
    var noteWords = ""
    var onNote: () -> Void = {}
    /// The first of Today's Plans cards' plans: its title, and the plan.
    var lanternTitle = ""
    var onLantern: () -> Void = {}
}

/// An invisible 44-point target over each thing that is true, the way the bins have one.
struct SkyHouseTargets: View {
    let house: SkyHouseButtons
    let spots: SkyHouseSpots

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear
            if house.things.has(.flag) {
                target(at: spots.mailbox, label: "Mail came today. Opens Mail.", id: "todaySkyMailbox", action: house.onMail)
            }
            if house.things.has(.note) {
                target(at: spots.note, label: "\(house.noteWords). Opens it.", id: "todaySkyNote", action: house.onNote)
            }
            if house.things.has(.lantern) {
                target(at: spots.lantern, label: "\(house.lanternTitle). Opens the plan.", id: "todaySkyLantern", action: house.onLantern)
            }
        }
    }

    private func target(at point: CGPoint, label: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Color.clear.frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .position(point)
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
    }
}
