//
//  PlacePreviewCards.swift
//  Pantopus
//
//  LOOKUPORDER: the lookup's two new first-screen cards. "At a glance" lists
//  every check that has an answer, worst first, in the server's words; a tap
//  scrolls to the check's card. "Money here" shows the area's typical home
//  value and property tax and the county's price curve over the years: area
//  figures, never this home's. Both are drawn from the server's answer only.
//

import SwiftUI

// MARK: - The stand-out card and the dollar card (kept from Wedge v2 D1 and Wave 4)

extension PlacePreviewContent {
    /// "FEMA · OpenFEMA NFIP policies · census tract-level, not this home"
    ///
    /// Mirrors the web footer. Either half may be absent, so the parts are
    /// joined rather than formatted into a fixed template — an empty
    /// source must not leave a leading separator.
    func scopeFooter(_ lead: PlaceMoneyLead) -> String {
        var parts: [String] = []
        if !lead.source.isEmpty { parts.append(lead.source) }
        if !lead.scope.isEmpty { parts.append("\(lead.scope)-level, not this home") }
        return parts.joined(separator: " · ")
    }

    /// The lead figure. `detail` and `source` are the server's own words
    /// and are rendered whole: between them they say what the number is
    /// measured over and that it is a benchmark, not a quote. Dropping
    /// either turns an honest band into a claim about this home.
    func moneyLeadCard(_ lead: PlaceMoneyLead) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Theme.Color.homeBg)
                    Icon(.dollarSign, size: 19, strokeWidth: 2, color: Theme.Color.home)
                }
                .frame(width: 34, height: 34)
                Text(lead.headline)
                    .font(.system(size: 15, weight: .bold))
                    .lineSpacing(3)
                    .foregroundStyle(Theme.Color.appText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !lead.detail.isEmpty {
                Text(lead.detail)
                    .font(.system(size: 13))
                    .lineSpacing(2)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            // The scope disclosure, rendered STRUCTURALLY rather than
            // trusted to prose. Today every `kind` the server emits puts
            // the scope in `detail` too, so this is belt-and-braces — but
            // the whole point of the money lead is that a dollar figure
            // is the most believable thing on the page and the easiest to
            // read as being about THIS home. The day a lead ships whose
            // `detail` omits it, the figure would stand alone. Web has
            // shown this since Wave 4; both native clients decoded
            // `scope` and rendered neither.
            if !lead.source.isEmpty || !lead.scope.isEmpty {
                Text(scopeFooter(lead))
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(Theme.Color.appTextMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("place.preview.moneyLead.scope")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.s4)
        .placeCard()
        .accessibilityIdentifier("place.preview.moneyLead")
    }

    // MARK: - The aha card (Wedge v2 D1)

    func ahaChipTone(_ tone: PlacePreviewAhaTone) -> PlaceChipModel.Tone {
        switch tone {
        case .alert: .error
        case .watch: .warning
        case .info: .sky
        case .calm: .success
        }
    }

    func ahaIcon(_ tone: PlacePreviewAhaTone) -> PantopusIcon {
        switch tone {
        case .alert, .watch: .flame
        case .info: .mapPin
        case .calm: .sparkles
        }
    }

    /// Headline, grade, detail and follow-up are the server's own words,
    /// rendered whole — the card says what the rule picked, nothing more.
    func ahaCard(_ aha: PlacePreviewAha) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Theme.Color.homeBg)
                    Icon(ahaIcon(aha.tone), size: 19, strokeWidth: 2, color: Theme.Color.home)
                }
                .frame(width: 34, height: 34)
                PlaceChip(model: PlaceChipModel(tone: ahaChipTone(aha.tone), text: aha.grade.isEmpty ? "What stands out" : aha.grade))
                Spacer(minLength: 0)
            }
            Text(aha.headline)
                .font(.system(size: 17, weight: .bold))
                .lineSpacing(3)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
            if !aha.detail.isEmpty {
                Text(aha.detail)
                    .font(.system(size: 13.5))
                    .lineSpacing(2)
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !aha.followUp.isEmpty {
                Button(action: onAction) {
                    HStack(spacing: 4) {
                        Text(aha.followUp)
                            .font(.system(size: 13.5, weight: .semibold))
                            .multilineTextAlignment(.leading)
                        Icon(.chevronRight, size: 14, strokeWidth: 2.25, color: Theme.Color.primaryInk)
                    }
                    .foregroundStyle(Theme.Color.primaryInk)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("place.preview.aha.followUp")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.s4)
        .placeCard()
        .padding(.top, 14)
        .accessibilityIdentifier("place.preview.aha")
    }
}

// MARK: - At a glance

struct PlacePreviewGlanceCard: View {
    let rows: [PlacePreviewGlanceRow]
    var onTap: (PlacePreviewGlanceRow) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlaceGroupLabel(text: "At a glance")
                .padding(.bottom, 6)
            ForEach(rows) { row in
                Button { onTap(row) } label: { rowView(row) }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(row.label): \(row.value)")
                    .accessibilityIdentifier("place.preview.glance.\(row.id)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Spacing.s4)
        .padding(.vertical, 14)
        .placeCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("place.preview.glance")
    }

    private func rowView(_ row: PlacePreviewGlanceRow) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Circle()
                .fill(Self.dot(row.tone))
                .frame(width: 8, height: 8)
                .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 1 }
            Text(row.label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.appText)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(row.value)
                .font(.system(size: 13.5))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
                .layoutPriority(1)
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
        .contentShape(Rectangle())
    }

    /// The stand-out card's four tones, as the chips draw them.
    static func dot(_ tone: PlacePreviewAhaTone) -> Color {
        switch tone {
        case .alert: Theme.Color.error
        case .watch: Theme.Color.warning
        case .calm: Theme.Color.success
        case .info: Theme.Color.primary600
        }
    }
}

// MARK: - Money here

struct PlacePreviewMoneyCard: View {
    let money: PlacePreviewMoney
    /// The record line does what "See this home's full record" does; without a record page it is not drawn.
    var onOpenRecord: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlaceGroupLabel(text: "Money here")
                .padding(.bottom, 10)
            figures
            if let trend = money.trend, trend.hasCurve {
                curve(trend)
                    .padding(.top, 14)
            }
            Text(sources)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(Theme.Color.appTextMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)
                .accessibilityIdentifier("place.preview.money.sources")
            Text("Area figures, not this home.")
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundStyle(Theme.Color.appTextSecondary)
                .padding(.top, 2)
                .accessibilityIdentifier("place.preview.money.scope")
            if let line = money.recordLine, !line.isEmpty, let onOpenRecord {
                Button(action: onOpenRecord) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(line)
                            .font(.system(size: 13.5, weight: .semibold))
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Icon(.chevronRight, size: 14, strokeWidth: 2.25, color: Theme.Color.primaryInk)
                    }
                    .foregroundStyle(Theme.Color.primaryInk)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, 10)
                .accessibilityIdentifier("place.preview.money.record")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.s4)
        .placeCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("place.preview.money")
    }

    /// The value and the tax side by side, or the one that is held alone.
    private var figures: some View {
        HStack(alignment: .top, spacing: 12) {
            if let value = money.value { figure(value, id: "value") }
            if let tax = money.tax { figure(tax, id: "tax") }
        }
    }

    private func figure(_ figure: PlacePreviewMoney.Figure, id: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(Self.dollars(figure.amount))
                .font(.system(size: 23, weight: .bold))
                .kerning(-0.3)
                .foregroundStyle(Theme.Color.appText)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(figure.label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Color.appTextMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("place.preview.money.\(id)")
    }

    private func curve(_ trend: PlacePreviewMoney.Trend) -> some View {
        let since = Self.sinceLabel(trend)
        let last = Self.lastLabel(trend)
        return VStack(alignment: .leading, spacing: 4) {
            PriceCurve(points: trend.changeSinceFirstPct)
                .frame(height: 64)
                .accessibilityLabel([Self.curveCaption(trend), since, last].compactMap(\.self).joined(separator: ", "))
                .accessibilityIdentifier("place.preview.money.curve")
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let first = trend.sinceYear ?? trend.years.first {
                    Text(String(first))
                        .foregroundStyle(Theme.Color.appTextMuted)
                }
                Spacer(minLength: 0)
                (Text(since ?? "").fontWeight(.semibold).foregroundColor(Theme.Color.appText)
                    + Text(since != nil && last != nil ? " · " : "")
                    + Text(last ?? ""))
                    .foregroundStyle(Theme.Color.appTextMuted)
                    .multilineTextAlignment(.trailing)
            }
            .font(.system(size: 12))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("place.preview.money.change")
        }
    }

    /// "Home prices across Clark County, FHFA price index · U.S. Census · American Community Survey".
    private var sources: String {
        var parts: [String] = []
        if let trend = money.trend, trend.hasCurve { parts.append(Self.curveCaption(trend)) }
        let sources = [money.value?.source, money.tax?.source].compactMap(\.self)
        for source in sources where !source.isEmpty && !parts.contains(source) {
            parts.append(source)
        }
        return parts.joined(separator: " · ")
    }

    // MARK: Words (LOOKUPORDER WORDS.md, "The money card")

    /// "Home prices across Clark County, FHFA price index", or "across ZIP 98607" where the last figure is the ZIP's.
    static func curveCaption(_ trend: PlacePreviewMoney.Trend) -> String {
        guard var area = trend.areaName, !area.isEmpty else { return "Home prices, FHFA price index" }
        if trend.scope == "zip", !area.hasPrefix("ZIP") { area = "ZIP \(area)" }
        return "Home prices across \(area), FHFA price index"
    }

    /// "+148% since 2011".
    static func sinceLabel(_ trend: PlacePreviewMoney.Trend) -> String? {
        guard let pct = trend.sinceChangePct ?? trend.changeSinceFirstPct.last,
              let year = trend.sinceYear ?? trend.years.first else { return nil }
        return "\(signed(pct, digits: 0))% since \(year)"
    }

    /// "+3.1% in 2025"; a fall reads "−2.0% in 2025".
    static func lastLabel(_ trend: PlacePreviewMoney.Trend) -> String? {
        guard let pct = trend.lastChangePct, let year = trend.year ?? trend.years.last else { return nil }
        return "\(signed(pct, digits: 1))% in \(year)"
    }

    private static func signed(_ value: Double, digits: Int) -> String {
        let text = String(format: "%.\(digits)f", abs(value))
        if Double(text) == 0 { return text }
        return (value < 0 ? "\u{2212}" : "+") + text
    }

    static func dollars(_ amount: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.locale = Locale(identifier: "en_US")
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: amount.rounded())) ?? "$\(Int(amount.rounded()))"
    }
}

/// The price curve: a drawn line over a baseline, ending in a dot. No chart library.
private struct PriceCurve: View {
    let points: [Double]

    var body: some View {
        Canvas { context, size in
            guard points.count >= 2, let low = points.min(), let high = points.max() else { return }
            let inset: CGFloat = 5
            let span = max(high - low, 0.0001)
            let width = size.width - inset * 2
            let height = size.height - inset * 2
            let step = width / CGFloat(points.count - 1)
            let place = { (index: Int, value: Double) -> CGPoint in
                CGPoint(x: inset + CGFloat(index) * step, y: inset + height * CGFloat(1 - (value - low) / span))
            }
            var baseline = Path()
            baseline.move(to: CGPoint(x: 0, y: size.height - 1))
            baseline.addLine(to: CGPoint(x: size.width, y: size.height - 1))
            context.stroke(baseline, with: .color(Theme.Color.appBorder), lineWidth: 1)
            var line = Path()
            for (index, value) in points.enumerated() {
                let point = place(index, value)
                if index == 0 { line.move(to: point) } else { line.addLine(to: point) }
            }
            context.stroke(
                line,
                with: .color(Theme.Color.primary600),
                style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round)
            )
            let end = place(points.count - 1, points[points.count - 1])
            context.fill(Path(ellipseIn: CGRect(x: end.x - 4, y: end.y - 4, width: 8, height: 8)), with: .color(Theme.Color.primary600))
        }
    }
}
