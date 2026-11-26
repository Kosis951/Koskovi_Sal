import Foundation

// --- Session ---

struct SessionInfo: Decodable {
    let authenticated: Bool
    let displayName: String?
    let role: String?
    let username: String?
    // How the dancer is written in the visiting trainer's schedule.
    var scheduleName: String?
    // What the account may do (an older web sends only the role).
    var permissions: Permissions?
    // "pending" while the trainer request from the registration waits.
    var trainerRequest: String?
}

// What an account may do, section by section (as permissions.ts on the web).
struct Permissions: Codable, Hashable {
    var hall: String
    var lessons: String
    var schedule: String
    var users: String
    var stats: String

    static func preset(_ role: Role?) -> Permissions {
        switch role {
        case .admin: return Permissions(hall: "all", lessons: "all", schedule: "edit", users: "manage", stats: "view")
        case .manager: return Permissions(hall: "all", lessons: "view", schedule: "edit", users: "none", stats: "view")
        case .trainer: return Permissions(hall: "own", lessons: "trainer", schedule: "view", users: "none", stats: "none")
        default: return Permissions(hall: "view", lessons: "view", schedule: "view", users: "none", stats: "none")
        }
    }

    struct Section: Identifiable {
        let key: WritableKeyPath<Permissions, String>
        let label: String
        let options: [(String, String)]
        var id: String { label }
    }

    static let sections: [Section] = [
        Section(key: \.hall, label: "Kalendář sálu", options: [("view", "Vidí"), ("own", "Přidává své akce"), ("all", "Upravuje vše")]),
        Section(key: \.lessons, label: "Lekce", options: [("none", "Nevidí"), ("view", "Vidí trenéry"), ("trainer", "Vlastní kalendář"), ("all", "Spravuje všechny")]),
        Section(key: \.schedule, label: "Rozpis", options: [("view", "Vidí"), ("edit", "Upravuje")]),
        Section(key: \.users, label: "Uživatelé", options: [("none", "Nevidí"), ("manage", "Spravuje")]),
        Section(key: \.stats, label: "Přehled a historie", options: [("none", "Nevidí"), ("view", "Vidí")]),
    ]
}

enum Role: String {
    case admin, manager, trainer, viewer

    var label: String {
        switch self {
        case .admin: return "Hlavní správce"
        case .manager: return "Správa sálu"
        case .trainer: return "Trenér"
        case .viewer: return "Tanečník"
        }
    }

}

// --- Hall calendar ---

struct Booking: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let organizer: String?
    let date: String
    let start: String
    let end: String
    let status: String
    let eventType: String?
    let bookingKind: String?
    let note: String?
    let trainer: String?
    let cleanupRequired: Bool?
    let cleanedAt: String?
    let createdBy: String?

    var isTraining: Bool { id.hasPrefix("recurring-") }
    var isBusy: Bool { status == "maintenance" }
    var waitsForCleanup: Bool { cleanupRequired == true && cleanedAt == nil }

    var kindLabel: String {
        if isTraining { return "Trénink" }
        if isBusy { return "Obsazeno" }
        switch eventType {
        case "soustredeni": return "Soustředění"
        case "seminar": return "Seminář"
        default: return bookingKind == "individual-lesson" ? "Lekce" : "Akce"
        }
    }
}

struct CancellationNotice: Decodable, Identifiable, Hashable {
    let id: String
    let date: String
    let start: String
    let end: String
    let title: String
}

struct OpeningHours: Decodable, Hashable {
    let day: Int
    let label: String
    let start: String
    let end: String
}

struct HallSettings: Decodable {
    let openingHours: [OpeningHours]
}

struct AvailabilityResponse: Decodable {
    let bookings: [Booking]
    let hall: HallSettings?
    let recurringCancellations: [CancellationNotice]?
}

// --- Lessons with trainers ---

struct TrainerInfo: Decodable, Identifiable, Hashable {
    let name: String
    let trainer: String
    var id: String { trainer }
}

struct TrainersResponse: Decodable {
    let trainers: [TrainerInfo]
}

struct TrainerLesson: Decodable, Identifiable, Hashable {
    let id: String
    let date: String
    let start: String
    let end: String
    let requester: String
    let status: String
    let note: String?
    let partner: String?
    let guest: String?
    let phone: String?

    var statusLabel: String {
        switch status {
        case "confirmed": return "Potvrzená"
        case "pending": return "Čeká na trenéra"
        case "declined": return "Odmítnutá"
        default: return "Zrušená"
        }
    }
}

struct LessonSlot: Decodable, Hashable {
    let date: String
    let start: String
    let end: String
    let state: String
    let lessonId: String?
    let requester: String?
}

// A time the trainer teaches: every week (weekday 1 = Monday … 7) or one day.
struct TrainerWindow: Decodable, Identifiable, Hashable {
    let id: String
    let start: String
    let end: String
    let lessonMinutes: Int
    let weekday: Int?
    let date: String?
    let validFrom: String?
    let validUntil: String?
}

struct TrainerCalendar: Decodable {
    // Only for the trainer (and whoever manages all calendars).
    var windows: [TrainerWindow]?
    let canManage: Bool
    // The viewer is this trainer (an administrator who manages it may sign up).
    var isOwnCalendar: Bool?
    let lessons: [TrainerLesson]
    let mine: [TrainerLesson]
    let requests: [TrainerLesson]
    let slots: [LessonSlot]
    let trainer: String
    let trainerName: String
    let viewerPartner: String?
}

// --- The visiting trainer's public schedule ---

struct PublicScheduleResponse: Decodable {
    let body: String
    let published: Bool
    let publishedAt: String?
    let title: String
    // For a signed-in dancer: their lessons ("date|start", partner's too) and,
    // until they answer, a row found by their name to confirm.
    var mine: [String]? = nil
    var linkSuggestion: String? = nil
}
