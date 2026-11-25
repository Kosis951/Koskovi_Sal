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
    @State private var isAddingGuest = false
    @State private var isSigningIn = false
    @AppStorage("lessons.trainer") private var lastTrainer = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if !session.isSignedIn {
                        SignInPrompt(
                            icon: "figure.dance",
                            title: "Lekce u trenérů",
                            text: "Přihlas se a uvidíš volné termíny svého trenéra, objednáš lekci a budeš mít přehled o svých lekcích."
                        ) { isSigningIn = true }
                    } else if trainers.isEmpty && !isLoading {
                        if let error {
                            ErrorBanner(text: error)
                        }
                        EmptyCard(icon: "person.2.slash", title: "Žádný trenér", text: "Zatím tu žádný trenér nemá kalendář lekcí.")
                    } else {
                        content
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .pageBackground()
            .safeAreaInset(edge: .top, spacing: 0) {
                BrandHeader(title: "Lekce", subtitle: calendar?.trainerName) {
                    if trainers.count > 1 {
                        Menu {
                            Picker("Trenér", selection: Binding(get: { selected ?? "" }, set: { choose($0) })) {
                                ForEach(trainers) { Text($0.name).tag($0.trainer) }
                            }
                        } label: {
                            Image(systemName: "person.2.fill")
                                .font(.headline)
                                .foregroundStyle(.white)
                                .frame(width: 38, height: 38)
                                .background(Circle().fill(.white.opacity(0.16)))
                        }
                        .accessibilityLabel("Vybrat trenéra")
                    }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task(id: session.isSignedIn) { await loadTrainers() }
            .refreshable { await loadCalendar() }
            .sheet(item: $requestSlot) { slot in
                LessonRequestView(slot: slot, calendar: calendar, partner: calendar?.viewerPartner ?? "") { message in
                    notice = message
                    Task { await loadCalendar() }
                }
            }
            .sheet(isPresented: $isAddingGuest) {
                if let calendar {
                    GuestLessonView(calendar: calendar) { message in
                        notice = message
                        Task { await loadCalendar() }
                    }
                }
            }
            .fullScreenCover(isPresented: $isSigningIn) {
                LoginView()
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let notice {
            NoticeBanner(text: notice)
        }
        if let error {
            ErrorBanner(text: error)
        }

        if let calendar {
            if calendar.canManage {
                trainerContent(calendar)
            } else {
                dancerContent(calendar)
            }
        } else if isLoading {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
        }
    }

    @ViewBuilder
    private func dancerContent(_ calendar: TrainerCalendar) -> some View {
        SectionTitle(text: "Moje lekce", systemImage: "calendar.badge.checkmark")
        if calendar.mine.isEmpty {
            EmptyCard(icon: "calendar.badge.plus", title: "Zatím žádná lekce", text: "Vyber si volný termín níže.")
        }
        ForEach(calendar.mine) { lesson in
            LessonCard(lesson: lesson, showName: false) {
                change(lesson, "cancel")
            }
        }

        SectionTitle(text: "Volné termíny", systemImage: "clock.badge.checkmark")
            .padding(.top, 6)
        let freeDays = Dictionary(grouping: calendar.slots.filter { $0.state == "free" }, by: \.date)

        if freeDays.isEmpty {
            EmptyCard(icon: "hourglass", title: "Teď nic volného", text: "Trenér zatím nemá volný termín. Zkus to později.")
        }

        ForEach(freeDays.keys.sorted(), id: \.self) { day in
            VStack(alignment: .leading, spacing: 10) {
                Text(Dates.dayTitle(day).capitalized(with: Dates.czech))
                    .font(.headline)
                    .foregroundStyle(Theme.ink)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 98), spacing: 8)], spacing: 8) {
                    ForEach(freeDays[day] ?? [], id: \.self) { slot in
                        Button {
                            requestSlot = slot
                        } label: {
                            Text("\(slot.start)–\(slot.end)")
                                .font(.subheadline.weight(.semibold).monospacedDigit())
                                .foregroundStyle(Theme.free.ink)
                                .frame(maxWidth: .infinity, minHeight: 40)
                                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.free.background))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.free.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .card()
        }
    }

    @ViewBuilder
    private func trainerContent(_ calendar: TrainerCalendar) -> some View {
        Button {
            isAddingGuest = true
        } label: {
            Label("Zapsat lekci", systemImage: "plus")
        }
        .buttonStyle(PrimaryButtonStyle())

        if !calendar.requests.isEmpty {
            SectionTitle(text: "Žádosti o lekci (\(calendar.requests.count))", systemImage: "tray.full")
            ForEach(calendar.requests) { lesson in
                VStack(alignment: .leading, spacing: 10) {
                    LessonSummary(lesson: lesson, showName: true)
                    HStack(spacing: 10) {
                        Button("Odmítnout") { change(lesson, "decline") }
                            .buttonStyle(SecondaryButtonStyle())
                        Button("Potvrdit") { change(lesson, "confirm") }
                            .buttonStyle(PrimaryButtonStyle())
                    }
                }
                .card()
            }
        }

        SectionTitle(text: "Potvrzené lekce", systemImage: "calendar")
        if calendar.lessons.isEmpty {
            EmptyCard(icon: "calendar", title: "Žádné potvrzené lekce", text: "Až někdo lekci objedná a ty ji potvrdíš, bude tady.")
        }
        ForEach(calendar.lessons) { lesson in
            LessonCard(lesson: lesson, showName: true) {
                change(lesson, "cancel")
            }
        }

        VStack(alignment: .leading, spacing: 10) {
            Label("Pozvánka pro tanečníky", systemImage: "link")
                .font(.headline)
                .foregroundStyle(Theme.ink)
            let link = AppConfig.webURL("/pozvanka/\(API.segment(calendar.trainer.lowercased()))")
            Text(link.absoluteString)
                .font(.footnote.monospaced())
                .foregroundStyle(Theme.inkMuted)
                .textSelection(.enabled)
            ShareLink(item: link) {
                Label("Poslat pozvánku", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(SecondaryButtonStyle())
            Link(destination: AppConfig.webURL("/lekce/\(API.segment(calendar.trainer))")) {
                Label("Časy výuky upravíš na webu", systemImage: "safari")
                    .font(.footnote.weight(.semibold))
            }
        }
        .card()
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
            if Demo.isOn {
                trainers = Demo.trainers
            } else {
                trainers = try await API.get("/api/lessons", as: TrainersResponse.self).trainers
            }
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
            if Demo.isOn {
                calendar = Demo.trainerCalendar
            } else {
                calendar = try await API.get("/api/lessons/\(API.segment(selected))", as: TrainerCalendar.self)
            }
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

// Shown instead of content that needs an account.
struct SignInPrompt: View {
    let icon: String
    let title: String
    let text: String
    let onSignIn: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 40, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .frame(width: 84, height: 84)
                .background(Circle().fill(Theme.subtle))
            Text(title)
                .font(.title2.weight(.heavy))
                .foregroundStyle(Theme.ink)
            Text(text)
                .font(.callout)
                .foregroundStyle(Theme.inkMuted)
                .multilineTextAlignment(.center)
            Button("Přihlásit se", action: onSignIn)
                .buttonStyle(PrimaryButtonStyle())
                .padding(.top, 4)
            Text("Účet dostaneš přes pozvánku od svého trenéra.")
                .font(.footnote)
                .foregroundStyle(Theme.inkSoft)
        }
        .padding(.vertical, 10)
        .card(padding: 22)
    }
}

struct EmptyCard: View {
    let icon: String
    let title: String
    let text: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(Theme.inkSoft)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.bold)).foregroundStyle(Theme.ink)
                Text(text).font(.footnote).foregroundStyle(Theme.inkMuted)
            }
            Spacer(minLength: 0)
        }
        .card()
    }
}

struct LessonSummary: View {
    let lesson: TrainerLesson
    let showName: Bool

    private var statusStyle: KindStyle {
        switch lesson.status {
        case "confirmed": return Theme.training
        case "pending": return Theme.cleanup
        default: return Theme.closed
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 2) {
                Text(Dates.shortWeekday(lesson.date)).font(.caption.weight(.bold))
                Text(Dates.dayNumber(lesson.date)).font(.title3.weight(.heavy))
            }
            .foregroundStyle(Theme.accent)
            .frame(width: 48, height: 54)
            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.subtle))

            VStack(alignment: .leading, spacing: 4) {
                Text("\(lesson.start)–\(lesson.end)")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(Theme.ink)
                if showName {
                    Text(lesson.requester).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                } else if let partner = lesson.partner, !partner.isEmpty {
                    Text("s partnerem/kou \(partner)").font(.subheadline).foregroundStyle(Theme.inkMuted)
                }
                if let note = lesson.note, !note.isEmpty {
                    Text(note).font(.footnote).foregroundStyle(Theme.inkMuted)
                }
            }
            Spacer(minLength: 4)
            Badge(text: lesson.statusLabel, style: statusStyle)
        }
    }
}

struct LessonCard: View {
    let lesson: TrainerLesson
    let showName: Bool
    let onCancel: () -> Void
    @State private var isConfirming = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LessonSummary(lesson: lesson, showName: showName)
            HStack(spacing: 10) {
                if showName, let phone = lesson.phone, !phone.isEmpty, let url = whatsappURL(phone: phone) {
                    Link(destination: url) {
                        Label("WhatsApp", systemImage: "message.fill")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(Capsule().fill(Color(red: 0.15, green: 0.68, blue: 0.38)))
                    }
                }
                Button("Zrušit lekci") { isConfirming = true }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.busy.ink)
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .background(Capsule().fill(Theme.busy.background))
            }
        }
        .card()
        .confirmationDialog("Zrušit lekci \(Dates.dayTitle(lesson.date)) \(lesson.start)?", isPresented: $isConfirming, titleVisibility: .visible) {
            Button("Zrušit lekci", role: .destructive, action: onCancel)
        }
    }

    private func whatsappURL(phone: String) -> URL? {
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
            ScrollView {
                VStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Badge(text: "Volný termín", style: Theme.free)
                        Text("\(slot.start)–\(slot.end)").font(.largeTitle.weight(.heavy))
                        Text("\(Dates.dayTitle(slot.date).capitalized(with: Dates.czech)) · \(calendar?.trainerName ?? "")")
                            .font(.subheadline.weight(.semibold))
                    }
                    .foregroundStyle(Theme.free.ink)
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.free.background))

                    VStack(spacing: 14) {
                        FieldBox(label: "Partner/ka (prázdné = sólo)") {
                            TextField("jméno", text: $partner)
                        }
                        FieldBox(label: "Poznámka pro trenéra") {
                            TextField("na čem chcete pracovat", text: $note, axis: .vertical)
                                .lineLimit(1...4)
                                .padding(.vertical, 12)
                        }
                    }
                    .card()

                    if let error {
                        ErrorBanner(text: error)
                    }

                    Button {
                        Task { await send() }
                    } label: {
                        if isSending { ProgressView().tint(.white) } else { Text("Objednat lekci") }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isSending)

                    Text("Lekce platí, až ji trenér potvrdí.")
                        .font(.footnote)
                        .foregroundStyle(Theme.inkMuted)
                }
                .padding(16)
            }
            .pageBackground()
            .navigationTitle("Objednat lekci")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zavřít") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
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

// The trainer writes a lesson in for somebody without an account (as on the
// web: any free time, confirmed right away).
struct GuestLessonView: View {
    let calendar: TrainerCalendar
    let onDone: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var guest = ""
    @State private var partner = ""
    @State private var phone = ""
    @State private var note = ""
    @State private var day = Date()
    @State private var start = "17:00"
    @State private var end = "17:45"
    @State private var isSaving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Kdo") {
                    TextField("Jméno", text: $guest)
                    TextField("Partner/ka (nepovinné)", text: $partner)
                    TextField("Telefon (nepovinné)", text: $phone)
                        .keyboardType(.phonePad)
                }
                Section("Kdy") {
                    DatePicker("Den", selection: $day, in: Date()..., displayedComponents: .date)
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
                        .lineLimit(1...4)
                }
                if let error {
                    Section { ErrorBanner(text: error) }
                }
            }
            .navigationTitle("Zapsat lekci")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { Task { await save() } }
                        .disabled(isSaving || guest.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onChange(of: start) {
                if end <= start {
                    end = Dates.time(min(Dates.minutes(start) + 45, 24 * 60 - 15))
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
            let response = try await API.send(
                "POST",
                "/api/lessons/\(API.segment(calendar.trainer))",
                body: [
                    "date": Dates.key(day),
                    "end": end,
                    "guest": guest.trimmingCharacters(in: .whitespaces),
                    "note": note.trimmingCharacters(in: .whitespacesAndNewlines),
                    "partner": partner.trimmingCharacters(in: .whitespaces),
                    "phone": phone.trimmingCharacters(in: .whitespaces),
                    "start": start,
                ],
                as: MessageResponse.self
            )
            onDone(response.message ?? "Lekce je zapsaná.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
