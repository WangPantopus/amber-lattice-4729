//
//  MomentsComposerModel+Live.swift
//  Pantopus
//
//  The Live mark and the weather on the Post sheet (Moments API v4.1, board
//  L1). A photo or video the Pantopus camera made just now, here, posts with
//  `taken_here`, so it reads "Live from here" for its first 15 minutes, and
//  with "Show the weather" on it keeps the weather as it was ("31°F · Snow").
//  The mark goes only while it is still true (both phones, coordinator
//  2026-11-20): at most 10 minutes after the shot, with the pin sent within
//  150 m of the fix the draft was pinned at when it was taken. A Post that
//  reads the fix again finds out; the sheet's Live line and weather row go at
//  10 minutes by themselves. The weather is asked once a camera draft lands
//  away from home (a retake at the same fix shows that reading again), apart
//  from the preview the composer opens with, so a slow weather source never
//  holds the camera or the pin.
//

import CoreLocation
import Foundation
import UIKit

/// The Pantopus camera's shot on the Post sheet: when it was taken, where its draft is pinned, and the weather the
/// sheet offers with it. Held by the composer model (`live`), so a fold on the iPhone Duo keeps it.
@Observable
@MainActor
final class MomentsLiveShot {
    /// How long after the shot it may still post as Live, and how far from the shot's fix the pin may be by then.
    static let freshFor: TimeInterval = 10 * 60
    static let withinM: CLLocationDistance = 150

    /// When the camera took the photo or finished the video; nil for an album item, a text card, or after 10 minutes.
    private(set) var takenAt: Date?
    /// The weather "Show the weather" offers (place-preview with `weather: true`); nil until it answers, or with none.
    private(set) var weather: MomentWeatherDTO?
    /// "Show the weather": on by default, then as last chosen on this phone (per account, `+Several`).
    var showWeather = true
    /// The fix the draft was pinned at when it was taken.
    @ObservationIgnored private var spot: CLLocation?
    @ObservationIgnored private var lapse: Task<Void, Never>?
    @ObservationIgnored private var asking: Task<Void, Never>?
    /// The last reading, where and when it came: a retake at the same fix within 10 minutes shows it again.
    @ObservationIgnored private var reading: Reading?

    /// The camera made the draft now, pinned at `fix`. With no fix there's no pin, so no mark.
    func took(at fix: UserCoordinate?) {
        clear()
        guard let fix else { return }
        takenAt = Date()
        spot = CLLocation(latitude: fix.latitude, longitude: fix.longitude)
        // The line and the weather row go at 10 minutes, without waiting for a Post tap.
        lapse = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.freshFor))
            guard !Task.isCancelled else { return }
            self?.clear()
        }
    }

    /// Retake: no shot.
    func clear() {
        lapse?.cancel()
        asking?.cancel()
        (lapse, asking) = (nil, nil)
        (takenAt, spot, weather) = (nil, nil, nil)
    }

    /// Asks once for the weather a Moment taken here would keep, at the shot's own fix (never a library item's point).
    func askWeather() {
        guard let spot, asking == nil else { return }
        let point = spot.coordinate
        if let reading, reading.point.latitude == point.latitude, reading.point.longitude == point.longitude,
           Date().timeIntervalSince(reading.at) <= Self.freshFor {
            weather = reading.weather
            return
        }
        asking = Task { [weak self] in
            let reply = try? await MomentsAPI.send(
                MomentsEndpoints.placePreview(latitude: point.latitude, longitude: point.longitude, weather: true),
                as: MomentPreviewWeatherDTO.self
            )
            guard !Task.isCancelled else { return }
            self?.weather = reply?.weather
            if let came = reply?.weather { self?.reading = Reading(point: point, at: Date(), weather: came) }
        }
    }

    private struct Reading {
        let point: CLLocationCoordinate2D
        let at: Date
        let weather: MomentWeatherDTO
    }

    /// Still true: at most 10 minutes since the shot, and `pin` within 150 m of where the draft was pinned then.
    func holds(pin: CLLocationCoordinate2D?, at now: Date = Date()) -> Bool {
        guard let takenAt, let spot, let pin, now.timeIntervalSince(takenAt) <= Self.freshFor else { return false }
        return CLLocation(latitude: pin.latitude, longitude: pin.longitude).distance(from: spot) <= Self.withinM
    }
}

extension MomentsComposerModel {
    /// The camera's photo: the draft, and the shot it was.
    func tookPhoto(_ image: UIImage) {
        use(photo: image)
        tookShot()
    }

    /// The camera's finished video: the draft (unless it can't be posted), and the shot it was.
    func tookVideo(_ url: URL) async {
        await use(video: url)
        if draft != nil { tookShot() }
    }

    /// The camera made the draft just now: keep when and where, and ask the weather where it isn't home.
    private func tookShot() {
        live.took(at: fix?.coordinate)
        if place?.atHome == false { live.askWeather() }
    }

    /// The Live line: a camera draft at an exact pin away from home, while the mark still holds. The server decides
    /// anyway (contract rules 1–5): never at home, on an area, floating, with no location or for an album item. An
    /// album item carries its file's date (`takenAt`) and a camera shot never does: a second guard beside Retake's.
    var showsLive: Bool {
        guard live.takenAt != nil, capture == nil, takenAt == nil else { return false }
        return place?.atHome == false && !floats && !noLocationOn && live.holds(pin: basePin)
    }

    /// "Show the weather" is on the sheet: beside the Live line, once the weather has answered.
    var offersWeather: Bool {
        showsLive && live.weather != nil
    }

    /// What a Post tap sends: the mark only while it holds for the pin being sent (a Post may have read the fix
    /// again), and the weather with it while its row is on the sheet and switched on.
    func liveFields(sending location: MomentLocationBody) -> MomentLiveFields {
        let pin = CLLocationCoordinate2D(latitude: location.latitude, longitude: location.longitude)
        guard showsLive, location.source == .gps, live.holds(pin: pin) else { return MomentLiveFields() }
        return MomentLiveFields(takenHere: true, showWeather: offersWeather && live.showWeather ? true : nil)
    }
}

/// `taken_here` and `show_weather` for one Post tap: every part of a long video goes alike.
struct MomentLiveFields {
    var takenHere: Bool?
    var showWeather: Bool?

    /// A tap that carries on after a stopped one: as the server kept the first part.
    init(following first: MomentDTO) {
        takenHere = first.live.takenHere ? true : nil
        showWeather = first.live.weather != nil ? true : nil
    }

    init(takenHere: Bool? = nil, showWeather: Bool? = nil) {
        self.takenHere = takenHere
        self.showWeather = showWeather
    }
}
