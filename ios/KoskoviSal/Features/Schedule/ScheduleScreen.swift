import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class ScheduleModel {
    private(set) var schedule: PublicScheduleResponse?
    private(set) var days: [ScheduleDay] = []
    var error: String?

    var isPublished: Bool { schedule?.published == true }

    // Requests to cancel or move a lesson are accepted a day from publishing.
    var requestsUntil: Date? {
        schedule?.publishedAt.flatMap(Dates.isoDate).map { $0.addingTimeInterval(24 * 60 * 60) }
    }

    var canRequest: Bool {
        guard let requestsUntil else { return false }
        return Date() < requestsUntil
    }

    func load() async {
        do {
            let schedule: PublicScheduleResponse

            if Demo.isOn {
                schedule = Demo.schedule
            } else {
                schedule = try await API.get("/api/rozpis", as: PublicScheduleResponse.self)
            }

            self.schedule = schedule
            days = ScheduleParser.parse(schedule.body, todayKey: Dates.todayKey())
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ScheduleScreen: View {
    let model: ScheduleModel
    @State private var requestRow: RequestTarget?
    @State private var notice: String?

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

                    if let until = model.requestsUntil {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: model.canRequest ? "arrow.left.arrow.right.circle.fill" : "info.circle.fill")
                                .font(.title3)
                                .foregroundStyle(Theme.accent)
                            Text(
                                model.canRequest
                                    ? "Nemůžeš na lekci? Klepni na svůj řádek a pošli žádost o zrušení nebo přesun – jde to do \(until.formatted(.dateTime.weekday(.abbreviated).day().month(.defaultDigits).hour().minute().locale(Dates.czech)))."
                                    : "Zrušit nebo přesunout lekci šlo den od zveřejnění rozpisu. Teď se ozvi přímo správcům."
                            )
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

                                if canAsk(day: day.dateKey, row: row), let date = day.dateKey {
                                    Button {
                                        requestRow = RequestTarget(date: date, row: row)
                                    } label: {
                                        ScheduleRowView(row: row, isPast: past, isNow: current, canRequest: true)
                                    }
                                    .buttonStyle(.plain)
                                } else {
                                    ScheduleRowView(row: row, isPast: past, isNow: current, canRequest: false)
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
                BrandHeader(title: "Rozpis", subtitle: model.schedule?.title)
            }
            .toolbar(.hidden, for: .navigationBar)
            .refreshable { await model.load() }
            .sheet(item: $requestRow) { target in
                ScheduleRequestView(date: target.date, row: target.row) { message in
                    notice = message
                }
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
        model.canRequest && row.kind == .lesson && !isPast(day: day, row: row)
    }
}

struct ScheduleRowView: View {
    let row: ScheduleRow
    let isPast: Bool
    let isNow: Bool
    let canRequest: Bool

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
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(style.line.opacity(row.kind == .lesson && !isNow ? 0 : 1), lineWidth: 1))
            .opacity(isPast ? 0.45 : 1)
        }
    }
}

struct ScheduleRequestView: View {
    let date: String
    let row: ScheduleRow
    let onDone: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var kind = "cancel"
    @State private var name: String
    @State private var preferred = ""
    @State private var phone = ""
    @State private var note = ""
    @State private var isSending = false
    @State private var error: String?

    init(date: String, row: ScheduleRow, onDone: @escaping (String) -> Void) {
        self.date = date
        self.row = row
        self.onDone = onDone
        _name = State(initialValue: row.text)
    }

    var body: some View {
        BrandSheet(
            title: "Zrušit nebo přesunout",
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

            VStack(spacing: 14) {
                ChoicePills(options: [("cancel", "Zrušit"), ("move", "Přesunout")], selection: $kind)
                if kind == "move" {
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
