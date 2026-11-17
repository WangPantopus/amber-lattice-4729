//
//  BusinessAddressField.swift
//  Pantopus
//
//  The Location section's Address field with address suggestions under
//  it. A picked suggestion fills the address, city, state and ZIP through
//  the editor's usual field changes, and empties a saved suite when it is
//  another street's. Parity: Android `EditBusinessPageScreen` Location
//  section.
//

import SwiftUI

struct BusinessAddressField: View {
    let field: EditBusinessPageField
    let suite: EditBusinessPageField
    let state: BizFieldState
    let onFieldChange: @MainActor (EditBusinessPageFieldKey, String) -> Void
    @State private var suggestions = AddressSuggestions()
    private static let fieldId = "editBusinessPage.addressWithSuggestions"

    var body: some View {
        // The field sits low on the page: when suggestions appear it moves to the top of what the
        // keyboard leaves, with the first suggestions under it.
        ScrollViewReader { proxy in
            fieldAndList
                .id(Self.fieldId)
                .onChange(of: suggestions.suggestions.isEmpty) { _, empty in
                    guard !empty else { return }
                    withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(Self.fieldId, anchor: .top) }
                }
        }
        // Nearby first: the owner's own home's area (founder 2026-11-17).
        .task { if suggestions.near == nil { suggestions.near = await AddressSuggestions.anyHomePoint() } }
    }

    private var fieldAndList: some View {
        VStack(alignment: .leading, spacing: Spacing.s2) {
            BizField(
                label: "Address",
                required: true,
                field: field,
                state: state,
                trailing: .mapPin,
                identifier: "editBusinessPage.field.address"
            ) { value in
                onFieldChange(.address, value)
                suggestions.textChanged(value)
            }
            AddressSuggestionList(suggestions: suggestions, identifier: "editBusinessPage.addressSuggestion") { suggestion in
                Task {
                    guard let picked = await suggestions.choose(suggestion) else { return }
                    if let street = picked.address, !street.isEmpty {
                        onFieldChange(.address, street)
                        // A suite belongs to its building; one the owner typed stays.
                        if !suite.isDirty, !suite.current.isEmpty, !Self.sameStreet(street, field.original) {
                            onFieldChange(.suite, "")
                        }
                    }
                    if let city = picked.city, !city.isEmpty { onFieldChange(.city, city) }
                    if let state = picked.state, !state.isEmpty { onFieldChange(.state, state) }
                    if let zip = picked.zipcode, !zip.isEmpty { onFieldChange(.zip, zip) }
                }
            }
        }
    }

    /// "805 Broadway St." and "805  broadway st" are the same street line.
    private static func sameStreet(_ lhs: String, _ rhs: String) -> Bool {
        func folded(_ value: String) -> String {
            value.lowercased()
                .split { $0.isWhitespace || $0 == "." || $0 == "," }
                .joined(separator: " ")
        }
        return folded(lhs) == folded(rhs)
    }
}
