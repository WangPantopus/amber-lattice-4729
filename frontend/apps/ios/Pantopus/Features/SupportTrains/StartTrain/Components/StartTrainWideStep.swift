//
//  StartTrainWideStep.swift
//  Pantopus
//
//  The Start-a-train wizard's steps on an iPad (founder, 2026-11-23: "the greatest iPad view ever"; "left side and
//  right side of the screen are not used, waste area"). Where the window holds a comfortable form column beside a
//  phone-wide one, the step's form keeps a readable width and the train's page, as helpers will open it, fills in
//  beside it (`StartTrainPreviewPanel`). The two sit together in the middle of the window. A narrow iPad window and
//  the accessibility text sizes keep the step alone, full width, as a phone shows it. The form is the same view
//  either way, so resizing the window keeps what is typed and focused.
//

import SwiftUI

/// The step's form beside the preview where both fit; else the form alone. `showsPreview` false (the launched step)
/// keeps a comfortable width in the middle instead.
struct StartTrainWideStep<FormContent: View, PreviewContent: View>: View {
    let showsPreview: Bool
    @ViewBuilder let form: () -> FormContent
    @ViewBuilder let preview: () -> PreviewContent

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var width: CGFloat = 0

    var body: some View {
        let wide = !dynamicTypeSize.isAccessibilitySize && width >= StartTrainSplitLayout.minimumWidth
        StartTrainSplitLayout(wide: wide) {
            // The shell's own spacing between the step and its error line.
            VStack(alignment: .leading, spacing: Spacing.s5) {
                form()
            }
            if wide, showsPreview {
                preview()
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    }
}

/// Places the form (the first view) and, when there is one, the preview (the second) side by side in the middle of
/// the room; with `wide` false, the form across the whole width.
struct StartTrainSplitLayout: Layout {
    /// The form's narrowest and widest: a phone's width to a comfortable line of fields.
    static let formRange: ClosedRange<CGFloat> = 400...660
    /// The preview's narrowest and widest: it holds the train page's 7-day calendar card.
    static let previewRange: ClosedRange<CGFloat> = 360...440
    /// The launched step's widest, centered.
    static let soloWidth: CGFloat = 560

    /// The narrowest room that holds both.
    static var minimumWidth: CGFloat {
        formRange.lowerBound + Spacing.s6 + previewRange.lowerBound
    }

    var wide: Bool

    /// Where the form and the preview go in a row this wide.
    struct Columns: Equatable {
        let formX: CGFloat
        let formWidth: CGFloat
        let previewX: CGFloat
        let previewWidth: CGFloat
    }

    static func columns(in width: CGFloat) -> Columns {
        let gap = width >= 1000 ? Spacing.s8 : Spacing.s6
        let preview = min(max((width * 0.36).rounded(.down), previewRange.lowerBound), previewRange.upperBound)
        let form = max(formRange.lowerBound, min(formRange.upperBound, width - gap - preview))
        let x = max(0, ((width - form - gap - preview) / 2).rounded(.down))
        return Columns(formX: x, formWidth: form, previewX: x + form + gap, previewWidth: preview)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
        guard let form = subviews.first else { return .zero }
        guard let width = proposal.width else { return form.sizeThatFits(proposal) }
        guard wide else {
            return CGSize(width: width, height: form.sizeThatFits(ProposedViewSize(width: width, height: nil)).height)
        }
        guard subviews.count > 1 else {
            let solo = min(width, Self.soloWidth)
            return CGSize(width: width, height: form.sizeThatFits(ProposedViewSize(width: solo, height: nil)).height)
        }
        let columns = Self.columns(in: width)
        let formHeight = form.sizeThatFits(ProposedViewSize(width: columns.formWidth, height: nil)).height
        let previewHeight = subviews[1].sizeThatFits(ProposedViewSize(width: columns.previewWidth, height: nil)).height
        return CGSize(width: width, height: max(formHeight, previewHeight))
    }

    func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
        guard let form = subviews.first else { return }
        guard wide else {
            form.place(
                at: bounds.origin,
                anchor: .topLeading,
                proposal: ProposedViewSize(width: bounds.width, height: nil)
            )
            return
        }
        guard subviews.count > 1 else {
            let solo = min(bounds.width, Self.soloWidth)
            form.place(
                at: CGPoint(x: bounds.minX + ((bounds.width - solo) / 2).rounded(.down), y: bounds.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: solo, height: nil)
            )
            return
        }
        let columns = Self.columns(in: bounds.width)
        form.place(
            at: CGPoint(x: bounds.minX + columns.formX, y: bounds.minY),
            anchor: .topLeading,
            proposal: ProposedViewSize(width: columns.formWidth, height: nil)
        )
        subviews[1].place(
            at: CGPoint(x: bounds.minX + columns.previewX, y: bounds.minY),
            anchor: .topLeading,
            proposal: ProposedViewSize(width: columns.previewWidth, height: nil)
        )
    }
}
