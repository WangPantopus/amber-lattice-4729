//
//  HelpCenterView.swift
//  Pantopus
//
//  P8 / T6.2c — Settings → Help sub-route. Static FAQ + contact CTA.
//  Per Q7: "Static FAQ + contact CTA. No backend." Content lives in
//  this file so it ships with the binary; future work can lift it
//  into the backend if it grows.
//

import SwiftUI

public struct HelpCenterView: View {
    private let onBack: @MainActor () -> Void

    @State private var showsEmailFallback = false
    /// "Tips for each screen" is open (the guidance cards' list, GUIDE spec §4).
    @State private var showsTips = false

    public init(onBack: @escaping @MainActor () -> Void) {
        self.onBack = onBack
    }

    public var body: some View {
        ZStack {
            if showsTips {
                GuidanceTipsView { withAnimation(.easeOut(duration: 0.25)) { showsTips = false } }
                    .transition(.move(edge: .trailing))
            } else {
                ContentDetailShell(
                    title: "Help",
                    onBack: onBack,
                    header: { headerView },
                    body: { contentBody },
                    // On an iPad "Still stuck?" is a card among the answers instead of a bar over them.
                    cta: { if !WideLayout.isPad { ctaBar } }
                )
                // On an iPad window that holds two columns the answers take the window's whole width.
                .wideColumnsScreen()
                .background(Theme.Color.appBg)
                .accessibilityIdentifier("helpCenter")
                .transition(.move(edge: .leading))
            }
        }
        .emailFallbackAlert(address: "support@pantopus.com", isPresented: $showsEmailFallback)
    }

    /// The first row of "Getting started" while the guidance cards are on: their list, to read again.
    private var tipsRow: some View {
        GuidanceTipRow(title: "Tips for each screen") {
            withAnimation(.easeOut(duration: 0.25)) { showsTips = true }
        }
        .accessibilityIdentifier("helpCenter.tips")
    }

    private var headerView: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Text("How can we help?")
                .pantopusTextStyle(.h2)
                .foregroundStyle(Theme.Color.appText)
            Text(
                "Most questions about messages and mail have answers below. " +
                    "If you don't see yours, reach out — we read every message."
            )
            .pantopusTextStyle(.small)
            .foregroundStyle(Theme.Color.appTextSecondary)
        }
        .padding(.top, Spacing.s2)
        // On an iPad level with the answers' columns below.
        .modifier(HelpSideMargins())
    }

    @ViewBuilder private var contentBody: some View {
        if WideLayout.isPad {
            padColumns
        } else {
            VStack(alignment: .leading, spacing: Spacing.s5) {
                ForEach(Self.sections, id: \.heading) { section in
                    sectionView(section)
                        .padding(.horizontal, Spacing.s4)
                }
            }
            .padding(.vertical, Spacing.s4)
        }
    }

    /// On an iPad window wide enough: "Getting started" and "Account & safety" in one column, "Mail & messages" and
    /// "Still stuck?" in the other; a narrower window keeps them in one column, in that order.
    private var padColumns: some View {
        WideColumns {
            ForEach(Array(Self.sections.enumerated()), id: \.element.heading) { index, section in
                sectionView(section)
                    .padding(.top, index == 0 ? Spacing.s0 : Spacing.s5)
                    .placeColumn(
                        index.isMultiple(of: 2) ? .leading : .trailing,
                        order: index,
                        // The first section has no room above it to leave out.
                        trimsTop: index == 0 ? Spacing.s0 : Spacing.s5
                    )
            }
            contactCard
                .padding(.top, Spacing.s5)
                .placeColumn(Self.sections.count.isMultiple(of: 2) ? .leading : .trailing, order: Self.sections.count, trimsTop: Spacing.s5)
        }
        .modifier(HelpSideMargins())
        .padding(.vertical, Spacing.s4)
    }

    private func sectionView(_ section: Section) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Text(section.heading)
                .pantopusTextStyle(.h3)
                .foregroundStyle(Theme.Color.appText)
            if section.heading == Self.gettingStarted, GuidanceCenter.shared.tipsAvailable {
                tipsRow
            }
            ForEach(section.items, id: \.question) { item in
                VStack(alignment: .leading, spacing: Spacing.s1) {
                    Text(item.question)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.appText)
                    Text(item.answer)
                        .pantopusTextStyle(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(Spacing.s4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
            }
        }
    }

    /// "Still stuck?" on an iPad: a card after the answers, where the phone has a bar along the bottom.
    private var contactCard: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Text("Still stuck?")
                .pantopusTextStyle(.h3)
                .foregroundStyle(Theme.Color.appText)
            Text("Email us. We read every message.")
                .pantopusTextStyle(.small)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
            PrimaryButton(title: "Email support") {
                if let url = URL(string: "mailto:support@pantopus.com?subject=Help") {
                    await openURL(url)
                }
            }
            .accessibilityIdentifier("helpCenterContactCTA")
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
    }

    private var ctaBar: some View {
        VStack(spacing: Spacing.s2) {
            Text("Still stuck?")
                .pantopusTextStyle(.caption)
                .foregroundStyle(Theme.Color.appTextSecondary)
            PrimaryButton(title: "Email support") {
                if let url = URL(string: "mailto:support@pantopus.com?subject=Help") {
                    await openURL(url)
                }
            }
            .accessibilityIdentifier("helpCenterContactCTA")
        }
        // Half folded like a book, on one side of the iPhone Duo's fold; the bar itself stays full width.
        .besideFold()
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, Spacing.s3)
        .background(Theme.Color.appSurface)
    }

    @MainActor
    private func openURL(_ url: URL) async {
        // No mail app → say where to write instead of doing nothing.
        let opened = await UIApplication.shared.open(url, options: [:])
        if !opened {
            showsEmailFallback = true
        }
    }

    private static let gettingStarted = "Getting started"

    private struct Section {
        let heading: String
        let items: [Item]
    }

    private struct Item {
        let question: String
        let answer: String
    }

    private static let sections: [Section] = [
        Section(heading: gettingStarted, items: [
            Item(
                question: "Why do I need to verify my email?",
                answer: "Verifying your email unlocks posting, messaging, and trust signals other people look for. " +
                    "It also lets us send you a Magic Link if you forget your password."
            ),
            Item(
                question: "Who can see my address?",
                answer: "Your profile never shows your street address. People who can see your profile see the city " +
                    "and state on it, and whether your home is verified. Posts, tasks, and listings show only the " +
                    "location you add to them."
            )
        ]),
        Section(heading: "Mail & messages", items: [
            Item(
                question: "What's the difference between mail and a chat?",
                answer: "Mail is asynchronous and ceremonial — it lands in your mailbox, can carry attachments and trust signals, " +
                    "and you reply when you're ready. Chats are real-time and live in the inbox tab."
            ),
            Item(
                question: "Why didn't my message send?",
                answer: "If the other person has blocked you, or if their privacy settings prevent unsolicited messages, the send fails. " +
                    "We surface this with a clear error in the chat thread."
            )
        ]),
        Section(heading: "Account & safety", items: [
            Item(
                question: "How do I block someone?",
                answer: "Open their profile, tap the kebab menu (•••), and choose Block. " +
                    "You can unblock them later from Settings → Blocked users."
            ),
            Item(
                question: "How do I delete my account?",
                answer: "Open the menu, tap Profile & Privacy, then Delete account at the bottom. " +
                    "You'll confirm in the app and verify your identity, then your account and its data are removed. " +
                    "Finish or cancel any gigs in progress and resolve pending payments first — those block deletion. " +
                    "If your account has payment history, contact support to close it."
            )
        ])
    ]
}

/// The page's side margins: a phone's 16 pt, and on an iPad the two columns' margins where they show.
private struct HelpSideMargins: ViewModifier {
    func body(content: Content) -> some View {
        if WideLayout.isPad {
            content.wideColumnsMargins(Spacing.s4)
        } else {
            content.padding(.horizontal, Spacing.s4)
        }
    }
}

#Preview {
    NavigationStack {
        HelpCenterView {}
    }
}
