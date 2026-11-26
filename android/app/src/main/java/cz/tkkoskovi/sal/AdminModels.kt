package cz.tkkoskovi.sal

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

// Data from the admin APIs (as in the iPhone app's Správa).

@Serializable
data class AdminUser(
    val username: String,
    val role: String = "viewer",
    val displayName: String? = null,
    val email: String? = null,
    val createdAt: String? = null,
    val createdBy: String? = null,
) {
    val roleValue get() = Role.of(role)
}

@Serializable
data class AdminUsersResponse(val users: List<AdminUser> = emptyList())

@Serializable
data class TrainingStatus(
    val state: String = "active",
    val heldLessons: Int? = null,
    val remainingLessons: Int? = null,
    val lastDate: String? = null,
) {
    val label
        get() = when (state) {
            "finished" -> "Skončil"
            "paused" -> "Pozastaven"
            "upcoming" -> "Začne"
            else -> "Běží"
        }
}

@Serializable
data class RecurringTraining(
    val key: String,
    val title: String = "",
    val alternateTitle: String? = null,
    val weekday: Int = 1,
    val start: String = "17:00",
    val end: String = "18:00",
    val trainer: String? = null,
    val validFrom: String? = null,
    val validUntil: String? = null,
    val lessonCount: Int? = null,
    val pausedFrom: String? = null,
    val pausedUntil: String? = null,
    val status: TrainingStatus? = null,
)

@Serializable
data class TrainingsResponse(val trainings: List<RecurringTraining> = emptyList())

@Serializable
data class Holiday(val id: String, val label: String = "", val start: String, val end: String)

@Serializable
data class HolidaysResponse(val holidays: List<Holiday> = emptyList())

@Serializable
data class ScheduleRequest(
    val id: String,
    val date: String = "",
    val start: String = "",
    val end: String = "",
    val kind: String = "cancel",
    val lessonName: String = "",
    val requesterName: String = "",
    val preferred: String? = null,
    val phone: String? = null,
    val note: String? = null,
    val status: String = "pending",
    val createdAt: String = "",
    val doneBy: String? = null,
)

@Serializable
data class ScheduleRequestsResponse(val requests: List<ScheduleRequest> = emptyList())

@Serializable
data class ScheduleDraft(
    val title: String = "",
    val body: String = "",
    val published: Boolean = false,
    val cancelTrainings: Boolean? = null,
)

// Audit log entries; the details are loose JSON, only a few parts are shown.
@Serializable
data class AuditEntry(
    val timestamp: String,
    val action: String = "",
    val actor: String = "",
    val bookingId: String? = null,
    val details: JsonObject? = null,
) {
    fun detail(name: String): String? =
        runCatching { details?.get(name)?.jsonPrimitive?.contentOrNull }.getOrNull()

    val actionLabel
        get() = when (action) {
            "booking.create" -> "přidal/a"
            "booking.delete" -> "smazal/a"
            "booking.update" -> "upravil/a"
            "booking.rename" -> "přejmenoval/a"
            "booking.clean" -> "uklidil/a"
            "booking.undo" -> "vrátil/a změnu"
            else -> action
        }

    val canUndo get() = action != "booking.undo" && action != "booking.clean"
}

@Serializable
data class AuditLogResponse(val entries: List<AuditEntry> = emptyList())

// The days of the week as the server counts them (1 = Monday … 7 = Sunday).
val weekdayNames = listOf("", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle")
