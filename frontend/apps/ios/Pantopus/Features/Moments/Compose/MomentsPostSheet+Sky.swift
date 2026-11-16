//
//  MomentsPostSheet+Sky.swift
//  Pantopus
//
//  The Post sheet's Sky rows (phase A, contract section 10.1), drawn only
//  while the place preview answers `sky: true`: "Pin it at a place" in place
//  of "Show the area instead", the blue note at home, "Show elevation" greyed
//  out at home, and "Share later" with its times. The words are `SkyWords`.
//

import SwiftUI

extension MomentsPostSheet {
    /// "Pin it at a place": off, "Pick a park, a shop or a venue nearby"; on, "Esther Short Park · Change" (the place
    /// picker); at home greyed out, "Not available at home".
    var pinRow: some View {
        let atHome = model.skyAtHome
        return Toggle(isOn: Binding(get: { model.pinsHere }, set: { model.setPinAtPlace($0) })) {
            VStack(alignment: .leading, spacing: 1) {
                Text(SkyWords.pinAtPlace)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(atHome ? Theme.Color.appTextMuted : Theme.Color.appText)
                if let name = model.skyPlaceName {
                    HStack(spacing: 0) {
                        Text("\(name) · ")
                            .font(.system(size: 12.5))
                            .foregroundStyle(Theme.Color.appTextSecondary)
                            .lineLimit(1)
                        Button(SkyWords.change) { model.findsPlace = true }
                            .font(.system(size: 12.5, weight: .semibold))
                            .foregroundStyle(Theme.Color.primaryTint)
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("moments.post.pin.change")
                    }
                } else {
                    Text(atHome ? SkyWords.pinNotAtHome : SkyWords.pinAtPlaceHint)
                        .font(.system(size: 12.5))
                        .foregroundStyle(atHome ? Theme.Color.appTextMuted : Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(Theme.Color.primarySolid)
        .disabled(atHome || model.sky?.canPin != true)
        .padding(.horizontal, Spacing.s1)
        .frame(minHeight: 52)
        .accessibilityIdentifier("moments.post.pin")
    }

    /// At home: "You're at home, so this shows only the area".
    var skyHomeNote: some View {
        HStack(alignment: .top, spacing: 10) {
            Icon(.info, size: 20, strokeWidth: 2.2, color: Theme.Color.info)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text(SkyWords.homeTitle)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(Theme.Color.info)
                Text(SkyWords.homeBody)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.appTextSecondary)
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.vertical, Spacing.s3)
        .padding(.horizontal, 14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.Color.infoBg))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.Color.infoLight, lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("moments.post.home")
    }

    /// "Show elevation" at home: greyed out, "Not shown at home".
    var greyHeightRow: some View {
        Toggle(isOn: .constant(false)) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Show elevation")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.Color.appTextMuted)
                Text(SkyWords.heightNotAtHome)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.Color.appTextMuted)
            }
        }
        .tint(Theme.Color.primarySolid)
        .disabled(true)
        .padding(.horizontal, Spacing.s1)
        .frame(minHeight: 52)
        .accessibilityIdentifier("moments.post.height")
    }

    /// "Share later": off, "Hold it until a time you pick"; on, "Shares at 6:40 pm" over the times on offer.
    var shareLaterRow: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            Toggle(isOn: Binding(get: { model.shareLaterChoice != nil }, set: { model.setShareLater($0) })) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(SkyWords.shareLater)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.Color.appText)
                    Text(model.sharesAt.map(SkyWords.sharesAt) ?? SkyWords.shareLaterHint)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .accessibilityIdentifier("moments.post.shareLater.when")
                }
            }
            .tint(Theme.Color.primarySolid)
            .frame(minHeight: 52)
            .accessibilityIdentifier("moments.post.shareLater")
            if model.shareLaterChoice != nil {
                shareLaterChoices
            }
        }
        .padding(.horizontal, Spacing.s1)
    }

    private var shareLaterChoices: some View {
        HStack(spacing: Spacing.s2) {
            ForEach(model.shareLaterChoices, id: \.key) { choice in
                let selected = model.shareLaterKey == choice.key
                Button { model.shareLaterKey = choice.key } label: {
                    Text(choice.label)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(selected ? Color.white : Theme.Color.appText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(selected ? Theme.Color.primarySolid : Color.clear))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(selected ? Theme.Color.primarySolid : Theme.Color.appBorder, lineWidth: 1)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("moments.post.shareLater.\(choice.key)")
            }
        }
    }
}
