//
//  SupportTrainShareText.swift
//  Pantopus
//
//  The words a Support Train's link is shared with. A helper passing a train on isn't its
//  organizer, so only the organizer's own invitation says "my" (B14).
//

import Foundation

public enum SupportTrainShareText {
    public static func message(trainId: String, asOrganizer: Bool = false) -> String {
        let link = InviteLinks.supportTrainURLString(trainId: trainId)
        return asOrganizer
            ? "Join my Support Train on Pantopus — \(link)"
            : "Help with this Support Train on Pantopus — \(link)"
    }
}
