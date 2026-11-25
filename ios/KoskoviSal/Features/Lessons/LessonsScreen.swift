import SwiftUI

struct LessonsScreen: View {
    @Environment(SessionModel.self) private var session
    @State private var trainers: [TrainerInfo] = []
    @State private var selected: String?
    @State private var calendar: TrainerCalendar?
    @State private var isLoading = false
    @State private var error: String?
    @State private var notice: String?
    @State private var requestSlot: LessonSlot?
    @AppStorage("lessons.trainer") private var lastTrainer = ""

    var body: some View {
        NavigationStack {
            Group {
                if !session.isSignedIn {
                    ContentUnavailableView {
                        Label("Lekce u trenérů", systemImage: "figure.dance")
                    } description: {
                        Text("Pro objednání lekce se přihlas v záložce Účet. Účet získáš přes pozvánku od trenéra.")
                    }
                } else if trainers.isEmpty && !isLoading {
                    ContentUnavailableView(
                        "Žádný trenér",
                        systemImage: "person.2.slash",
                        description: Text(error ?? "Zatím tu žádný trenér nemá kalendář lekcí.")
                    )
                } else {
                    content
                }
            }
            .navigationTitle(calendar?.trainerName ?? "Lekce")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if trainers.count > 1 {
                        Menu {
                            Picker("Trenér", selection: Binding(get: { selected ?? "" }, set: { choose($0) })) {
                                ForEach(trainers) { Text($0.name).tag($0.trainer) }
                            }
                        } label: {
                            Label("Trenér", systemImage: "person.2")
                        }
                    }
                }
            }
            .task(id: session.isSignedIn) { await loadTrainers() }
            .refreshable { await loadCalendar() }
            .sheet(item: $requestSlot) { slot in
                LessonRequestView(slot: slot, calendar: calendar, partner: calendar?.viewerPartner ?? "") { message in
                    notice = message
                    Task { await loadCalendar() }
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        List {
            if let notice {
                Section { Label(notice, systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
            }
            if let error {
                Section { ErrorBanner(text: error) }
            }

            if let calendar {
                if calendar.canManage && !calendar.requests.isEmpty {
                    Section("Žádosti o lekci") {
                        ForEach(calendar.requests) { lesson in
                            LessonRow(lesson: lesson, showName: true)
                                .swipeActions(edge: .trailing) {
                                    Button("Odmítnout", role: .destructive) { change(lesson, "decline") }
                                    Button("Potvrdit") { change(lesson, "confirm") }.tint(.green)
                                }
                                .contextMenu {
                                    Button("Potvrdit", systemImage: "checkmark") { change(lesson, "confirm") }
                                    Button("Odmítnout", systemImage: "xmark", role: .destructive) { change(lesson, "decline") }
                                }
                        }
                    }
                }

                if calendar.canManage {
                    Section("Potvrzené lekce") {
                        if calendar.lessons.isEmpty {
                            Text("Zatím žádné.").foregroundStyle(.secondary)
                        }
                        ForEach(calendar.lessons) { lesson in
                            LessonRow(lesson: lesson, showName: true)
                                .swipeActions(edge: .trailing) {
                                    Button("Zrušit", role: .destructive) { change(lesson, "cancel") }
                                }
                        }
                    }
                } else {
                    Section("Moje lekce") {
                        if calendar.mine.isEmpty {
                            Text("Zatím žádná. Vyber volný termín níže.").foregroundStyle(.secondary)
                        }
                        ForEach(calendar.mine) { lesson in
                            LessonRow(lesson: lesson, showName: false)
                                .swipeActions(edge: .trailing) {
                                    Button("Zrušit", role: .destructive) { change(lesson, "cancel") }
                                }
                        }
                    }
                }

                let freeDays = Dictionary(grouping: calendar.slots.filter { $0.state == "free" }, by: \.date)

                if !calendar.canManage {
                    if freeDays.isEmpty {
                        Section("Volné termíny") {
                            Text("Trenér teď nemá volný termín.").foregroundStyle(.secondary)
                        }
                    }
                    ForEach(freeDays.keys.sorted(), id: \.self) { day in
                        Section(Dates.dayTitle(day)) {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(freeDays[day] ?? [], id: \.self) { slot in
                                        Button("\(slot.start)–\(slot.end)") { requestSlot = slot }
                                            .buttonStyle(.bordered)
                                            .font(.subheadline.monospacedDigit())
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }
                } else {
                    Section {
                        Link(destination: AppConfig.webURL("/lekce/\(API.segment(calendar.trainer))")) {
                            Label("Časy výuky a zápis lekce na webu", systemImage: "safari")
                        }
                    } footer: {
                        Text("Pozvánka pro tanečníky: \(AppConfig.webURL("/pozvanka/\(API.segment(calendar.trainer.lowercased()))").absoluteString)")
                            .textSelection(.enabled)
                    }
                }
            } else if isLoading {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
    }

    private func choose(_ trainer: String) {
        selected = trainer
        lastTrainer = trainer
        Task { await loadCalendar() }
    }

    private func loadTrainers() async {
        guard session.isSignedIn else {
            trainers = []
            calendar = nil
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            trainers = try await API.get("/api/lessons", as: TrainersResponse.self).trainers
            selected = trainers.first { $0.trainer == lastTrainer }?.trainer ?? trainers.first?.trainer
            error = nil
            await loadCalendar()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadCalendar() async {
        guard let selected else { return }

        do {
            calendar = try await API.get("/api/lessons/\(API.segment(selected))", as: TrainerCalendar.self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func change(_ lesson: TrainerLesson, _ action: String) {
        guard let trainer = calendar?.trainer else { return }

        Task {
            do {
                let response = try await API.send(
                    "PATCH",
                    "/api/lessons/\(API.segment(trainer))/\(API.segment(lesson.id))",
                    body: ["action": action],
                    as: MessageResponse.self
                )
                notice = response.message
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
            await loadCalendar()
        }
    }
}

struct LessonRow: View {
    let lesson: TrainerLesson
    let showName: Bool

    var body: some View {
        HStack(spacing: 12) {
            KindBar(color: lesson.status == "confirmed" ? Theme.accent : Theme.cleanup)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(Dates.dayTitle(lesson.date)) · \(lesson.start)–\(lesson.end)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
                Text(showName ? lesson.requester : lesson.statusLabel)
                    .font(.body.weight(.semibold))
                if let note = lesson.note, !note.isEmpty {
                    Text(note).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if showName, let phone = lesson.phone, !phone.isEmpty, let url = whatsappURL(phone: phone, lesson: lesson) {
                Link(destination: url) {
                    Image(systemName: "message.fill")
                        .foregroundStyle(.white)
                        .padding(8)
                        .background(Circle().fill(Color.green))
                }
                .accessibilityLabel("Napsat přes WhatsApp")
            }
        }
    }

    private func whatsappURL(phone: String, lesson: TrainerLesson) -> URL? {
        let text = "Ahoj, připomínám lekci \(Dates.dayTitle(lesson.date)) \(lesson.start)–\(lesson.end)."
        var components = URLComponents(string: "https://wa.me/\(phone.filter(\.isNumber))")
        components?.queryItems = [URLQueryItem(name: "text", value: text)]
        return components?.url
    }
}

extension LessonSlot: Identifiable {
    var id: String { "\(date)-\(start)" }
}

struct LessonRequestView: View {
    let slot: LessonSlot
    let calendar: TrainerCalendar?
    let onDone: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var partner: String
    @State private var note = ""
    @State private var isSending = false
    @State private var error: String?

    init(slot: LessonSlot, calendar: TrainerCalendar?, partner: String, onDone: @escaping (String) -> Void) {
        self.slot = slot
        self.calendar = calendar
        self.onDone = onDone
        _partner = State(initialValue: partner)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Trenér", value: calendar?.trainerName ?? "")
                    LabeledContent("Termín", value: "\(Dates.dayTitle(slot.date)) \(slot.start)–\(slot.end)")
                }
                Section {
                    TextField("Partner/ka (prázdné = sólo)", text: $partner)
                    TextField("Poznámka pro trenéra", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                } footer: {
                    Text("Lekce platí, až ji trenér potvrdí.")
                }
                if let error {
                    Section { ErrorBanner(text: error) }
                }
            }
            .navigationTitle("Objednat lekci")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Odeslat") { Task { await send() } }.disabled(isSending)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func send() async {
        guard let trainer = calendar?.trainer else { return }

        isSending = true
        defer { isSending = false }

        do {
            let response = try await API.send(
                "POST",
                "/api/lessons/\(API.segment(trainer))",
                body: [
                    "date": slot.date,
                    "end": slot.end,
                    "note": note.trimmingCharacters(in: .whitespacesAndNewlines),
                    "partner": partner.trimmingCharacters(in: .whitespaces),
                    "start": slot.start,
                ],
                as: MessageResponse.self
            )
            onDone(response.message ?? "Žádost je odeslaná.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
