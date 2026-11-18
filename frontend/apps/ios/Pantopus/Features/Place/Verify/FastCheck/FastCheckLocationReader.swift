//
//  FastCheckLocationReader.swift
//  Pantopus
//
//  One precise reading for "At home now" (FASTVERIFY phase 5). It asks for
//  the app's usual while-using permission (never "always"), then listens for
//  a few seconds at the best accuracy and keeps the closest fix. The app's
//  shared provider stays at its coarse setting for every other screen.
//

import CoreLocation
import Foundation

struct FastCheckReading: Equatable {
    let latitude: Double
    let longitude: Double
    let accuracyMeters: Double
    /// iOS says the fix came from a simulator or a tool, not the phone's radios.
    let mocked: Bool
}

@MainActor
final class FastCheckLocationReader: NSObject, CLLocationManagerDelegate, @unchecked Sendable {
    enum Outcome: Equatable {
        case reading(FastCheckReading)
        case denied
        case unavailable
    }

    private let manager = CLLocationManager()
    private var authorization: CheckedContinuation<Void, Never>?
    private var best: CLLocation?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func read(listeningFor seconds: TimeInterval = 8) async -> Outcome {
        if manager.authorizationStatus == .notDetermined {
            await withCheckedContinuation { continuation in
                authorization = continuation
                manager.requestWhenInUseAuthorization()
            }
        }
        guard [.authorizedWhenInUse, .authorizedAlways].contains(manager.authorizationStatus) else { return .denied }
        best = nil
        manager.startUpdatingLocation()
        let deadline = Date().addingTimeInterval(seconds)
        // Stop early once a fix is good enough for the check (50 m); else keep the closest one.
        while Date() < deadline, !Task.isCancelled {
            if let best, best.horizontalAccuracy <= 15 { break }
            try? await Task.sleep(for: .milliseconds(250))
        }
        manager.stopUpdatingLocation()
        guard let best else { return .unavailable }
        return .reading(FastCheckReading(
            latitude: best.coordinate.latitude,
            longitude: best.coordinate.longitude,
            accuracyMeters: best.horizontalAccuracy,
            mocked: best.sourceInformation?.isSimulatedBySoftware ?? false
        ))
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            guard status != .notDetermined, let continuation = authorization else { return }
            authorization = nil
            continuation.resume()
        }
    }

    nonisolated func locationManager(_: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            for location in locations where Self.isUsable(location) {
                if best == nil || location.horizontalAccuracy < (best?.horizontalAccuracy ?? .infinity) { best = location }
            }
        }
    }

    nonisolated func locationManager(_: CLLocationManager, didFailWithError _: any Error) {}

    private static func isUsable(_ location: CLLocation) -> Bool {
        CLLocationCoordinate2DIsValid(location.coordinate)
            && location.horizontalAccuracy.isFinite && location.horizontalAccuracy >= 0
            && abs(location.timestamp.timeIntervalSinceNow) < 30
    }
}
