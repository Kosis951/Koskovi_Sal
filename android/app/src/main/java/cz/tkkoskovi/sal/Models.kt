package cz.tkkoskovi.sal

import kotlinx.serialization.Serializable

// --- Session ---

@Serializable
data class SessionInfo(
    val authenticated: Boolean = false,
    val displayName: String? = null,
    val role: String? = null,
    val username: String? = null,
    // How the dancer is written in the visiting trainer's schedule.
    val scheduleName: String? = null,
    // What the account may do (an older web sends only the role).
    val permissions: Permissions? = null,
    // "pending" while the trainer request from the registration waits.
    val trainerRequest: String? = null,
)

// What an account may do, section by section (as permissions.ts on the web).
@Serializable
data class Permissions(
    val hall: String = "view",
    val lessons: String = "view",
    val schedule: String = "view",
    val users: String = "none",
    val stats: String = "none",
) {
    fun get(key: String) = when (key) {
        "hall" -> hall
        "lessons" -> lessons
        "schedule" -> schedule
        "users" -> users
        else -> stats
    }

    fun with(key: String, value: String) = when (key) {
        "hall" -> copy(hall = value)
        "lessons" -> copy(lessons = value)
        "schedule" -> copy(schedule = value)
        "users" -> copy(users = value)
        else -> copy(stats = value)
    }

    fun asMap() = mapOf("hall" to hall, "lessons" to lessons, "schedule" to schedule, "stats" to stats, "users" to users)

    data class Section(val key: String, val label: String, val options: List<Pair<String, String>>)

    companion object {
        fun preset(role: Role?) = when (role) {
            Role.admin -> Permissions("all", "all", "edit", "manage", "view")
            Role.manager -> Permissions("all", "view", "edit", "none", "view")
            Role.trainer -> Permissions("own", "trainer", "view", "none", "none")
            else -> Permissions()
        }

        val sections = listOf(
            Section("hall", "Kalendář sálu", listOf("view" to "Vidí", "own" to "Přidává své", "all" to "Upravuje vše")),
            Section("lessons", "Lekce", listOf("none" to "Nevidí", "view" to "Vidí trenéry", "trainer" to "Vlastní kalendář", "all" to "Spravuje všechny")),
            Section("schedule", "Rozpis", listOf("view" to "Vidí", "edit" to "Upravuje")),
            Section("users", "Uživatelé", listOf("none" to "Nevidí", "manage" to "Spravuje")),
            Section("stats", "Přehled a historie", listOf("none" to "Nevidí", "view" to "Vidí")),
        )
    }
}

enum class Role(val label: String) {
    admin("Hlavní správce"),
    manager("Správa sálu"),
    trainer("Trenér"),
    viewer("Tanečník");

    companion object {
        fun of(value: String?) = entries.firstOrNull { it.name == value }
    }
}

// --- Hall calendar ---

@Serializable
data class Booking(
    val id: String,
    val title: String = "",
    val organizer: String? = null,
    val date: String,
    val start: String,
    val end: String,
    val status: String = "",
    val eventType: String? = null,
    val bookingKind: String? = null,
    val note: String? = null,
    val trainer: String? = null,
    val cleanupRequired: Boolean? = null,
    val cleanedAt: String? = null,
    val createdBy: String? = null,
) {
    val isTraining get() = id.startsWith("recurring-")
    val isBusy get() = status == "maintenance"
    val waitsForCleanup get() = cleanupRequired == true && cleanedAt == null

    val kindLabel: String
        get() = when {
            isTraining -> "Trénink"
            isBusy -> "Obsazeno"
            eventType == "soustredeni" -> "Soustředění"
            eventType == "seminar" -> "Seminář"
            bookingKind == "individual-lesson" -> "Lekce"
            else -> "Akce"
        }
}

@Serializable
data class CancellationNotice(
    val id: String,
    val date: String,
    val start: String,
    val end: String,
    val title: String = "",
)

@Serializable
data class OpeningHours(val day: Int, val label: String = "", val start: String, val end: String)

@Serializable
data class HallSettings(val openingHours: List<OpeningHours> = emptyList())

@Serializable
data class AvailabilityResponse(
    val bookings: List<Booking> = emptyList(),
    val hall: HallSettings? = null,
    val recurringCancellations: List<CancellationNotice>? = null,
)

// --- Lessons with trainers ---

@Serializable
data class TrainerInfo(val name: String, val trainer: String)

@Serializable
data class TrainersResponse(val trainers: List<TrainerInfo> = emptyList())

@Serializable
data class TrainerLesson(
    val id: String,
    val date: String,
    val start: String,
    val end: String,
    val requester: String = "",
    val status: String = "",
    val note: String? = null,
    val partner: String? = null,
    val guest: String? = null,
    val phone: String? = null,
) {
    val statusLabel
        get() = when (status) {
            "confirmed" -> "Potvrzená"
            "pending" -> "Čeká na trenéra"
            "declined" -> "Odmítnutá"
            else -> "Zrušená"
        }
}

@Serializable
data class LessonSlot(
    val date: String,
    val start: String,
    val end: String,
    val state: String,
    val lessonId: String? = null,
    val requester: String? = null,
)

// A time the trainer teaches: every week (weekday 1 = Monday … 7) or one day.
@Serializable
data class TrainerWindow(
    val id: String,
    val start: String,
    val end: String,
    val lessonMinutes: Int = 45,
    val weekday: Int? = null,
    val date: String? = null,
    val validFrom: String? = null,
    val validUntil: String? = null,
)

@Serializable
data class TrainerCalendar(
    // Only for the trainer (and whoever manages all calendars).
    val windows: List<TrainerWindow> = emptyList(),
    val canManage: Boolean = false,
    val lessons: List<TrainerLesson> = emptyList(),
    val mine: List<TrainerLesson> = emptyList(),
    val requests: List<TrainerLesson> = emptyList(),
    val slots: List<LessonSlot> = emptyList(),
    val trainer: String,
    val trainerName: String = "",
    val viewerPartner: String? = null,
)

// --- The visiting trainer's public schedule ---

@Serializable
data class PublicScheduleResponse(
    val body: String = "",
    val published: Boolean = false,
    val publishedAt: String? = null,
    val title: String = "",
    // For a signed-in dancer: their lessons ("date|start", partner's too) and,
    // until they answer, a row found by their name to confirm.
    val mine: List<String>? = null,
    val linkSuggestion: String? = null,
)

// --- Account ---

@Serializable
data class Profile(
    val displayName: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val email: String? = null,
    val partnerName: String? = null,
    val phone: String? = null,
    val scheduleName: String? = null,
)

@Serializable
data class ProfileResponse(val profile: Profile = Profile())
