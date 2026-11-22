//
//  RootTabOrder.swift
//  Pantopus
//
//  Which of Place and Today is the bar's first tab, and the tab the app opens
//  on (founder decision 2026-11-21). A person with a Home gets Today first:
//  it is the screen they come back to each day. Until they have one, Place is
//  first, because Place is where a home is added and verified.
//
//  "Has a Home" is the Home Place lands on and Today follows
//  (`MyHomesResponse.defaultHomeId`): a saved address, a claim still in
//  review or entries that all wait on verification keep Place first.
//
//  The answer is kept on this phone per account each time the home list is
//  read, and the bar reads it once, when the signed-in tabs are made. So the
//  bar is drawn in its order from the first frame, with no request, and never
//  moves while the app is in use: a home set up now shows Today first the
//  next time the app opens. An account new to this phone has no answer yet
//  and gets Place first for that one launch.
//

import Foundation

@MainActor
enum RootTabOrder {
    /// Today is the first tab for `account`, as its last home list on this phone says.
    static func todayFirst(account: String?, defaults: UserDefaults = .standard) -> Bool {
        guard let account else { return false }
        return defaults.bool(forKey: key(account))
    }

    /// The signed-in account's order, for the tabs being made now. The UI test
    /// journeys run on the stubbed server, share one install and expect Place
    /// at launch: they keep Place first.
    static func todayFirstForSignedInAccount() -> Bool {
        guard ProcessInfo.processInfo.environment["UI_TESTS_STUB_API"] != "1" else { return false }
        return todayFirst(account: signedInAccount)
    }

    /// The home list was read for the signed-in account: its answer is kept for the next launch.
    static func note(_ homes: MyHomesResponse, defaults: UserDefaults = .standard) {
        guard let account = signedInAccount else { return }
        let hasHome = homes.defaultHomeId != nil
        guard defaults.bool(forKey: key(account)) != hasHome else { return }
        defaults.set(hasHome, forKey: key(account))
    }

    private static var signedInAccount: String? {
        if case let .signedIn(user) = AuthManager.shared.state { return user.id }
        return nil
    }

    private static func key(_ account: String) -> String {
        "pantopus.tabs.todayFirst.\(account)"
    }
}
