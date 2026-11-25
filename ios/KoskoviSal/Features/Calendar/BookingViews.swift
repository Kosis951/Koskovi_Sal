import SwiftUI

// Every quarter of an hour from 6:00 to 23:45.
let quarterHours = stride(from: 6 * 60, through: 24 * 60 - 15, by: 15).map(Dates.time)

struct BookingDetailView: View {
    let booking: Booking
    let model: HallModel
    let canEdit: Bool
    let onNotice: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var isConfirmingDelete = false
    @State private var isEditing = false
    @State private var isWorking = false
    @State private var error: String?

    private var style: KindStyle { Theme.style(for: booking) }

    private var hasEnded: Bool {
        booking.date < Dates.todayKey() || (booking.date == Dates.todayKey() && booking.end <= Dates.nowTime())
    }

    var body: some View {
        BrandSheet(title: booking.title, subtitle: booking.kindLabel) {
            VStack(alignment: .leading, spacing: 8) {
                Badge(text: booking.kindLabel, style: style)
                Text("\(booking.start)–\(booking.end)")
                    .font(.largeTitle.weight(.heavy).monospacedDigit())
                Text(Dates.dayTitle(booking.date).capitalized(with: Dates.czech))
                    .font(.subheadline.weight(.semibold))
                    .opacity(0.85)
            }
            .foregroundStyle(style.ink)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(style.background))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(style.line, lineWidth: 1))

            let rows = detailRows

            if !rows.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(rows) { row in
                        DetailRow(icon: row.icon, label: row.label, value: row.value)
                    }
                }
                .card()
            }

            if let error {
                ErrorBanner(text: error)
            }

            if booking.waitsForCleanup && hasEnded {
                Button {
                    Task { await clean() }
                } label: {
                    Label("Uklidil jsem sál", systemImage: "checkmark")
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isWorking)
            }

            if canEdit {
                VStack(spacing: 10) {
                    if !booking.isTraining {
                        Button {
                            isEditing = true
                        } label: {
                            Label("Upravit název a čas", systemImage: "pencil")
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }

                    DangerButton(title: booking.isTraining ? "Zrušit tento trénink" : "Smazat akci") {
                        isConfirmingDelete = true
                    }
                    .disabled(isWorking)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .confirmationDialog(
            booking.isTraining ? "Zrušit trénink \(booking.title)?" : "Smazat \(booking.title)?",
            isPresented: $isConfirmingDelete,
            titleVisibility: .visible
        ) {
            Button(booking.isTraining ? "Zrušit trénink" : "Smazat", role: .destructive) {
                Task { await delete() }
            }
        }
        .sheet(isPresented: $isEditing) {
            EditBookingView(booking: booking, model: model) {
                onNotice("Akce je upravená.")
                dismiss()
            }
        }
    }

    private var detailRows: [InfoRow] {
        var rows: [InfoRow] = []

        if let organizer = booking.organizer, !organizer.isEmpty, organizer != booking.title {
            rows.append(InfoRow(icon: "person.2", label: "Pořádá", value: organizer))
        }
        if let trainer = booking.trainer, !trainer.isEmpty {
            rows.append(InfoRow(icon: "figure.dance", label: "Trenér", value: trainer))
        }
        if booking.cleanupRequired == true {
            rows.append(InfoRow(icon: "sparkles", label: "Úklid", value: booking.cleanedAt == nil ? "Čeká na úklid" : "Uklizeno"))
        }
        if let note = booking.note, !note.isEmpty {
            rows.append(InfoRow(icon: "text.alignleft", label: "Poznámka", value: note))
        }
        if booking.isTraining {
            rows.append(InfoRow(icon: "repeat", label: "Pravidelný trénink", value: "Každý týden ve stejný čas"))
        }

        return rows
    }

    private func delete() async {
        isWorking = true
        defer { isWorking = false }

        do {
            try await model.delete(booking)
            onNotice(booking.isTraining ? "Trénink je zrušený." : "Akce je smazaná.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func clean() async {
        isWorking = true
        defer { isWorking = false }

        do {
            let message = try await model.markCleaned(booking)
            onNotice(message)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// One line of a detail card.
struct InfoRow: Identifiable {
    let icon: String
    let label: String
    let value: String

    var id: String { label }
}

struct DetailRow: View {
    let icon: String
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(Theme.accent)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption.weight(.semibold)).foregroundStyle(Theme.inkMuted)
                Text(value).font(.body).foregroundStyle(Theme.ink)
            }
            Spacer(minLength: 0)
        }
    }
}

// A cancelled regular training; hall managers can bring it back.
struct CancellationDetailView: View {
    let notice: CancellationNotice
    let model: HallModel
    let canReinstate: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var isWorking = false
    @State private var error: String?

    var body: some View {
        BrandSheet(
            title: notice.title,
            subtitle: "Trénink zrušen",
            primaryTitle: canReinstate ? "Obnovit trénink" : nil,
            isWorking: isWorking,
            onPrimary: { Task { await reinstate() } }
        ) {
            VStack(alignment: .leading, spacing: 8) {
                Badge(text: "Zrušeno", style: Theme.closed)
                Text("\(notice.start)–\(notice.end)")
                    .font(.largeTitle.weight(.heavy).monospacedDigit())
                    .strikethrough()
                Text(Dates.dayTitle(notice.date).capitalized(with: Dates.czech))
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(Theme.closed.ink)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.closed.background))

            if let error {
                ErrorBanner(text: error)
            }
        }
        .presentationDetents([.medium])
    }

    private func reinstate() async {
        isWorking = true
        defer { isWorking = false }

        do {
            try await model.reinstate(notice)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct EditBookingView: View {
    let booking: Booking
    let model: HallModel
    let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var start: String
    @State private var end: String
    @State private var isSaving = false
    @State private var error: String?

    init(booking: Booking, model: HallModel, onSaved: @escaping () -> Void) {
        self.booking = booking
        self.model = model
        self.onSaved = onSaved
        _title = State(initialValue: booking.title)
        _start = State(initialValue: booking.start)
        _end = State(initialValue: booking.end)
    }

    var body: some View {
        BrandSheet(
            title: "Upravit akci",
            subtitle: Dates.dayTitle(booking.date),
            primaryTitle: "Uložit",
            primaryDisabled: title.trimmingCharacters(in: .whitespaces).isEmpty,
            isWorking: isSaving,
            onPrimary: { Task { await save() } }
        ) {
            VStack(spacing: 14) {
                FieldBox(label: "Název") {
                    TextField("Název akce", text: $title)
                }
                HStack(spacing: 12) {
                    TimeField(label: "Od", selection: $start, options: timeChoices(including: booking.start))
                    TimeField(label: "Do", selection: $end, options: timeChoices(including: booking.end))
                }
            }
            .card()

            if let error {
                ErrorBanner(text: error)
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func timeChoices(including time: String) -> [String] {
        quarterHours.contains(time) ? quarterHours : (quarterHours + [time]).sorted()
    }

    private func save() async {
        guard start < end else {
            error = "Konec musí být později než začátek."
            return
        }

        isSaving = true
        defer { isSaving = false }

        do {
            let newTitle = title.trimmingCharacters(in: .whitespaces)

            if newTitle != booking.title {
                try await model.rename(booking, to: newTitle)
            }
            if start != booking.start || end != booking.end {
                try await model.move(booking, start: start, end: end)
            }
            dismiss()
            onSaved()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct AddBookingView: View {
    let model: HallModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var eventType = "seminar"
    @State private var day: Date
    @State private var start = "17:00"
    @State private var end = "18:00"
    @State private var note = ""
    @State private var cleanup = false
    @State private var isSaving = false
    @State private var error: String?

    private static let eventTypes = [
        ("seminar", "Seminář"),
        ("soustredeni", "Soustředění"),
        ("obsazeno", "Obsazeno"),
    ]

    init(model: HallModel, date: String) {
        self.model = model
        _day = State(initialValue: Dates.date(date) ?? Date())
    }

    var body: some View {
        BrandSheet(
            title: "Nová akce",
            subtitle: "Obsazenost sálu",
            primaryTitle: "Přidat akci",
            primaryDisabled: name.trimmingCharacters(in: .whitespaces).isEmpty,
            isWorking: isSaving,
            onPrimary: { Task { await save() } }
        ) {
            VStack(spacing: 14) {
                FieldBox(label: "Název akce") {
                    TextField("např. Seminář LAT", text: $name)
                        .textInputAutocapitalization(.sentences)
                }
                ChoicePills(options: Self.eventTypes, selection: $eventType)
                if eventType == "obsazeno" {
                    FieldNote(text: "Pravidelné tréninky v té době odpadnou.")
                }
            }
            .card()

            VStack(spacing: 14) {
                DateField(label: "Den", date: $day)
                HStack(spacing: 12) {
                    TimeField(label: "Od", selection: $start)
                    TimeField(label: "Do", selection: $end)
                }
            }
            .card()

            VStack(spacing: 14) {
                NoteField(label: "Poznámka", placeholder: "nepovinné", text: $note)
                ToggleCard(title: "Po akci je potřeba uklidit", detail: "Sál se ukáže jako „čeká na úklid“.", isOn: $cleanup)
            }
            .card()

            if let error {
                ErrorBanner(text: error)
            }
        }
        .onChange(of: start) {
            if end <= start {
                end = Dates.time(min(Dates.minutes(start) + 60, 24 * 60 - 15))
            }
        }
    }

    private func save() async {
        guard start < end else {
            error = "Konec musí být později než začátek."
            return
        }

        isSaving = true
        defer { isSaving = false }

        do {
            try await model.addBooking(
                name: name.trimmingCharacters(in: .whitespaces),
                date: Dates.key(day),
                start: start,
                end: end,
                eventType: eventType,
                note: note.trimmingCharacters(in: .whitespacesAndNewlines),
                cleanup: cleanup
            )
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
