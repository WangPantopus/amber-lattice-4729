//
//  MomentsStudioMadeUpName.swift
//  Pantopus
//
//  "Made-up name" in the Studio's bar ("Pulse, reinvented" phase 0 step 2; the made-up-names contract,
//  `docs/product/made-up-names/README.md`, "Moments"). A Moment under the person's made-up name goes to people
//  nearby only, floats over its area (or sits at a public place its own picture was taken at), and carries no Live
//  mark, weather or height; it takes reactions, not replies. It floats over its area by default, at home and away
//  (founder, 2026-11-27: "Yes, fix it"; the server's #4950): the pill reads "Area · <town>". Away from home, "Pin it at a
//  place" in the drawer stays the author's own choice, and then the pill reads "At <place>". The chip shows only while
//  `/api/pen-names/me` says the person may use one and the Moment has a place; picked before there is a name, the name
//  screen opens first.
//
//  It is sent as `post_as: "pen_name"` with an ordinary Moment's body (`MomentsComposerModel.postsUnderMadeUpName`).
//

import CoreLocation
import SwiftUI

/// Who sees it, as the Studio's chips say it.
enum MomentsStudioAudience: Equatable {
    case nearby, friends, madeUp
}

extension MomentsComposerModel {
    /// The chip that's picked.
    var studioAudience: MomentsStudioAudience {
        if postsUnderMadeUpName { return .madeUp }
        return noLocationOn || audience == .connections ? .friends : .nearby
    }

    /// The area's name a Moment over its area reads: "Camas, WA".
    var studioAreaName: String {
        sky?.area?.label ?? place?.areaLabel ?? place?.placeLabel ?? "this area"
    }

    /// Under a made-up name it floats over its area: always at home, and away from home unless its author pinned it at a
    /// public place ("Pin it at a place"; the server floats it the same way when no place is picked, #4950).
    var madeUpFloats: Bool {
        guard postsUnderMadeUpName, !noLocationOn else { return false }
        if place?.atHome == true { return true }
        return sky != nil && !pinsHere
    }

    /// Away from home under a made-up name, "Pin it at a place" is the author's choice in the drawer.
    var offersMadeUpPin: Bool {
        postsUnderMadeUpName && sky != nil && place?.atHome != true && !noLocationOn
    }

    /// The disc the drawer's small map draws while a made-up name's Moment floats away from home (at home `skyDisc`).
    var madeUpDisc: (center: CLLocationCoordinate2D, radiusM: Double)? {
        guard madeUpFloats, let area = sky?.area else { return nil }
        return (CLLocationCoordinate2D(latitude: area.latitude, longitude: area.longitude), area.radiusM)
    }

    /// The made-up name can be offered: the person may use one, and the Moment has a place.
    var offersMadeUpName: Bool {
        PenNameStore.shared.me?.allowed == true && !noLocationLocked
    }

    /// A chip was picked. Made-up name is people nearby only, with a place, and none of what says where its writer is
    /// now or how high: those rows go from the drawer, and their switches go off.
    func pickStudioAudience(_ picked: MomentsStudioAudience) {
        switch picked {
        case .nearby:
            postsUnderMadeUpName = false
            audience = .nearby
        case .friends:
            postsUnderMadeUpName = false
            audience = .connections
        case .madeUp:
            postsUnderMadeUpName = true
            audience = .nearby
            if noLocation { setNoLocation(false) }
            showHeight = false
            live.showWeather = false
            // It floats over its area by default; a public place is pinned only when its author picks one in the drawer.
            // Nor a stamp that says how high or how far from home.
            studioStamps.removeAll { MomentsStudioStamps.notUnderMadeUpName.contains($0.kind) }
        }
        error = nil
    }
}

/// Over the bar while the made-up name is picked, in the words all three apps share (lead, 2026-11-27): "Posting as
/// Noble Pinecone. Others can't see it's you."
struct MomentsStudioPostingAs: View {
    let penName: PenNameDTO

    var body: some View {
        HStack(spacing: Spacing.s2) {
            PenNameAvatar(name: penName.name, url: penName.avatar, size: 28)
            Text("Posting as \(penName.name). Others can't see it's you.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Spacing.s3)
        .padding(.vertical, Spacing.s2)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.black.opacity(0.55)))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("moments.studio.postingAs")
    }
}
