//
//  ShareViewController.swift
//  PantopusShare
//
//  Pantopus in another app's share sheet (founder, 2026-11-27): Photos, Safari
//  or any app that shares a photo, a video, a link or words. It shows who is
//  sharing and a card for each place in Pantopus the thing can go (Moments,
//  Pulse, Message, Mail, Plans); a tap copies it to the App Group and opens
//  the app on that composer. A person or group the share sheet suggested from
//  Pantopus chats skips the cards and goes straight to that chat.
//

import SwiftUI
import UIKit

final class ShareViewController: UIViewController {
    private let model = ShareModel()
    private var handedOver = false

    override func viewDidLoad() {
        super.viewDidLoad()
        let picker = SharePicker(
            model: model,
            onPick: { [weak self] destination in self?.pick(destination) },
            onOpenApp: { [weak self] in self?.finish(opening: true) },
            onDone: { [weak self] in self?.close() },
            onCancel: { [weak self] in self?.cancel() }
        )
        let host = UIHostingController(rootView: picker)
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)

        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        model.start(items: items, intent: extensionContext?.intent)
        // A suggested person or group: no cards, the chat opens once the copy is done.
        if model.suggestedChat != nil, model.account != nil { pick(.messages) }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // Swiped away: nothing copied stays behind.
        if !handedOver { model.discard() }
    }

    private func pick(_ destination: ShareInDestination) {
        Task {
            guard await model.send(to: destination) else { return }
            finish(opening: true)
        }
    }

    private func cancel() {
        model.discard()
        handedOver = true
        extensionContext?.cancelRequest(withError: CocoaError(.userCancelled))
    }

    private func finish(opening: Bool) {
        handedOver = true
        if opening, let url = URL(string: "pantopus://\(ShareInbox.linkHost)"), !openApp(url) {
            // The app couldn't be brought forward from here: say so, and it picks the share up when it's opened.
            model.waitsForApp = true
            return
        }
        // The app is coming forward; the share sheet closes behind it.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    /// A share extension has no `UIApplication.shared`; the application is still the last responder above this
    /// screen, and it opens the link. Should a later iOS take that away, the app finds the share the next time it
    /// is opened (`ShareInCoordinator` reads the App Group whenever it comes forward).
    private func openApp(_ url: URL) -> Bool {
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        var responder: UIResponder? = self
        while let current = responder {
            if current is UIApplication, current.responds(to: selector) {
                typealias Open = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, AnyObject?) -> Void
                let open = unsafeBitCast(current.method(for: selector), to: Open.self)
                open(current, selector, url as NSURL, NSDictionary(), nil)
                return true
            }
            responder = current.next
        }
        return false
    }

    /// "Done" under "Open Pantopus to finish".
    private func close() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
