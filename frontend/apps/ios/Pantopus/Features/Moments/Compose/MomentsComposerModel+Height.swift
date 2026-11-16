//
//  MomentsComposerModel+Height.swift
//  Pantopus
//
//  "Show elevation" on the Post sheet (board H1): the Moment says how high above
//  sea level it was made, rounded to 10 ft. The height goes with the pin: the
//  album photo's own where the Moment pins where the photo was taken, else the
//  fix's. The switch is offered only where the server allows it (heights are
//  on for you and the spot isn't your home), for an exact pin, and for a
//  reading the server will keep; once turned on it stays on for your next
//  Moments on this phone.
//

import Foundation

extension MomentsComposerModel {
    /// The reading that goes with the pin.
    private var heightReading: HeightReading? {
        capture != nil ? captureHeight : fixHeight
    }

    /// The feet the row shows and everyone will read; nil with no reading, or one the server would leave out.
    var heightFeet: Int? {
        // The Sky: a floating Moment's height is rounded to 100 ft ("About 4,400 ft").
        let step = sky != nil && floats ? 100 : 10
        return heightReading.flatMap {
            MomentHeight.feet(meters: $0.meters, accuracyM: $0.accuracyMeters, speedMps: $0.speedMps, step: step)
        }
    }

    /// The "Show elevation" row is on the sheet: never at home or with no location; before the Sky, not for an area.
    var offersHeight: Bool {
        place?.canShowHeight == true && (sky != nil || !showArea) && !noLocationOn && heightFeet != nil
    }

    /// The Sky at home: the row stays, greyed out, "Not shown at home".
    var greysHeight: Bool {
        skyAtHome && heightFeet != nil
    }

    /// What goes with the post: the reading, only while the row is on the sheet and switched on.
    var shownHeight: MomentAltitudeBody? {
        guard offersHeight, showHeight, let reading = heightReading else { return nil }
        return MomentAltitudeBody(meters: reading.meters, accuracyM: reading.accuracyMeters, speedMps: reading.speedMps)
    }
}
