import Foundation
import Observation

@MainActor
@Observable
final class SessionModel {
    private(set) var info: SessionInfo?
    private(set) var isChecking = false

    var isSignedIn: Bool { info?.authenticated == true }
    var role: Role? { info?.role.flatMap(Role.init(rawValue:)) }
    var username: String? { info?.username }
    var displayName: String { info?.displayName ?? info?.username ?? "" }
    var scheduleName: String? {
        guard let name = info?.scheduleName?.trimmingCharacters(in: .whitespaces), !name.isEmpty else { return nil }
        return name
    }

    func refresh() async {
        if Demo.isOn {
            info = Demo.session
            return
        }

        isChecking = true
        defer { isChecking = false }

        if let info = try? await API.get("/api/auth/session", as: SessionInfo.self) {
            self.info = info
        }
    }

    func signIn(username: String, password: String) async throws {
        _ = try await API.send(
            "POST",
            "/api/auth/login",
            body: ["password": password, "username": username],
            as: Empty.self
        )
        await refresh()
    }

    func signOut() async {
        _ = try? await API.send("POST", "/api/auth/logout", as: Empty.self)

        // The cookie goes away even when the server could not be reached.
        let storage = HTTPCookieStorage.shared
        for cookie in storage.cookies(for: AppConfig.baseURL) ?? [] {
            storage.deleteCookie(cookie)
        }

        info = SessionInfo(authenticated: false, displayName: nil, role: nil, username: nil)
    }

    // Trainers may change only what they added themselves; trainings are
    // changed by hall managers only.
    func canEdit(_ booking: Booking) -> Bool {
        guard let role, role.canAddBookings else { return false }
        if role.canManageBookings { return true }
        guard !booking.isTraining, let createdBy = booking.createdBy, let username else { return false }
        return createdBy.compare(username, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame
    }
}
