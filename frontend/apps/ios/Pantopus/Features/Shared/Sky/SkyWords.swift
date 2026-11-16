//
//  SkyWords.swift
//  Pantopus
//
//  Every word the Sky's approximate places put on screen (phase A, contract
//  section 10): the Moment Post sheet and the Pulse composer's place line.
//  Kept in one place so a change of words is one edit. Drawn only while the
//  server answers `sky: true`.
//

import Foundation

enum SkyWords {
    // MARK: - The place line

    /// "Floating over Washougal, WA".
    static func floatingOver(_ area: String) -> String {
        "Floating over \(area)"
    }

    /// "At Esther Short Park".
    static func at(_ place: String) -> String {
        "At \(place)"
    }

    static let area = "Area"
    static let exact = "Exact"
    static let pinAtPlace = "Pin it at a place"
    static let pinAtPlaceHint = "Pick a park, a shop or a venue nearby"
    static let change = "Change"
    static let pinNotAtHome = "Not available at home"
    static let noPlaceHere = "No place to pin near here"

    // MARK: - At home

    static let homeTitle = "You're at home, so this floats over the area"
    static let homeBody = "A Moment made at home never shows the spot. Photos can still show where you are."

    // MARK: - Elevation

    /// "About 4,400 ft above sea level": a floating Moment's height, rounded to 100 ft.
    static func aboutHeight(feet: Int) -> String {
        feet < 0 ? "About \((-feet).formatted()) ft below sea level" : "About \(feet.formatted()) ft above sea level"
    }

    /// "About 4,400 ft": a floating Moment's height where it is shown.
    static func aboutFeet(_ feet: Int) -> String {
        "About \(feet.formatted()) ft"
    }

    static let heightNotAtHome = "Not shown at home"

    // MARK: - Share later

    static let shareLater = "Share later"
    static let shareLaterHint = "Hold it until a time you pick"

    /// "Shares at 6:40 pm".
    static func sharesAt(_ date: Date) -> String {
        "Shares at \(time(date))"
    }

    /// The Post button: "Share at 6:40 pm · shows for 24 hours".
    static func shareAtButton(_ date: Date, hours: Int) -> String {
        "Share at \(time(date)) · shows for \(hours == 1 ? "1 hour" : "\(hours) hours")"
    }

    /// After posting: "Your Moment shares at 6:40 pm."
    static func scheduledNotice(_ date: Date) -> String {
        "Your Moment shares at \(time(date))."
    }

    static let shareTimePassed = "It's past 7 pm, so Tonight at 8 isn't on offer. Pick another time."

    // MARK: - The Pulse composer

    /// A venue tagged and a photo taken there: the post pins exactly (as before the Sky).
    static let photoPins = "Your photo was taken here, so you can post to this place. Your post will say \u{201C}Photo taken here.\u{201D}"
    /// An address or a bare photo: the post floats.
    static let photoFloats = "Your photo was taken here. The post floats over the area."

    // MARK: - A Moment shared later

    static let earlierToday = "Earlier today"
    static let yesterday = "Yesterday"

    /// "6:40 pm".
    static func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "h:mm a"
        formatter.amSymbol = "am"
        formatter.pmSymbol = "pm"
        return formatter.string(from: date)
    }
}
