import SwiftUI

struct AdminUsersView: View {
    @State private var users: [AdminUser] = []
    @State private var requests: [TrainerRequest] = []
    @State private var deciding: String?
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

                if !requests.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Žádosti o trenérský účet (\(requests.count))", systemImage: "graduationcap")
                            .font(.headline)
                            .foregroundStyle(Theme.ink)
                        ForEach(requests) { request in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(request.name).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                                Text([request.username, request.email, request.requestedAt.map(Dates.dateTime)].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption)
                                    .foregroundStyle(Theme.inkMuted)
                                HStack(spacing: 10) {
                                    Button("Zamítnout") { Task { await decide(request, approve: false) } }
                                        .buttonStyle(SecondaryButtonStyle())
                                    Button("Schválit") { Task { await decide(request, approve: true) } }
                                        .buttonStyle(PrimaryButtonStyle())
                                }
                                .disabled(deciding != nil)
                            }
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: 14).fill(Theme.subtle))
                        }
                    }
                    .card()
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.accent, lineWidth: 1.5))
                }

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
                            Badge(text: badge(user), style: user.preset == nil && user.roleValue != .admin ? Theme.cleanup : style(for: user.roleValue))
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

    private func badge(_ user: AdminUser) -> String {
        if user.roleValue == .admin { return Role.admin.label }
        if let preset = user.preset.flatMap(Role.init(rawValue:)) { return preset.label }
        return user.permissions == nil ? (user.roleValue?.label ?? user.role) : "Vlastní práva"
    }

    private func decide(_ request: TrainerRequest, approve: Bool) async {
        deciding = request.username
        defer { deciding = nil }

        do {
            let response = try await API.send(
                "PATCH",
                "/api/admin-users",
                body: ["trainerRequest": approve ? "approve" : "decline", "username": request.username],
                as: MessageResponse.self
            )
            notice = response.message
            await load()
        } catch {
            self.error = error.localizedDescription
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
            let response = try await API.get("/api/admin-users", as: AdminUsersResponse.self)
            users = response.users
            requests = response.trainerRequests ?? []
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
    @State private var permissions = Permissions.preset(.viewer)
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
                VStack(alignment: .leading, spacing: 12) {
                    Text("Předvolba").font(.footnote.weight(.semibold)).foregroundStyle(Theme.inkMuted)
                    ChoicePills(options: Self.roles, selection: $role)
                    if user != nil {
                        Divider()
                        Text("Práva po sekcích").font(.footnote.weight(.semibold)).foregroundStyle(Theme.inkMuted)
                        ForEach(Permissions.sections) { section in
                            HStack {
                                Text(section.label).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                                Spacer()
                                Picker(section.label, selection: Binding(
                                    get: { permissions[keyPath: section.key] },
                                    set: { permissions[keyPath: section.key] = $0 }
                                )) {
                                    ForEach(section.options, id: \.0) { option in
                                        Text(option.1).tag(option.0)
                                    }
                                }
                                .pickerStyle(.menu)
                                .tint(Theme.accent)
                            }
                        }
                        FieldNote(text: "Předvolba nastaví sekce, pak je můžeš upravit.")
                    }
                }
                .card()
                .onChange(of: role) {
                    permissions = Permissions.preset(Role(rawValue: role))
                }
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
            if let user {
                role = user.role
                permissions = user.permissions ?? Permissions.preset(user.roleValue)
            }
        }
    }

    private func save() async {
        if !password.isEmpty && password.count < 8 {
            error = "Heslo musí mít aspoň 8 znaků."
            return
        }

        isSaving = true
        defer { isSaving = false }

        let name = user?.username ?? username.trimmingCharacters(in: .whitespaces)

        do {
            var messages: [String] = []

            // An existing account: its sections (PATCH); a new one gets the
            // preset with its password.
            if let user, user.roleValue != .admin,
               role != user.role || permissions != (user.permissions ?? Permissions.preset(user.roleValue)) {
                let response = try await API.send(
                    "PATCH",
                    "/api/admin-users",
                    body: [
                        "permissions": ["hall": permissions.hall, "lessons": permissions.lessons, "schedule": permissions.schedule, "stats": permissions.stats, "users": permissions.users],
                        "role": role,
                        "username": name,
                    ],
                    as: MessageResponse.self
                )
                messages.append(response.message ?? "Práva jsou uložená.")
            }

            if user == nil || !password.isEmpty {
                var payload: [String: Any] = ["username": name]
                if user == nil { payload["role"] = role }
                if !password.isEmpty { payload["password"] = password }
                let response = try await API.send("POST", "/api/admin-users", body: payload, as: MessageResponse.self)
                messages.append(response.message ?? "Uloženo.")
            }

            if !messages.isEmpty { onDone(messages.joined(separator: " ")) }
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
