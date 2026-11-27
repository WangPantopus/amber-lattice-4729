//
//  PulsePostSignals.swift
//  Pantopus
//
//  The five signals on Pulse posts ("Pulse, reinvented", CONTRACT section 4): Learned, Want to go, Smile, Same,
//  Helpful, in the emoji's place on a post's card and on its own page. The server adds `userSignal` and `signals` to a
//  post only for a reader whose `pulse_reinvented` switch is on, so only a post that carries them draws these; every
//  other post draws today's emoji. One signal per person, the same reaction as an emoji (choosing one replaces it).
//  The web's `PostSignals.tsx` draws the same: the card's pill, and on the post page all five as chips.
//

import Observation
import SwiftUI
import UIKit

/// A post's signals as the server sent them: each chosen signal's count, most first (ties in the order offered), and
/// the reader's own.
struct PostSignals: Sendable, Hashable {
    struct Count: Sendable, Hashable {
        let signal: MomentSignal
        let count: Int
    }

    let postId: String
    let counts: [Count]
    let mine: MomentSignal?

    /// Nil when the post carries no `signals` (the reader's switch is off, or an older server): today's emoji.
    init?(postId: String, signals: [PostSignalCountDTO]?, userSignal: String?) {
        guard let signals else { return nil }
        self.init(postId: postId, counts: Self.tidy(signals), mine: userSignal.flatMap(MomentSignal.init(rawValue:)))
    }

    private init(postId: String, counts: [Count], mine: MomentSignal?) {
        self.postId = postId
        self.counts = counts
        self.mine = mine
    }

    /// How many people chose a signal.
    var total: Int {
        counts.reduce(0) { $0 + $1.count }
    }

    func count(of signal: MomentSignal) -> Int {
        counts.first { $0.signal == signal }?.count ?? 0
    }

    /// The card's marks: up to three, most chosen first, the reader's own always among them.
    var cardSignals: [MomentSignal] {
        var top = counts.prefix(3).map(\.signal)
        if let mine, !top.contains(mine) {
            if top.count == 3 { top[2] = mine } else { top.append(mine) }
        }
        return top
    }

    /// What the reader's choice would show at once: their old signal one less, the new one one more.
    func moving(to signal: MomentSignal?) -> PostSignals {
        var byKind = Dictionary(counts.map { ($0.signal, $0.count) }, uniquingKeysWith: +)
        if let mine { byKind[mine] = max(0, (byKind[mine] ?? 0) - 1) }
        if let signal { byKind[signal, default: 0] += 1 }
        return PostSignals(postId: postId, counts: Self.sorted(byKind), mine: signal)
    }

    /// The server's answer to a choice; its counts when it sent them, else the ones shown.
    func confirmed(by reply: PostSignalResponse) -> PostSignals {
        let mine = reply.signal.flatMap(MomentSignal.init(rawValue:))
        return PostSignals(postId: postId, counts: reply.signals.map(Self.tidy) ?? counts, mine: mine)
    }

    /// VoiceOver: "Signals, 6: 3 Learned, 2 Smile, 1 Helpful", or "React" before anyone chose one.
    var accessibilityLabel: String {
        guard total > 0 else { return PostReactionKind.emoji.label }
        return "Signals, \(total): " + counts.map { "\($0.count) \($0.signal.title)" }.joined(separator: ", ")
    }

    /// "Your signal: Learned"; nothing before the reader chose one.
    var accessibilityValue: String {
        mine.map { "Your signal: \($0.title)" } ?? ""
    }

    private static func tidy(_ list: [PostSignalCountDTO]) -> [Count] {
        var byKind: [MomentSignal: Int] = [:]
        for entry in list {
            guard let signal = MomentSignal(rawValue: entry.signal), entry.count >= 1 else { continue }
            byKind[signal, default: 0] += entry.count
        }
        return sorted(byKind)
    }

    private static func sorted(_ byKind: [MomentSignal: Int]) -> [Count] {
        let order = MomentSignal.allCases
        return byKind.filter { $0.value > 0 }
            .map { Count(signal: $0.key, count: $0.value) }
            .sorted {
                $0.count == $1.count
                    ? (order.firstIndex(of: $0.signal) ?? 0) < (order.firstIndex(of: $1.signal) ?? 0)
                    : $0.count > $1.count
            }
    }
}

/// The signals chosen in this run of the app, by post, over what the post said when the choice was made. A fresh read
/// of the post (other counts) replaces them, as on the web. The card and the post page share it, so a choice on one
/// shows on the other.
@Observable
@MainActor
final class PostSignalStore {
    static let shared = PostSignalStore()

    private struct Given {
        let base: PostSignals
        let shown: PostSignals
    }

    private var given: [String: Given] = [:]
    /// Posts whose choice is on its way: taps wait.
    private(set) var pending: Set<String> = []
    /// "Couldn't send that. Try again." for a few seconds after a choice failed, by post.
    private(set) var failed: [String: String] = [:]

    /// The signals to draw for a post as the server last sent them.
    func shown(_ base: PostSignals) -> PostSignals {
        guard let entry = given[base.postId], entry.base == base else { return base }
        return entry.shown
    }

    /// One of the five, chosen; the reader's own again takes it back. Shown at once, sent as `{ "signal": … }`, then the
    /// server's counts replace the guess; rolled back on failure.
    func choose(_ signal: MomentSignal, on base: PostSignals, api: APIClient = .shared) async {
        let id = base.postId
        guard !pending.contains(id) else { return }
        let before = shown(base)
        let choice: MomentSignal? = before.mine == signal ? nil : signal
        given[id] = Given(base: base, shown: before.moving(to: choice))
        pending.insert(id)
        failed[id] = nil
        defer { pending.remove(id) }
        if choice != nil { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        do {
            let reply: PostSignalResponse = try await MomentsAPI.send(
                StudioEndpoints.postSignal(postId: id, signal: choice?.rawValue),
                api: api
            )
            let shownNow = given[id]?.shown ?? before
            given[id] = Given(base: base, shown: shownNow.confirmed(by: reply))
            ScreenStore.store(for: api).markStale(topics: [ScreenTopic.posts, ScreenTopic.post(id)])
        } catch {
            given[id] = Given(base: base, shown: before)
            fail(id, (error as? MomentsFailure)?.message ?? "Couldn't send that. Try again.")
            // A signal is the new screens' own: refused, the switch may be off now (CONTRACT 1). Off, the posts are read
            // again and come back as today's, with emoji.
            await PulseReinventedFlags.shared.recheck()
            if !PulseReinventedFlags.shared.isOn {
                ScreenStore.store(for: api).markStale(topics: [ScreenTopic.posts, ScreenTopic.post(id)])
            }
        }
    }

    private func fail(_ id: String, _ message: String) {
        failed[id] = message
        UIAccessibility.post(notification: .announcement, argument: message)
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(3))
            if self?.failed[id] == message { self?.failed[id] = nil }
        }
    }
}

/// The card's signal, in the emoji pill's place: a smile and "React" before anyone chose one, then the most chosen
/// signals' marks (the reader's own always among them) and how many chose one, tinted once the reader chose one. A
/// tap opens the five.
struct PulseSignalPill: View {
    let base: PostSignals
    @Binding var isPicking: Bool
    private let store = PostSignalStore.shared

    var body: some View {
        let signals = store.shown(base)
        let pending = store.pending.contains(base.postId)
        Button { if !pending { isPicking = true } } label: {
            label(signals)
                .hitArea(horizontal: 6, vertical: 12)
        }
        .buttonStyle(.plain)
        .opacity(pending ? 0.5 : 1)
        .accessibilityLabel(signals.accessibilityLabel)
        .accessibilityValue(signals.accessibilityValue)
        .accessibilityAddTraits(signals.mine != nil ? .isSelected : [])
        .accessibilityIdentifier("pulseSignals_\(base.postId)")
        .popover(isPresented: $isPicking) {
            PulseSignalPicker(chosen: signals.mine) { signal in
                isPicking = false
                Task { await store.choose(signal, on: base) }
            }
            .presentationCompactAdaptation(.popover)
            .presentationBackground(Theme.Color.appSurface)
        }
    }

    @ViewBuilder
    private func label(_ signals: PostSignals) -> some View {
        if let failure = store.failed[base.postId] {
            Text(failure)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(Theme.Color.error)
                .lineLimit(1)
        } else if signals.total == 0 {
            HStack(spacing: Spacing.s1) {
                Icon(.smile, size: 12, color: Theme.Color.appTextSecondary)
                Text(PostReactionKind.emoji.label)
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
        } else {
            let tint = signals.mine != nil ? Theme.Color.primaryInk : Theme.Color.appTextSecondary
            HStack(spacing: Spacing.s1) {
                HStack(spacing: 2) {
                    ForEach(signals.cardSignals) { signal in
                        Icon(signal.icon, size: 13, strokeWidth: 2, color: tint)
                    }
                }
                Text("\(signals.total)")
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(tint)
            }
        }
    }
}

/// The five signals in a bubble from the control that opened it, each its mark beside its word; the reader's own is
/// tinted, and choosing it again takes it back.
struct PulseSignalPicker: View {
    let chosen: MomentSignal?
    let onPick: @MainActor (MomentSignal) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(MomentSignal.allCases) { signal in
                option(signal)
            }
        }
        .padding(Spacing.s1)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Signals")
        .accessibilityIdentifier("pulseSignalPicker")
    }

    private func option(_ signal: MomentSignal) -> some View {
        let isChosen = chosen == signal
        return Button { onPick(signal) } label: {
            HStack(spacing: Spacing.s2) {
                Icon(signal.icon, size: 18, strokeWidth: 2, color: isChosen ? Theme.Color.primary700 : Theme.Color.appText)
                Text(signal.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(isChosen ? Theme.Color.primary700 : Theme.Color.appText)
                Spacer(minLength: Spacing.s4)
            }
            .padding(.horizontal, Spacing.s3)
            .frame(minWidth: 180, minHeight: 44)
            .background(isChosen ? Theme.Color.primary50 : Color.clear, in: RoundedRectangle(cornerRadius: Radii.md))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(signal.title)
        .accessibilityAddTraits(isChosen ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("pulseSignalOption_\(signal.rawValue)")
    }
}

/// The post page's signals (board B3): all five as chips, each with how many chose it, the reader's own tinted. A chip
/// sets that signal, or takes the reader's own back.
struct PostSignalChips: View {
    let base: PostSignals
    private let store = PostSignalStore.shared

    var body: some View {
        let signals = store.shown(base)
        let pending = store.pending.contains(base.postId)
        VStack(alignment: .leading, spacing: Spacing.s1) {
            ContentDetailFlowLayout(spacing: Spacing.s2, lineSpacing: Spacing.s2) {
                ForEach(MomentSignal.allCases) { signal in
                    chip(signal, count: signals.count(of: signal), on: signals.mine == signal, pending: pending)
                }
            }
            if let failure = store.failed[base.postId] {
                Text(failure)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.error)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Signals")
        .accessibilityIdentifier("pulsePostDetail-signals")
    }

    private func chip(_ signal: MomentSignal, count: Int, on: Bool, pending: Bool) -> some View {
        let foreground = on ? Theme.Color.primary700 : Theme.Color.appTextSecondary
        return Button { Task { await store.choose(signal, on: base) } } label: {
            HStack(spacing: Spacing.s1) {
                Icon(signal.icon, size: 14, strokeWidth: 2, color: foreground)
                Text(signal.title)
                    .font(.system(size: PantopusTextStyle.caption.size, weight: .medium))
                    .foregroundStyle(foreground)
                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: PantopusTextStyle.caption.size, weight: .regular))
                        .foregroundStyle(foreground)
                }
            }
            .padding(.horizontal, Spacing.s3)
            .frame(height: 32)
            .background(on ? Theme.Color.primary50 : Theme.Color.appSurface)
            .overlay {
                RoundedRectangle(cornerRadius: Radii.pill, style: .continuous)
                    .stroke(on ? Theme.Color.primary700.opacity(0.25) : Theme.Color.appBorder, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: Radii.pill))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(pending)
        .opacity(pending ? 0.6 : 1)
        .accessibilityLabel(count > 0 ? "\(signal.title), \(count)" : signal.title)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("pulsePostDetail-signal-\(signal.rawValue)")
    }
}

extension PulseReinventedFlags {
    /// A Pulse post's signals when it carries them; nil otherwise, and then the card and the post page draw today's
    /// emoji. The server sends `signals` only to a reader whose switch is on (CONTRACT 4), so the post's own answer
    /// decides, as on the web: no wait for the app's own read of the switch, and a post read while the switch was off
    /// never shows them.
    static func postSignals(_ post: FeedPostDTO) -> PostSignals? {
        PostSignals(postId: post.id, signals: post.signals, userSignal: post.userSignal)
    }

    static func postSignals(_ post: PostDetailDTO) -> PostSignals? {
        PostSignals(postId: post.id, signals: post.signals, userSignal: post.userSignal)
    }
}
