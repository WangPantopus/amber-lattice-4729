//
//  MailReplyPage.swift
//  Pantopus
//
//  A reply to a Christmas card opened from the Mailbox (experience plan Part 3): the joined card, the card its writer
//  answered with the reply lying on it, and what comes up from its ⋯: the Vault, Shred, Report this card and Block,
//  as on a card's table (the memories plan: Report and Block on every reply).
//

import SwiftUI

struct MailReplyPage: View {
    let viewModel: MailDetailViewModel
    let pair: CardReplyPair
    let onClose: () -> Void

    @State private var reportsSender = false
    @State private var confirmsBlock = false
    @State private var blockInFlight = false
    @State private var note: String?

    private var content: MailDetailContent? {
        if case let .loaded(content) = viewModel.state { return content }
        return nil
    }

    /// The writer's account, for Report and Block; none for a business.
    private var senderPersonId: String? {
        guard let content, !content.senderIsBusiness else { return nil }
        return content.senderUserId
    }

    private var first: String {
        HolidayCardWords.firstName(pair.reply.fromName)
    }

    var body: some View {
        CardTableJoinedPage(pair: pair, menuItems: menuItems, toast: note ?? viewModel.toast, onClose: onClose)
            .modifier(MailVaultFolderPickers(viewModel: viewModel))
            .confirmationDialog(
                "Shred this?",
                isPresented: Binding(get: { viewModel.confirmsShred }, set: { viewModel.confirmsShred = $0 }),
                titleVisibility: .visible
            ) {
                Button("Shred", role: .destructive) { Task { await viewModel.act(.shred) } }
                    .accessibilityIdentifier("cardJoinedShredConfirm")
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("It's gone from your mailbox. You can bring it back for 30 days.")
            }
            .confirmationDialog("Block \(first)?", isPresented: $confirmsBlock, titleVisibility: .visible) {
                Button("Block", role: .destructive) { Task { await block() } }
                    .accessibilityIdentifier("cardJoinedBlockConfirm")
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("They won't be able to send you mail. Cards and replies on their way between you are withdrawn. "
                    + "This reply stays until you shred it.")
            }
            .sheet(isPresented: $reportsSender) {
                if let senderPersonId {
                    ReportUserSheet(
                        userId: senderPersonId,
                        handle: nil,
                        displayName: pair.reply.fromName,
                        // "Report this card" shares the reply, and only the reply, with Pantopus admins.
                        card: ReportedCard(mailId: viewModel.mailId, senderFirstName: first),
                        onClose: { reportsSender = false },
                        onSubmitted: {
                            reportsSender = false
                            note = "Report sent. Thanks for telling us."
                        }
                    )
                }
            }
            // Shredded: back to the Mailbox.
            .onChange(of: viewModel.didLeaveMailbox) { _, left in
                if left { onClose() }
            }
    }

    private var menuItems: [CardTableMenuItem] {
        var items: [CardTableMenuItem] = []
        if content?.letter?.isFiled == true {
            items.append(CardTableMenuItem(title: "Take out of the Vault", identifier: "cardJoinedMenuUnfile") {
                Task { await viewModel.tapLetterAction(.unfile) }
            })
        } else {
            items.append(CardTableMenuItem(title: "File in the Vault", identifier: "cardJoinedMenuVault") {
                Task { await viewModel.tapLetterAction(.file) }
            })
        }
        items.append(CardTableMenuItem(title: "Shred", identifier: "cardJoinedMenuShred") {
            Task { await viewModel.tapLetterAction(.shred) }
        })
        if senderPersonId != nil {
            items.append(CardTableMenuItem(title: "Report this card", identifier: "cardJoinedMenuReport") { reportsSender = true })
            items.append(CardTableMenuItem(title: "Block \(first)", identifier: "cardJoinedMenuBlock") { confirmsBlock = true })
        }
        return items
    }

    private func block() async {
        guard let senderPersonId, !blockInFlight else { return }
        blockInFlight = true
        defer { blockInFlight = false }
        do {
            _ = try await APIClient.shared.request(BlocksEndpoints.block(userId: senderPersonId))
            note = "\(first) is blocked."
        } catch {
            note = "Couldn't block \(first). Check your connection and try again."
        }
    }
}
