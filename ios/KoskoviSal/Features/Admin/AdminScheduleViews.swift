import SwiftUI

private struct ScheduleDraft: Decodable {
    let title: String
    let body: String
    let published: Bool
    let cancelTrainings: Bool?
}

// The visiting trainer's schedule: plain text as the trainer sends it, with
// a live preview; publishing puts it on the public page and into the hall
// calendar.
struct AdminScheduleView: View {
    @State private var title = ""
    @State private var text = ""
    @State private var published = false
    @State private var cancelTrainings = false
    @State private var isLoaded = false
    @State private var isSaving = false
    @State private var showsPreview = false
    @State private var error: String?
    @State private var notice: String?

    private var days: [ScheduleDay] { ScheduleParser.parse(text, todayKey: Dates.todayKey()) }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let notice { NoticeBanner(text: notice) }
                if let error { ErrorBanner(text: error) }

                VStack(spacing: 12) {
                    FieldBox(label: "Nadpis") {
                        TextField("Externí trenér", text: $title)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Rozpis (jak ho trenér pošle)")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.inkMuted)
                        TextEditor(text: $text)
                            .font(.callout.monospaced())
                            .frame(minHeight: 260)
                            .scrollContentBackground(.hidden)
                            .padding(8)
                            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.subtle))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line, lineWidth: 1))
                        Text("Řádek s datem (5.11.) začíná den, řádky „10:00–10:45 – Jméno“ jsou lekce. Oběd a pauza se poznají, GROUP je seminář.")
                            .font(.caption)
                            .foregroundStyle(Theme.inkMuted)
                    }
                    Toggle(isOn: $published) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Zveřejnit").font(.body.weight(.semibold))
                            Text("Uvidí ho všichni i bez přihlášení, propíše se do kalendáře sálu.").font(.caption).foregroundStyle(Theme.inkMuted)
                        }
                    }
                    .tint(Theme.accent)
                    Toggle(isOn: $cancelTrainings) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Zrušit tréninky v té době").font(.body.weight(.semibold))
                            Text("Jinak poběží tréninky vedle bloku trenéra.").font(.caption).foregroundStyle(Theme.inkMuted)
                        }
                    }
                    .tint(Theme.accent)
                }
                .card()
                .disabled(!isLoaded)

                Button {
                    Task { await save() }
                } label: {
                    if isSaving { ProgressView().tint(.white) } else { Text("Uložit") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isSaving || !isLoaded)

                DisclosureGroup(isExpanded: $showsPreview) {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(days) { day in
                            if let date = day.dateKey {
                                Text(Dates.dayTitle(date).capitalized(with: Dates.czech))
                                    .font(.headline)
                                    .foregroundStyle(Theme.ink)
                                    .padding(.top, 6)
                            }
                            ForEach(day.rows) { row in
                                ScheduleRowView(row: row, isPast: false, isNow: false, canRequest: false)
                            }
                        }
                    }
                    .padding(.top, 8)
                } label: {
                    Label("Náhled (\(days.count) dní)", systemImage: "eye")
                        .font(.headline)
                        .foregroundStyle(Theme.ink)
                }
                .card()
            }
            .padding(16)
        }
        .pageBackground()
        .navigationTitle("Rozpis")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            let draft = try await API.get("/api/rozpis", as: ScheduleDraft.self)
            title = draft.title
            text = draft.body
            published = draft.published
            cancelTrainings = draft.cancelTrainings ?? false
            isLoaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        do {
            let response = try await API.send(
                "PUT",
                "/api/rozpis",
                body: [
                    "body": text,
                    "cancelTrainings": cancelTrainings,
                    "published": published,
                    "title": title.trimmingCharacters(in: .whitespaces),
                ],
                as: MessageResponse.self
            )
            notice = response.message ?? "Uloženo."
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct AdminScheduleRequestsView: View {
    @State private var requests: [ScheduleRequest] = []
    @State private var isLoading = false
    @State private var error: String?
    @State private var showsDone = false

    private var shown: [ScheduleRequest] {
        requests.filter { showsDone || $0.status == "pending" }.sorted { ($0.date, $0.start) < ($1.date, $1.start) }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Picker("Zobrazit", selection: $showsDone) {
                    Text("Čekající").tag(false)
                    Text("Všechny").tag(true)
                }
                .pickerStyle(.segmented)

                AdminState(isLoading: isLoading, error: error, isEmpty: shown.isEmpty, emptyText: "Žádné žádosti.")

                ForEach(shown) { request in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Badge(text: request.kind == "move" ? "Přesun" : "Zrušení", style: request.kind == "move" ? Theme.event : Theme.busy)
                            Spacer()
                            if request.status == "done" {
                                Badge(text: "Vyřízeno", style: Theme.free)
                            }
                        }
                        Text("\(request.lessonName) · \(Dates.dayTitle(request.date)) \(request.start)–\(request.end)")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Theme.ink)
                        Text("Žádá: \(request.requesterName)").font(.subheadline).foregroundStyle(Theme.inkMuted)
                        if let preferred = request.preferred, !preferred.isEmpty {
                            Text("Hodilo by se: \(preferred)").font(.subheadline).foregroundStyle(Theme.inkMuted)
                        }
                        if let note = request.note, !note.isEmpty {
                            Text(note).font(.footnote).foregroundStyle(Theme.inkMuted)
                        }
                        HStack(spacing: 10) {
                            if let phone = request.phone, !phone.isEmpty, let url = URL(string: "https://wa.me/\(phone.filter(\.isNumber))") {
                                Link(destination: url) {
                                    Label("WhatsApp", systemImage: "message.fill")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.white)
                                        .frame(maxWidth: .infinity, minHeight: 40)
                                        .background(Capsule().fill(Color(red: 0.15, green: 0.68, blue: 0.38)))
                                }
                            }
                            Button(request.status == "done" ? "Vrátit" : "Vyřízeno") {
                                Task { await setStatus(request, request.status == "done" ? "pending" : "done") }
                            }
                            .buttonStyle(SecondaryButtonStyle())
                        }
                    }
                    .card()
                }
            }
            .padding(16)
        }
        .pageBackground()
        .navigationTitle("Žádosti z rozpisu")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            requests = try await API.get("/api/rozpis/zadosti", as: ScheduleRequestsResponse.self).requests
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setStatus(_ request: ScheduleRequest, _ status: String) async {
        do {
            _ = try await API.send("PATCH", "/api/rozpis/zadosti/\(API.segment(request.id))", body: ["status": status], as: Empty.self)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
