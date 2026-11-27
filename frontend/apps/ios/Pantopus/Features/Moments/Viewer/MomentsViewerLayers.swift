//
//  MomentsViewerLayers.swift
//  Pantopus
//
//  What "Pulse, reinvented" phase 2 lays over a Moment's photo in the viewer (CONTRACT 7), drawn only while the switch
//  is on for the person watching. With it off, or on a Moment with none, the photo is today's: the same picture with
//  the same label, and its stamps (`MomentStampsOverlay`, which draws nothing with the switch off).
//
//  Before and after (CONTRACT 7g): one half over the other with a curtain (`MomentBeforeAfterView`); the stamps sit on
//  one half's frame. The viewer holds still on it, so the reader compares at their own pace and taps on when they
//  choose.
//

import SwiftUI

/// A Moment's photo in the viewer, with what is laid over it.
struct MomentPhotoSurface: View {
    let moment: MomentDTO
    let image: UIImage
    @State private var flags = PulseReinventedFlags.shared

    var body: some View {
        if flags.isOn, let pair = moment.layers.beforeAfter {
            MomentBeforeAfterView(picture: image, item: pair)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("\(moment.author.shortName)'s before and after")
                .accessibilityIdentifier("moments.viewer.photo")
                .overlay { MomentStampsOverlay(moment: moment, picture: MomentBeforeAfterHalves.size(of: image.size)) }
        } else {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .accessibilityLabel("\(moment.author.shortName)'s photo")
                .accessibilityIdentifier("moments.viewer.photo")
                // "Pulse, reinvented": its stamps, only while the switch is on for you.
                .overlay { MomentStampsOverlay(moment: moment, picture: image.size) }
        }
    }
}

extension MomentsViewerModel {
    /// The viewer holds still on a before and after (as the web's viewer does): the reader goes on with a tap.
    var playHolds: Bool {
        guard PulseReinventedFlags.shared.isOn, let moment, moment.kind == .photo else { return false }
        return moment.layers.beforeAfter != nil
    }
}
