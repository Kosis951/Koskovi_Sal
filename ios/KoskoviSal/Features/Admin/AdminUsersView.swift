import SwiftUI

struct AdminUsersView: View {
    @State private var users: [AdminUser] = []
    @State private var isLoading = false
    @State private var error: String?
    @State private var notice: String?
    @State private var search = ""
    @State private var editing: AdminUser?
    @State private var isAdding = false

    private var filtered: [AdminUser] {
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !query.isEmpty else { return users }
        return users.filter {
            [$0.username, $0.displayName ?? "", $0.email ?? ""].joined(separator: " ").lowercased().contains(query)
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let notice {
                    NoticeBanner(text: notice)
                }
                AdminState(isLoading: isLoading, error: error, isEmpty: users.isEmpty, emptyText: "Zatím žádní uživatelé.")

                ForEach(filtered) { user in
                    Button {
                        editing = user
                    } label: {
                        HStack(spacing: 12) {
                            Text(String((user.displayName ?? user.username).prefix(1)).uppercased())
                                .font(.headline)
                                .foregroundStyle(.white)
                                .frame(width: 40, height: 40)
                                .background(Circle().fill(Theme.gradient))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(user.displayName ?? user.username).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                                Text([user.username, user.email].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(Theme.inkMuted)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Badge(text: user.roleValue?.label ?? user.role, style: style(for: user.roleValue))
                        }
                        .card(padding: 12)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
        .pageBackground()
        .navigationTitle("Uživatelé (\(users.count))")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Hledat jméno nebo e-mail")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { isAdding = true } label: { Image(systemName: "person.badge.plus") }
                    .accessibilityLabel("Přidat uživatele")
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $editing) { user in
            AdminUserEditView(user: user) { message in
                notice = message
                Task { await load() }
            }
        }
        .sheet(isPresented: $isAdding) {
            AdminUserEditView(user: nil) { message in
                notice = message
                Task { await load() }
            }
        }
    }

    private func style(for role: Role?) -> KindStyle {
        switch role {
        case .admin: return Theme.busy
        case .manager: return Theme.event
        case .trainer: return Theme.free
        default: return Theme.training
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            users = try await API.get("/api/admin-users", as: AdminUsersResponse.self).users
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// Edit an account (role, new password, delete) or add one (user == nil).
struct AdminUserEditView: View {
    let user: AdminUser?
    let onDone: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var username = ""
    @State private var role = "viewer"
    @State private var password = ""
    @State private var isSaving = false
    @State private var isConfirmingDelete = false
    @State private var error: String?

    private static let roles: [(String, String)] = [
        ("viewer", "Tanečník"),
        ("trainer", "Trenér"),
        ("manager", "Správa sálu"),
    ]

    var body: some View {
        BrandSheet(
            title: user == nil ? "Nový uživatel" : (user?.displayName ?? user?.username ?? ""),
            subtitle: user?.username,
            primaryTitle: "Uložit",
            primaryDisabled: user == nil && (username.count < 3 || password.count < 8),
            isWorking: isSaving,
            onPrimary: { Task { await save() } }
        ) {
            if let user {
                VStack(spacing: 10) {
                    InfoLine(label: "Přihlašovací jméno", value: user.username)
                    if let email = user.email { InfoLine(label: "E-mail", value: email) }
                    if let created = user.createdAt { InfoLine(label: "Vytvořen", value: Dates.dateTime(created)) }
                    if let by = user.createdBy { InfoLine(label: "Kým / jak", value: by) }
                }
                .card()
            } else {
                VStack(spacing: 14) {
                    FieldBox(label: "Přihlašovací jméno") {
                        TextField("jméno", text: $username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                }
                .card()
            }

            if user?.roleValue != .admin {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Role").font(.footnote.weight(.semibold)).foregroundStyle(Theme.inkMuted)
                    ChoicePills(options: Self.roles, selection: $role)
                }
                .card()
            }

            VStack(spacing: 10) {
                FieldBox(label: user == nil ? "Heslo (aspoň 8 znaků)" : "Nové heslo") {
                    SecureField(user == nil ? "heslo" : "nevyplněno = beze změny", text: $password)
                        .textContentType(.newPassword)
                }
                if user != nil {
                    FieldNote(text: "Nové heslo předej uživateli osobně, dosavadní přestane platit.")
                }
            }
            .card()

            if let error {
                ErrorBanner(text: error)
            }

            if let user, user.roleValue != .admin {
                DangerButton(title: "Smazat účet") { isConfirmingDelete = true }
            }
        }
        .alert("Smazat účet \(user?.username ?? "")?", isPresented: $isConfirmingDelete) {
            Button("Zpět", role: .cancel) {}
            Button("Smazat", role: .destructive) { Task { await delete() } }
        } message: {
            Text("Účet se už nepřihlásí. Jeho lekce a akce zůstanou.")
        }
        .onAppear {
            if let user { role = user.role }
        }
    }

    private func save() async {
        if !password.isEmpty && password.count < 8 {
            error = "Heslo musí mít aspoň 8 znaků."
            return
        }

        isSaving = true
        defer { isSaving = false }

        var payload: [String: Any] = ["username": user?.username ?? username.trimmingCharacters(in: .whitespaces)]

        if user?.roleValue != .admin, role != user?.role || user == nil {
            payload["role"] = role
        }
        if !password.isEmpty {
            payload["password"] = password
        }

        guard payload.count > 1 else {
            dismiss()
            return
        }

        do {
            let response = try await API.send("POST", "/api/admin-users", body: payload, as: MessageResponse.self)
            onDone(response.message ?? "Uloženo.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        guard let user else { return }

        do {
            let response = try await API.send("DELETE", "/api/admin-users", body: ["username": user.username], as: MessageResponse.self)
            onDone(response.message ?? "Účet je smazaný.")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
