//
//  MomentsStudioComposer.swift
//  Pantopus
//
//  "Pulse, reinvented", phase 0 step 2 (founder, 2026-11-26): the Studio. It
//  is today's composer (`MomentsComposer`) with one difference: after a shot,
//  a pick or a text card, the picture fills the screen with tools on the right
//  and one bar at the bottom (`MomentsStudioStage`) instead of the Post sheet.
//  The camera, the library, the text card, the marks editor, the gate and the
//  18+ question are today's screens, used as they are.
//
//  It opens only while the `pulse_reinvented` switch is on for the person
//  (`PulseReinventedFlags`), read when + is tapped; off, + opens
//  `MomentsComposer`, unchanged. Both post through the same model, so a
//  Moment made here is an ordinary Moment, and should the switch go off
//  while it is open, today's composer picks up the same draft.
//
//  On the iPhone Duo held open, sideways or as a table, the Post screen is
//  today's (`MomentsPostStage`, with its Duo layouts); the Studio takes the
//  phone and the closed Duo.
//

import SwiftUI

/// The composer + opens: the Studio when the switch was on as + was tapped, today's `MomentsComposer` otherwise. Should
/// the switch go off while the Studio is open (read again on foreground, or the server saying so), today's composer
/// takes over at once with the same model, so the picture, its marks and the caption are all still there (lead,
/// 2026-11-27). A switch that comes on meanwhile changes nothing until the next +.
struct MomentsComposerChoice: View {
    let request: MomentsComposeRequest
    let onClose: @MainActor () -> Void
    @State private var reinvented = PulseReinventedFlags.shared

    var body: some View {
        Group {
            if request.studio, reinvented.isOn {
                MomentsStudioComposer(model: request.model, onClose: onClose)
            } else {
                MomentsComposer(model: request.model, onClose: onClose)
            }
        }
        // Today's composer knows nothing of a made-up name: going back, the Moment is the person's own again.
        .onChange(of: reinvented.isOn) { _, isOn in
            if !isOn {
                request.model.postsUnderMadeUpName = false
                // Nor stamps: today's server refuses them while the switch is off.
                request.model.studioStamps = []
                // Nor the Studio's pens and letterings: today's Text and Draw make lines and labels as before. What was
                // already drawn or written stays on the picture.
                request.model.marking.studio = nil
            }
        }
    }
}

struct MomentsStudioComposer: View {
    /// Held by the Moments tab, above this cover: on the iPhone Duo a fold can build the composer again.
    let model: MomentsComposerModel
    let onClose: @MainActor () -> Void
    @State private var asksDiscard = false
    /// How the iPhone Duo is held, as this cover reads it; until then, as the Moments tab read it.
    @State private var ownScreen: MomentsDuoScreen?
    @Environment(\.momentsDuoScreen) private var openerScreen

    private var duo: MomentsDuoScreen {
        ownScreen ?? openerScreen
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if model.marking.isOpen, let media = model.markedMedia {
                // Text and Draw: today's editor, in this stack (not a cover), so a fold keeps it.
                MomentsMarksEditor(model: model, media: media, studio: true)
                    .environment(\.colorScheme, .dark)
            } else if model.draft != nil {
                // Posted: the next of several picked together takes the screen; after the last, the composer closes.
                if duo.pose == .phone || duo.pose == .closed {
                    MomentsStudioStage(model: model, onPosted: posted)
                        .environment(\.colorScheme, .dark)
                } else {
                    MomentsPostStage(model: model, onPosted: posted)
                }
            } else if model.gate != .open {
                MomentsComposeGate(model: model, onClose: close)
                    .environment(\.colorScheme, .dark)
            } else {
                Group {
                    switch model.mode {
                    case .camera: MomentsCameraScreen(model: model, onClose: close)
                    case .library: MomentsLibraryScreen(model: model, onClose: close)
                    case .text: MomentsTextCardEditor(model: model, onClose: close)
                    }
                }
                .environment(\.colorScheme, .dark)
            }
        }
        .environment(\.momentsDuoScreen, duo)
        .onAppear { Task { await model.start() } }
        // Back to the camera, or on to the next of several picked together: the stamps were that picture's.
        .onChange(of: model.draft == nil) { _, gone in
            if gone { model.studioStamps = [] }
        }
        .onChange(of: model.waiting.count) { _, _ in model.studioStamps = [] }
        .onChange(of: model.wantsCamera, initial: true) { _, wants in
            if wants {
                Task { await model.camera.start() }
            } else {
                model.camera.stop()
            }
        }
        .sheet(isPresented: Binding(get: { model.asksAdult }, set: { model.asksAdult = $0 })) {
            MomentsAdultSheet(model: model, onDecline: close)
                .presentationDetents([.height(300)])
                .interactiveDismissDisabled()
        }
        .alert(
            "Moments are for people 18 and older.",
            isPresented: Binding(get: { model.ageRefused }, set: { model.ageRefused = $0 })
        ) {
            Button("OK", role: .cancel) { close() }
        }
        .alert("Discard this Moment?", isPresented: $asksDiscard) {
            Button("Discard", role: .destructive) { leave() }
                .accessibilityIdentifier("moments.compose.discard")
            Button("Keep editing", role: .cancel) {}
                .accessibilityIdentifier("moments.compose.keep")
        } message: {
            Text("What you wrote won't be saved.")
        }
        // The Studio's X on a picture with marks, or a placed one: on the model, so a fold keeps the question.
        .alert(
            "Discard this Moment?",
            isPresented: Binding(get: { model.marking.asksRetake }, set: { model.marking.asksRetake = $0 })
        ) {
            Button("Discard", role: .destructive) { model.retake() }
                .accessibilityIdentifier("moments.post.retake.discard")
            Button("Keep editing", role: .cancel) {}
                .accessibilityIdentifier("moments.post.retake.keep")
        } message: {
            Text(model.marking.marks.isEmpty ? "How you resized it won't be saved." : "What you drew or wrote on it won't be saved.")
        }
        .readsMomentsDuoScreen(Binding(get: { duo }, set: { screen in
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) { ownScreen = screen }
        }))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("moments.compose")
    }

    private func posted() {
        Task { if await !model.moveOn() { onClose() } }
    }

    /// Close asks first when a written card would be lost.
    private func close() {
        if model.draft == nil, !model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            asksDiscard = true
        } else {
            leave()
        }
    }

    private func leave() {
        model.abandon()
        onClose()
    }
}
