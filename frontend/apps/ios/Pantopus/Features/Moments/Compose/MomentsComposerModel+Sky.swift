//
//  MomentsComposerModel+Sky.swift
//  Pantopus
//
//  The Sky's places on the Post sheet, only while the place preview answers
//  `sky: true` (founder 2026-11-17): a Moment is where it was taken; "Pin it
//  at a place" pins it at a public place close by, picked by name; at home it
//  shows only its area ("Around Washougal, WA") and says so; "Share later"
//  holds it until a time picked. The server decides again when it's posted.
//  With no `sky` in the answer nothing here applies and the sheet is the one
//  from before.
//

import CoreLocation
import Foundation

extension MomentsComposerModel {
    /// The preview's Sky fields; nil while the server doesn't answer `sky: true` (the sheet is the one from before).
    var sky: MomentSkyPreviewDTO? {
        place?.sky
    }

    /// The Moment shows only its area: under the Sky at home, where it never shows the spot; before it, "Show the
    /// area instead".
    var floats: Bool {
        sky == nil ? showArea : skyAtHome
    }

    /// The Sky: it pins at a public place. "Pin it at a place" is on, the spot isn't home, and there's a place: the
    /// one picked in the place picker, else the one that names the spot.
    var pinsHere: Bool {
        guard let sky, pinsAtPlace, sky.canPin, !noLocationOn else { return false }
        return pickedVenue != nil || sky.place != nil
    }

    /// The place's name while it pins at one: "Esther Short Park".
    var skyPlaceName: String? {
        guard pinsHere else { return nil }
        return pickedVenue?.name ?? sky?.place?.label
    }

    /// At home, under the Sky: the blue note, the home icon, and "Pin it at a place" greyed out.
    var skyAtHome: Bool {
        sky != nil && place?.atHome == true && !noLocationOn
    }

    /// The disc the small map draws for a Moment at home: the area's own point and its radius.
    var skyDisc: (center: CLLocationCoordinate2D, radiusM: Double)? {
        guard floats, let area = sky?.area else { return nil }
        return (CLLocationCoordinate2D(latitude: area.latitude, longitude: area.longitude), area.radiusM)
    }

    /// "Pin it at a place" switched: on uses the place that names the spot, else opens the place picker (a place
    /// picked there turns it on); off, the Moment is where it was taken again.
    func setPinAtPlace(_ on: Bool) {
        error = nil
        guard on else {
            pinsAtPlace = false
            venue = nil
            return
        }
        guard let sky, sky.canPin else { return }
        if sky.place != nil { pinsAtPlace = true } else { findsPlace = true }
    }

    /// The server found no place to pin at (`422 NO_PLACE_HERE`): the switch goes back off and says so.
    func noPlaceToPin() {
        pinsAtPlace = false
        venue = nil
        error = SkyWords.noPlaceHere
    }

    // MARK: - Share later

    /// The times on offer now, from the preview.
    var shareLaterChoices: [MomentShareLaterDTO] {
        sky?.shareLater ?? []
    }

    /// The choice picked, while it's still on offer.
    var shareLaterChoice: MomentShareLaterDTO? {
        guard let shareLaterKey else { return nil }
        return shareLaterChoices.first { $0.key == shareLaterKey }
    }

    /// "Share later" switched: on picks the first time on offer, off posts now.
    func setShareLater(_ on: Bool) {
        shareLaterKey = on ? shareLaterChoices.first?.key : nil
    }

    /// When it would share: an hour or three from now, or the evening's time the server gave.
    var sharesAt: Date? {
        guard let choice = shareLaterChoice else { return nil }
        switch choice.key {
        case "1h": return Date().addingTimeInterval(3600)
        case "3h": return Date().addingTimeInterval(3 * 3600)
        default: return MomentTime.parse(choice.at)
        }
    }

    /// What goes with the post: the choice's key while one is picked.
    var shareLaterBody: String? {
        sky == nil ? nil : shareLaterChoice?.key
    }
}
