import Foundation

// --- Session ---

struct SessionInfo: Decodable {
    let authenticated: Bool
    let displayName: String?
    let role: String?
    let username: String?
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

    var canManageBookings: Bool { self == .admin || self == .manager }
    var canAddBookings: Bool { canManageBookings || self == .trainer }
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

struct TrainerCalendar: Decodable {
    let canManage: Bool
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
}
