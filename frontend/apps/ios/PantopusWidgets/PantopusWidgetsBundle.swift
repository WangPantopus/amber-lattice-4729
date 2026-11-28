//
//  PantopusWidgetsBundle.swift
//  PantopusWidgets
//
//  Widget-extension entry point: the active-task Live Activity (Phase
//  6b), the "Tasks near me" home-screen timeline widget (Phase 6c),
//  "Today at your address" (the Today tab's living sky) and the posting
//  card (a Moment's photo or video on its way).
//

import SwiftUI
import WidgetKit

@main
struct PantopusWidgetsBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        TasksNearMeWidget()
        GigActivityWidget()
        PostingActivityWidget()
    }
}
