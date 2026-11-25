import SwiftUI

struct AccountScreen: View {
    @Environment(SessionModel.self) private var session
    @Environment(PushModel.self) private var push
    @State private var username = ""
    @State private var password = ""
    @State private var isSigningIn = false
    @State private var error: String?
    @FocusState private var focused: Field?

    enum Field { case username, password }

    var body: some View {
        NavigationStack {
            Form {
                if session.isSignedIn {
                    Section {
                        HStack(spacing: 14) {
                            Text(String(session.displayName.prefix(1)).uppercased())
                                .font(.title2.weight(.bold))
                                .foregroundStyle(.white)
                                .frame(width: 52, height: 52)
                                .background(Circle().fill(Theme.gradient))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(session.displayName).font(.headline)
                                Text(session.role?.label ?? "").font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)

                        Button("Odhlásit se", role: .destructive) {
                            Task { await session.signOut() }
                        }
                    }
                } else {
                    Section {
                        TextField("Přihlašovací jméno", text: $username)
                            .textContentType(.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focused, equals: .username)
                            .submitLabel(.next)
                            .onSubmit { focused = .password }
                        SecureField("Heslo", text: $password)
                            .textContentType(.password)
                            .focused($focused, equals: .password)
                            .submitLabel(.go)
                            .onSubmit { Task { await signIn() } }
                        Button {
                            Task { await signIn() }
                        } label: {
                            if isSigningIn {
                                ProgressView()
                            } else {
                                Text("Přihlásit se").fontWeight(.semibold)
                            }
                        }
                        .disabled(isSigningIn || username.isEmpty || password.isEmpty)
                    } header: {
                        Text("Přihlášení")
                    } footer: {
                        Text("Stejný účet jako na webu. Bez přihlášení vidíš kalendář sálu a rozpis.")
                    }

                    if let error {
                        Section { ErrorBanner(text: error) }
                    }
                }

                Section {
                    ForEach(PushTopic.allCases) { topic in
                        Toggle(topic.title, isOn: Binding(
                            get: { push.topics.contains(topic) },
                            set: { enabled in Task { await push.set(topic, enabled: enabled) } }
                        ))
                    }
                    if !push.topics.isEmpty && push.token != nil {
                        Button("Poslat zkušební upozornění") {
                            Task { await push.sendTest() }
                        }
                        .disabled(push.isBusy)
                    }
                } header: {
                    Text("Upozornění")
                } footer: {
                    if let message = push.message {
                        Text(message)
                    } else if !push.isAvailable {
                        Text("Server zatím upozornění pro aplikaci nemá zapnutá.")
                    }
                }

                Section("Web") {
                    if session.role?.canManageBookings == true {
                        Link(destination: AppConfig.webURL("/admin")) {
                            Label("Správa sálu", systemImage: "gearshape")
                        }
                    }
                    if session.isSignedIn {
                        Link(destination: AppConfig.webURL("/profil")) {
                            Label("Můj profil", systemImage: "person.text.rectangle")
                        }
                    }
                    Link(destination: AppConfig.baseURL) {
                        Label(AppConfig.baseURL.host() ?? "Web", systemImage: "safari")
                    }
                }

                Section {
                    LabeledContent("Verze", value: appVersion)
                }
            }
            .navigationTitle("Účet")
        }
    }

    private var appVersion: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? ""
        let build = info?["CFBundleVersion"] as? String ?? ""
        return "\(version) (\(build))"
    }

    private func signIn() async {
        guard !username.isEmpty, !password.isEmpty else { return }

        isSigningIn = true
        defer { isSigningIn = false }

        do {
            try await session.signIn(username: username.trimmingCharacters(in: .whitespaces), password: password)
            password = ""
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
