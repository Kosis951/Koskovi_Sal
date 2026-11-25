import SwiftUI

struct AccountScreen: View {
    @Environment(SessionModel.self) private var session
    @Environment(PushModel.self) private var push
    @State private var isSigningIn = false
    @State private var isEditingProfile = false
    @State private var isChangingPassword = false
    @State private var isConfirmingSignOut = false
    @State private var notice: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let notice {
                        NoticeBanner(text: notice)
                    }

                    if session.isSignedIn {
                        profileCard
                    } else {
                        SignInPrompt(
                            icon: "person.crop.circle",
                            title: "Přihlášení",
                            text: "Stejný účet jako na webu. Bez přihlášení vidíš kalendář sálu a rozpis, s účtem i své lekce."
                        ) { isSigningIn = true }
                    }

                    notificationsCard
                    linksCard

                    Text("TK Koškovi \(appVersion)")
                        .font(.footnote)
                        .foregroundStyle(Theme.inkSoft)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .pageBackground()
            .safeAreaInset(edge: .top, spacing: 0) {
                BrandHeader(title: "Účet", subtitle: session.isSignedIn ? session.displayName : "Nepřihlášen/a")
            }
            .toolbar(.hidden, for: .navigationBar)
            .fullScreenCover(isPresented: $isSigningIn) {
                LoginView()
            }
            .sheet(isPresented: $isEditingProfile) {
                ProfileView { message in
                    notice = message
                    Task { await session.refresh() }
                }
            }
            .sheet(isPresented: $isChangingPassword) {
                PasswordView { message in notice = message }
            }
            .confirmationDialog("Odhlásit se?", isPresented: $isConfirmingSignOut, titleVisibility: .visible) {
                Button("Odhlásit se", role: .destructive) {
                    Task { await session.signOut() }
                }
            }
        }
    }

    private var profileCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                Text(String(session.displayName.prefix(1)).uppercased())
                    .font(.title.weight(.heavy))
                    .foregroundStyle(.white)
                    .frame(width: 60, height: 60)
                    .background(Circle().fill(Theme.gradient))
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.displayName)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(Theme.ink)
                    if let role = session.role {
                        Badge(text: role.label, style: Theme.training)
                    }
                }
                Spacer(minLength: 0)
            }

            VStack(spacing: 0) {
                AccountRow(icon: "person.text.rectangle", title: "Můj profil", detail: "Jméno, partner/ka, telefon") {
                    isEditingProfile = true
                }
                Divider().padding(.leading, 44)
                AccountRow(icon: "key", title: "Změnit heslo", detail: nil) {
                    isChangingPassword = true
                }
                Divider().padding(.leading, 44)
                AccountRow(icon: "rectangle.portrait.and.arrow.right", title: "Odhlásit se", detail: nil, tint: Theme.busy.ink) {
                    isConfirmingSignOut = true
                }
            }
        }
        .card()
    }

    private var notificationsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Upozornění", systemImage: "bell.badge")
                .font(.headline)
                .foregroundStyle(Theme.ink)

            ForEach(PushTopic.allCases) { topic in
                Toggle(isOn: Binding(
                    get: { push.topics.contains(topic) },
                    set: { enabled in Task { await push.set(topic, enabled: enabled) } }
                )) {
                    Text(topic.title).font(.subheadline.weight(.medium)).foregroundStyle(Theme.ink)
                }
                .tint(Theme.accent)
            }

            if !push.topics.isEmpty && push.token != nil {
                Button("Poslat zkušební upozornění") {
                    Task { await push.sendTest() }
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(push.isBusy)
            }

            if let message = push.message {
                Text(message).font(.footnote).foregroundStyle(Theme.inkMuted)
            } else if !push.isAvailable {
                Text("Server zatím upozornění pro aplikaci nemá zapnutá.").font(.footnote).foregroundStyle(Theme.inkMuted)
            } else {
                Text("Dáme vědět, když bude sál dnes obsazený, trénink odpadne nebo sál čeká na úklid.")
                    .font(.footnote)
                    .foregroundStyle(Theme.inkMuted)
            }
        }
        .card()
    }

    private var linksCard: some View {
        VStack(spacing: 0) {
            if session.role?.canManageBookings == true {
                LinkRow(icon: "gearshape", title: "Správa sálu na webu", url: AppConfig.webURL("/admin"))
                Divider().padding(.leading, 44)
            }
            LinkRow(icon: "safari", title: "Web sal.tkkoskovi.cz", url: AppConfig.baseURL)
            Divider().padding(.leading, 44)
            LinkRow(icon: "questionmark.circle", title: "Podpora", url: URL(string: "https://app.tkkoskovi.cz/support")!)
            Divider().padding(.leading, 44)
            LinkRow(icon: "hand.raised", title: "Ochrana soukromí", url: URL(string: "https://app.tkkoskovi.cz/privacy")!)
        }
        .card(padding: 8)
    }

    private var appVersion: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? ""
        let build = info?["CFBundleVersion"] as? String ?? ""
        return "\(version) (\(build))"
    }
}

struct AccountRow: View {
    let icon: String
    let title: String
    let detail: String?
    var tint: Color = Theme.ink
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .foregroundStyle(tint == Theme.ink ? Theme.accent : tint)
                    .frame(width: 30)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.body.weight(.semibold)).foregroundStyle(tint)
                    if let detail {
                        Text(detail).font(.caption).foregroundStyle(Theme.inkMuted)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Theme.inkSoft)
            }
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct LinkRow: View {
    let icon: String
    let title: String
    let url: URL

    var body: some View {
        Link(destination: url) {
            HStack(spacing: 12) {
                Image(systemName: icon).foregroundStyle(Theme.accent).frame(width: 30)
                Text(title).font(.body.weight(.medium)).foregroundStyle(Theme.ink)
                Spacer()
                Image(systemName: "arrow.up.right").font(.caption.weight(.bold)).foregroundStyle(Theme.inkSoft)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 12)
        }
    }
}

// --- Profile and password ---

private struct ProfileResponse: Decodable {
    struct Profile: Decodable {
        let displayName: String?
        let partnerName: String?
        let phone: String?
    }

    let profile: Profile
}

struct ProfileView: View {
    let onSaved: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var displayName = ""
    @State private var partnerName = ""
    @State private var phone = ""
    @State private var isLoaded = false
    @State private var isSaving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Jméno a příjmení", text: $displayName)
                        .textContentType(.name)
                    TextField("Stálý partner/ka", text: $partnerName)
                } header: {
                    Text("Jak tě uvidí ostatní")
                } footer: {
                    Text("Partnera předvyplníme při objednávání lekce.")
                }
                Section {
                    TextField("Telefon", text: $phone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                } footer: {
                    Text("Vidí ho jen trenér, u kterého máš lekci, aby ti mohl napsat přes WhatsApp.")
                }
                if let error {
                    Section { ErrorBanner(text: error) }
                }
            }
            .disabled(!isLoaded)
            .overlay { if !isLoaded { ProgressView() } }
            .navigationTitle("Můj profil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { Task { await save() } }.disabled(isSaving || !isLoaded)
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        do {
            let response = try await API.get("/api/account/profile", as: ProfileResponse.self)
            displayName = response.profile.displayName ?? ""
            partnerName = response.profile.partnerName ?? ""
            phone = response.profile.phone ?? ""
        } catch {
            self.error = error.localizedDescription
        }
        isLoaded = true
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        do {
            let response = try await API.send(
                "PUT",
                "/api/account/profile",
                body: [
                    "displayName": displayName.trimmingCharacters(in: .whitespaces),
                    "partnerName": partnerName.trimmingCharacters(in: .whitespaces),
                    "phone": phone.trimmingCharacters(in: .whitespaces),
                ],
                as: MessageResponse.self
            )
            onSaved(response.message ?? "Profil je uložený.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct PasswordView: View {
    let onSaved: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var current = ""
    @State private var new = ""
    @State private var repeated = ""
    @State private var isSaving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Současné heslo", text: $current)
                        .textContentType(.password)
                }
                Section {
                    SecureField("Nové heslo", text: $new)
                        .textContentType(.newPassword)
                    SecureField("Nové heslo znovu", text: $repeated)
                        .textContentType(.newPassword)
                } footer: {
                    Text("Aspoň 8 znaků.")
                }
                if let error {
                    Section { ErrorBanner(text: error) }
                }
            }
            .navigationTitle("Změnit heslo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { Task { await save() } }
                        .disabled(isSaving || current.isEmpty || new.count < 8)
                }
            }
        }
    }

    private func save() async {
        guard new == repeated else {
            error = "Nová hesla se neshodují."
            return
        }

        isSaving = true
        defer { isSaving = false }

        do {
            let response = try await API.send(
                "POST",
                "/api/account/password",
                body: ["currentPassword": current, "newPassword": new],
                as: MessageResponse.self
            )
            onSaved(response.message ?? "Heslo je změněné.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
