package cz.tkkoskovi.sal

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

// The trainer's times of teaching (as on the web): every week on a day, or one
// date, cut into lessons of the chosen length. Dancers book the free ones.

fun windowTitle(window: TrainerWindow) =
    window.date?.let { Dates.dayTitle(it).replaceFirstChar { c -> c.titlecase(Dates.czech) } }
        ?: "Každé ${weekdayNames.getOrElse(window.weekday ?: 1) { "" }.lowercase()}"

@Composable
fun TrainerWindowCard(window: TrainerWindow, onDelete: () -> Unit) {
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(windowTitle(window), color = P.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Muted("${window.start}–${window.end} · lekce ${window.lessonMinutes} min")
                val validity = listOfNotNull(
                    window.validFrom?.let { "od ${Dates.dayTitle(it)}" },
                    window.validUntil?.let { "do ${Dates.dayTitle(it)}" },
                )
                if (validity.isNotEmpty()) Muted(validity.joinToString(" "), 12)
            }
            Text(
                "Smazat",
                color = P.busy.ink,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable(onClick = onDelete).padding(8.dp),
            )
        }
    }
}

@Composable
fun TrainerWindowSheet(trainer: String, onDismiss: () -> Unit, onDone: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var repeats by remember { mutableStateOf("weekly") }
    var weekday by remember { mutableStateOf("1") }
    var date by remember { mutableStateOf(Dates.todayKey()) }
    var start by remember { mutableStateOf("14:00") }
    var end by remember { mutableStateOf("18:00") }
    var length by remember { mutableStateOf("45") }
    var limited by remember { mutableStateOf(false) }
    var until by remember { mutableStateOf(Dates.addDays(90, Dates.todayKey())) }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val count = (Dates.minutes(end) - Dates.minutes(start)) / (length.toIntOrNull() ?: 45)

    BrandSheet(
        title = "Čas výuky",
        subtitle = "Kdy učíš",
        onDismiss = onDismiss,
        primaryTitle = "Přidat",
        primaryEnabled = count > 0,
        working = working,
        onPrimary = {
            working = true
            val body = mutableMapOf<String, Any?>("end" to end, "lessonMinutes" to (length.toIntOrNull() ?: 45), "start" to start)
            if (repeats == "weekly") {
                body["weekday"] = weekday.toInt()
                if (limited) body["validUntil"] = until
            } else {
                body["date"] = date
            }
            scope.launch {
                runCatching { Api.send<MessageResponse>("POST", "/api/lessons/${Api.segment(trainer)}/windows", body) }
                    .onSuccess { onDone(it.message ?: "Čas výuky je přidaný.") }
                    .onFailure { error = it.message }
                working = false
            }
        },
    ) {
        Card {
            ChoicePills(listOf("weekly" to "Každý týden", "once" to "Jeden den"), repeats) { repeats = it }
            if (repeats == "weekly") {
                ChoicePills((1..7).map { "$it" to weekdayNames[it].take(2) }, weekday) { weekday = it }
            } else {
                DateField("Den", date) { date = it }
            }
        }
        Card {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TimePicker("Od", start, Modifier.weight(1f)) { start = it }
                TimePicker("Do", end, Modifier.weight(1f)) { end = it }
            }
            Text("Délka lekce (min)", color = P.inkMuted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            ChoicePills(listOf("30" to "30", "45" to "45", "60" to "60", "90" to "90"), length) { length = it }
            FieldNote(if (count > 0) "Vejde se $count lekcí po $length min." else "Do tohoto času se nevejde ani jedna lekce.")
        }
        if (repeats == "weekly") {
            Card {
                ToggleRow("Jen do určitého dne", limited) { limited = it }
                if (limited) DateField("Do", until) { until = it }
            }
        }
        error?.let { ErrorBanner(it) }
    }
}
