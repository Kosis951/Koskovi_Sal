import SwiftUI

// Hall administration in the app (as Správa on the web): for the hall's
// managers; users only for the main administrator.
struct AdminScreen: View {
    @Environment(SessionModel.self) private var session

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    SectionTitle(text: "Sál", systemImage: "building.columns")
                    VStack(spacing: 0) {
                        AdminLink(icon: "calendar", title: "Akce", detail: "Nadcházející akce v sále") { AdminBookingsView() }
                        Divider().padding(.leading, 52)
                        AdminLink(icon: "repeat", title: "Pravidelné tréninky", detail: "Přidat, upravit, pozastavit") { AdminTrainingsView() }
                        Divider().padding(.leading, 52)
                        AdminLink(icon: "beach.umbrella", title: "Prázdniny", detail: "Období bez tréninků") { AdminHolidaysView() }
                    }
                    .card(padding: 6)

                    SectionTitle(text: "Externí trenér", systemImage: "list.bullet.rectangle")
                    VStack(spacing: 0) {
                        AdminLink(icon: "square.and.pencil", title: "Rozpis", detail: "Text rozpisu a zveřejnění") { AdminScheduleView() }
                        Divider().padding(.leading, 52)
                        AdminLink(icon: "tray.full", title: "Žádosti o zrušení a přesun", detail: "Z veřejného rozpisu") { AdminScheduleRequestsView() }
                    }
                    .card(padding: 6)

                    SectionTitle(text: "Lidé a historie", systemImage: "person.2")
                    VStack(spacing: 0) {
                        if session.role == .admin {
                            AdminLink(icon: "person.2.badge.gearshape", title: "Uživatelé", detail: "Účty, role, hesla") { AdminUsersView() }
                            Divider().padding(.leading, 52)
                        }
                        AdminLink(icon: "clock.arrow.circlepath", title: "Historie změn", detail: "Kdo co změnil, vrácení změny") { AdminHistoryView() }
                    }
                    .card(padding: 6)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .pageBackground()
            .safeAreaInset(edge: .top, spacing: 0) {
                BrandHeader(title: "Správa", subtitle: session.role?.label)
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}

struct AdminLink<Destination: View>: View {
    let icon: String
    let title: String
    let detail: String
    @ViewBuilder let destination: () -> Destination

    var body: some View {
        NavigationLink {
            destination()
                .toolbar(.visible, for: .navigationBar)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Theme.gradient))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.body.weight(.semibold)).foregroundStyle(Theme.ink)
                    Text(detail).font(.caption).foregroundStyle(Theme.inkMuted)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Theme.inkSoft)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// --- Data from the admin APIs ---

struct AdminUser: Decodable, Identifiable, Hashable {
    let username: String
    let role: String
    let displayName: String?
    let email: String?
    let createdAt: String?
    let createdBy: String?
    let isStored: Bool?

    var id: String { username }
    var roleValue: Role? { Role(rawValue: role) }
}

struct AdminUsersResponse: Decodable {
    let users: [AdminUser]
}

struct TrainingStatus: Decodable, Hashable {
    let state: String
    let heldLessons: Int?
    let remainingLessons: Int?
    let lastDate: String?

    var label: String {
        switch state {
        case "finished": return "Skončil"
        case "paused": return "Pozastaven"
        case "upcoming": return "Začne"
        default: return "Běží"
        }
    }
}

struct RecurringTraining: Decodable, Identifiable, Hashable {
    let key: String
    let title: String
    let alternateTitle: String?
    let weekday: Int
    let start: String
    let end: String
    let trainer: String?
    let validFrom: String?
    let validUntil: String?
    let lessonCount: Int?
    let pausedFrom: String?
    let pausedUntil: String?
    let status: TrainingStatus?

    var id: String { key }
}

struct TrainingsResponse: Decodable {
    let trainings: [RecurringTraining]
}

struct Holiday: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
    let start: String
    let end: String
}

struct HolidaysResponse: Decodable {
    let holidays: [Holiday]
}

struct ScheduleRequest: Decodable, Identifiable, Hashable {
    let id: String
    let date: String
    let start: String
    let end: String
    let kind: String
    let lessonName: String
    let requesterName: String
    let preferred: String?
    let phone: String?
    let note: String?
    let status: String
    let createdAt: String
    let doneBy: String?
}

struct ScheduleRequestsResponse: Decodable {
    let requests: [ScheduleRequest]
}

// Audit log entries: details are loose JSON; only the parts shown are read.
struct AuditEntry: Decodable, Identifiable, Hashable {
    struct Details: Decodable, Hashable {
        let title: String?
        let date: String?
        let start: String?
        let end: String?
    }

    let timestamp: String
    let action: String
    let actor: String
    let bookingId: String?
    let details: Details?

    var id: String { timestamp + action }

    var actionLabel: String {
        switch action {
        case "booking.create": return "Přidal/a"
        case "booking.delete": return "Smazal/a"
        case "booking.update": return "Upravil/a"
        case "booking.rename": return "Přejmenoval/a"
        case "booking.clean": return "Uklidil/a"
        case "booking.undo": return "Vrátil/a změnu"
        default: return action
        }
    }

    var canUndo: Bool { action != "booking.undo" && action != "booking.clean" }
}

struct AuditLogResponse: Decodable {
    let entries: [AuditEntry]
}

// The days of the week as the server counts them (1 = Monday … 7 = Sunday).
let weekdayNames = ["", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"]

// A small loading/error wrapper used by the admin lists.
struct AdminState: View {
    let isLoading: Bool
    let error: String?
    let isEmpty: Bool
    let emptyText: String

    var body: some View {
        if let error {
            ErrorBanner(text: error)
        }
        if isLoading && isEmpty {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 30)
        } else if isEmpty && error == nil {
            EmptyCard(icon: "tray", title: "Nic tu není", text: emptyText)
        }
    }
}
