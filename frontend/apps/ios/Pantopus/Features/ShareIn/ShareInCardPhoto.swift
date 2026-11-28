//
//  ShareInCardPhoto.swift
//  Pantopus
//
//  A photo shared from another app to Mail (`ShareInCoordinator`): it waits
//  here while the person picks a card and who it's for, and goes on the card
//  when "Write on the back" shows its "Add a photo" (`HolidayCardSteps`), as
//  if picked there. A card carries one photo, for one person, sent with a
//  bought stamp; where the card can't take it, it stays here and the row
//  says why, as it does for a picked one. It waits an hour, then is dropped.
//

import Observation
import SwiftUI

@Observable
@MainActor
final class ShareInCardPhoto {
    static let shared = ShareInCardPhoto()

    private var photo: Data?
    private var leftAt = Date.distantPast

    private init() {}

    /// A photo is waiting for a card.
    var isWaiting: Bool {
        photo != nil && Date().timeIntervalSince(leftAt) < ShareInbox.keepsFor
    }

    func leave(_ data: Data) {
        photo = data
        leftAt = Date()
    }

    /// The card takes it: once.
    func take() -> Data? {
        defer { photo = nil }
        return isWaiting ? photo : nil
    }

    func clear() {
        photo = nil
    }
}

/// The line the card flow shows while a shared photo waits: it says where the photo will go.
struct ShareInCardPhotoNote: View {
    @State private var waiting = ShareInCardPhoto.shared
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if waiting.isWaiting {
            Text("Your photo goes on the card when you write on the back.")
                .font(.system(size: 13))
                .foregroundStyle(HolidayCardDesk.muted(scheme))
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s2)
                .accessibilityIdentifier("shareIn.cardPhotoNote")
        }
    }
}
