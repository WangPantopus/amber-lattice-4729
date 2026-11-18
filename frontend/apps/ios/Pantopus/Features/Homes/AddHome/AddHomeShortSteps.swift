//
//  AddHomeShortSteps.swift
//  Pantopus
//
//  Add Home in two steps (FASTVERIFY drawings 1 and 2, `home_short_add`):
//  "Find your home" with the checked address and its unit, then "How do you
//  live here?". The same wizard, view model and checks as the four steps;
//  only what the person sees and fills in is shorter.
//

import SwiftUI

/// The small green label above a two-step heading: "Your home", or the address on the second step.
struct AddHomeShortLabel: View {
    let text: String

    var body: some View {
        HStack(spacing: Spacing.s1) {
            Icon(.house, size: 13, strokeWidth: 2.25, color: Theme.Color.success)
                .accessibilityHidden(true)
            Text(text, style: .overline)
                .foregroundStyle(Theme.Color.success)
                .lineLimit(2)
        }
        .padding(.horizontal, Spacing.s3)
        .padding(.vertical, Spacing.s1)
        .background(Capsule().fill(Theme.Color.successBg))
        .accessibilityElement(children: .combine)
    }
}

/// The founder's line about the typed address, on "1 of 2" from the first keystroke to the checked address.
struct AddHomeShortPrivacyLine: View {
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.s2) {
            Icon(.lock, size: 14, color: Theme.Color.appTextSecondary)
                .accessibilityHidden(true)
            // The founder's line, verbatim (no closing period).
            Text("Only you see the address you type, others see your first name, never your address")
                .pantopusTextStyle(.caption)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("addHome_short_privacyLine")
    }
}

// MARK: - 1 of 2: the checked address

struct AddHomeShortFindStep: View {
    @Bindable var viewModel: AddHomeWizardViewModel
    @FocusState private var unitFocused: Bool

    var body: some View {
        AddHomeShortLabel(text: "Your home")
        HeadlineBlock("Find your home", subtitle: "Type your street address and pick it from the list.")
        VStack(alignment: .leading, spacing: Spacing.s3) {
            searchedAddress
            if let mismatch = viewModel.zipMismatch {
                ZipMismatchBanner(mismatch: mismatch) { viewModel.applyGeocodedZip() }
            } else if let address = viewModel.geocodedAddress, viewModel.isGeocodeResolved {
                checkedAddress(address)
            } else if viewModel.isCheckingAddress {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .accessibilityLabel("Checking the address")
            }
            AddHomeShortPrivacyLine()
        }
    }

    /// The picked address in the search box; a tap goes back to the search to change it.
    private var searchedAddress: some View {
        Button(action: viewModel.leadingTapped) {
            HStack(spacing: Spacing.s2) {
                Icon(.search, size: 18, color: Theme.Color.appTextSecondary)
                Text(viewModel.homeSearchQuery.isEmpty ? viewModel.form.address.street : viewModel.homeSearchQuery)
                    .font(Theme.Font.body)
                    .foregroundStyle(Theme.Color.appText)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Spacing.s3)
            .frame(minHeight: 48)
            .background(Theme.Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                    .stroke(Theme.Color.primary600, lineWidth: 1.5)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Search by address or nearby")
        .accessibilityValue(viewModel.homeSearchQuery)
        .accessibilityHint("Change the address")
        .accessibilityIdentifier("addHome_short_searchedAddress")
    }

    private func checkedAddress(_ address: AddHomeGeocodedAddress) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: Spacing.s2) {
                    checkedLabel
                    Spacer(minLength: 0)
                    if viewModel.uspsConfirmed { confirmedChip }
                }
                VStack(alignment: .leading, spacing: Spacing.s1) {
                    checkedLabel
                    if viewModel.uspsConfirmed { confirmedChip }
                }
            }
            Text(address.street)
                .scaledFont(18, weight: .semibold)
                .foregroundStyle(Theme.Color.appText)
                .fixedSize(horizontal: false, vertical: true)
            Text("\(address.city), \(address.state) \(address.zipCode)")
                .pantopusTextStyle(.body)
                .foregroundStyle(Theme.Color.appTextSecondary)
            if let notice = viewModel.postalNotice {
                AddHomePostalNoticeRow(notice: notice)
            }
            Text("Apartment or unit")
                .pantopusTextStyle(.small)
                .foregroundStyle(Theme.Color.appText)
                .padding(.top, Spacing.s2)
            TextField("Apartment or unit", text: $viewModel.shortUnitInput, prompt: Text("None for this home"))
                .font(Theme.Font.body)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .focused($unitFocused)
                .submitLabel(.done)
                .padding(.horizontal, Spacing.s3)
                .frame(minHeight: 48)
                .typesInFieldOnTap($unitFocused)
                .background(Theme.Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                        .stroke(Theme.Color.appBorder, lineWidth: 1)
                )
                .accessibilityIdentifier("addHome_short_unit")
            Text("Leave empty if your home has none.")
                .pantopusTextStyle(.caption)
                .foregroundStyle(Theme.Color.appTextSecondary)
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: Radii.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radii.lg, style: .continuous)
                .stroke(Theme.Color.appBorder, lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("addHome_short_checkedAddress")
    }

    private var checkedLabel: some View {
        Text("Checked address", style: .overline)
            .foregroundStyle(Theme.Color.appTextSecondary)
    }

    private var confirmedChip: some View {
        HStack(spacing: Spacing.s1) {
            Icon(.check, size: 12, strokeWidth: 2.5, color: Theme.Color.success)
            Text("Confirmed with USPS")
                .scaledFont(12, weight: .semibold)
                .foregroundStyle(Theme.Color.success)
        }
        .padding(.horizontal, Spacing.s2)
        .padding(.vertical, 3)
        .background(Capsule().fill(Theme.Color.successBg))
        // A label, not reading text: capped so it stays a chip beside the address at the largest sizes.
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("addHome_short_uspsConfirmed")
    }
}

// MARK: - 2 of 2: how you live here

struct AddHomeShortRoleStep: View {
    @Bindable var viewModel: AddHomeWizardViewModel

    var body: some View {
        AddHomeShortLabel(text: viewModel.form.address.street)
        HeadlineBlock("How do you live here?", subtitle: "Pick the one that fits. It sets which tools you get.")
        VStack(spacing: Spacing.s2) {
            ForEach(AddHomeRole.allCases, id: \.self) { role in
                row(role)
            }
        }
        HStack(alignment: .top, spacing: Spacing.s2) {
            Icon(.info, size: 16, color: Theme.Color.appTextSecondary)
                .accessibilityHidden(true)
            Text("We fill in your home's type, size and year built from the county record. Check them anytime in Place.")
                .pantopusTextStyle(.caption)
                .foregroundStyle(Theme.Color.appTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Spacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.appSurfaceSunken)
        .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("addHome_short_countyNote")
    }

    private func row(_ role: AddHomeRole) -> some View {
        let selected = viewModel.form.role == role
        return Button { viewModel.selectRole(role) } label: {
            HStack(alignment: .top, spacing: Spacing.s3) {
                ZStack {
                    Circle()
                        .stroke(selected ? Theme.Color.primary600 : Theme.Color.appBorder, lineWidth: 2)
                        .frame(width: 22, height: 22)
                    if selected {
                        Circle().fill(Theme.Color.primary600).frame(width: 12, height: 12)
                    }
                }
                .padding(.top, 1)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Self.title(role))
                        .scaledFont(16, weight: .semibold)
                        .foregroundStyle(Theme.Color.appText)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(Self.detail(role))
                        .pantopusTextStyle(.caption)
                        .foregroundStyle(Theme.Color.appTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(Spacing.s3)
            .background(selected ? Theme.Color.infoBg : Theme.Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: Radii.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radii.md, style: .continuous)
                    .stroke(selected ? Theme.Color.primary600 : Theme.Color.appBorder, lineWidth: selected ? 2 : 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("addHome_role_\(role.rawValue)")
    }

    static func title(_ role: AddHomeRole) -> String {
        switch role {
        case .owner: "I own it"
        case .tenant: "I rent it"
        case .householdMember: "I live here with family or friends"
        }
    }

    static func detail(_ role: AddHomeRole) -> String {
        switch role {
        case .owner: "You can confirm ownership with a document later."
        case .tenant: "The lease is in your name or a housemate's."
        case .householdMember: "Someone else owns or rents it."
        }
    }
}
