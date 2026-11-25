import SwiftUI

struct BookingDetailView: View {
    let booking: Booking
    let model: HallModel
    let canEdit: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var isConfirmingDelete = false
    @State private var isWorking = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        KindBar(color: Theme.color(for: booking))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(booking.title).font(.title3.weight(.bold))
                            Text(booking.kindLabel).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section {
                    LabeledContent("Den", value: Dates.dayTitle(booking.date))
                    LabeledContent("Čas", value: "\(booking.start)–\(booking.end)")
                    if let organizer = booking.organizer, !organizer.isEmpty, organizer != booking.title {
                        LabeledContent("Pořádá", value: organizer)
                    }
                    if let trainer = booking.trainer, !trainer.isEmpty {
                        LabeledContent("Trenér", value: trainer)
                    }
                    if booking.cleanupRequired == true {
                        LabeledContent("Úklid", value: booking.cleanedAt == nil ? "čeká na úklid" : "uklizeno")
                    }
                }

                if let note = booking.note, !note.isEmpty {
                    Section("Poznámka") {
                        Text(note)
                    }
                }

                if let error {
                    Section { ErrorBanner(text: error) }
                }

                if canEdit {
                    Section {
                        Button(role: .destructive) {
                            isConfirmingDelete = true
                        } label: {
                            Label(booking.isTraining ? "Zrušit tento trénink" : "Smazat akci", systemImage: "trash")
                        }
                        .disabled(isWorking)
                    } footer: {
                        Text("Další úpravy (čas, název, trenér) jsou zatím ve webové správě.")
                    }
                }
            }
            .navigationTitle("Detail")
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
        }
        .presentationDetents([.medium, .large])
    }

    private func delete() async {
        isWorking = true
        defer { isWorking = false }

        do {
            try await model.delete(booking)
            dismiss()
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

    // Every quarter of an hour from 6:00 to midnight.
    private static let times = stride(from: 6 * 60, through: 24 * 60 - 15, by: 15).map(Dates.time)

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
                        ForEach(Self.times, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Do", selection: $end) {
                        ForEach(Self.times, id: \.self) { Text($0).tag($0) }
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
