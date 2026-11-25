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
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 8) {
                        Badge(text: booking.kindLabel, style: style)
                        Text(booking.title)
                            .font(.title2.weight(.heavy))
                            .foregroundStyle(style.ink)
                        Label("\(Dates.dayTitle(booking.date)) · \(booking.start)–\(booking.end)", systemImage: "clock")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(style.ink.opacity(0.85))
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(style.background))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(style.line, lineWidth: 1))

                    VStack(alignment: .leading, spacing: 12) {
                        if let organizer = booking.organizer, !organizer.isEmpty, organizer != booking.title {
                            DetailRow(icon: "person.2", label: "Pořádá", value: organizer)
                        }
                        if let trainer = booking.trainer, !trainer.isEmpty {
                            DetailRow(icon: "figure.dance", label: "Trenér", value: trainer)
                        }
                        if booking.cleanupRequired == true {
                            DetailRow(icon: "sparkles", label: "Úklid", value: booking.cleanedAt == nil ? "Čeká na úklid" : "Uklizeno")
                        }
                        if let note = booking.note, !note.isEmpty {
                            DetailRow(icon: "text.alignleft", label: "Poznámka", value: note)
                        }
                        if booking.isTraining {
                            DetailRow(icon: "repeat", label: "Pravidelný trénink", value: "Každý týden ve stejný čas")
                        }
                    }
                    .card()

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

                            Button(role: .destructive) {
                                isConfirmingDelete = true
                            } label: {
                                Label(booking.isTraining ? "Zrušit tento trénink" : "Smazat akci", systemImage: "trash")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Theme.busy.ink)
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .background(Capsule().fill(Theme.busy.background))
                            }
                            .disabled(isWorking)
                        }
                    }
                }
                .padding(16)
            }
            .pageBackground()
            .navigationTitle("Detail akce")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hotovo") { dismiss() }
                }
            }
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
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
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
        NavigationStack {
            VStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 8) {
                    Badge(text: "Trénink zrušen", style: Theme.closed)
                    Text(notice.title).font(.title2.weight(.heavy)).strikethrough()
                    Label("\(Dates.dayTitle(notice.date)) · \(notice.start)–\(notice.end)", systemImage: "clock")
                        .font(.subheadline.weight(.semibold))
                }
                .foregroundStyle(Theme.closed.ink)
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.closed.background))

                if let error {
                    ErrorBanner(text: error)
                }

                if canReinstate {
                    Button {
                        Task { await reinstate() }
                    } label: {
                        Label("Obnovit trénink", systemImage: "arrow.uturn.backward")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isWorking)
                }

                Spacer()
            }
            .padding(16)
            .pageBackground()
            .navigationTitle("Zrušený trénink")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hotovo") { dismiss() }
                }
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
        NavigationStack {
            Form {
                Section("Název") {
                    TextField("Název akce", text: $title)
                }
                Section("Čas") {
                    Picker("Od", selection: $start) {
                        ForEach(timeChoices(including: booking.start), id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Do", selection: $end) {
                        ForEach(timeChoices(including: booking.end), id: \.self) { Text($0).tag($0) }
                    }
                }
                if let error {
                    Section { ErrorBanner(text: error) }
                }
            }
            .navigationTitle("Upravit akci")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { Task { await save() } }
                        .disabled(isSaving || title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
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
        NavigationStack {
            Form {
                Section {
                    TextField("Název akce", text: $name)
                        .textInputAutocapitalization(.sentences)
                    Picker("Typ", selection: $eventType) {
                        ForEach(Self.eventTypes, id: \.0) { type in
                            Text(type.1).tag(type.0)
                        }
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    if eventType == "obsazeno" {
                        Text("Pravidelné tréninky v té době odpadnou.")
                    }
                }

                Section {
                    DatePicker("Den", selection: $day, displayedComponents: .date)
                        .environment(\.locale, Dates.czech)
                        .environment(\.timeZone, Dates.prague)
                    Picker("Od", selection: $start) {
                        ForEach(quarterHours, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Do", selection: $end) {
                        ForEach(quarterHours, id: \.self) { Text($0).tag($0) }
                    }
                }

                Section {
                    TextField("Poznámka", text: $note, axis: .vertical)
                        .lineLimit(2...5)
                    Toggle("Po akci je potřeba uklidit", isOn: $cleanup)
                }

                if let error {
                    Section { ErrorBanner(text: error) }
                }
            }
            .navigationTitle("Nová akce")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { Task { await save() } }
                        .disabled(isSaving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onChange(of: start) {
                if end <= start {
                    end = Dates.time(min(Dates.minutes(start) + 60, 24 * 60 - 15))
                }
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
