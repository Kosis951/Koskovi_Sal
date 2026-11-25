import SwiftUI

// Full-screen sign-in in the club's colours (shown from Účet and Lekce).
struct LoginView: View {
    @Environment(SessionModel.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var username = ""
    @State private var password = ""
    @State private var showsPassword = false
    @State private var isSigningIn = false
    @State private var isRegistering = false
    @State private var error: String?
    @FocusState private var focused: Field?

    enum Field { case username, password }

    var body: some View {
        ZStack {
            Theme.gradient.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 26) {
                    VStack(spacing: 14) {
                        Image("LogoMark")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 92, height: 82)
                            .padding(.top, 36)
                            .accessibilityHidden(true)
                        Text("Vítej v TK Koškovi")
                            .font(.largeTitle.weight(.heavy))
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.center)
                        Text("Přihlas se stejným účtem jako na webu sal.tkkoskovi.cz.")
                            .font(.callout)
                            .foregroundStyle(Theme.accentSoft)
                            .multilineTextAlignment(.center)
                    }

                    VStack(spacing: 16) {
                        FieldBox(label: "Přihlašovací jméno") {
                            TextField("jméno", text: $username)
                                .textContentType(.username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($focused, equals: .username)
                                .submitLabel(.next)
                                .onSubmit { focused = .password }
                        }

                        FieldBox(label: "Heslo") {
                            HStack {
                                Group {
                                    if showsPassword {
                                        TextField("heslo", text: $password)
                                            .textInputAutocapitalization(.never)
                                            .autocorrectionDisabled()
                                    } else {
                                        SecureField("heslo", text: $password)
                                    }
                                }
                                .textContentType(.password)
                                .focused($focused, equals: .password)
                                .submitLabel(.go)
                                .onSubmit { Task { await signIn() } }

                                Button {
                                    showsPassword.toggle()
                                } label: {
                                    Image(systemName: showsPassword ? "eye.slash" : "eye")
                                        .foregroundStyle(Theme.inkSoft)
                                }
                                .accessibilityLabel(showsPassword ? "Skrýt heslo" : "Zobrazit heslo")
                            }
                        }

                        if let error {
                            ErrorBanner(text: error)
                        }

                        Button {
                            Task { await signIn() }
                        } label: {
                            if isSigningIn {
                                ProgressView().tint(.white)
                            } else {
                                Text("Přihlásit se")
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(isSigningIn || username.isEmpty || password.isEmpty)
                    }
                    .padding(22)
                    .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Theme.surface))
                    .shadow(color: .black.opacity(0.18), radius: 24, y: 10)

                    VStack(spacing: 10) {
                        Text("Nemáš účet?")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.white)
                        Button("Zaregistrovat se") { isRegistering = true }
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(Capsule().stroke(.white.opacity(0.7), lineWidth: 1.5))
                        Text("Kalendář sálu a rozpis vidíš i bez přihlášení.")
                            .font(.footnote)
                            .foregroundStyle(Theme.accentSoft)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.horizontal, 12)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .overlay(alignment: .topTrailing) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(.white.opacity(0.18)))
            }
            .padding(16)
            .accessibilityLabel("Zavřít")
        }
        .onAppear { focused = .username }
        .sheet(isPresented: $isRegistering) {
            RegisterView { dismiss() }
        }
    }

    private func signIn() async {
        guard !username.isEmpty, !password.isEmpty, !isSigningIn else { return }

        isSigningIn = true
        defer { isSigningIn = false }

        do {
            try await session.signIn(username: username.trimmingCharacters(in: .whitespaces), password: password)
            password = ""
            error = nil
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
