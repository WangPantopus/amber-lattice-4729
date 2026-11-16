//
//  PlansFlags.swift
//  Pantopus
//
//  Nearby Plans sits behind two server flags (Plans build brief, section 3),
//  both off by default: `plans` (everything) and `plans_playdates`
//  (playdates, on top of `plans`). A third, `plans_business` (Plans with
//  businesses), only decides what the app shows outside Plans' own answers:
//  the team permissions "Post plans" and "Run plans". Inside Plans the server
//  decides, by sending a business's plan or not. A fourth, `plans_private`
//  (step 1's private plans), shows the controls for posting one; a private plan
//  already posted shows as private either way. A fifth, `plans_repeat` (step 2's
//  repeating plans), shows the Repeats row for a plan that doesn't repeat yet; a
//  plan that already repeats keeps its lines and its host's controls either
//  way. Two more, `plans_kinds` and `plans_online` (steps 3 and 4), show the
//  four newer kinds and "Online" for posting; a plan already posted reads
//  either way. `plans_guest_answers` (Plans for the holidays, H1) shows the
//  host's controls for room up to 100, "Kids welcome" and the open link; a
//  guest reads what the plan itself says either way. The app reads them at launch and on
//  foreground through `GET /api/feature-flags/:flagName`, which honors
//  `enabled_for_internal_team` and `beta_user_ids`, so pilot testers can have
//  Plans before everyone else.
//
//  Off: there is no Plans tab, and no Plans entry point, card,
//  notification or deep link shows. The last answer is remembered per
//  account, so the right tab bar is there on the first frame after a
//  relaunch; a failed check keeps the last answer. A new account starts
//  from its own answer, never the previous account's.
//

import Foundation
import Observation

@Observable
@MainActor
final class PlansFlags {
    static let shared = PlansFlags()

    /// Nearby Plans is on for the signed-in account.
    private(set) var plans = false
    /// Playdates are on too (never without `plans`).
    private(set) var playdates = false
    /// Plans with businesses is on too (never without `plans`).
    private(set) var business = false
    /// Private plans can be posted (never without `plans`).
    private(set) var privatePlans = false
    /// Plans can be set to repeat (never without `plans`).
    private(set) var repeating = false
    /// Steps 3 and 4: the four newer kinds, and online plans, can be posted (never without `plans`).
    private(set) var kinds = false
    private(set) var online = false
    /// Plans for the holidays H1: room up to 100, kids welcome, one link for everyone (never without `plans`).
    private(set) var guestAnswers = false

    /// Checks closer together than this reuse the last answer.
    static let recheckAfter: TimeInterval = 30

    @ObservationIgnored private var account: String?
    @ObservationIgnored private var lastChecked: Date?
    @ObservationIgnored private var inFlight: Task<Void, Never>?
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let injectedAPI: APIClient?

    init(api: APIClient? = nil, defaults: UserDefaults = .standard) {
        injectedAPI = api
        self.defaults = defaults
    }

    /// Re-reads the flags for `account` (the signed-in user id); nil turns
    /// Plans off. `force` skips the 30-second reuse.
    func refresh(account newAccount: String?, force: Bool = false) async {
        guard let newAccount else {
            account = nil
            lastChecked = nil
            apply(Answers(
                plans: false,
                playdates: false,
                business: false,
                privatePlans: false,
                repeating: false,
                kinds: false,
                online: false,
                guestAnswers: false
            ))
            return
        }
        if newAccount != account {
            account = newAccount
            lastChecked = nil
            restore(for: newAccount)
        }
        if !force, let lastChecked, Date().timeIntervalSince(lastChecked) < Self.recheckAfter { return }
        if let inFlight {
            await inFlight.value
            return
        }
        let task = Task { await check(account: newAccount) }
        inFlight = task
        await task.value
        inFlight = nil
    }

    /// The remembered answer for `account`, at once (a link or a push
    /// arriving before the launch check has run).
    func prime(account newAccount: String?) {
        guard let newAccount, newAccount != account else { return }
        account = newAccount
        lastChecked = nil
        restore(for: newAccount)
    }

    /// The answer a Plans link acts on: the remembered one, or the server's when
    /// this device has none for `account` yet. A plan link that arrives with the
    /// first sign-in (someone new opening a neighbor's plan) would otherwise meet
    /// the default "off" and be dropped.
    func ready(account newAccount: String?) async {
        prime(account: newAccount)
        guard let newAccount, defaults.array(forKey: Self.key(newAccount)) == nil else { return }
        await refresh(account: newAccount)
    }

    private func check(account checked: String) async {
        let api = injectedAPI ?? APIClient.shared
        async let plansAnswer = Self.read("plans", api: api)
        async let playdatesAnswer = Self.read("plans_playdates", api: api)
        async let businessAnswer = Self.read("plans_business", api: api)
        async let privateAnswer = Self.read("plans_private", api: api)
        async let repeatAnswer = Self.read("plans_repeat", api: api)
        async let kindsAnswer = Self.read("plans_kinds", api: api)
        async let onlineAnswer = Self.read("plans_online", api: api)
        async let guestAnswersAnswer = Self.read("plans_guest_answers", api: api)
        let answers = await (
            plans: plansAnswer,
            playdates: playdatesAnswer,
            business: businessAnswer,
            privatePlans: privateAnswer,
            repeating: repeatAnswer,
            kinds: kindsAnswer,
            online: onlineAnswer,
            guestAnswers: guestAnswersAnswer
        )
        // An account switch while the check ran: its answers aren't this account's.
        guard account == checked else { return }
        let plansOn = answers.plans ?? plans
        if answers.plans != nil || answers.playdates != nil { lastChecked = Date() }
        apply(Answers(
            plans: plansOn,
            playdates: plansOn && (answers.playdates ?? playdates),
            business: plansOn && (answers.business ?? business),
            privatePlans: plansOn && (answers.privatePlans ?? privatePlans),
            repeating: plansOn && (answers.repeating ?? repeating),
            kinds: plansOn && (answers.kinds ?? kinds),
            online: plansOn && (answers.online ?? online),
            guestAnswers: plansOn && (answers.guestAnswers ?? guestAnswers)
        ))
        // One list per account; a shorter one saved by an older build restores the missing switches as off.
        defaults.set([plans, playdates, business, privatePlans, repeating, kinds, online, guestAnswers], forKey: Self.key(checked))
    }

    private func restore(for account: String) {
        let saved = defaults.array(forKey: Self.key(account)) as? [Bool] ?? []
        let plansOn = saved.first ?? false
        apply(Answers(
            plans: plansOn,
            playdates: plansOn && saved.dropFirst().first == true,
            business: plansOn && saved.dropFirst(2).first == true,
            privatePlans: plansOn && saved.dropFirst(3).first == true,
            repeating: plansOn && saved.dropFirst(4).first == true,
            kinds: plansOn && saved.dropFirst(5).first == true,
            online: plansOn && saved.dropFirst(6).first == true,
            guestAnswers: plansOn && saved.dropFirst(7).first == true
        ))
    }

    /// Each switch's answer, every one already off without `plans`.
    private struct Answers {
        let plans: Bool
        let playdates: Bool
        let business: Bool
        let privatePlans: Bool
        let repeating: Bool
        let kinds: Bool
        let online: Bool
        let guestAnswers: Bool
    }

    private func apply(_ answers: Answers) {
        if plans != answers.plans { plans = answers.plans }
        if playdates != answers.playdates { playdates = answers.playdates }
        if business != answers.business { business = answers.business }
        if privatePlans != answers.privatePlans { privatePlans = answers.privatePlans }
        if repeating != answers.repeating { repeating = answers.repeating }
        if kinds != answers.kinds { kinds = answers.kinds }
        if online != answers.online { online = answers.online }
        if guestAnswers != answers.guestAnswers { guestAnswers = answers.guestAnswers }
    }

    /// The flag's answer, or nil when it couldn't be read (offline, 5xx).
    private static func read(_ name: String, api: APIClient) async -> Bool? {
        do {
            let flag: FeatureFlagDTO = try await api.request(PlansEndpoints.flag(name))
            return flag.enabled
        } catch {
            return nil
        }
    }

    private static func key(_ account: String) -> String {
        "pantopus.plans.flags.\(account)"
    }
}
