import SwiftUI

// A dancing couple with two accounts: one asks, the other accepts, and both
// then see the lessons of either of them. Only names are shown.
private struct Partnerships: Decodable {
    struct Person: Decodable, Identifiable, Hashable {
        let id: String
        let name: String
        let username: String
    }

    let partner: Person?
    let incoming: [Person]
    let outgoing: [Person]
    var message: String?
}

private struct FoundPeople: Decodable {
    struct Person: Decodable, Identifiable, Hashable {
        let name: String
        let username: String
        var id: String { username }
    }

    let people: [Person]
}

struct PartnerCard: View {
    @State private var state: Partnerships?
    @State private var isSearching = false
    @State private var isConfirmingEnd = false
    @State private var isWorking = false
    @State private var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Partner/ka", systemImage: "person.2.fill")
                .font(.headline)
                .foregroundStyle(Theme.ink)

            if let partner = state?.partner {
                HStack {
                    Text(partner.name).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                    Spacer()
                    Badge(text: "Spojeno", style: Theme.free)
                }
                Text("Vidíte společně svoje lekce z rozpisu a oběma chodí připomínky.")
                    .font(.footnote)
                    .foregroundStyle(Theme.inkMuted)
                Button("Ukončit partnerství") { isConfirmingEnd = true }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.busy.ink)
            } else {
                ForEach(state?.incoming ?? []) { person in
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\(person.name) tě žádá o partnerství").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                        HStack(spacing: 10) {
                            Button("Přijmout") { Task { await respond(person.id, "accept") } }
                                .buttonStyle(PrimaryButtonStyle())
                            Button("Odmítnout") { Task { await respond(person.id, "decline") } }
                                .buttonStyle(SecondaryButtonStyle())
                        }
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Theme.training.background))
                }
                ForEach(state?.outgoing ?? []) { person in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(person.name).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                            Text("Čeká na potvrzení").font(.caption).foregroundStyle(Theme.inkMuted)
                        }
                        Spacer()
                        Button("Zrušit") { Task { await respond(person.id, "cancel") } }
                            .font(.footnote.weight(.semibold))
                    }
                }
                Text("Tančíte každý na svůj účet? Najdi partnera/ku podle příjmení a pošli žádost – pak uvidíte lekce společně.")
                    .font(.footnote)
                    .foregroundStyle(Theme.inkMuted)
                Button("Najít partnera/ku") { isSearching = true }
                    .buttonStyle(SecondaryButtonStyle())
            }

            if let message {
                Text(message).font(.footnote.weight(.semibold)).foregroundStyle(Theme.accent)
            }
        }
        .disabled(isWorking)
        .card()
        .task { await load() }
        .sheet(isPresented: $isSearching) {
            PartnerSearchView { text in
                message = text
                Task { await load() }
            }
        }
        .alert("Ukončit partnerství?", isPresented: $isConfirmingEnd) {
            Button("Zpět", role: .cancel) {}
            Button("Ukončit", role: .destructive) {
                if let id = state?.partner?.id { Task { await respond(id, "end") } }
            }
        } message: {
            Text("Přestanete vidět lekce toho druhého.")
        }
    }

    private func load() async {
        if Demo.isOn {
            state = Partnerships(partner: .init(id: "demo", name: "Martin Dvořák", username: "martin"), incoming: [], outgoing: [])
            return
        }
        state = try? await API.get("/api/account/partners", as: Partnerships.self)
    }

    private func respond(_ id: String, _ action: String) async {
        isWorking = true
        defer { isWorking = false }

        do {
            let response = try await API.send("PATCH", "/api/account/partners/\(API.segment(id))", body: ["action": action], as: Partnerships.self)
            state = response
            message = response.message
        } catch {
            message = error.localizedDescription
        }
    }
}

private struct PartnerSearchView: View {
    let onSent: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var people: [FoundPeople.Person] = []
    @State private var hasSearched = false
    @State private var isSearching = false
    @State private var sending: String?
    @State private var error: String?

    var body: some View {
        BrandSheet(title: "Najít partnera/ku", subtitle: "Napiš aspoň 3 písmena jména nebo příjmení") {
            VStack(spacing: 12) {
                FieldBox(label: "Jméno nebo příjmení") {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(Theme.inkSoft)
                        TextField("např. Dvořáková", text: $query)
                            .textContentType(.name)
                            .autocorrectionDisabled()
                            .submitLabel(.search)
                        if isSearching {
                            ProgressView().controlSize(.small)
                        } else if !query.isEmpty {
                            Button {
                                query = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.inkSoft)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Smazat")
                        }
                    }
                }
                FieldNote(text: "Na velikosti písmen ani háčcích a čárkách nezáleží.")
            }
            .card()

            if hasSearched && people.isEmpty && !isSearching {
                EmptyCard(icon: "person.crop.circle.badge.questionmark", title: "Nikoho jsme nenašli", text: "Partner/ka si musí v profilu vyplnit jméno a příjmení.")
            }

            if !people.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(people.enumerated()), id: \.element.id) { index, person in
                        if index > 0 { Divider() }
                        HStack(spacing: 12) {
                            Text(initials(person.name))
                                .font(.footnote.weight(.bold))
                                .foregroundStyle(.white)
                                .frame(width: 36, height: 36)
                                .background(Circle().fill(Theme.gradient))
                            Text(person.name).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                            Spacer()
                            Button("Poslat žádost") { Task { await request(person) } }
                                .font(.subheadline.weight(.bold))
                                .disabled(sending != nil)
                        }
                        .padding(.vertical, 10)
                    }
                }
                .card(padding: 14)
                .transition(.opacity)
            }

            if let error {
                ErrorBanner(text: error)
            }
        }
        // Suggestions while typing: a short pause after the last letter, then ask.
        .task(id: query) {
            let wanted = query.trimmingCharacters(in: .whitespaces)
            guard wanted.count >= 3 else {
                withAnimation(.snappy) {
                    people = []
                    hasSearched = false
                }
                return
            }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await search(wanted)
        }
    }

    private func initials(_ name: String) -> String {
        name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    private func search(_ wanted: String) async {
        isSearching = true
        defer { isSearching = false }

        do {
            let encoded = wanted.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? wanted
            let found = try await API.get("/api/account/partners/search?q=\(encoded)", as: FoundPeople.self).people
            guard !Task.isCancelled else { return }
            withAnimation(.snappy) {
                people = found
                hasSearched = true
            }
            error = nil
        } catch {
            guard !Task.isCancelled else { return }
            self.error = error.localizedDescription
        }
    }

    private func request(_ person: FoundPeople.Person) async {
        sending = person.username
        defer { sending = nil }

        do {
            let response = try await API.send("POST", "/api/account/partners", body: ["username": person.username], as: Partnerships.self)
            onSent(response.message ?? "Žádost je odeslaná.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
