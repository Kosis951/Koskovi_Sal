import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class ScheduleModel {
    private(set) var schedule: PublicScheduleResponse?
    private(set) var days: [ScheduleDay] = []
    private var showsTour = false
    var error: String?

    var isPublished: Bool { schedule?.published == true }
    // The server's list of the dancer's lessons (nil: an older web).
    var mineKeys: Set<String>? { schedule?.mine.map(Set.init) }

    // A lesson can be asked to be cancelled until a week before the visiting
    // trainer's first day, and to be moved until two days before it (the
    // organiser may not manage it). Later only in person with the organiser.
    // The web checks the same.
    var cancelUntil: String? {
        days.compactMap(\.dateKey).min().map { Dates.addDays(-7, to: $0) }
    }

    var canCancel: Bool {
        guard let cancelUntil else { return false }
        return Dates.todayKey() <= cancelUntil
    }

    func canMove(_ date: String) -> Bool {
        Dates.todayKey() <= Dates.addDays(-2, to: date)
    }

    func load() async {
        do {
            let schedule: PublicScheduleResponse

            let isTour = TourModel.shared.isActive
            if isTour || showsTour {
                // The guide's made-up schedule goes, even if loading fails.
                self.schedule = nil
                days = []
                showsTour = isTour
            }

            if isTour {
                schedule = Demo.tourSchedule
            } else if Demo.isOn {
                schedule = Demo.schedule
            } else {
                schedule = try await API.get("/api/rozpis", as: PublicScheduleResponse.self)
            }

            self.schedule = schedule
            // Hall managers also get the unpublished draft; that is for Správa only.
            days = schedule.published ? ScheduleParser.parse(schedule.body, todayKey: Dates.todayKey()) : []
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ScheduleScreen: View {
    let model: ScheduleModel
    @Environment(SessionModel.self) private var session
    @State private var requestRow: RequestTarget?
    @State private var notice: String?
    @State private var isLinking = false
    @State private var isAnswering = false

    struct RequestTarget: Identifiable {
        let id = UUID()
        let date: String
        let row: ScheduleRow
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let notice {
                        NoticeBanner(text: notice)
                    }
                    if let error = model.error {
                        ErrorBanner(text: error)
                    }

                    if model.schedule != nil, !model.isPublished {
                        EmptyCard(
                            icon: "calendar.badge.clock",
                            title: "Není naplánován externí trenér",
                            text: "Až přijede, najdeš tu jeho rozpis a tvoje lekce se zvýrazní."
                        )
                        .tourTarget(.scheduleMine)
                    } else {
                        VStack(spacing: 14) {
                            myLessonsCard
                        }
                        .tourTarget(.scheduleMine)
                    }

                    if model.isPublished, !model.days.isEmpty {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: "arrow.left.arrow.right.circle.fill")
                                .font(.title3)
                                .foregroundStyle(Theme.accent)
                            Text(requestRules)
                                .font(.footnote)
                                .foregroundStyle(Theme.inkMuted)
                        }
                        .card(padding: 14)
                    }

                    ForEach(model.days) { day in
                        VStack(alignment: .leading, spacing: 8) {
                            if let date = day.dateKey {
                                HStack {
                                    Text(Dates.dayTitle(date).capitalized(with: Dates.czech))
                                        .font(.title3.weight(.bold))
                                        .foregroundStyle(Theme.ink)
                                    Spacer()
                                    if date == Dates.todayKey() {
                                        Badge(text: "Dnes", style: Theme.free)
                                    }
                                }
                                .padding(.bottom, 2)
                            }

                            ForEach(day.rows) { row in
                                let past = isPast(day: day.dateKey, row: row)
                                let current = isNow(day: day.dateKey, row: row)

                                let mine = isMine(day.dateKey, row)

                                if canAsk(day: day.dateKey, row: row), let date = day.dateKey {
                                    Button {
                                        requestRow = RequestTarget(date: date, row: row)
                                    } label: {
                                        ScheduleRowView(row: row, isPast: past, isNow: current, canRequest: true, isMine: mine)
                                    }
                                    .buttonStyle(.plain)
                                } else {
                                    ScheduleRowView(row: row, isPast: past, isNow: current, canRequest: false, isMine: mine)
                                }
                            }
                        }
                        .card()
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .pageBackground()
            .safeAreaInset(edge: .top, spacing: 0) {
                BrandHeader(title: "Rozpis", subtitle: model.isPublished ? model.schedule?.title : "Externí trenér")
            }
            .toolbar(.hidden, for: .navigationBar)
            .tourOverlay(.schedule)
            .refreshable { await model.load() }
            .sheet(isPresented: $isLinking) {
                ScheduleNameView(current: session.scheduleName ?? "") {
                    Task { await session.refresh() }
                }
            }
            .sheet(item: $requestRow) { target in
                ScheduleRequestView(
                    date: target.date,
                    row: target.row,
                    canCancel: model.canCancel,
                    canMove: model.canMove(target.date)
                ) { message in
                    notice = message
                }
            }
        }
    }

    private func isMine(_ date: String?, _ row: ScheduleRow) -> Bool {
        guard row.kind == .lesson else { return false }
        if let keys = model.mineKeys {
            return keys.contains("\(date ?? "")|\(row.start ?? "")")
        }
        guard let name = session.scheduleName else { return false }
        return ScheduleParser.row(row.text, belongsTo: name)
    }

    // "Is this you?" – the answer links (or not) the lessons found by name.
    private func answer(_ confirm: Bool) async {
        isAnswering = true
        defer { isAnswering = false }

        do {
            let response = try await API.send("POST", "/api/account/schedule-link", body: ["confirm": confirm], as: MessageResponse.self)
            notice = response.message
            await model.load()
        } catch {
            model.error = error.localizedDescription
        }
    }

    private var suggestionCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Tohle jsi ty?", systemImage: "person.crop.circle.badge.questionmark")
                .font(.headline)
                .foregroundStyle(Theme.ink)
            Text(model.schedule?.linkSuggestion ?? "")
                .font(.body.weight(.semibold))
                .foregroundStyle(Theme.accent)
            Text("V rozpisu jsme našli tvoje příjmení. Když potvrdíš, budeš tu mít své lekce (i partnerovy) a připomínky k nim.")
                .font(.footnote)
                .foregroundStyle(Theme.inkMuted)
            HStack(spacing: 10) {
                Button("Ano, to jsem já") { Task { await answer(true) } }
                    .buttonStyle(PrimaryButtonStyle())
                Button("Nejsem") { Task { await answer(false) } }
                    .buttonStyle(SecondaryButtonStyle())
            }
            .disabled(isAnswering)
        }
        .card()
    }

    // The dancer's own lessons from the schedule, or an offer to link the
    // account with their name in it.
    @ViewBuilder
    private var myLessonsCard: some View {
        if session.isSignedIn, model.schedule?.linkSuggestion != nil {
            suggestionCard
        }
        if session.isSignedIn {
            let mine = model.days.flatMap { day in
                day.rows.filter { isMine(day.dateKey, $0) }.map { (date: day.dateKey, row: $0) }
            }
            if !mine.isEmpty || session.scheduleName != nil {
                let name = session.scheduleName ?? ""

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Label("Moje lekce", systemImage: "person.crop.circle.badge.checkmark")
                            .font(.headline)
                            .foregroundStyle(Theme.ink)
                        Spacer()
                        Button("Změnit") { isLinking = true }
                            .font(.footnote.weight(.semibold))
                    }
                    if mine.isEmpty {
                        Text("V rozpisu zatím nevidíme „\(name)“. Zkontroluj, jak tě trenér píše.")
                            .font(.footnote)
                            .foregroundStyle(Theme.inkMuted)
                    }
                    ForEach(Array(mine.enumerated()), id: \.offset) { _, item in
                        HStack(spacing: 12) {
                            Text(item.date.map { Dates.dayTitle($0) } ?? "")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.ink)
                            Spacer()
                            Text("\(item.row.start ?? "")–\(item.row.end ?? "")")
                                .font(.subheadline.weight(.bold).monospacedDigit())
                                .foregroundStyle(Theme.accent)
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.training.background))
                    }
                }
                .card()
            } else if model.schedule?.linkSuggestion == nil {
                Button {
                    isLinking = true
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "link.circle.fill").font(.title2).foregroundStyle(Theme.accent)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Propoj se s rozpisem").font(.subheadline.weight(.bold)).foregroundStyle(Theme.ink)
                            Text("Najdeme tě podle příjmení z profilu, nebo napiš, jak tě trenér v rozpisu píše.")
                                .font(.caption)
                                .foregroundStyle(Theme.inkMuted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Theme.inkSoft)
                    }
                    .card(padding: 14)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func isPast(day: String?, row: ScheduleRow) -> Bool {
        guard let day, let end = row.end else { return false }
        let today = Dates.todayKey()
        return day < today || (day == today && end <= Dates.nowTime())
    }

    private func isNow(day: String?, row: ScheduleRow) -> Bool {
        guard let day, day == Dates.todayKey(), let start = row.start, let end = row.end else { return false }
        let now = Dates.nowTime()
        return start <= now && now < end
    }

    private func canAsk(day: String?, row: ScheduleRow) -> Bool {
        guard model.isPublished, let day, row.kind == .lesson, !isPast(day: day, row: row) else { return false }
        return model.canCancel || model.canMove(day)
    }

    private var requestRules: String {
        let cancel = model.cancelUntil.map(Dates.dayTitle) ?? ""
        let start = model.canCancel
            ? "Nemůžeš na lekci? Klepni na svůj řádek: zrušit ji jde do \(cancel) (týden před příjezdem trenéra), "
            : "Zrušit lekci už přes rozpis nejde (šlo týden před příjezdem trenéra). "
        return start + "o přesun můžeš požádat nejpozději 2 dny před lekcí – nemusí ale vyjít. Potom už jen po osobní domluvě s organizátorem."
    }
}

struct ScheduleRowView: View {
    let row: ScheduleRow
    let isPast: Bool
    let isNow: Bool
    let canRequest: Bool
    var isMine = false

    private var style: KindStyle {
        switch row.kind {
        case .group: return Theme.event
        case .pause: return Theme.closed
        case .lesson: return isNow ? Theme.free : Theme.training
        case .note: return Theme.closed
        }
    }

    var body: some View {
        if row.kind == .note {
            Text(row.text)
                .font(.footnote)
                .foregroundStyle(Theme.inkMuted)
                .padding(.vertical, 2)
        } else {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.start ?? "").font(.subheadline.weight(.bold).monospacedDigit())
                    Text(row.end ?? "").font(.caption.monospacedDigit()).opacity(0.75)
                }
                .frame(width: 50, alignment: .leading)

                switch row.kind {
                case .group:
                    Label(row.label, systemImage: "person.3.fill").font(.body.weight(.bold))
                case .pause:
                    Label(row.text, systemImage: "cup.and.saucer.fill").font(.subheadline.italic())
                default:
                    Text(row.text.isEmpty ? "–" : row.text).font(.body.weight(.semibold))
                }

                Spacer(minLength: 4)

                if isMine {
                    Badge(text: "Ty", style: Theme.event)
                }
                if isNow {
                    Badge(text: "Teď", style: Theme.free)
                } else if canRequest {
                    Image(systemName: "ellipsis.circle")
                        .font(.title3)
                        .opacity(0.6)
                        .accessibilityLabel("Zrušit nebo přesunout")
                }
            }
            .foregroundStyle(style.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, row.kind == .pause ? 8 : 11)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(style.background))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(isMine ? Theme.accent : style.line.opacity(row.kind == .lesson && !isNow ? 0 : 1), lineWidth: isMine ? 2 : 1)
            )
            .opacity(isPast ? 0.45 : 1)
        }
    }
}

struct ScheduleRequestView: View {
    let date: String
    let row: ScheduleRow
    let canCancel: Bool
    let canMove: Bool
    let onDone: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var kind: String
    @State private var name: String
    @State private var preferred = ""
    @State private var phone = ""
    @State private var note = ""
    @State private var isSending = false
    @State private var error: String?

    init(date: String, row: ScheduleRow, canCancel: Bool, canMove: Bool, onDone: @escaping (String) -> Void) {
        self.date = date
        self.row = row
        self.canCancel = canCancel
        self.canMove = canMove
        self.onDone = onDone
        _kind = State(initialValue: canCancel ? "cancel" : "move")
        _name = State(initialValue: row.text)
    }

    private var kinds: [(String, String)] {
        (canCancel ? [("cancel", "Zrušit")] : []) + (canMove ? [("move", "Přesunout")] : [])
    }

    var body: some View {
        BrandSheet(
            title: canCancel ? "Zrušit nebo přesunout" : "Přesunout lekci",
            subtitle: row.text,
            primaryTitle: "Odeslat žádost",
            primaryDisabled: name.trimmingCharacters(in: .whitespaces).isEmpty,
            isWorking: isSending,
            onPrimary: { Task { await send() } }
        ) {
            VStack(alignment: .leading, spacing: 6) {
                Badge(text: "Lekce", style: Theme.training)
                Text("\(row.start ?? "")–\(row.end ?? "")").font(.largeTitle.weight(.heavy).monospacedDigit())
                Text("\(Dates.dayTitle(date).capitalized(with: Dates.czech)) · \(row.text)")
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(Theme.training.ink)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.training.background))

            VStack(alignment: .leading, spacing: 14) {
                if kinds.count > 1 {
                    ChoicePills(options: kinds, selection: $kind)
                }
                if !canCancel {
                    FieldNote(text: "Zrušit lekci už přes rozpis nejde (šlo týden před příjezdem trenéra) – jen po osobní domluvě s organizátorem.")
                }
                if kind == "move" {
                    Label("Přesun nemusí jít – záleží na volných časech trenéra. Dokud ho nepotvrdíme, lekce platí.", systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.cleanup.ink)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.cleanup.background))
                    FieldBox(label: "Kdy by ti to šlo") {
                        TextField("např. odpoledne po 15:00", text: $preferred)
                    }
                }
            }
            .card()

            VStack(spacing: 14) {
                FieldBox(label: "Tvoje jméno") {
                    TextField("jméno", text: $name)
                }
                FieldBox(label: "Telefon (nepovinné)") {
                    TextField("abychom se ozvali", text: $phone)
                        .keyboardType(.phonePad)
                }
                NoteField(label: "Poznámka", placeholder: "nepovinné", text: $note)
            }
            .card()

            FieldNote(text: "Lekce platí, dokud ti zrušení nebo přesun nepotvrdíme.")

            if let error {
                ErrorBanner(text: error)
            }
        }
    }

    private func send() async {
        isSending = true
        defer { isSending = false }

        do {
            let response = try await API.send(
                "POST",
                "/api/rozpis/zadosti",
                body: [
                    "date": date,
                    "kind": kind,
                    "lessonName": row.text,
                    "note": note.trimmingCharacters(in: .whitespacesAndNewlines),
                    "phone": phone.trimmingCharacters(in: .whitespaces),
                    "preferred": preferred.trimmingCharacters(in: .whitespaces),
                    "requesterName": name.trimmingCharacters(in: .whitespaces),
                    "start": row.start ?? "",
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

// Links the account with the dancer's name in the schedule (saved in the
// profile, so it works on every device).
struct ScheduleNameView: View {
    let current: String
    let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var isSaving = false
    @State private var error: String?

    var body: some View {
        BrandSheet(
            title: "Jméno v rozpisu",
            subtitle: "Jak tě píše externí trenér",
            primaryTitle: "Uložit",
            isWorking: isSaving,
            onPrimary: { Task { await save() } }
        ) {
            VStack(spacing: 10) {
                FieldBox(label: "Jméno v rozpisu") {
                    TextField("např. Novák", text: $name)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                }
                FieldNote(text: "Stačí příjmení, jak je v rozpisu (\"Novák\" najde i řádek „Novák / Dvořáková“). Prázdné = zrušit propojení.")
            }
            .card()

            if let error {
                ErrorBanner(text: error)
            }
        }
        .presentationDetents([.medium])
        .onAppear { name = current }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        do {
            let wanted = name.trimmingCharacters(in: .whitespaces)
            let response = try await API.send(
                "PUT",
                "/api/account/profile",
                body: ["scheduleName": wanted],
                as: ProfileSaveResponse.self
            )
            try response.check(scheduleName: wanted)
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
