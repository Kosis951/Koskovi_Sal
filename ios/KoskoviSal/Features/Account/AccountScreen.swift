import SwiftUI

struct AccountScreen: View {
    @Environment(SessionModel.self) private var session
    @Environment(PushModel.self) private var push
    @Environment(\.refreshApp) private var refreshApp
    @State private var isSigningIn = false
    @State private var isEditingProfile = false
    @State private var isChangingPassword = false
    @State private var isConfirmingSignOut = false
    @State private var isDeletingAccount = false
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
                        PartnerCard()
                            .tourTarget(.partner)
                    } else {
                        SignInPrompt(
                            icon: "person.crop.circle",
                            title: "Přihlášení",
                            text: "Stejný účet jako na webu. Bez přihlášení vidíš kalendář sálu a rozpis, s účtem i své lekce."
                        ) { isSigningIn = true }
                    }

                    notificationsCard
                        .tourTarget(.notifications)
                    linksCard

                    // Out of the way at the very bottom, so nobody taps it by chance.
                    if session.isSignedIn {
                        Button {
                            isDeletingAccount = true
                        } label: {
                            Label("Smazat účet", systemImage: "trash")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Theme.busy.ink)
                                .padding(.vertical, 8)
                                .padding(.horizontal, 16)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 18)
                    }

                    Text("TK Koškovi \(appVersion)")
                        .font(.footnote)
                        .foregroundStyle(Theme.inkSoft)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .tourScroll(.account)
            .pageBackground()
            .safeAreaInset(edge: .top, spacing: 0) {
                BrandHeader(title: "Účet", subtitle: session.isSignedIn ? session.displayName : "Nepřihlášen/a")
            }
            .toolbar(.hidden, for: .navigationBar)
            .tourOverlay(.account)
            .refreshable { await refreshApp() }
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
            .sheet(isPresented: $isDeletingAccount) {
                DeleteAccountView { message in
                    notice = message
                    Task { await session.signOut() }
                }
            }
            .alert("Odhlásit se?", isPresented: $isConfirmingSignOut) {
                Button("Zpět", role: .cancel) {}
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

            if session.hasTrainerRequest {
                Label("Žádost o trenérský účet čeká na schválení správcem. Do té doby máš účet tanečníka.", systemImage: "hourglass")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.cleanup.ink)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Theme.cleanup.background))
            }

            VStack(spacing: 0) {
                AccountRow(icon: "person.text.rectangle", title: "Můj profil", detail: "Jméno, příjmení, e-mail, telefon") {
                    isEditingProfile = true
                }
                Divider().padding(.leading, 44)
                AccountRow(icon: "key", title: "Změnit heslo", detail: nil) {
                    isChangingPassword = true
                }
                Divider().padding(.leading, 44)
                AccountRow(icon: "sparkles", title: "Průvodce aplikací", detail: "Ukáže, kde co najdeš") {
                    TourModel.shared.start()
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

            if push.topics.contains(.lessons) && (!session.isSignedIn || session.scheduleName == nil) {
                FieldNote(text: session.isSignedIn
                    ? "Pro připomínky lekcí vyplň v profilu, jak tě píše trenér v rozpisu."
                    : "Připomínky lekcí fungují s přihlášeným účtem a jménem v rozpisu.")
            } else if push.topics.contains(.lessons) {
                FieldNote(text: "Hodinu před tvou lekcí (\(session.scheduleName ?? "")) přijde upozornění a na zamčené obrazovce i v Dynamic Islandu se spustí odpočet.")
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
            if session.canAdminister {
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
        let firstName: String?
        let lastName: String?
        let email: String?
        let partnerName: String?
        let phone: String?
        let scheduleName: String?
    }

    let profile: Profile
}

struct ProfileView: View {
    let onSaved: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var partnerName = ""
    @State private var phone = ""
    @State private var scheduleName = ""
    @State private var isLoaded = false
    @State private var isSaving = false
    @State private var error: String?

    var body: some View {
        BrandSheet(
            title: "Můj profil",
            subtitle: "Jak tě uvidí ostatní",
            primaryTitle: "Uložit",
            primaryDisabled: !isLoaded,
            isWorking: isSaving,
            onPrimary: { Task { await save() } }
        ) {
            if !isLoaded {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 30)
            } else {
                VStack(spacing: 14) {
                    HStack(spacing: 12) {
                        FieldBox(label: "Jméno") {
                            TextField("Jana", text: $firstName)
                                .textContentType(.givenName)
                        }
                        FieldBox(label: "Příjmení") {
                            TextField("Nováková", text: $lastName)
                                .textContentType(.familyName)
                        }
                    }
                    FieldNote(text: "Podle příjmení najdeme tvoje lekce v rozpisu externího trenéra.")
                    FieldBox(label: "Partner/ka bez vlastního účtu") {
                        TextField("jméno", text: $partnerName)
                    }
                    FieldNote(text: "Když tančí s tebou na jeden účet. Partner/ka s vlastním účtem se propojí v Účtu → Partner/ka.")
                    FieldBox(label: "Jméno v rozpisu (jen když tě trenér píše jinak)") {
                        TextField("např. Novák", text: $scheduleName)
                            .autocorrectionDisabled()
                    }
                }
                .card()

                VStack(spacing: 14) {
                    FieldBox(label: "E-mail") {
                        TextField("jana@seznam.cz", text: $email)
                            .keyboardType(.emailAddress)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    FieldNote(text: "Pro zprávy ze sálu a obnovení hesla.")
                    FieldBox(label: "Telefon") {
                        TextField("777 123 456", text: $phone)
                            .keyboardType(.phonePad)
                            .textContentType(.telephoneNumber)
                    }
                    FieldNote(text: "Nepovinné. Vidí ho jen trenér, u kterého máš lekci, aby ti mohl napsat přes WhatsApp.")
                }
                .card()
            }

            if let error {
                ErrorBanner(text: error)
            }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            let response = try await API.get("/api/account/profile", as: ProfileResponse.self)
            firstName = response.profile.firstName ?? ""
            lastName = response.profile.lastName ?? ""
            // Older accounts: split the shown name once.
            if firstName.isEmpty && lastName.isEmpty, let name = response.profile.displayName {
                let parts = name.split(separator: " ", maxSplits: 1).map(String.init)
                firstName = parts.first ?? ""
                lastName = parts.count > 1 ? parts[1] : ""
            }
            email = response.profile.email ?? ""
            partnerName = response.profile.partnerName ?? ""
            phone = response.profile.phone ?? ""
            scheduleName = response.profile.scheduleName ?? ""
        } catch {
            self.error = error.localizedDescription
        }
        isLoaded = true
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        do {
            let wantedScheduleName = scheduleName.trimmingCharacters(in: .whitespaces)
            let response = try await API.send(
                "PUT",
                "/api/account/profile",
                body: [
                    "displayName": [firstName, lastName]
                        .map { $0.trimmingCharacters(in: .whitespaces) }
                        .filter { !$0.isEmpty }
                        .joined(separator: " "),
                    "email": email.trimmingCharacters(in: .whitespaces),
                    "firstName": firstName.trimmingCharacters(in: .whitespaces),
                    "lastName": lastName.trimmingCharacters(in: .whitespaces),
                    "partnerName": partnerName.trimmingCharacters(in: .whitespaces),
                    "phone": phone.trimmingCharacters(in: .whitespaces),
                    "scheduleName": wantedScheduleName,
                ],
                as: ProfileSaveResponse.self
            )
            try response.check(scheduleName: wantedScheduleName)
            onSaved(response.message ?? "Profil je uložený.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// Deletes the signed-in account for good (asks for the password).
struct DeleteAccountView: View {
    let onDeleted: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var isDeleting = false
    @State private var error: String?

    var body: some View {
        BrandSheet(
            title: "Smazat účet",
            subtitle: "Tohle nejde vrátit",
            primaryTitle: "Smazat účet natrvalo",
            primaryDisabled: password.isEmpty,
            isWorking: isDeleting,
            onPrimary: { Task { await delete() } }
        ) {
            VStack(alignment: .leading, spacing: 14) {
                Text("Smažeme tvůj profil (jméno, příjmení, e-mail, telefon, partnera) i propojení s partnery a rozpisem. Telefon ti přestane posílat připomínky lekcí. Lekce, které už máš objednané, zůstanou trenérovi v kalendáři.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.inkMuted)
                FieldBox(label: "Heslo pro potvrzení") {
                    SecureField("heslo", text: $password)
                        .textContentType(.password)
                }
            }
            .card()

            if let error {
                ErrorBanner(text: error)
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func delete() async {
        isDeleting = true
        defer { isDeleting = false }

        do {
            let response = try await API.send("DELETE", "/api/account", body: ["password": password], as: MessageResponse.self)
            onDeleted(response.message ?? "Účet je smazaný.")
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
        BrandSheet(
            title: "Změnit heslo",
            primaryTitle: "Uložit nové heslo",
            primaryDisabled: current.isEmpty || new.count < 8,
            isWorking: isSaving,
            onPrimary: { Task { await save() } }
        ) {
            VStack(spacing: 14) {
                FieldBox(label: "Současné heslo") {
                    SecureField("heslo", text: $current)
                        .textContentType(.password)
                }
            }
            .card()

            VStack(spacing: 14) {
                FieldBox(label: "Nové heslo") {
                    SecureField("aspoň 8 znaků", text: $new)
                        .textContentType(.newPassword)
                }
                FieldBox(label: "Nové heslo znovu") {
                    SecureField("pro kontrolu", text: $repeated)
                        .textContentType(.newPassword)
                }
            }
            .card()

            if let error {
                ErrorBanner(text: error)
            }
        }
        .presentationDetents([.medium, .large])
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
