//
//  PlanCalendarEditor.swift
//  Pantopus
//
//  Board J7's "Calendar": the plan in the system's event editor (moved out of
//  PlanGoingAndHosting.swift unchanged).
//

import EventKit
import EventKitUI
import SwiftUI

/// Adds the plan to the calendar with the system editor (no calendar access needed).
struct PlanCalendarEditor: UIViewControllerRepresentable {
    let card: PlanCardDTO
    let place: PlanPlaceDTO?
    let onDone: () -> Void

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let store = EKEventStore()
        let event = EKEvent(eventStore: store)
        event.title = card.title
        event.startDate = card.startsAtDate ?? Date()
        event.endDate = card.endsAtDate ?? event.startDate.addingTimeInterval(7200)
        if let place {
            // An online plan's location is its link (for the people in, who are the only ones with this sheet).
            event.location = place.link ?? [place.name, place.address].compactMap { $0 }.joined(separator: ", ")
        }
        event.url = card.shareUrl.flatMap(URL.init(string:))
        let controller = EKEventEditViewController()
        controller.eventStore = store
        controller.event = event
        controller.editViewDelegate = context.coordinator
        return controller
    }

    func updateUIViewController(_: EKEventEditViewController, context _: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onDone: onDone)
    }

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let onDone: () -> Void

        init(onDone: @escaping () -> Void) {
            self.onDone = onDone
        }

        func eventEditViewController(_: EKEventEditViewController, didCompleteWith _: EKEventEditViewAction) {
            onDone()
        }
    }
}
