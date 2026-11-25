import SwiftUI

// Pop-up windows (sheets) in the club's style: a gradient header with the
// title and a close button, cards on the page colour, and the main action as
// a big button at the bottom.
struct BrandSheet<Content: View>: View {
    let title: String
    var subtitle: String?
    var primaryTitle: String?
    var primaryDisabled = false
    var isWorking = false
    var onPrimary: (() -> Void)?
    @ViewBuilder var content: () -> Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.title3.weight(.heavy))
                        .foregroundStyle(.white)
                    if let subtitle {
                        Text(subtitle)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Theme.accentSoft)
                    }
                }
                Spacer(minLength: 8)
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(.white.opacity(0.18)))
                }
                .accessibilityLabel("Zavřít")
            }
            .padding(.horizontal, 18)
            .padding(.top, 22)
            .padding(.bottom, 16)
            .background(Theme.gradient)

            ScrollView {
                VStack(spacing: 14) {
                    content()
                }
                .padding(16)
                .padding(.bottom, 8)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Theme.page.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let primaryTitle, let onPrimary {
                Button(action: onPrimary) {
                    if isWorking {
                        ProgressView().tint(.white)
                    } else {
                        Text(primaryTitle)
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(primaryDisabled || isWorking)
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 8)
                .background(Theme.page.opacity(0.96).ignoresSafeArea(edges: .bottom))
            }
        }
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(26)
    }
}

// A short note under a field or card.
struct FieldNote: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(Theme.inkMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
    }
}

// A choice from a few options as pills ("Seminář | Soustředění | Obsazeno").
struct ChoicePills: View {
    let options: [(String, String)]
    @Binding var selection: String

    var body: some View {
        HStack(spacing: 8) {
            ForEach(options, id: \.0) { option in
                let isSelected = option.0 == selection

                Button {
                    withAnimation(.snappy) { selection = option.0 }
                } label: {
                    Text(option.1)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(isSelected ? Color.white : Theme.ink)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(
                            Capsule().fill(isSelected ? AnyShapeStyle(Theme.gradient) : AnyShapeStyle(Theme.subtle))
                        )
                        .overlay(Capsule().stroke(isSelected ? Color.clear : Theme.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// A time from a list (quarter hours) in the field style.
struct TimeField: View {
    let label: String
    @Binding var selection: String
    var options: [String] = quarterHours

    var body: some View {
        FieldBox(label: label) {
            Menu {
                Picker(label, selection: $selection) {
                    ForEach(options, id: \.self) { Text($0).tag($0) }
                }
            } label: {
                HStack {
                    Text(selection)
                        .font(.body.weight(.semibold).monospacedDigit())
                        .foregroundStyle(Theme.ink)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Theme.inkSoft)
                }
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
            }
        }
    }
}

// A day in the field style (opens the calendar).
struct DateField: View {
    let label: String
    @Binding var date: Date
    var from: Date?

    var body: some View {
        FieldBox(label: label) {
            HStack {
                Image(systemName: "calendar").foregroundStyle(Theme.accent)
                Group {
                    if let from {
                        DatePicker(label, selection: $date, in: from..., displayedComponents: .date)
                    } else {
                        DatePicker(label, selection: $date, displayedComponents: .date)
                    }
                }
                .labelsHidden()
                .environment(\.locale, Dates.czech)
                .environment(\.timeZone, Dates.prague)
                Spacer()
            }
        }
    }
}

// An on/off setting with an explanation, as a card row.
struct ToggleCard: View {
    let title: String
    var detail: String?
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                if let detail {
                    Text(detail).font(.caption).foregroundStyle(Theme.inkMuted)
                }
            }
        }
        .tint(Theme.accent)
    }
}

// A multi-line text in the field style.
struct NoteField: View {
    let label: String
    var placeholder = ""
    @Binding var text: String

    var body: some View {
        FieldBox(label: label) {
            TextField(placeholder, text: $text, axis: .vertical)
                .lineLimit(2...5)
                .padding(.vertical, 12)
        }
    }
}

// A label and value line for read-only details in a card.
struct InfoLine: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(.subheadline).foregroundStyle(Theme.inkMuted)
            Spacer(minLength: 12)
            Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink).multilineTextAlignment(.trailing)
        }
    }
}

// A destructive action in a card ("Smazat účet").
struct DangerButton: View {
    let title: String
    var systemImage = "trash"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.busy.ink)
                .frame(maxWidth: .infinity, minHeight: 46)
                .background(Capsule().fill(Theme.busy.background))
        }
        .buttonStyle(.plain)
    }
}
