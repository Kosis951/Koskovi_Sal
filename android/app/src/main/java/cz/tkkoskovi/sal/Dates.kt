package cz.tkkoskovi.sal

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// Dates travel as "YYYY-MM-DD" keys and "HH:MM" times in Prague time, as on
// the web.
object Dates {
    val prague: ZoneId = ZoneId.of("Europe/Prague")
    val czech: Locale = Locale("cs", "CZ")

    private val dayFormat = DateTimeFormatter.ofPattern("EEEE d. M.", czech)
    private val shortDayFormat = DateTimeFormatter.ofPattern("EEE", czech)
    private val monthFormat = DateTimeFormatter.ofPattern("LLLL yyyy", czech)
    private val dateTimeFormat = DateTimeFormatter.ofPattern("EEE d. M. HH:mm", czech)

    fun date(key: String): LocalDate? = runCatching { LocalDate.parse(key) }.getOrNull()

    fun todayKey(): String = LocalDate.now(prague).toString()

    fun nowTime(): String = LocalTime.now(prague).let { time(it.hour * 60 + it.minute) }

    fun addDays(days: Long, key: String): String = date(key)?.plusDays(days)?.toString() ?: key

    fun addMonths(months: Long, key: String): String = date(key)?.plusMonths(months)?.toString() ?: key

    // Monday of the week the day is in.
    fun weekStart(key: String): String {
        val day = date(key) ?: return key
        return day.minusDays((day.dayOfWeek.value - 1).toLong()).toString()
    }

    fun week(key: String): List<String> {
        val start = weekStart(key)
        return (0L until 7L).map { addDays(it, start) }
    }

    // Whole weeks (Monday to Sunday) covering the month the day is in.
    fun monthGrid(key: String): List<String> {
        val first = key.take(8) + "01"
        val nextMonth = addMonths(1, first).take(8) + "01"
        var day = weekStart(first)
        val days = mutableListOf<String>()
        while (day < nextMonth || days.size % 7 != 0) {
            days += day
            day = addDays(1, day)
        }
        return days
    }

    // 0 = Sunday … 6 = Saturday, as JavaScript's getDay() on the web.
    fun jsWeekday(key: String): Int = (date(key)?.dayOfWeek?.value ?: 0) % 7

    fun dayNumber(key: String): String = date(key)?.dayOfMonth?.toString().orEmpty()

    // "čtvrtek 5. 11."
    fun dayTitle(key: String): String = date(key)?.format(dayFormat) ?: key

    // "Čt"
    fun shortWeekday(key: String): String =
        date(key)?.format(shortDayFormat)?.trimEnd('.')?.replaceFirstChar { it.titlecase(czech) }.orEmpty()

    fun monthTitle(key: String): String =
        date(key)?.format(monthFormat)?.replaceFirstChar { it.titlecase(czech) }.orEmpty()

    fun instant(iso: String): Instant? =
        runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull()
            ?: runCatching { Instant.parse(iso) }.getOrNull()

    fun dateTime(iso: String): String =
        instant(iso)?.atZone(prague)?.format(dateTimeFormat) ?: iso

    fun minutes(time: String): Int {
        val parts = time.split(":").mapNotNull { it.toIntOrNull() }
        return if (parts.size == 2) parts[0] * 60 + parts[1] else 0
    }

    fun time(minutes: Int): String = String.format(Locale.ROOT, "%02d:%02d", minutes / 60, minutes % 60)

    // Quarter hours from 6:00 for time pickers.
    val quarterHours: List<String> = (6 * 60..24 * 60 - 15 step 15).map { time(it) }
}
