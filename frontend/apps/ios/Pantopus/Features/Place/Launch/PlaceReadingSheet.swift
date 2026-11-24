//
//  PlaceReadingSheet.swift
//  Pantopus
//
//  LOOKUPORDER SPEC 5.2: "Ask Pantopus: what does this mean for me?" on the
//  lookup. A short reading of the page by Pantopus AI, written from the
//  public records the page shows and never given the street address:
//  what matters most, what to do in order, what the page can't tell, and
//  three questions already answered. No typing before an account.
//  `POST /api/public/place/reading` answers 404 (off), 409 (not looked up
//  here lately), 429 (the day's readings are used) or 502 (no good answer):
//  the sheet stays open and says so, with no retry loop; the row stays.
//

import SwiftUI

@Observable
@MainActor
final class PlaceReadingModel {
    enum State {
        case loading
        case loaded(PlaceReading)
        case failed
    }

    let address: String
    private(set) var state: State = .loading
    private let api: APIClient

    init(address: String, api: APIClient = .shared) {
        self.address = address
        self.api = api
    }

    func load() async {
        do {
            let response: PlaceReadingResponse = try await api.request(PlaceEndpoints.reading(address: address))
            if let reading = response.reading, reading.isRenderable {
                state = .loaded(reading)
            } else {
                state = .failed
            }
        } catch is CancellationError {
            return
        } catch {
            state = .failed
        }
    }
}

/// What the row opens, by address.
struct PlaceReadingRequest: Identifiable, Hashable {
    let address: String
    var id: String {
        address
    }
}

struct PlaceReadingSheet: View {
    @State private var model: PlaceReadingModel
    /// Signed out: "Ask your own question. Free with an account." goes where Continue goes.
    var onSignUp: (() -> Void)?
    var onClose: () -> Void
    @State private var openQuestion: Int?

    init(address: String, onSignUp: (() -> Void)?, onClose: @escaping () -> Void) {
        _model = State(initialValue: PlaceReadingModel(address: address))
        self.onSignUp = onSignUp
        self.onClose = onClose
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                AskPantopusGlyph(size: 16)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(Theme.Color.magicBg))
                Text("Ask Pantopus")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Theme.Color.appText)
                Spacer(minLength: 0)
                Button(action: onClose) {
                    Icon(.x, size: 18, strokeWidth: 2.25, color: Theme.Color.appTextSecondary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.leading, Spacing.s4)
            .padding(.trailing, Spacing.s1)
            .padding(.top, Spacing.s2)
            ScrollView {
                content
                    .padding(.horizontal, Spacing.s4)
                    .padding(.bottom, Spacing.s8)
            }
        }
        .background(Theme.Color.appBg)
        .task { await model.load() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("place.preview.reading")
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .failed:
            // Founder-approved 2026-11-24: the sheet stays open and says so, once.
            VStack(alignment: .leading, spacing: 0) {
                Text("Pantopus AI couldn't read this page just now.")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.s4)
                    .accessibilityIdentifier("place.preview.reading.failed")
                signUpLink
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .loading:
            VStack(alignment: .leading, spacing: 10) {
                ForEach(0..<4, id: \.self) { index in
                    PlaceSkeleton(widthFraction: index == 0 ? 0.5 : 1, height: index == 0 ? 14 : 56, radius: 10)
                }
            }
            .padding(.top, Spacing.s4)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Pantopus is reading this page")
        case let .loaded(reading):
            loaded(reading)
        }
    }

    private func loaded(_ reading: PlaceReading) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if !reading.matters.isEmpty {
                heading("What matters most here")
                paragraph(reading.matters)
            }
            if !reading.steps.isEmpty {
                heading("What to do, in order")
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(reading.steps.enumerated()), id: \.offset) { index, step in
                        stepRow(index + 1, step)
                    }
                }
            }
            if !reading.cannotTell.isEmpty {
                heading("What this page can't tell you")
                paragraph(reading.cannotTell)
            }
            if !reading.questions.isEmpty {
                VStack(spacing: 8) {
                    ForEach(Array(reading.questions.enumerated()), id: \.offset) { index, question in
                        questionRow(index, question)
                    }
                }
                .padding(.top, 20)
            }
            signUpLink
            Text("Written by Pantopus AI from the public records on this page. It is not given your street address.")
                .font(.system(size: 12))
                .lineSpacing(2)
                .foregroundStyle(Theme.Color.appTextMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.s4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Signed out: "Ask your own question. Free with an account." goes where Continue goes.
    @ViewBuilder
    private var signUpLink: some View {
        if let onSignUp {
            Button(action: onSignUp) {
                HStack(spacing: 4) {
                    Text("Ask your own question. Free with an account.")
                        .font(.system(size: 14.5, weight: .semibold))
                        .multilineTextAlignment(.leading)
                    Icon(.chevronRight, size: 14, strokeWidth: 2.25, color: Theme.Color.primaryInk)
                }
                .foregroundStyle(Theme.Color.primaryInk)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, Spacing.s4)
            .accessibilityIdentifier("place.preview.reading.signUp")
        }
    }

    private func heading(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(Theme.Color.appText)
            .accessibilityAddTraits(.isHeader)
            .padding(.top, 20)
            .padding(.bottom, 6)
    }

    private func paragraph(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14.5))
            .lineSpacing(3)
            .foregroundStyle(Theme.Color.appTextSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func stepRow(_ number: Int, _ step: PlaceReading.Step) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(number)")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.Color.primaryInk)
                .frame(width: 22, height: 22)
                .background(Circle().fill(Theme.Color.primary50))
                .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 6 }
            VStack(alignment: .leading, spacing: 2) {
                Text(step.text)
                    .font(.system(size: 14.5))
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
                if !step.source.isEmpty {
                    Text(step.source)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.Color.appTextMuted)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func questionRow(_ index: Int, _ question: PlaceReading.Question) -> some View {
        let open = openQuestion == index
        return VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) { openQuestion = open ? nil : index }
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(question.question)
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(Theme.Color.appText)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Icon(open ? .chevronUp : .chevronDown, size: 16, strokeWidth: 2.25, color: Theme.Color.appTextMuted)
                }
                .frame(maxWidth: .infinity, minHeight: 28, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(open ? [.isButton, .isSelected] : .isButton)
            .accessibilityIdentifier("place.preview.reading.question.\(index)")
            if open {
                Text(question.answer)
                    .font(.system(size: 14))
                    .lineSpacing(2)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .placeCard()
    }
}
