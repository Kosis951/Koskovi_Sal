package cz.tkkoskovi.sal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

class ScheduleModel {
    var schedule by mutableStateOf<PublicScheduleResponse?>(null)
        private set
    var days by mutableStateOf<List<ScheduleDay>>(emptyList())
        private set
    var error by mutableStateOf<String?>(null)

    val isPublished get() = schedule?.published == true

    // Requests to cancel or move a lesson are accepted a day from publishing.
    val requestsUntil: Instant?
        get() = schedule?.publishedAt?.let { Dates.instant(it) }?.plus(1, ChronoUnit.DAYS)

    val canRequest get() = requestsUntil?.let { Instant.now() < it } == true

    suspend fun load() {
        runCatching { Api.get<PublicScheduleResponse>("/api/rozpis") }
            .onSuccess {
                schedule = it
                days = ScheduleParser.parse(it.body, Dates.todayKey())
                error = null
            }
            .onFailure { error = it.message }
    }
}

private data class RowRef(val day: ScheduleDay, val row: ScheduleRow)

@Composable
fun ScheduleScreen(model: ScheduleModel, session: SessionModel, onSignIn: () -> Unit) {
    val scope = rememberCoroutineScope()
    var requesting by remember { mutableStateOf<RowRef?>(null) }
    var naming by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    val today = Dates.todayKey()
    val now = Dates.minutes(Dates.nowTime())
    val name = session.scheduleName

    fun isMine(row: ScheduleRow) = row.kind == RowKind.Lesson && name != null && ScheduleParser.belongsTo(row.text, name)

    fun isPast(day: ScheduleDay, row: ScheduleRow): Boolean {
        val key = day.dateKey ?: return false
        return key < today || (key == today && Dates.minutes(row.end ?: "00:00") <= now)
    }

    ScreenScaffold(header = {
        BrandHeader("Rozpis", model.schedule?.title?.takeIf { it.isNotBlank() } ?: "Externí trenér") {
            HeaderButton(Icons.Filled.Refresh, "Obnovit") { scope.launch { model.load() } }
        }
    }) {
        model.error?.let { item { ErrorBanner(it) } }
        notice?.let { item { NoticeBanner(it) } }

        // The dancer's own lessons, found by their name in the schedule.
        item {
            Card {
                SectionTitle("Moje lekce")
                if (!session.isSignedIn) {
                    Muted("Přihlas se a propoj účet se svým jménem v rozpisu – tvoje lekce se tu ukážou samy.")
                    SecondaryButton("Přihlásit se", onClick = onSignIn)
                } else if (name == null) {
                    Muted("Propoj se s rozpisem: napiš, jak tě trenér v rozpisu píše, a tvoje lekce se zvýrazní.")
                    PrimaryButton("Propojit s rozpisem") { naming = true }
                } else {
                    val mine = model.days.flatMap { day -> day.rows.filter { isMine(it) }.map { RowRef(day, it) } }
                    if (mine.isEmpty()) {
                        Muted("V rozpisu teď nejsi (hledáme „$name“).")
                    }
                    mine.forEach { ref ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                ref.day.dateKey?.let { Dates.dayTitle(it) } ?: "",
                                color = P.inkMuted,
                                fontSize = 14.sp,
                                modifier = Modifier.weight(1f),
                            )
                            Text("${ref.row.start}–${ref.row.end}", color = P.ink, fontWeight = FontWeight.Bold)
                        }
                    }
                    Text(
                        "Jméno v rozpisu: $name · změnit",
                        color = P.accent,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable { naming = true },
                    )
                }
            }
        }

        val until = model.requestsUntil
        if (until != null) {
            item {
                Card {
                    Muted(
                        if (model.canRequest) {
                            "Nemůžeš na lekci? Klepni na svůj řádek a pošli žádost o zrušení nebo přesun – jde to do ${Dates.dateTime(until.toString())}."
                        } else {
                            "Zrušit nebo přesunout lekci šlo den od zveřejnění rozpisu. Teď se ozvi přímo správcům."
                        },
                    )
                }
            }
        }

        model.days.forEachIndexed { index, day ->
            item(key = "day-$index") {
                Card(padding = 12) {
                    Text(
                        day.dateKey?.let { Dates.dayTitle(it).replaceFirstChar { c -> c.titlecase(Dates.czech) } } ?: "Rozpis",
                        color = P.ink,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    day.rows.forEach { row ->
                        val past = isPast(day, row)
                        val current = day.dateKey == today && row.start != null && row.end != null &&
                            Dates.minutes(row.start) <= now && now < Dates.minutes(row.end)
                        val canRequest = model.canRequest && row.kind == RowKind.Lesson && !past
                        ScheduleRowView(row, past, current, isMine(row)) {
                            if (canRequest) requesting = RowRef(day, row)
                        }
                    }
                }
            }
        }
    }

    requesting?.let { ref ->
        ScheduleRequestSheet(ref, session, onDismiss = { requesting = null }) { message ->
            notice = message
            requesting = null
        }
    }

    if (naming) {
        ScheduleNameSheet(name.orEmpty(), onDismiss = { naming = false }) {
            naming = false
            scope.launch { session.refresh() }
        }
    }
}

@Composable
private fun ScheduleRowView(row: ScheduleRow, past: Boolean, current: Boolean, mine: Boolean, onClick: () -> Unit) {
    if (row.kind == RowKind.Note) {
        Muted(row.text)
        return
    }
    val style = when (row.kind) {
        RowKind.Pause -> P.closed
        RowKind.Group -> P.event
        else -> if (current) P.training else KindStyle(P.subtle, P.ink, P.line)
    }
    Row(
        Modifier
            .fillMaxWidth()
            .alpha(if (past) 0.5f else 1f)
            .clip(RoundedCornerShape(12.dp))
            .background(style.background)
            .border(if (mine) 2.dp else 1.dp, if (mine) P.accent else style.line, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = if (row.kind == RowKind.Pause) 8.dp else 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("${row.start}–${row.end}", color = style.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.width(100.dp))
        Text(
            row.label,
            color = style.ink,
            fontSize = 15.sp,
            fontWeight = if (row.kind == RowKind.Lesson) FontWeight.SemiBold else FontWeight.Normal,
            textDecoration = if (past) TextDecoration.None else null,
            modifier = Modifier.weight(1f),
        )
        if (mine) {
            Spacer(Modifier.width(6.dp))
            Badge("Ty", P.training)
        }
    }
}

@Composable
private fun ScheduleRequestSheet(ref: RowRef, session: SessionModel, onDismiss: () -> Unit, onDone: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var kind by remember { mutableStateOf("cancel") }
    var preferred by remember { mutableStateOf("") }
    var name by remember { mutableStateOf(session.displayName) }
    var phone by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    BrandSheet(
        title = "Změna lekce",
        subtitle = "${ref.day.dateKey?.let { Dates.dayTitle(it) } ?: ""} · ${ref.row.start}–${ref.row.end} · ${ref.row.text}",
        onDismiss = onDismiss,
        primaryTitle = "Poslat žádost",
        primaryEnabled = name.isNotBlank(),
        working = working,
        onPrimary = {
            working = true
            scope.launch {
                runCatching {
                    Api.send<MessageResponse>(
                        "POST",
                        "/api/rozpis/zadosti",
                        mapOf(
                            "date" to ref.day.dateKey.orEmpty(),
                            "kind" to kind,
                            "lessonName" to ref.row.text,
                            "note" to note.trim(),
                            "phone" to phone.trim(),
                            "preferred" to preferred.trim(),
                            "requesterName" to name.trim(),
                            "start" to ref.row.start.orEmpty(),
                        ),
                    )
                }
                    .onSuccess { onDone(it.message ?: "Žádost je odeslaná.") }
                    .onFailure { error = it.message }
                working = false
            }
        },
    ) {
        Card {
            ChoicePills(listOf("cancel" to "Zrušit", "move" to "Přesunout"), kind) { kind = it }
            if (kind == "move") {
                Field("Kdy by ti to šlo", preferred, { preferred = it }, placeholder = "např. po 16:00")
            }
        }
        Card {
            Field("Tvoje jméno", name, { name = it })
            Field("Telefon", phone, { phone = it }, keyboard = androidx.compose.ui.text.input.KeyboardType.Phone, placeholder = "nepovinné")
            Field("Poznámka", note, { note = it }, singleLine = false, minLines = 2)
        }
        error?.let { ErrorBanner(it) }
    }
}

// Links the account with the dancer's name in the schedule (saved in the
// profile, so it works on every device).
@Composable
private fun ScheduleNameSheet(current: String, onDismiss: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(current) }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    BrandSheet(
        title = "Jméno v rozpisu",
        subtitle = "Jak tě píše externí trenér",
        onDismiss = onDismiss,
        primaryTitle = "Uložit",
        working = working,
        onPrimary = {
            working = true
            scope.launch {
                runCatching {
                    Api.send<MessageResponse>("PUT", "/api/account/profile", mapOf("scheduleName" to name.trim()))
                }
                    .onSuccess { onSaved() }
                    .onFailure { error = it.message }
                working = false
            }
        },
    ) {
        Card {
            Field("Jméno v rozpisu", name, { name = it }, placeholder = "např. Novák")
            FieldNote("Stačí příjmení, jak je v rozpisu (\"Novák\" najde i řádek „Novák / Dvořáková“). Prázdné = zrušit propojení.")
        }
        error?.let { ErrorBanner(it) }
    }
}
