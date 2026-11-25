import SwiftUI

// Registration without an invite: the dancer's account works right away.
struct RegisterView: View {
    @Environment(SessionModel.self) private var session
    @Environment(\.dismiss) private var dismiss
    let onRegistered: () -> Void
    @State private var displayName = ""
    @State private var email = ""
    @State private var username = ""
    @State private var password = ""
    @State private var passwordAgain = ""
    @State private var isSaving = false
    @State private var error: String?

    private var isComplete: Bool {
        !displayName.trimmingCharacters(in: .whitespaces).isEmpty
            && email.contains("@")
            && username.trimmingCharacters(in: .whitespaces).count >= 3
            && password.count >= 8
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    VStack(spacing: 6) {
                        Text("Nový účet")
                            .font(.title.weight(.heavy))
                            .foregroundStyle(Theme.ink)
                        Text("Po registraci můžeš hned objednávat lekce u trenérů.")
                            .font(.callout)
                            .foregroundStyle(Theme.inkMuted)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 8)

                    VStack(spacing: 14) {
                        FieldBox(label: "Jméno a příjmení") {
                            TextField("Jana Nováková", text: $displayName)
                                .textContentType(.name)
                        }
                        FieldBox(label: "E-mail") {
                            TextField("jana@seznam.cz", text: $email)
                                .textContentType(.emailAddress)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                        FieldBox(label: "Přihlašovací jméno") {
                            TextField("jana", text: $username)
                                .textContentType(.username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                        FieldBox(label: "Heslo (aspoň 8 znaků)") {
                            SecureField("heslo", text: $password)
                                .textContentType(.newPassword)
                        }
                        FieldBox(label: "Heslo znovu") {
                            SecureField("heslo", text: $passwordAgain)
                                .textContentType(.newPassword)
                        }
                    }
                    .card()

                    if let error {
                        ErrorBanner(text: error)
                    }

                    Button {
                        Task { await register() }
                    } label: {
                        if isSaving { ProgressView().tint(.white) } else { Text("Zaregistrovat se") }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isSaving || !isComplete)

                    Text("Registrací souhlasíš se zpracováním údajů podle zásad ochrany soukromí.")
                        .font(.footnote)
                        .foregroundStyle(Theme.inkMuted)
                        .multilineTextAlignment(.center)
                    Link("Zásady ochrany soukromí", destination: URL(string: "https://app.tkkoskovi.cz/privacy")!)
                        .font(.footnote.weight(.semibold))
                }
                .padding(16)
            }
            .pageBackground()
            .navigationTitle("Registrace")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zavřít") { dismiss() }
                }
            }
        }
    }

    private func register() async {
        guard password == passwordAgain else {
            error = "Hesla se neshodují."
            return
        }

        isSaving = true
        defer { isSaving = false }

        do {
            _ = try await API.send(
                "POST",
                "/api/auth/register",
                body: [
                    "displayName": displayName.trimmingCharacters(in: .whitespaces),
                    "email": email.trimmingCharacters(in: .whitespaces),
                    "password": password,
                    "username": username.trimmingCharacters(in: .whitespaces),
                ],
                as: Empty.self
            )
            await session.refresh()
            dismiss()
            onRegistered()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
