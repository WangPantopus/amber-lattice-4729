//
//  PlanChecksScreen.swift
//  Pantopus
//
//  Plans for the holidays, the business track B5 (07-screens C3, picture 14):
//  the business's guest list with money, opened from the totals on its plan.
//  Three totals, All / Not paid / Paid, a row a guest ("Pantopus" or "Yours",
//  then "Send a check", "Check sent · $52.00" / "Waiting" or "$38.40 · tip
//  $8.64" / "Paid"), the server's note and "Send a check". Tapping a paid
//  guest refunds all or a part. Read again every 5 seconds while open.
//

import SwiftUI

struct PlanChecksScreen: View {
    @State private var model: PlanChecksModel
    let onBack: () -> Void

    @State private var sending: PlanChecksRowDTO?
    @State private var picksGuest = false
    @State private var refunding: PlanChecksRowDTO?

    init(planId: String, onBack: @escaping () -> Void) {
        _model = State(initialValue: PlanChecksModel(planId: planId))
        self.onBack = onBack
    }

    var body: some View {
        VStack(spacing: 0) {
            PlanNavBar(title: model.title, leading: .back, onLeading: onBack)
            switch model.phase {
            case .loading:
                loading
            case let .error(message):
                errorState(message)
            case .loaded:
                if let list = model.list { content(list) }
            }
        }
        .background(Theme.Color.appBg)
        .toolbar(.hidden, for: .navigationBar)
        .hidesTabBar(true)
        .task { await model.watch() }
        .sheet(item: $sending) { row in
            PlanSendCheckSheet(row: row, dealOnBill: model.list?.dealOnBill == true) { amount, noDeal in
                await model.send(to: row, amount: amount, noDeal: noDeal)
            }
        }
        .sheet(item: $refunding) { row in
            PlanRefundCheckSheet(row: row) { amount in await model.refund(row, amount: amount) }
        }
        .confirmationDialog("Send a check to", isPresented: $picksGuest, titleVisibility: .visible) {
            ForEach(model.list?.rows ?? []) { row in
                Button(row.name) { sending = row }
            }
            Button("Cancel", role: .cancel) {}
        }
        .overlay(alignment: .bottom) { toastView }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planChecks")
    }

    private func content(_ list: PlanChecksListDTO) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                totals(list.totals)
                Picker("Show", selection: $model.filter) {
                    ForEach(PlanChecksModel.Filter.allCases) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("planChecksFilter")
                if model.rows.isEmpty {
                    Text(list.rows.isEmpty ? "Nobody is in yet." : "Nobody here yet.")
                        .planFont(.small)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .frame(maxWidth: .infinity, minHeight: 64)
                } else {
                    PlanCardBox(padding: 0) {
                        VStack(spacing: 0) {
                            ForEach(Array(model.rows.enumerated()), id: \.element.id) { index, row in
                                if index > 0 { Divider().overlay(Theme.Color.appBorder).padding(.leading, 64) }
                                PlanChecksRow(row: row, onSend: { sending = row }, onOpenPaid: { refunding = row })
                            }
                        }
                    }
                }
                if let note = list.noteText {
                    PlanScopeLine(text: note, icon: .info).accessibilityIdentifier("planChecksNote")
                }
            }
            .padding(.horizontal, Spacing.s4)
            .padding(.top, Spacing.s2)
            .padding(.bottom, Spacing.s6)
        }
        .refreshable { await model.load() }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button("Send a check") { picksGuest = true }
                .planButton(.primary)
                .disabled(list.rows.isEmpty)
                .accessibilityIdentifier("planSendCheck")
                .padding(.horizontal, Spacing.s4)
                .padding(.vertical, Spacing.s3)
                .background(Theme.Color.appSurface)
                .overlay(alignment: .top) { Divider().overlay(Theme.Color.appBorder) }
        }
    }

    /// C3 item 1: "14 guests in", "$126.24 paid so far", "$22.64 tips", each drawn large over its words.
    private func totals(_ totals: PlanChecksTotalsDTO) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Spacing.s2) { totalTiles(totals) }
            VStack(spacing: Spacing.s2) { totalTiles(totals) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planChecksTotals")
    }

    @ViewBuilder private func totalTiles(_ totals: PlanChecksTotalsDTO) -> some View {
        totalTile(totals.inText, identifier: "planChecksTotal.in")
        totalTile(totals.paidText, identifier: "planChecksTotal.paid")
        totalTile(totals.tipsText, identifier: "planChecksTotal.tips")
    }

    private func totalTile(_ text: String, identifier: String) -> some View {
        let parts = PlanChecksTotalsDTO.split(text)
        return VStack(alignment: .leading, spacing: 0) {
            Text(parts.big).planFont(.h3).monospacedDigit().foregroundStyle(Theme.Color.appText).fixedSize()
            Text(parts.small).planFont(.footnote).foregroundStyle(Theme.Color.appTextSecondary).fixedSize()
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous).fill(Theme.Color.appSurfaceSunken))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
        .accessibilityIdentifier(identifier)
    }

    private var loading: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            HStack(spacing: Spacing.s2) {
                ForEach(0..<3, id: \.self) { _ in Shimmer(width: 110, height: 64, cornerRadius: 14) }
            }
            ForEach(0..<4, id: \.self) { _ in Shimmer(width: nil, height: 56, cornerRadius: Radii.lg) }
            Spacer()
        }
        .padding(Spacing.s4)
        .accessibilityElement()
        .accessibilityLabel("Loading the guest list")
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: Spacing.s3) {
            Text("Couldn't load the guest list").planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
            Text(message).planFont(.small).foregroundStyle(Theme.Color.appTextSecondary).multilineTextAlignment(.center)
            Button("Try again") { Task { await model.load() } }
                .planButton(.secondary, size: .small)
                .frame(maxWidth: 200)
                .accessibilityIdentifier("planChecksRetry")
            Spacer()
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var toastView: some View {
        if let toast = model.toast {
            ToastView(message: ToastMessage(text: toast))
                .padding(.bottom, 96)
                .dismissToast(after: toast, minimum: 2.5) { model.toast = nil }
        }
    }
}

/// C3 item 3: a guest, who brought them, and their check's state.
struct PlanChecksRow: View {
    let row: PlanChecksRowDTO
    let onSend: () -> Void
    let onOpenPaid: () -> Void

    var body: some View {
        HStack(spacing: Spacing.s3) {
            Circle()
                .fill(Theme.Color.primary100)
                .frame(width: 40, height: 40)
                .overlay(Text(String(row.name.prefix(1))).planFont(.bodyStrong).foregroundStyle(Theme.Color.primary700))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: Spacing.s2) {
                    Text(row.name).planFont(.bodyStrong).foregroundStyle(Theme.Color.appText)
                    if let brought = row.broughtByText { broughtChip(brought) }
                }
                if let line = row.check?.text, row.state != "none" {
                    Text(line).planFont(.small).monospacedDigit().foregroundStyle(Theme.Color.appTextSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing
        }
        .padding(.horizontal, 14)
        .padding(.vertical, Spacing.s3)
        .contentShape(Rectangle())
        .onTapGesture { if row.state == "paid" { onOpenPaid() } }
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: row.state == "paid" ? "Refund" : "Send a check") {
            row.state == "paid" ? onOpenPaid() : onSend()
        }
        .accessibilityIdentifier("planChecksRow.\(row.requestId)")
    }

    @ViewBuilder private var trailing: some View {
        switch row.state {
        case "none":
            Button("Send a check", action: onSend)
                .planButton(.secondary, size: .small)
                .fixedSize()
                .accessibilityIdentifier("planSendCheckRow.\(row.requestId)")
        case "paid":
            stateChip(row.check?.stateText ?? "Paid", ok: true)
        default:
            stateChip(row.check?.stateText ?? "", ok: false)
        }
    }

    private func broughtChip(_ text: String) -> some View {
        Text(text)
            .planFont(.caption)
            .fontWeight(.semibold)
            .foregroundStyle(text == "Pantopus" ? Theme.Color.primaryInk : Theme.Color.appTextStrong)
            .padding(.horizontal, 8)
            .frame(minHeight: 22)
            .background(Capsule().fill(text == "Pantopus" ? Theme.Color.primary50 : Theme.Color.appSurfaceSunken))
    }

    private func stateChip(_ text: String, ok: Bool) -> some View {
        HStack(spacing: 4) {
            if ok { Icon(.check, size: 12, strokeWidth: 2.4, color: Theme.Color.success) }
            Text(text).planFont(.footnote).fontWeight(.semibold)
        }
        .foregroundStyle(ok ? Theme.Color.success : Theme.Color.appTextStrong)
        .padding(.horizontal, 10)
        .frame(minHeight: 26)
        .background(Capsule().fill(ok ? Theme.Color.successBg : Theme.Color.appSurfaceSunken))
        .fixedSize()
    }
}
