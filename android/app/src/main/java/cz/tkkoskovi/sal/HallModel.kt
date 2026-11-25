package cz.tkkoskovi.sal

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

// One line of a day in the hall: a booking, a cancelled training or free time.
sealed class DayItem {
    abstract val key: String
    abstract val start: String

    data class Reserved(val booking: Booking) : DayItem() {
        override val key get() = booking.id
        override val start get() = booking.start
    }

    data class Cancelled(val notice: CancellationNotice) : DayItem() {
        override val key get() = "cancelled-${notice.id}"
        override val start get() = notice.start
    }

    data class Free(override val start: String, val end: String) : DayItem() {
        override val key get() = "free-$start-$end"
    }
}

// "Can I use the hall right now?" – as the banner on the web says it.
enum class Tone { Free, Busy, Cleanup, Closed }

data class HallStatus(val title: String, val detail: String, val tone: Tone, val cleanupBooking: Booking? = null)

// What a day holds, for the dots in the calendar.
enum class DayKind { Training, Event, Busy, Cleanup }

class HallModel {
    var bookings by mutableStateOf<List<Booking>>(emptyList())
        private set
    var cancellations by mutableStateOf<List<CancellationNotice>>(emptyList())
        private set
    var openingHours by mutableStateOf<List<OpeningHours>>(emptyList())
        private set
    var isLoading by mutableStateOf(false)
        private set
    var hasLoaded by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)

    companion object {
        // Minutes before closing reserved for leaving the hall (as on the web).
        const val DEPARTURE_MINUTES = 30
        // Shorter gaps do not count as free time.
        const val MINIMUM_FREE_MINUTES = 45
    }

    suspend fun load() {
        isLoading = true
        try {
            val response = Api.get<AvailabilityResponse>("/api/availability")
            bookings = response.bookings
            cancellations = response.recurringCancellations.orEmpty()
            openingHours = response.hall?.openingHours.orEmpty()
            error = null
            hasLoaded = true
        } catch (failure: ApiException) {
            error = failure.message
        } finally {
            isLoading = false
        }
    }

    fun bookings(day: String) = bookings.filter { it.date == day }.sortedBy { it.start }

    fun hours(day: String) = openingHours.firstOrNull { it.day == Dates.jsWeekday(day) }

    fun kinds(day: String): List<DayKind> {
        val list = bookings(day)
        return buildList {
            if (list.any { it.isTraining }) add(DayKind.Training)
            if (list.any { !it.isTraining && !it.isBusy }) add(DayKind.Event)
            if (list.any { it.isBusy }) add(DayKind.Busy)
            if (list.any { it.waitsForCleanup }) add(DayKind.Cleanup)
        }
    }

    // Free time between bookings within the opening hours (past time today
    // left out).
    fun freeWindows(day: String, now: Int = 0): List<IntRange> {
        val hours = hours(day) ?: return emptyList()
        val windows = mutableListOf<IntRange>()
        var cursor = maxOf(Dates.minutes(hours.start), now)
        val close = Dates.minutes(hours.end)

        for (booking in bookings(day)) {
            val start = Dates.minutes(booking.start)
            if (start - cursor >= MINIMUM_FREE_MINUTES && cursor < close) {
                windows += cursor until minOf(start, close)
            }
            cursor = maxOf(cursor, Dates.minutes(booking.end))
        }

        if (close - cursor >= MINIMUM_FREE_MINUTES) windows += cursor until close
        return windows
    }

    private fun nowFor(day: String) = if (day == Dates.todayKey()) Dates.minutes(Dates.nowTime()) else 0

    // The day as the web shows it: bookings, cancelled trainings and free time.
    fun items(day: String): List<DayItem> {
        val items = mutableListOf<DayItem>()
        items += bookings(day).map { DayItem.Reserved(it) }
        items += cancellations.filter { it.date == day }.map { DayItem.Cancelled(it) }
        items += freeWindows(day, nowFor(day)).map { DayItem.Free(Dates.time(it.first), Dates.time(it.last + 1)) }
        return items.sortedBy { it.start }
    }

    fun freeHours(day: String): Double {
        val minutes = freeWindows(day, nowFor(day)).sumOf { it.last + 1 - it.first }
        return Math.round(minutes / 30.0) / 2.0
    }

    fun status(): HallStatus {
        val today = Dates.todayKey()
        val now = Dates.minutes(Dates.nowTime())
        val hours = hours(today) ?: return HallStatus("Sál je dnes zavřený", "Dnes je sál zavřený.", Tone.Closed)
        val open = Dates.minutes(hours.start)
        val close = Dates.minutes(hours.end)

        if (now < open) return HallStatus("Sál je zatím zavřený", "Otevírá se dnes v ${hours.start}.", Tone.Closed)
        if (now >= close) return HallStatus("Sál je už zavřený", "Dnes bylo otevřeno do ${hours.end}.", Tone.Closed)

        val day = bookings(today)
        val windows = freeWindows(today, now)
        val freeLater = windows.firstOrNull()?.let { "Volno od ${Dates.time(maxOf(it.first, now))}." } ?: "Dnes už volno nebude."
        val current = day.firstOrNull { Dates.minutes(it.start) <= now && Dates.minutes(it.end) > now }

        if (current == null) {
            val waiting = day.lastOrNull { it.waitsForCleanup && Dates.minutes(it.end) <= now }
            if (waiting != null) {
                return HallStatus("Sál čeká na úklid", "Po akci ${waiting.title} je potřeba sál uklidit.", Tone.Cleanup, waiting)
            }
        }

        if (current != null) return HallStatus("Teď obsazeno: ${current.title} do ${current.end}", freeLater, Tone.Busy)

        if (now >= close - DEPARTURE_MINUTES) {
            return HallStatus(
                "Sál se zavírá",
                "Posledních $DEPARTURE_MINUTES minut před zavíračkou (${hours.end}) je na odchod ze sálu.",
                Tone.Closed,
            )
        }

        val next = day.firstOrNull { Dates.minutes(it.start) > now }
        val window = windows.firstOrNull()

        if (window != null && window.first <= now) {
            if (next != null && Dates.minutes(next.start) < close - DEPARTURE_MINUTES) {
                return HallStatus("Sál je teď volný do ${next.start}", "Pak ${next.title} (${next.start}–${next.end}).", Tone.Free)
            }
            return HallStatus("Sál je teď volný až do konce dne", "Otevřeno do ${hours.end}.", Tone.Free)
        }

        if (next != null) return HallStatus("Teď je jen krátká mezera", "Pak ${next.title} od ${next.start}. $freeLater", Tone.Busy)

        return HallStatus("Sál je volný", "Otevřeno do ${hours.end}.", Tone.Free)
    }

    // --- Changes ---

    suspend fun addBooking(name: String, date: String, start: String, end: String, eventType: String, note: String, cleanup: Boolean) {
        Api.send<MessageResponse>(
            "POST",
            "/api/booking-request",
            mapOf(
                "bookingKind" to "hall",
                "cleanupRequired" to cleanup,
                "date" to date,
                "end" to end,
                "eventType" to eventType,
                "name" to name,
                "note" to note,
                "start" to start,
            ),
        )
        load()
    }

    suspend fun delete(booking: Booking) {
        Api.send<MessageResponse>("DELETE", "/api/bookings/${Api.segment(booking.id)}")
        load()
    }

    suspend fun rename(booking: Booking, title: String) {
        Api.send<MessageResponse>("PUT", "/api/bookings/${Api.segment(booking.id)}/title", mapOf("title" to title))
        load()
    }

    suspend fun move(booking: Booking, start: String, end: String) {
        Api.send<MessageResponse>("PUT", "/api/bookings/${Api.segment(booking.id)}/time", mapOf("end" to end, "start" to start))
        load()
    }

    suspend fun markCleaned(booking: Booking): String {
        val response = Api.send<MessageResponse>("POST", "/api/bookings/${Api.segment(booking.id)}/clean")
        load()
        return response.message ?: "Díky! Sál je označen jako uklizený."
    }

    suspend fun reinstate(notice: CancellationNotice) {
        Api.send<MessageResponse>("POST", "/api/bookings/${Api.segment(notice.id)}/reinstate")
        load()
    }
}
