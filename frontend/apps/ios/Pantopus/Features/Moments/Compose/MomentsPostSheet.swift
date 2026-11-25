//
//  MomentsPostSheet.swift
//  Pantopus
//
//  Boards P3 and P4, the Post sheet over what you took (or the text card):
//  the pin on a small map and the place others will read, "Show the area
//  instead", how long (1h · 6h · 24h · 48h), who sees it (Everyone nearby ·
//  My connections), the caption, and Post. At your own home the amber note
//  says so first. On the iPhone Duo the stage takes the Duo's layouts
//  (`MomentsPostStage+Duo.swift`). On the phone the sheet over a photo or a
//  video pulls down to show the picture as it will post, and back up
//  (`MomentsPostStage+Lower.swift`); a tap on the small map opens it full
//  screen (`MomentsPostFullMap.swift`).
//

import AVFoundation
import MapKit
import SwiftUI

struct MomentsPostStage: View {
    let model: MomentsComposerModel
    let onPosted: () -> Void
    @State var player: AVPlayer?
    /// How tall the pills are (one row or two): the closed Duo's sheet starts below them.
    @State var pillsHeight: CGFloat = 40
    /// The phone's sheet pulled down to show the picture (`+Lower`).
    @State var lowering = MomentsPostLowering()
    @Environment(\.momentsDuoScreen) var duo
    @Environment(\.accessibilityReduceMotion) var reduceMotion

    var body: some View {
        Group {
            switch duo.pose {
            case .phone: phoneStage
            case .closed: closedStage
            case .wide: wideStage
            case .upright: uprightStage
            case .table: tableStage
            }
        }
        // A fold can take the stage away and bring it back: the looping video carries on.
        .onAppear { player?.play() }
        .onDisappear { player?.pause() }
    }

    private var phoneStage: some View {
        ZStack(alignment: .top) {
            phonePills
                .padding(.horizontal, Spacing.s3)
                .padding(.top, 2)
            VStack(spacing: 0) {
                Spacer(minLength: 120)
                // The sheet is as tall as what's in it, up to the room there is (less with the keyboard up). Over a
                // photo or a video it pulls down to show the picture and back up; it moves by an offset (`+Lower`).
                MomentsPostSheetPosition(lowering: lowers ? lowering : nil) {
                    MomentsPostSheet(model: model, onPosted: onPosted)
                }
                .layoutPriority(1)
            }
            .ignoresSafeArea(.container, edges: .bottom)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // The home indicator's strip, never the keyboard's: a view that runs under the keyboard reads the screen's own.
        .background {
            Color.clear
                .ignoresSafeArea(.keyboard)
                .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.bottom } action: { lowering.measured(bottomInset: $0) }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
        .onChange(of: reduceMotion, initial: true) { _, reduce in lowering.reduceMotion = reduce }
        .environment(\.momentsPostLowering, lowers ? lowering : nil)
        // Behind the screen, never part of its layout: a photo that fills the screen is larger than
        // the screen, and as a sibling it pushed Retake under the clock and the sheet under the keyboard.
        .background {
            Color.black
                .overlay { undimmedBackdrop }
                // A view of its own, so a drag frame redraws the dimming and not the picture.
                .overlay { MomentsPostDimming(lowering: lowers ? lowering : nil, dims: model.draft != .text) }
                .clipped()
                .ignoresSafeArea()
        }
    }

    /// The sheet pulls down over a photo or a video, not over a text card (its Edit shows the card).
    private var lowers: Bool {
        switch model.draft {
        case .photo, .video: true
        case .text, nil: false
        }
    }

    /// The Post sheet, or on the open Duo the options as a card (board O9); closed, its map is smaller (board C8).
    func sheet(asCard: Bool = false, mapHeight: CGFloat = 150) -> some View {
        MomentsPostSheet(model: model, asCard: asCard, mapHeight: mapHeight, onPosted: onPosted)
    }

    /// Behind the sheet: the picture a little darker, or the text card's colors.
    var backdrop: some View {
        undimmedBackdrop
            .overlay { Color.black.opacity(model.draft == .text ? 0 : 0.3).allowsHitTesting(false) }
    }

    /// The picture as it will post (the phone darkens it under the sheet with `MomentsPostDimming`).
    @ViewBuilder
    var undimmedBackdrop: some View {
        switch model.draft {
        case let .photo(image):
            MomentsMarkedPhoto(
                image: image,
                marks: model.marking.marks,
                placement: model.marking.placement,
                backdrop: model.marking.backdrop
            )
            .accessibilityLabel("The photo you're posting")
        case let .video(url):
            markedVideo(url: url)
                .accessibilityLabel("The video you're posting")
        case .text:
            let colors = MomentsPalette.card(model.background)
            LinearGradient(colors: [colors.top, colors.bottom], startPoint: UnitPoint(x: 0.33, y: 0), endPoint: UnitPoint(x: 0.67, y: 1))
                .overlay(alignment: .top) {
                    Text(model.text)
                        .font(.system(size: 24, weight: .semibold))
                        .lineSpacing(7)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white)
                        .lineLimit(4)
                        .padding(.horizontal, 36)
                        .padding(.top, 112)
                }
        case nil:
            Color.black
        }
    }

    /// The video, muted, looping.
    func videoSurface(url: URL) -> some View {
        MomentsVideoSurface(player: player ?? AVPlayer())
            .onAppear {
                let looping = AVPlayer(url: url)
                looping.isMuted = true
                looping.play()
                player = looping
            }
            .onReceive(NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification)) { _ in
                player?.seek(to: .zero)
                player?.play()
            }
    }
}

/// The options' scroll view, for where their top stands in it.
private let momentsPostOptionsSpace = "momentsPostOptions"

struct MomentsPostSheet: View {
    let model: MomentsComposerModel
    /// On the open iPhone Duo, a card beside the picture (board O9): no grabber, every corner rounded.
    var asCard = false
    /// The small map: 150 pt; closed on the Duo, 110 (board C8); 0 on a table, where a bigger one is beside it (T5).
    var mapHeight: CGFloat = 150
    let onPosted: () -> Void
    @Environment(AuthManager.self) private var auth
    /// The phone's drag over a photo or a video (`MomentsPostStage+Lower.swift`); nil elsewhere.
    @Environment(\.momentsPostLowering) private var lowering
    @State private var optionsHeight: CGFloat = 520

    var body: some View {
        VStack(spacing: 0) {
            if !asCard {
                Capsule()
                    .fill(Theme.Color.appBorderStrong)
                    .frame(width: 36, height: 5)
                    .padding(.top, Spacing.s2)
            }
            // The options take their own height and scroll only when there's less room than that
            // (a small phone, the at-home notice, the keyboard up).
            ScrollView {
                options
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                        optionsHeight = height
                        lowering?.optionsHeight = height
                    }
                    .onGeometryChange(for: CGFloat.self) { geometry in
                        geometry.frame(in: .named(momentsPostOptionsSpace)).minY
                    } action: { lowering?.optionsTop = $0 }
            }
            .coordinateSpace(.named(momentsPostOptionsSpace))
            .frame(maxHeight: optionsHeight)
            .scrollBounceBehavior(.basedOnSize)
            // On the phone a pull down past the options' top lowers the sheet (`+Lower`).
            .momentsPostOptionsDrag(lowering)
            // Post is always in reach: under the options, outside their scrolling, with what stopped it right above.
            VStack(alignment: .leading, spacing: Spacing.s3) {
                if let error = model.error {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Color.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("moments.post.error")
                }
                postButton
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s3)
            .padding(.bottom, Spacing.s6)
            .momentsPostDragArea(lowering)
        }
        // The grab handle's band: a drag on it moves the sheet, a tap lowers it to show the picture.
        .overlay(alignment: .top) {
            if let lowering, !asCard {
                handleBand(lowering)
            }
        }
        // As a card, the stage gives it its frame and its rounded background.
        .background {
            if !asCard {
                UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24, style: .continuous)
                    .fill(Theme.Color.appSurface)
                    .shadow(color: .black.opacity(0.3), radius: 12, x: 0, y: -6)
                    .ignoresSafeArea(edges: .bottom)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Post your Moment")
        .accessibilityIdentifier("moments.post")
        // One sheet for both: the short list of names (when more than one fits) and the place picker it can open,
        // which is the Pulse composer's around the pin, with only venues within reach of it.
        .sheet(isPresented: Binding(get: { model.picksPlace || model.findsPlace }, set: { if !$0 { model.closePlaceSheets() } })) {
            Group {
                if model.findsPlace, let anchor = model.placePickerAnchor {
                    placeFinder(anchor: anchor)
                } else {
                    MomentsPlacePicker(model: model) { model.picksPlace = false }
                }
            }
            .presentationDetents(model.findsPlace ? [.large] : [.medium])
            .presentationBackground(Theme.Color.appSurface)
        }
    }

    private func handleBand(_ lowering: MomentsPostLowering) -> some View {
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: MomentsPostLowering.handleBand)
            .contentShape(Rectangle())
            .onTapGesture { lowering.setLowered(true) }
            .momentsPostDragArea(lowering)
            .accessibilityElement()
            .accessibilityLabel("Show the picture")
            .accessibilityHint("Lowers the options so the whole picture shows")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { lowering.setLowered(true) }
            .accessibilityIdentifier("moments.post.handle")
    }

    private var options: some View {
        @Bindable var model = model
        return VStack(alignment: .leading, spacing: 0) {
            // No map on the table pose (mapHeight 0), and none with no location (there's no pin).
            if mapHeight > 0, !model.noLocationOn {
                MomentsPostMap(
                    pin: model.pin,
                    showArea: model.floats,
                    disc: model.skyDisc,
                    me: me,
                    placeholder: model.locating == .unavailable ? "Location is off" : "Finding where you are…",
                    height: mapHeight,
                    fullMap: MomentsPostFullMap.Place(model: model)
                )
                .padding(.top, asCard ? 16 : 11)
            }
            placeRow
                .padding(.top, model.noLocationOn && mapHeight > 0 ? (asCard ? 16 : 11) : 10)
            if let taken = model.takenLine {
                takenRow(taken).padding(.top, 2)
            } else if model.showsLive {
                liveRow.padding(.top, 2)
            }
            if model.pin == nil, model.locating == .unavailable, !model.noLocationOn {
                Text("Turn on location for Pantopus in Settings to post a Moment.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.error)
                    .padding(.horizontal, Spacing.s1)
                    .accessibilityIdentifier("moments.post.locationOff")
            }
            if model.showsHomeNotice {
                homeNotice.padding(.top, Spacing.s2)
            }
            // The Sky (`+Sky`): the note at home, and "Pin it at a place" in place of "Show the area instead".
            if model.skyAtHome {
                skyHomeNote.padding(.top, Spacing.s2)
            }
            if !model.noLocationOn {
                Group { if model.sky != nil { pinRow } else { areaRow } }
                    .padding(.top, Spacing.s2)
            }
            noLocationRow
                .padding(.top, model.noLocationOn ? Spacing.s2 : 0)
            if model.offersHeight, let feet = model.heightFeet {
                heightRow(feet: feet)
            } else if model.greysHeight {
                greyHeightRow
            }
            if model.offersWeather, let weather = model.live.weather {
                weatherRow(weather)
            }
            if model.sky != nil, !model.shareLaterChoices.isEmpty {
                shareLaterRow
            }
            label("How long").padding(.top, Spacing.s4)
            durations.padding(.top, Spacing.s2)
            label("Who sees it").padding(.top, 14)
            audience.padding(.top, Spacing.s2)
            if model.draft != .text {
                captionField(text: $model.caption).padding(.top, 14)
            }
        }
        .padding(.horizontal, Spacing.s4)
    }

    private var me: MomentAuthorDTO? {
        guard case let .signedIn(user) = auth.state else { return nil }
        return MomentAuthorDTO(me: user)
    }

    private var homeNotice: some View {
        HStack(alignment: .top, spacing: 10) {
            Icon(.alertTriangle, size: 20, strokeWidth: 2.2, color: Theme.Color.warning)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text("This is your home. People will see the pin on it.")
                    .font(.system(size: 14.5, weight: .semibold))
                    // The label ink: darker in light, lighter in dark, so it reads on the amber card in both.
                    .foregroundStyle(Theme.Color.warning)
                Text("Turn on Show the area instead to show only the area.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.vertical, Spacing.s3)
        .padding(.horizontal, 14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.Color.warningBg))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.Color.warningLight, lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("moments.post.home")
    }

    private var areaRow: some View {
        Toggle(isOn: Binding(get: { model.showArea }, set: { model.showArea = $0 })) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Show the area instead")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Color.appText)
                Text("People see a pin within about half a mile, not the exact spot")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        }
        .tint(Theme.Color.primarySolid)
        .padding(.horizontal, Spacing.s1)
        .frame(minHeight: 52)
        .accessibilityIdentifier("moments.post.area")
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Theme.Color.appTextSecondary)
            .padding(.horizontal, Spacing.s1)
            .accessibilityAddTraits(.isHeader)
    }

    private var durations: some View {
        HStack(spacing: Spacing.s2) {
            ForEach([1, 6, 24, 48], id: \.self) { hours in
                let selected = model.hours == hours
                Button { model.hours = hours } label: {
                    Text("\(hours)h")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(selected ? Color.white : Theme.Color.appText)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(selected ? Theme.Color.primarySolid : Color.clear))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(selected ? Theme.Color.primarySolid : Theme.Color.appBorder, lineWidth: 1)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(hours == 1 ? "1 hour" : "\(hours) hours")
                .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("moments.post.hours.\(hours)")
            }
        }
    }

    private var audience: some View {
        HStack(spacing: 3) {
            segment(.nearby, "Everyone nearby", id: "moments.post.audience.nearby")
            segment(.connections, "My connections", id: "moments.post.audience.connections")
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.Color.appSurfaceSunken))
    }

    private func segment(_ value: MomentAudience, _ title: String, id: String) -> some View {
        // A Moment with no location goes only to connections: "Everyone nearby" needs a place.
        let selected = (model.noLocationOn ? .connections : model.audience) == value
        let usable = !model.noLocationOn || value == .connections
        return Button { model.audience = value } label: {
            Text(title)
                .font(.system(size: 14.5, weight: selected ? .semibold : .medium))
                .foregroundStyle(selected ? Theme.Color.appText : Theme.Color.appTextSecondary.opacity(usable ? 1 : 0.45))
                .frame(maxWidth: .infinity, minHeight: 34)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(selected ? Theme.Color.appSurfaceRaised : Color.clear)
                        .shadow(color: .black.opacity(selected ? 0.12 : 0), radius: 1.5, x: 0, y: 1)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!usable)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier(id)
    }

    private func captionField(text: Binding<String>) -> some View {
        HStack(spacing: Spacing.s2) {
            TextField("", text: text, prompt: Text("Add a caption").foregroundColor(Theme.Color.appTextMuted))
                .font(.system(size: 15))
                .foregroundStyle(Theme.Color.appText)
                .submitLabel(.done)
                .accessibilityLabel("Caption")
                .accessibilityIdentifier("moments.post.caption")
            Text("\(model.caption.count) / \(MomentsComposerModel.captionLimit)")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .allowsHitTesting(false)
                .accessibilityIdentifier("moments.post.captionCount")
        }
        .padding(.horizontal, 14)
        .frame(height: 46)
        .typesInFieldOnTap()
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.Color.appBorder, lineWidth: 1))
    }

    private var postButton: some View {
        Button {
            Keyboard.close()
            Task {
                if await model.post() { onPosted() }
            }
        } label: {
            ZStack {
                Text(model.postLabel)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .opacity(model.isPosting ? 0 : 1)
                if model.isPosting { ProgressView().tint(.white) }
            }
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Capsule().fill(Theme.Color.primarySolid))
            .opacity(model.canPost ? 1 : 0.5)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!model.canPost)
        .accessibilityIdentifier("moments.post.submit")
    }
}
