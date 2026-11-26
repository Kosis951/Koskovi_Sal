import SwiftUI

// The trainer's times of teaching (as on the web): every week on a day, or one
// date, cut into lessons of the chosen length. Dancers book the free ones.
struct TrainerWindowsView: View {
    let trainer: String
    let onChange: () -> Void
    @State private var windows: [TrainerWindow]
    @State private var isAdding = false
    @State private var deleting: TrainerWindow?
    @State private var notice: String?
    @State private var error: String?

    init(trainer: String, windows: [TrainerWindow], onChange: @escaping () -> Void) {
        self.trainer = trainer
        self.onChange = onChange
        _windows = State(initialValue: windows)
    }

    static let weekdays = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"]

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let notice { NoticeBanner(text: notice) }
                if let error { ErrorBanner(text: error) }

                Button {
                    isAdding = true
                } label: {
                    Label("Přidat čas výuky", systemImage: "plus")
                }
                .buttonStyle(PrimaryButtonStyle())

                if windows.isEmpty {
                    EmptyCard(icon: "clock", title: "Zatím žádné časy", text: "Přidej, kdy učíš – tanečníci pak uvidí volné lekce a objednají si je.")
                }

                ForEach(windows) { window in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(title(window)).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                            Text("\(window.start)–\(window.end) · lekce \(window.lessonMinutes) min")
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(Theme.inkMuted)
                            if let validity = validity(window) {
                                Text(validity).font(.caption).foregroundStyle(Theme.inkSoft)
                            }
                        }
                        Spacer()
                        Button {
                            deleting = window
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(Theme.busy.ink)
                                .frame(width: 40, height: 40)
                        }
                        .accessibilityLabel("Smazat")
                    }
                    .card(padding: 14)
                }

                FieldNote(text: "Smazáním času zmizí jen volné lekce v něm; objednané a potvrzené lekce zůstanou.")
            }
            .padding(16)
        }
        .pageBackground()
        .navigationTitle("Časy výuky")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await reload() }
        .sheet(isPresented: $isAdding) {
            TrainerWindowAddView(trainer: trainer) { message in
                notice = message
                Task { await reload() }
            }
        }
        .alert("Smazat čas výuky?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("Zpět", role: .cancel) {}
            Button("Smazat", role: .destructive) {
                if let window = deleting { Task { await delete(window) } }
            }
        } message: {
            Text(deleting.map { "\(title($0)) \($0.start)–\($0.end)" } ?? "")
        }
    }

    private func title(_ window: TrainerWindow) -> String {
        if let date = window.date {
            return Dates.dayTitle(date).capitalized(with: Dates.czech)
        }
        let index = (window.weekday ?? 1) - 1
        return "Každé " + (Self.weekdays.indices.contains(index) ? Self.weekdays[index].lowercased() : "")
    }

    private func validity(_ window: TrainerWindow) -> String? {
        switch (window.validFrom, window.validUntil) {
        case let (from?, until?): return "Od \(Dates.dayTitle(from)) do \(Dates.dayTitle(until))"
        case let (from?, nil): return "Od \(Dates.dayTitle(from))"
        case let (nil, until?): return "Do \(Dates.dayTitle(until))"
        default: return nil
        }
    }

    private func reload() async {
        do {
            let calendar = try await API.get("/api/lessons/\(API.segment(trainer))", as: TrainerCalendar.self)
            windows = calendar.windows ?? []
            error = nil
            onChange()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete(_ window: TrainerWindow) async {
        do {
            let response = try await API.send("DELETE", "/api/lessons/\(API.segment(trainer))/windows", body: ["id": window.id], as: MessageResponse.self)
            notice = response.message
            await reload()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct TrainerWindowAddView: View {
    let trainer: String
    let onDone: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var repeats = "weekly"
    @State private var weekday = "1"
    @State private var date = Date()
    @State private var start = TrainerWindowAddView.time(14, 0)
    @State private var end = TrainerWindowAddView.time(18, 0)
    @State private var length = "45"
    @State private var hasEnd = false
    @State private var until = Date().addingTimeInterval(90 * 24 * 60 * 60)
    @State private var isSaving = false
    @State private var error: String?

    static func time(_ hour: Int, _ minute: Int) -> Date {
        Dates.calendar.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date()
    }

    private func hhmm(_ date: Date) -> String {
        let parts = Dates.calendar.dateComponents([.hour, .minute], from: date)
        return Dates.time((parts.hour ?? 0) * 60 + (parts.minute ?? 0))
    }

    private var lessonsCount: Int {
        let minutes = Dates.minutes(hhmm(end)) - Dates.minutes(hhmm(start))
        return max(minutes / max(Int(length) ?? 45, 1), 0)
    }

    var body: some View {
        BrandSheet(
            title: "Čas výuky",
            subtitle: "Kdy učíš",
            primaryTitle: "Přidat",
            primaryDisabled: lessonsCount == 0,
            isWorking: isSaving,
            onPrimary: { Task { await save() } }
        ) {
            VStack(alignment: .leading, spacing: 14) {
                ChoicePills(options: [("weekly", "Každý týden"), ("once", "Jeden den")], selection: $repeats)
                if repeats == "weekly" {
                    ChoicePills(
                        options: TrainerWindowsView.weekdays.enumerated().map { ("\($0.offset + 1)", String($0.element.prefix(2))) },
                        selection: $weekday
                    )
                } else {
                    DatePicker("Den", selection: $date, in: Date()..., displayedComponents: .date)
                        .environment(\.locale, Dates.czech)
                }
            }
            .card()

            VStack(alignment: .leading, spacing: 14) {
                DatePicker("Od", selection: $start, displayedComponents: .hourAndMinute)
                DatePicker("Do", selection: $end, displayedComponents: .hourAndMinute)
                Text("Délka lekce").font(.footnote.weight(.semibold)).foregroundStyle(Theme.inkMuted)
                ChoicePills(options: [("30", "30"), ("45", "45"), ("60", "60"), ("90", "90")], selection: $length)
                FieldNote(text: lessonsCount == 0 ? "Do tohoto času se nevejde ani jedna lekce." : "Vejde se \(lessonsCount) lekcí po \(length) min.")
            }
            .environment(\.locale, Dates.czech)
            .card()

            if repeats == "weekly" {
                VStack(alignment: .leading, spacing: 10) {
                    Toggle("Jen do určitého dne", isOn: $hasEnd).tint(Theme.accent)
                    if hasEnd {
                        DatePicker("Do", selection: $until, in: Date()..., displayedComponents: .date)
                            .environment(\.locale, Dates.czech)
                    }
                }
                .card()
            }

            if let error {
                ErrorBanner(text: error)
            }
        }
        .presentationDetents([.large])
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        var body: [String: Any] = [
            "end": hhmm(end),
            "lessonMinutes": Int(length) ?? 45,
            "start": hhmm(start),
        ]
        if repeats == "weekly" {
            body["weekday"] = Int(weekday) ?? 1
            if hasEnd { body["validUntil"] = Dates.key(until) }
        } else {
            body["date"] = Dates.key(date)
        }

        do {
            let response = try await API.send("POST", "/api/lessons/\(API.segment(trainer))/windows", body: body, as: MessageResponse.self)
            onDone(response.message ?? "Čas výuky je přidaný.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
