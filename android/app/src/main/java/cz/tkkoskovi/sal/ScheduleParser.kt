package cz.tkkoskovi.sal

import java.text.Normalizer
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.abs

// The visiting trainer's schedule, written as plain text (same rules as
// src/lib/public-schedule.ts on the web):
//
//   5.11.
//   10:00–10:45 – Bílý
//   13:00–13:45 – Oběd
//   18:00-19:00 - GROUP
enum class RowKind { Pause, Group, Lesson, Note }

data class ScheduleRow(val kind: RowKind, val start: String?, val end: String?, val text: String) {
    // "GROUP" is called a seminar ("GROUP LAT" → "Seminář LAT").
    val label: String get() = if (kind == RowKind.Group) ScheduleParser.groupWord.replace(text, "Seminář") else text
}

data class ScheduleDay(
    // Missing when rows come before the first date.
    val dateKey: String?,
    val rows: MutableList<ScheduleRow> = mutableListOf(),
)

object ScheduleParser {
    private val options = setOf(RegexOption.IGNORE_CASE)
    private val dateLine = Regex("""^\s*(?:\p{L}+\s+)?(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4}))?\s*:?\s*$""", options)
    private val timeLine = Regex("""^\s*(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})\s*(?:[-–—:]\s*)?(.*)$""", options)
    private val breakWords = Regex("oběd|obed|coffee|káva|kafe|pauza|přestávka|prestavka|break|svačina", options)
    private val groupWords = Regex("group|skupin|semin[aá][rř]", options)
    val groupWord = Regex("""\bgroup\b""", options)

    // `todayKey` picks the year for dates written without one: the one that
    // puts the date closest to today.
    fun parse(body: String, todayKey: String): List<ScheduleDay> {
        val days = mutableListOf<ScheduleDay>()

        for (line in body.lines()) {
            val trimmed = line.trim()
            if (trimmed.isEmpty()) continue

            val date = dateLine.find(line)
            if (date != null) {
                val key = dateKey(
                    date.groupValues[1].toInt(),
                    date.groupValues[2].toInt(),
                    date.groupValues[3].toIntOrNull(),
                    todayKey,
                )
                if (key != null) {
                    days += ScheduleDay(key)
                    continue
                }
            }

            if (days.isEmpty()) days += ScheduleDay(null)

            val time = timeLine.find(line)
            val values = time?.groupValues?.drop(1)?.take(4)?.map { it.toInt() }
            if (time != null && values != null && values[0] < 24 && values[1] < 60 && values[2] < 24 && values[3] < 60) {
                val text = time.groupValues[5].trim()
                val kind = when {
                    breakWords.containsMatchIn(text) -> RowKind.Pause
                    groupWords.containsMatchIn(text) -> RowKind.Group
                    else -> RowKind.Lesson
                }
                days.last().rows += ScheduleRow(
                    kind,
                    Dates.time(values[0] * 60 + values[1]),
                    Dates.time(values[2] * 60 + values[3]),
                    text,
                )
            } else {
                days.last().rows += ScheduleRow(RowKind.Note, null, null, trimmed)
            }
        }

        return days.filter { it.rows.isNotEmpty() || it.dateKey != null }
    }

    private fun dateKey(day: Int, month: Int, year: Int?, todayKey: String): String? {
        if (month !in 1..12 || day !in 1..31) return null
        val today = Dates.date(todayKey) ?: return null
        val years = year?.let { listOf(it) } ?: listOf(today.year - 1, today.year, today.year + 1)
        return years
            .mapNotNull { runCatching { LocalDate.of(it, month, day) }.getOrNull() }
            .minByOrNull { abs(ChronoUnit.DAYS.between(today, it)) }
            ?.toString()
    }

    private fun fold(value: String): String =
        Normalizer.normalize(value, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase(Dates.czech)

    // The row is the dancer's: their schedule name appears in it as whole
    // words, ignoring case and accents ("novák" in "Novák / Dvořáková").
    fun belongsTo(text: String, name: String): Boolean {
        val target = fold(name).trim()
        if (target.isEmpty()) return false
        return Regex("(^|[^\\p{L}])" + Regex.escape(target) + "($|[^\\p{L}])").containsMatchIn(fold(text))
    }
}
