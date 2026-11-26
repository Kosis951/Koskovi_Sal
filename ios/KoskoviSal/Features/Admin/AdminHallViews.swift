import SwiftUI

// --- Regular trainings ---

struct AdminTrainingsView: View {
    @State private var trainings: [RecurringTraining] = []
    @State private var isLoading = false
    @State private var error: String?
    @State private var notice: String?
    @State private var editing: RecurringTraining?
    @State private var isAdding = false

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let notice { NoticeBanner(text: notice) }
                AdminState(isLoading: isLoading, error: error, isEmpty: trainings.isEmpty, emptyText: "Žádné pravidelné tréninky.")

                ForEach(1...7, id: \.self) { weekday in
                    let day = trainings.filter { $0.weekday == weekday }.sorted { $0.start < $1.start }

                    if !day.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(weekdayNames[weekday]).font(.headline).foregroundStyle(Theme.ink)
                            ForEach(day) { training in
                                Button { editing = training } label: { TrainingRow(training: training) }
                                    .buttonStyle(.plain)
                            }
                        }
                        .card()
                    }
                }
            }
            .padding(16)
        }
        .pageBackground()
        .navigationTitle("Pravidelné tréninky")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { isAdding = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Přidat trénink")
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $editing) { training in
            TrainingEditView(training: training) { message in
                notice = message
                Task { await load() }
            }
        }
        .sheet(isPresented: $isAdding) {
            TrainingEditView(training: nil) { message in
                notice = message
                Task { await load() }
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            trainings = try await API.get("/api/recurring-trainings", as: TrainingsResponse.self).trainings
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct TrainingRow: View {
    let training: RecurringTraining

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(training.start).font(.subheadline.weight(.bold).monospacedDigit())
                Text(training.end).font(.caption.monospacedDigit()).opacity(0.75)
            }
            .frame(width: 50, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(training.alternateTitle.map { "\(training.title) / \($0)" } ?? training.title)
                    .font(.body.weight(.semibold))
                if let trainer = training.trainer, !trainer.isEmpty {
                    Text(trainer).font(.caption)
                }
            }
            Spacer()
            if let status = training.status, status.state != "active" {
                Badge(text: status.label, style: status.state == "paused" ? Theme.cleanup : Theme.closed)
            }
        }
        .foregroundStyle(Theme.training.ink)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.training.background))
    }
}

struct TrainingEditView: View {
    let training: RecurringTraining?
    let onDone: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var alternateTitle = ""
    @State private var trainer = ""
    @State private var weekday = 1
    @State private var start = "17:00"
    @State private var end = "18:00"
    @State private var hasPeriod = false
    @State private var validFrom = Date()
    @State private var validUntil = Date()
    @State private var isCourse = false
    @State private var lessonCount = 10
    @State private var isPaused = false
    @State private var pausedFrom = Date()
    @State private var pausedUntil = Date()
    @State private var isSaving = false
    @State private var isConfirmingDelete = false
    @State private var error: String?

    var body: some View {
        BrandSheet(
            title: training == nil ? "Nový trénink" : "Upravit trénink",
            subtitle: training?.title,
            primaryTitle: "Uložit",
            primaryDisabled: title.trimmingCharacters(in: .whitespaces).isEmpty,
            isWorking: isSaving,
            onPrimary: { Task { await save() } }
        ) {
            VStack(spacing: 14) {
                FieldBox(label: "Název") {
                    TextField("např. Junioři", text: $title)
                }
                FieldBox(label: "Střídavý název (každý druhý týden)") {
                    TextField("nepovinné", text: $alternateTitle)
                }
                FieldBox(label: "Trenér") {
                    TextField("nepovinné", text: $trainer)
                }
            }
            .card()

            VStack(spacing: 14) {
                FieldBox(label: "Den") {
                    Menu {
                        Picker("Den", selection: $weekday) {
                            ForEach(1...7, id: \.self) { Text(weekdayNames[$0]).tag($0) }
                        }
                    } label: {
                        HStack {
                            Text(weekdayNames[weekday]).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                            Spacer()
                            Image(systemName: "chevron.up.chevron.down").font(.caption.weight(.bold)).foregroundStyle(Theme.inkSoft)
                        }
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .contentShape(Rectangle())
                    }
                }
                HStack(spacing: 12) {
                    TimeField(label: "Od", selection: $start)
                    TimeField(label: "Do", selection: $end)
                }
            }
            .card()

            VStack(spacing: 14) {
                ToggleCard(title: "Jen v určitém období", isOn: $hasPeriod)
                if hasPeriod || isCourse {
                    DateField(label: "Od", date: $validFrom)
                }
                if hasPeriod && !isCourse {
                    DateField(label: "Do", date: $validUntil)
                }
                ToggleCard(title: "Kurz na počet lekcí", isOn: $isCourse)
                if isCourse {
                    Stepper("Lekcí: \(lessonCount)", value: $lessonCount, in: 1...200)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.ink)
                }
                if let status = training?.status {
                    FieldNote(text: statusText(status))
                }
            }
            .card()

            VStack(spacing: 14) {
                ToggleCard(title: "Pozastavit", detail: "Trénink v tom období neproběhne.", isOn: $isPaused)
                if isPaused {
                    DateField(label: "Od", date: $pausedFrom)
                    DateField(label: "Do", date: $pausedUntil)
                }
            }
            .card()

            if let error {
                ErrorBanner(text: error)
            }

            if training != nil {
                DangerButton(title: "Smazat trénink") { isConfirmingDelete = true }
            }
        }
        .alert("Smazat trénink \(training?.title ?? "")?", isPresented: $isConfirmingDelete) {
            Button("Zpět", role: .cancel) {}
            Button("Smazat", role: .destructive) { Task { await delete() } }
        } message: {
            Text("Trénink zmizí z kalendáře ve všech týdnech.")
        }
        .onAppear(perform: fill)
    }

    private func statusText(_ status: TrainingStatus) -> String {
        var parts = ["Stav: \(status.label.lowercased())"]
        if let held = status.heldLessons, let remaining = status.remainingLessons {
            parts.append("proběhlo \(held), zbývá \(remaining)")
        }
        if let last = status.lastDate {
            parts.append("poslední \(Dates.dayTitle(last))")
        }
        return parts.joined(separator: " · ")
    }

    private func fill() {
        guard let training else { return }

        title = training.title
        alternateTitle = training.alternateTitle ?? ""
        trainer = training.trainer ?? ""
        weekday = training.weekday
        start = training.start
        end = training.end
        hasPeriod = training.validFrom != nil || training.validUntil != nil
        validFrom = training.validFrom.flatMap(Dates.date) ?? Date()
        validUntil = training.validUntil.flatMap(Dates.date) ?? Date()
        isCourse = training.lessonCount != nil
        lessonCount = training.lessonCount ?? 10
        isPaused = training.pausedFrom != nil
        pausedFrom = training.pausedFrom.flatMap(Dates.date) ?? Date()
        pausedUntil = training.pausedUntil.flatMap(Dates.date) ?? Date()
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        var payload: [String: Any] = [
            "alternateTitle": alternateTitle.trimmingCharacters(in: .whitespaces),
            "end": end,
            "start": start,
            "title": title.trimmingCharacters(in: .whitespaces),
            "trainer": trainer.trimmingCharacters(in: .whitespaces),
            "weekday": weekday,
        ]

        if hasPeriod || isCourse { payload["validFrom"] = Dates.key(validFrom) }
        if hasPeriod && !isCourse { payload["validUntil"] = Dates.key(validUntil) }
        if isCourse { payload["lessonCount"] = lessonCount }
        if isPaused {
            payload["pausedFrom"] = Dates.key(pausedFrom)
            payload["pausedUntil"] = Dates.key(pausedUntil)
        }
        if let training { payload["key"] = training.key }

        do {
            _ = try await API.send(training == nil ? "POST" : "PUT", "/api/recurring-trainings", body: payload, as: Empty.self)
            onDone(training == nil ? "Trénink je přidaný." : "Trénink je uložený.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        guard let training else { return }

        do {
            _ = try await API.send("DELETE", "/api/recurring-trainings", body: ["key": training.key], as: Empty.self)
            onDone("Trénink je smazaný.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// --- Holidays ---

struct AdminHolidaysView: View {
    @State private var holidays: [Holiday] = []
    @State private var isLoading = false
    @State private var error: String?
    @State private var isAdding = false
    @State private var deleting: Holiday?

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                AdminState(isLoading: isLoading, error: error, isEmpty: holidays.isEmpty, emptyText: "Žádné prázdniny. Tréninky běží každý týden.")

                ForEach(holidays.sorted { $0.start < $1.start }) { holiday in
                    HStack(spacing: 12) {
                        Image(systemName: "beach.umbrella.fill").foregroundStyle(Theme.cleanup.ink)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(holiday.label).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                            Text("\(Dates.dayTitle(holiday.start)) – \(Dates.dayTitle(holiday.end))")
                                .font(.caption)
                                .foregroundStyle(Theme.inkMuted)
                        }
                        Spacer()
                        Button { deleting = holiday } label: { Image(systemName: "trash").foregroundStyle(Theme.busy.ink) }
                            .accessibilityLabel("Smazat prázdniny")
                    }
                    .card(padding: 14)
                }
            }
            .padding(16)
        }
        .pageBackground()
        .navigationTitle("Prázdniny")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { isAdding = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Přidat prázdniny")
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(isPresented: $isAdding) {
            HolidayAddView { Task { await load() } }
        }
        .alert("Smazat \(deleting?.label ?? "")?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("Zpět", role: .cancel) {}
            Button("Smazat", role: .destructive) {
                if let holiday = deleting { Task { await delete(holiday) } }
            }
        } message: {
            Text("Tréninky v tom období se zase objeví.")
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            holidays = try await API.get("/api/recurring-holidays", as: HolidaysResponse.self).holidays
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete(_ holiday: Holiday) async {
        do {
            _ = try await API.send("DELETE", "/api/recurring-holidays", body: ["id": holiday.id], as: Empty.self)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct HolidayAddView: View {
    let onDone: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var label = "Prázdniny"
    @State private var start = Date()
    @State private var end = Date()
    @State private var error: String?

    var body: some View {
        BrandSheet(
            title: "Nové prázdniny",
            subtitle: "Tréninky v tom období neproběhnou",
            primaryTitle: "Přidat",
            primaryDisabled: label.trimmingCharacters(in: .whitespaces).isEmpty,
            onPrimary: { Task { await save() } }
        ) {
            VStack(spacing: 14) {
                FieldBox(label: "Název") {
                    TextField("Prázdniny", text: $label)
                }
                DateField(label: "Od", date: $start)
                DateField(label: "Do", date: $end, from: start)
            }
            .card()

            if let error {
                ErrorBanner(text: error)
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func save() async {
        do {
            _ = try await API.send(
                "POST",
                "/api/recurring-holidays",
                body: ["end": Dates.key(end), "label": label.trimmingCharacters(in: .whitespaces), "start": Dates.key(start)],
                as: Empty.self
            )
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// --- Upcoming one-off bookings ---

struct AdminBookingsView: View {
    @Environment(SessionModel.self) private var session
    @State private var model = HallModel()
    @State private var openBooking: Booking?
    @State private var isAdding = false
    @State private var notice: String?

    private var upcoming: [Booking] {
        model.bookings
            .filter { !$0.isTraining && $0.date >= Dates.todayKey() }
            .sorted { ($0.date, $0.start) < ($1.date, $1.start) }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let notice { NoticeBanner(text: notice) }
                AdminState(isLoading: model.isLoading, error: model.error, isEmpty: upcoming.isEmpty, emptyText: "Žádné nadcházející akce.")

                ForEach(upcoming) { booking in
                    HStack(spacing: 12) {
                        VStack(spacing: 2) {
                            Text(Dates.shortWeekday(booking.date)).font(.caption.weight(.bold))
                            Text(Dates.dayNumber(booking.date)).font(.title3.weight(.heavy))
                        }
                        .foregroundStyle(Theme.accent)
                        .frame(width: 48, height: 54)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.subtle))
                        DayItemRow(item: .booking(booking)) { openBooking = booking }
                    }
                }
            }
            .padding(16)
        }
        .pageBackground()
        .navigationTitle("Akce")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { isAdding = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Přidat akci")
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
        .sheet(item: $openBooking) { booking in
            BookingDetailView(booking: booking, model: model, canEdit: session.canEdit(booking)) { message in
                notice = message
            }
        }
        .sheet(isPresented: $isAdding) {
            AddBookingView(model: model, date: Dates.todayKey())
        }
    }
}

// --- History ---

struct AdminHistoryView: View {
    @State private var entries: [AuditEntry] = []
    @State private var isLoading = false
    @State private var error: String?
    @State private var notice: String?
    @State private var undoing: AuditEntry?

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let notice { NoticeBanner(text: notice) }
                AdminState(isLoading: isLoading, error: error, isEmpty: entries.isEmpty, emptyText: "Zatím žádné změny.")

                ForEach(entries) { entry in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: icon(for: entry.action))
                            .foregroundStyle(Theme.accent)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(entry.actor) · \(entry.actionLabel.lowercased())")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Theme.inkMuted)
                            Text(entry.details?.title ?? entry.bookingId ?? "")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(Theme.ink)
                            if let date = entry.details?.date {
                                Text("\(Dates.dayTitle(date)) \(entry.details?.start ?? "")–\(entry.details?.end ?? "")")
                                    .font(.caption)
                                    .foregroundStyle(Theme.inkMuted)
                            }
                            Text(Dates.dateTime(entry.timestamp)).font(.caption2).foregroundStyle(Theme.inkSoft)
                        }
                        Spacer()
                        if entry.canUndo {
                            Button("Vrátit") { undoing = entry }
                                .font(.caption.weight(.bold))
                                .buttonStyle(.bordered)
                        }
                    }
                    .card(padding: 12)
                }
            }
            .padding(16)
        }
        .pageBackground()
        .navigationTitle("Historie změn")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .alert("Vrátit tuhle změnu?", isPresented: Binding(get: { undoing != nil }, set: { if !$0 { undoing = nil } })) {
            Button("Zpět", role: .cancel) {}
            Button("Vrátit změnu") {
                if let entry = undoing { Task { await undo(entry) } }
            }
        }
    }

    private func icon(for action: String) -> String {
        switch action {
        case "booking.create": return "plus.circle"
        case "booking.delete": return "trash"
        case "booking.clean": return "sparkles"
        case "booking.undo": return "arrow.uturn.backward"
        default: return "pencil"
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            entries = try await API.get("/api/audit-log", as: AuditLogResponse.self).entries
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func undo(_ entry: AuditEntry) async {
        do {
            let response = try await API.send("POST", "/api/audit-log/undo", body: ["timestamp": entry.timestamp], as: MessageResponse.self)
            notice = response.message ?? "Změna je vrácená."
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
