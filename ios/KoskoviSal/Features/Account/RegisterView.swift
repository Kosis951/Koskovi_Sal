import SwiftUI

// Registration without an invite: the dancer's account works right away.
struct RegisterView: View {
    @Environment(SessionModel.self) private var session
    @Environment(\.dismiss) private var dismiss
    let onRegistered: () -> Void
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var username = ""
    @State private var password = ""
    @State private var passwordAgain = ""
    @State private var isSaving = false
    @State private var error: String?

    private var isComplete: Bool {
        !firstName.trimmingCharacters(in: .whitespaces).isEmpty
            && !lastName.trimmingCharacters(in: .whitespaces).isEmpty
            && email.contains("@")
            && username.trimmingCharacters(in: .whitespaces).count >= 3
            && password.count >= 8
    }

    var body: some View {
        BrandSheet(
            title: "Nový účet",
            subtitle: "Po registraci můžeš hned objednávat lekce",
            primaryTitle: "Zaregistrovat se",
            primaryDisabled: !isComplete,
            isWorking: isSaving,
            onPrimary: { Task { await register() } }
        ) {
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
                FieldBox(label: "E-mail") {
                    TextField("jana@seznam.cz", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .card()

            VStack(spacing: 14) {
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
                    SecureField("pro kontrolu", text: $passwordAgain)
                        .textContentType(.newPassword)
                }
            }
            .card()

            if let error {
                ErrorBanner(text: error)
            }

            VStack(spacing: 6) {
                FieldNote(text: "Registrací souhlasíš se zpracováním údajů podle zásad ochrany soukromí.")
                Link("Zásady ochrany soukromí", destination: URL(string: "https://app.tkkoskovi.cz/privacy")!)
                    .font(.footnote.weight(.semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
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
                    "email": email.trimmingCharacters(in: .whitespaces),
                    "firstName": firstName.trimmingCharacters(in: .whitespaces),
                    "lastName": lastName.trimmingCharacters(in: .whitespaces),
                    "password": password,
                    "username": username.trimmingCharacters(in: .whitespaces),
                ],
                as: Empty.self
            )
            await session.refresh()
            dismiss()
            onRegistered()
            TourModel.shared.startAfterRegistration()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
