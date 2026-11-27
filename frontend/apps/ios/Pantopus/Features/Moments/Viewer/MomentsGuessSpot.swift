//
//  MomentsGuessSpot.swift
//  Pantopus
//
//  Guess the spot in the viewer ("Pulse, reinvented" phase 0 step 8; CONTRACT section 5). Only while the switch is on
//  for the person watching: the server leaves a guess-the-spot Moment's spot out until they guessed (no place, no
//  point, no place stamps), and says `guess` on it. Until they guess, the viewer holds still and offers "Where is
//  this?"; a map takes one pin, and the answer says how far off it was ("1.2 mi off"), then the Moment shows in full.
//  Its author sees how many guessed. Distance only: no points, no ranks. With the switch off none of this is drawn.
//

import CoreLocation
import MapKit
import Observation
import SwiftUI

/// The guess sheet open over the viewer (one at a time).
@Observable
@MainActor
final class MomentGuessPrompt {
    static let shared = MomentGuessPrompt()

    var open: MomentDTO?
    /// Moments whose "Keep this?" was answered in this run.
    var keepAnswered: Set<String> = []
}

extension MomentsViewerModel {
    /// A guess-the-spot Moment someone else made that the person watching hasn't guessed yet.
    var guessWaits: Bool {
        guard PulseReinventedFlags.shared.isOn, let guess = moment?.guess, !isMine else { return false }
        return guess.mine == nil
    }

    /// The viewer holds still while a guess waits or its sheet is open (as the web's viewer does), while its author
    /// hasn't answered "Keep this?", while "Want to come?" has the plan composer open, and while phase 2's layers hold it
    /// (`playHolds`).
    var guessCovers: Bool {
        MomentGuessPrompt.shared.open != nil || guessWaits || keepWaits || MomentPlanStart.shared.seed != nil || playHolds
    }

    /// "Keep this?" waits for its author's answer (CONTRACT 6d).
    var keepWaits: Bool {
        guard PulseReinventedFlags.shared.isOn, let moment, isMine, moment.keepOffer else { return false }
        return !MomentGuessPrompt.shared.keepAnswered.contains(moment.id)
    }

    /// The author's answer: yes keeps it as a post that stays, for the same people, until they remove it.
    func answerKeep(_ keep: Bool) async {
        guard let moment else { return }
        MomentGuessPrompt.shared.keepAnswered.insert(moment.id)
        do {
            let _: MomentEnvelope = try await MomentsAPI.send(StudioEndpoints.keep(momentId: moment.id, keep: keep))
            cache.forget(moment.id)
            if keep { show(Toast(text: "Kept. It stays for the same people until you remove it.")) }
        } catch {
            MomentGuessPrompt.shared.keepAnswered.remove(moment.id)
            show(Toast(text: (error as? MomentsFailure)?.message ?? "Couldn't keep it. Try again."))
            await PulseReinventedFlags.shared.recheck()
        }
    }

    /// The guess went in: the Moment is read again, now in full (its place and stamps).
    func guessed(_ result: MomentGuessResultDTO, momentId: String) {
        cache.forget(momentId)
        retry()
        show(Toast(text: result.label))
    }
}

/// The pills under the header: today's (Taken, Live from here and the weather), then the guess pill while the switch is
/// on and the Moment is a guess-the-spot one.
struct MomentsViewerPills: View {
    let model: MomentsViewerModel
    private let prompt = MomentGuessPrompt.shared

    var body: some View {
        if let meta = model.metaPills {
            MomentsMetaPills(meta: meta)
        }
        MomentsViewerPlan(model: model)
        if model.keepWaits {
            MomentKeepCard(model: model)
                .padding(.horizontal, Spacing.s4)
                .padding(.top, Spacing.s2)
        }
        if PulseReinventedFlags.shared.isOn, let moment = model.moment, let guess = moment.guess {
            MomentGuessPill(guess: guess, mine: model.isMine) { prompt.open = moment }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 58)
                .padding(.top, 2)
                .sheet(item: Binding(get: { prompt.open }, set: { prompt.open = $0 })) { opened in
                    MomentGuessSheet(moment: opened) { result in
                        prompt.open = nil
                        model.guessed(result, momentId: opened.id)
                    } onClose: {
                        prompt.open = nil
                    }
                    .presentationDetents([.large])
                }
        }
    }
}

/// "Where is this?" before the person guessed (a button), "1.2 mi off · 4 guesses" after, and on one's own "Guess the
/// spot · 4 guesses".
struct MomentGuessPill: View {
    let guess: MomentGuessStateDTO
    let mine: Bool
    let onGuess: () -> Void

    var body: some View {
        if !mine, guess.mine == nil {
            Button(action: onGuess) {
                HStack(spacing: 6) {
                    Icon(.mapPin, size: 14, strokeWidth: 2.4, color: .white)
                    Text("Where is this? Drop a pin")
                        .font(.system(size: 13.5, weight: .bold))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(Theme.Color.primarySolid))
                .hitArea(horizontal: 4, vertical: 8)
            }
            .buttonStyle(.plain)
            .fixedSize()
            .accessibilityLabel("Where is this? Drop a pin to guess the spot")
            .accessibilityIdentifier("moments.viewer.guess")
        } else {
            HStack(spacing: 5) {
                Icon(.mapPin, size: 13, strokeWidth: 2.2, color: .white)
                Text(words)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(Color.black.opacity(0.48)))
            .fixedSize()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(words)
            .accessibilityIdentifier("moments.viewer.guessCount")
        }
    }

    private var words: String {
        let count = guess.count < 1 ? "No guesses yet" : guess.count == 1 ? "1 guess" : "\(guess.count) guesses"
        if let result = guess.mine { return "\(result.label) · \(count)" }
        return "Guess the spot · \(count)"
    }
}

/// The map that takes the one guess: tap where you think it was, then Guess. The answer shows how far off, and the
/// spot itself beside the pin.
struct MomentGuessSheet: View {
    let moment: MomentDTO
    let onGuessed: (MomentGuessResultDTO) -> Void
    let onClose: () -> Void

    @State private var position: MapCameraPosition = .automatic
    @State private var pin: CLLocationCoordinate2D?
    @State private var sending = false
    @State private var answer: (result: MomentGuessResultDTO, spot: CLLocationCoordinate2D?)?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                MapReader { proxy in
                    Map(position: $position) {
                        if let pin {
                            Annotation("Your guess", coordinate: pin) { GuessPinMark(color: Theme.Color.primarySolid) }
                        }
                        if let spot = answer?.spot {
                            Annotation("The spot", coordinate: spot) { GuessPinMark(color: Theme.Color.success) }
                        }
                    }
                    .onTapGesture { point in
                        guard answer == nil, !sending, let tapped = proxy.convert(point, from: .local) else { return }
                        pin = tapped
                        error = nil
                    }
                    .accessibilityIdentifier("moments.guess.map")
                }
                footer
            }
            .navigationTitle("Where is this?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(answer == nil ? "Cancel" : "Done") { finish() }
                        .accessibilityIdentifier("moments.guess.close")
                }
            }
        }
        .onAppear(perform: startCamera)
        .interactiveDismissDisabled(sending)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            if let answer {
                Text(answer.result.label)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Theme.Color.appText)
                    .accessibilityIdentifier("moments.guess.result")
                Text("The green pin is where it was taken.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            } else {
                Text(pin == nil ? "Tap the map where you think this was taken." : "One guess each. Ready?")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                if let error {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.error)
                }
            }
            Button {
                if answer == nil { Task { await send() } } else { finish() }
            } label: {
                Text(answer == nil ? (sending ? "Guessing…" : "Guess") : "See the Moment")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(RoundedRectangle(cornerRadius: Radii.lg).fill(Theme.Color.primarySolid))
            }
            .buttonStyle(.plain)
            .disabled(answer == nil && (pin == nil || sending))
            .opacity(answer == nil && (pin == nil || sending) ? 0.5 : 1)
            .accessibilityIdentifier("moments.guess.send")
        }
        .padding(Spacing.s4)
        .background(Theme.Color.appSurface)
    }

    /// Starts where the person is (their last fix), never anywhere the Moment says: it says nothing until the guess.
    private func startCamera() {
        guard let here = CLLocationManager().location?.coordinate else { return }
        let span = MKCoordinateSpan(latitudeDelta: 0.35, longitudeDelta: 0.35)
        position = .region(MKCoordinateRegion(center: here, span: span))
    }

    private func send() async {
        guard let pin, !sending else { return }
        sending = true
        defer { sending = false }
        do {
            let reply: MomentGuessResponse = try await MomentsAPI.send(
                StudioEndpoints.guess(momentId: moment.id, latitude: pin.latitude, longitude: pin.longitude)
            )
            let full = reply.moment
            let spot = full.noLocation ? nil : CLLocationCoordinate2D(latitude: full.latitude, longitude: full.longitude)
            answer = (reply.guess, spot)
            if let spot {
                let region = MKCoordinateRegion(
                    center: CLLocationCoordinate2D(
                        latitude: (spot.latitude + pin.latitude) / 2,
                        longitude: (spot.longitude + pin.longitude) / 2
                    ),
                    span: MKCoordinateSpan(
                        latitudeDelta: max(abs(spot.latitude - pin.latitude) * 1.8, 0.01),
                        longitudeDelta: max(abs(spot.longitude - pin.longitude) * 1.8, 0.01)
                    )
                )
                withAnimation { position = .region(region) }
            }
        } catch {
            self.error = (error as? MomentsFailure)?.message ?? "Couldn't send your guess. Try again."
            // Guessing is the new screens' own: refused, the switch may be off now (CONTRACT 1).
            await PulseReinventedFlags.shared.recheck()
        }
    }

    private func finish() {
        if let answer { onGuessed(answer.result) } else { onClose() }
    }
}

private struct GuessPinMark: View {
    let color: Color

    var body: some View {
        Icon(.mapPin, size: 30, strokeWidth: 2.4, color: color)
            .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
    }
}

/// "Keep this?" on one's own Moment that drew replies, before it fades (CONTRACT 6d).
struct MomentKeepCard: View {
    let model: MomentsViewerModel

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("Keep this?")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)
            Text("It drew replies. Keep it as a post that stays, for the same people, until you remove it.")
                .font(.system(size: 13.5))
                .foregroundStyle(.white.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: Spacing.s2) {
                Button("Keep it") { Task { await model.answerKeep(true) } }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, Spacing.s4)
                    .frame(height: 36)
                    .background(Capsule().fill(Theme.Color.primarySolid))
                    .accessibilityIdentifier("moments.viewer.keep.yes")
                Button("Not now") { Task { await model.answerKeep(false) } }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, Spacing.s4)
                    .frame(height: 36)
                    .background(Capsule().stroke(.white.opacity(0.6), lineWidth: 1))
                    .accessibilityIdentifier("moments.viewer.keep.no")
            }
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.black.opacity(0.6)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.viewer.keep")
    }
}
