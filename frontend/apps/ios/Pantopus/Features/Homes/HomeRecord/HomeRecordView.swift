//
//  HomeRecordView.swift
//  Pantopus
//
//  "This home's record" (a looked-up address) and "Your home's record" (a
//  Home): one page the server draws as blocks. The page draws every block kind
//  of contract v1 in the server's order and skips a kind it does not know.
//

import SwiftUI

struct HomeRecordView: View {
    @State private var viewModel: HomeRecordViewModel
    private let onBack: (() -> Void)?
    /// An app link from the page (a button or action whose url starts with
    /// `/`). The host opens the app's own screen for it.
    private let onOpenAppLink: (String) -> Void
    @Environment(\.openURL) private var openURL

    init(
        source: HomeRecordSource,
        onBack: (() -> Void)? = nil,
        onOpenAppLink: @escaping (String) -> Void
    ) {
        _viewModel = State(initialValue: HomeRecordViewModel(source: source))
        self.onBack = onBack
        self.onOpenAppLink = onOpenAppLink
    }

    #if DEBUG
    /// Previews: a page already drawn from a sample.
    init(previewing record: HomeRecord, source: HomeRecordSource) {
        let model = HomeRecordViewModel(source: source)
        model.showForPreview(record)
        _viewModel = State(initialValue: model)
        onBack = {}
        onOpenAppLink = { _ in }
    }
    #endif

    var body: some View {
        ContentDetailShell(
            title: viewModel.source.title,
            onBack: onBack,
            onRefresh: refreshAction,
            header: { header },
            body: { content }
        )
        .offlineBanner(isOffline: !NetworkMonitor.shared.isOnline)
        .refreshFailureToast($viewModel.refreshFailureMessage)
        .task { await viewModel.load() }
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("homeRecord")
    }

    /// Pull to refresh only once the page is there.
    private var refreshAction: (@Sendable () async -> Void)? {
        guard case .loaded = viewModel.state else { return nil }
        let model = viewModel
        return { await model.refresh() }
    }

    @ViewBuilder private var header: some View {
        switch viewModel.state {
        case let .loaded(record):
            HomeRecordHeaderView(header: record.header, state: record.state)
                .padding(.horizontal, Spacing.s4)
        case .loading:
            HomeRecordSkeleton.header
                .padding(.horizontal, Spacing.s4)
        case .error:
            EmptyView()
        }
    }

    @ViewBuilder private var content: some View {
        switch viewModel.state {
        case let .loaded(record):
            HomeRecordBlocksView(record: record, onOpen: open)
                .padding(.horizontal, Spacing.s4)
        case .loading:
            HomeRecordSkeleton.body
                .padding(.horizontal, Spacing.s4)
        case let .error(headline, message):
            ErrorState(headline: headline, message: message) { await viewModel.refresh() }
                .padding(.top, Spacing.s10)
                .accessibilityIdentifier("homeRecord.error")
        }
    }

    /// An app link opens the app's own screen; an https page opens the web.
    private func open(_ raw: String) {
        let link = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if link.hasPrefix("/"), !link.hasPrefix("//") {
            onOpenAppLink(link)
        } else if let url = ExternalLink.webURL(link), url.scheme?.lowercased() == "https" {
            openURL(url)
        }
    }
}

// MARK: - Header

struct HomeRecordHeaderView: View {
    let header: HomeRecordHeader
    let state: HomeRecordState

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            if let chip = header.chip {
                PlaceChip(model: PlaceChipModel(
                    tone: chip.tone.placeTone,
                    text: chip.text,
                    icon: state == .owner ? .shieldCheck : .check
                ))
            }
            Text(header.title)
                .font(.system(size: 28, weight: .bold))
                .kerning(-0.56)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("homeRecord.title")
            if let subtitle = header.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.Color.appTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.top, Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension HomeRecordTone {
    var placeTone: PlaceChipModel.Tone {
        switch self {
        case .success: .success
        case .warning: .warning
        case .neutral: .neutral
        }
    }
}

// MARK: - Loading, in the page's shape

@MainActor
enum HomeRecordSkeleton {
    static var header: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Shimmer(width: 190, height: 24, cornerRadius: Radii.pill)
            Shimmer(width: 220, height: 30)
            Shimmer(width: 150, height: 18)
        }
        .padding(.top, Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement()
        .accessibilityLabel("Loading the record")
        .accessibilityIdentifier("homeRecord.loading")
    }

    static var body: some View {
        VStack(spacing: Spacing.s3) {
            VStack(spacing: Spacing.s3) {
                Shimmer(height: 42, cornerRadius: Radii.lg)
                Shimmer(height: 230, cornerRadius: Radii.lg)
                Shimmer(height: 14)
            }
            .padding(Spacing.s3)
            .homeRecordCard()
            VStack(alignment: .leading, spacing: Spacing.s3) {
                HStack(spacing: Spacing.s2) {
                    ForEach(0..<3, id: \.self) { _ in Shimmer(height: 66, cornerRadius: Radii.lg) }
                }
                Shimmer(height: 18)
                Shimmer(width: 220, height: 14)
            }
            .padding(Spacing.s4)
            .homeRecordCard()
            VStack(alignment: .leading, spacing: 18) {
                ForEach(0..<5, id: \.self) { _ in Shimmer(height: 18) }
            }
            .padding(Spacing.s4)
            .homeRecordCard()
            .padding(.top, Spacing.s3)
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Card surface

extension View {
    /// The record's card: white, a 1-point border, 20-point corners and a soft shadow.
    func homeRecordCard() -> some View {
        frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radii.xl2, style: .continuous)
                    .strokeBorder(Theme.Color.appBorder, lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.04), radius: 3, x: 0, y: 1)
    }
}

#if DEBUG
#Preview("Lookup") {
    if let record = HomeRecordFixtures.record(.lookup) {
        HomeRecordView(previewing: record, source: .lookup(address: "1 Pantopus Way"))
    }
}

#Preview("Owner") {
    if let record = HomeRecordFixtures.record(.owner) {
        HomeRecordView(previewing: record, source: .home(homeId: "sample"))
    }
}
#endif
