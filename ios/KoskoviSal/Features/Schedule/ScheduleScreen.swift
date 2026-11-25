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
            let schedule = try await API.get("/api/rozpis", as: PublicScheduleResponse.self)
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
            List {
                if let notice {
                    Section { Label(notice, systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
                }
                if let error = model.error {
                    Section { ErrorBanner(text: error) }
                }

                if let until = model.requestsUntil {
                    Section {
                        Text(
                            model.canRequest
                                ? "Nemůžeš na lekci? Přejeď po svém řádku doleva a pošli žádost o zrušení nebo přesun – jde to do \(until.formatted(.dateTime.weekday(.abbreviated).day().month(.defaultDigits).hour().minute().locale(Dates.czech)))."
                                : "Zrušit nebo přesunout lekci šlo den od zveřejnění rozpisu. Teď se ozvi přímo správcům."
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }
                }

                ForEach(model.days) { day in
                    Section {
                        ForEach(day.rows) { row in
                            ScheduleRowView(row: row, isPast: isPast(day: day.dateKey, row: row))
                                .swipeActions(edge: .trailing) {
                                    if canAsk(day: day.dateKey, row: row), let date = day.dateKey {
                                        Button("Zrušit / přesunout") {
                                            requestRow = RequestTarget(date: date, row: row)
                                        }
                                        .tint(.orange)
                                    }
                                }
                        }
                    } header: {
                        Text(day.dateKey.map(Dates.dayTitle) ?? "")
                    }
                }
            }
            .navigationTitle(model.schedule?.title ?? "Rozpis")
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

    private func canAsk(day: String?, row: ScheduleRow) -> Bool {
        model.canRequest && row.kind == .lesson && !isPast(day: day, row: row)
    }
}

struct ScheduleRowView: View {
    let row: ScheduleRow
    let isPast: Bool

    var body: some View {
        HStack(spacing: 12) {
            if let start = row.start, let end = row.end {
                Text("\(start)–\(end)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(width: 96, alignment: .leading)
            }

            switch row.kind {
            case .pause:
                Text(row.text).italic().foregroundStyle(.secondary)
            case .group:
                Label(row.label, systemImage: "person.3.fill")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Theme.accent)
            case .lesson:
                Text(row.text.isEmpty ? "–" : row.text).font(.body.weight(.semibold))
            case .note:
                Text(row.text).font(.footnote).foregroundStyle(.secondary)
            }

            Spacer()
        }
        .opacity(isPast ? 0.45 : 1)
        .listRowBackground(row.kind == .group ? Theme.accent.opacity(0.1) : nil)
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
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Lekce", value: row.text)
                    LabeledContent("Kdy", value: "\(Dates.dayTitle(date)) \(row.start ?? "")–\(row.end ?? "")")
                }
                Section {
                    Picker("Žádost", selection: $kind) {
                        Text("Zrušit").tag("cancel")
                        Text("Přesunout").tag("move")
                    }
                    .pickerStyle(.segmented)
                    if kind == "move" {
                        TextField("Kdy by ti to šlo", text: $preferred)
                    }
                }
                Section {
                    TextField("Tvoje jméno", text: $name)
                    TextField("Telefon (nepovinné)", text: $phone)
                        .keyboardType(.phonePad)
                    TextField("Poznámka", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                } footer: {
                    Text("Lekce platí, dokud ti zrušení nebo přesun nepotvrdíme.")
                }
                if let error {
                    Section { ErrorBanner(text: error) }
                }
            }
            .navigationTitle("Zrušit nebo přesunout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zavřít") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Odeslat") { Task { await send() } }
                        .disabled(isSending || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
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
