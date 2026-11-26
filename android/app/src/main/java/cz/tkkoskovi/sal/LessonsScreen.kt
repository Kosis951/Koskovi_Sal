package cz.tkkoskovi.sal

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LessonsScreen(session: SessionModel, onSignIn: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("app", Context.MODE_PRIVATE) }
    var trainers by remember { mutableStateOf<List<TrainerInfo>>(emptyList()) }
    var selected by remember { mutableStateOf<String?>(null) }
    var calendar by remember { mutableStateOf<TrainerCalendar?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var requesting by remember { mutableStateOf<LessonSlot?>(null) }
    var addingWindow by remember { mutableStateOf(false) }
    var deletingWindow by remember { mutableStateOf<TrainerWindow?>(null) }

    suspend fun loadCalendar() {
        val trainer = selected ?: return
        runCatching { Api.get<TrainerCalendar>("/api/lessons/${Api.segment(trainer)}") }
            .onSuccess { calendar = it; error = null }
            .onFailure { error = it.message }
    }

    suspend fun loadTrainers() {
        if (!session.isSignedIn) {
            trainers = emptyList()
            calendar = null
            return
        }
        loading = true
        runCatching { Api.get<TrainersResponse>("/api/lessons").trainers }
            .onSuccess { list ->
                trainers = list
                val last = prefs.getString("lessons.trainer", null)
                selected = list.firstOrNull { it.trainer == last }?.trainer ?: list.firstOrNull()?.trainer
                error = null
                loadCalendar()
            }
            .onFailure { error = it.message }
        loading = false
    }

    fun change(lesson: TrainerLesson, action: String) {
        val trainer = calendar?.trainer ?: return
        scope.launch {
            runCatching {
                Api.send<MessageResponse>(
                    "PATCH",
                    "/api/lessons/${Api.segment(trainer)}/${Api.segment(lesson.id)}",
                    mapOf("action" to action),
                )
            }
                .onSuccess { notice = it.message; error = null }
                .onFailure { error = it.message }
            loadCalendar()
        }
    }

    LaunchedEffect(session.isSignedIn) { loadTrainers() }

    ScreenScaffold(header = {
        BrandHeader("Lekce", calendar?.trainerName?.takeIf { it.isNotBlank() } ?: "S trenéry") {
            if (session.isSignedIn) {
                HeaderButton(Icons.Filled.Refresh, "Obnovit") { scope.launch { loadTrainers() } }
            }
        }
    }, onRefresh = { if (trainers.isEmpty()) loadTrainers() else loadCalendar() }) {
        if (!session.isSignedIn) {
            item {
                SignInPrompt(
                    Icons.Filled.Groups,
                    "Lekce s trenéry",
                    "Po přihlášení si tu zarezervuješ volný čas u svého trenéra a uvidíš své lekce.",
                    onSignIn,
                )
            }
            return@ScreenScaffold
        }

        error?.let { item { ErrorBanner(it) } }
        notice?.let { item { NoticeBanner(it) } }

        if (trainers.size > 1) {
            item {
                ChoicePills(trainers.map { it.trainer to it.name }, selected.orEmpty()) { trainer ->
                    selected = trainer
                    prefs.edit().putString("lessons.trainer", trainer).apply()
                    scope.launch { loadCalendar() }
                }
            }
        }

        if (!loading && trainers.isEmpty() && error == null) {
            item { EmptyCard("Zatím tu není žádný trenér s lekcemi.") }
        }

        val data = calendar ?: return@ScreenScaffold

        if (data.canManage && data.requests.isNotEmpty()) {
            item { SectionTitle("Žádosti o lekci") }
            data.requests.forEach { lesson ->
                item(key = "request-${lesson.id}") {
                    LessonCard(lesson, showRequester = true) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            DangerButton("Odmítnout", Modifier.weight(1f)) { change(lesson, "decline") }
                            PrimaryButton("Potvrdit", Modifier.weight(1f)) { change(lesson, "confirm") }
                        }
                    }
                }
            }
        }

        // When the trainer teaches; dancers then see the free slots.
        if (data.canManage) {
            item { SectionTitle("Časy výuky") }
            item { PrimaryButton("Přidat čas výuky") { addingWindow = true } }
            if (data.windows.isEmpty()) {
                item { EmptyCard("Zatím žádné časy. Přidej, kdy učíš – tanečníci pak uvidí volné lekce a objednají si je.") }
            }
            data.windows.forEach { window ->
                item(key = "window-${window.id}") { TrainerWindowCard(window) { deletingWindow = window } }
            }
        }

        if (data.canManage) {
            val upcoming = data.lessons.filter { it.status == "confirmed" && it.date >= Dates.todayKey() }
            if (upcoming.isNotEmpty()) {
                item { SectionTitle("Potvrzené lekce") }
                upcoming.forEach { lesson ->
                    item(key = "lesson-${lesson.id}") {
                        LessonCard(lesson, showRequester = true) {
                            DangerButton("Zrušit lekci") { change(lesson, "cancel") }
                        }
                    }
                }
            }
        }

        // The trainer does not sign up in their own calendar; an administrator
        // managing someone else's may, like a dancer.
        if (data.canManage && data.isOwnCalendar != false) return@ScreenScaffold

        val mine = data.mine.filter { it.date >= Dates.todayKey() && (it.status == "confirmed" || it.status == "pending") }
        item { SectionTitle("Moje lekce") }
        if (mine.isEmpty()) {
            item { EmptyCard("Zatím nemáš žádnou lekci. Vyber si volný čas níže.") }
        }
        mine.forEach { lesson ->
            item(key = "mine-${lesson.id}") {
                LessonCard(lesson, showRequester = false) {
                    DangerButton("Zrušit lekci") { change(lesson, "cancel") }
                }
            }
        }

        val free = data.slots.filter { it.state == "free" && it.date >= Dates.todayKey() }.groupBy { it.date }
        item { SectionTitle("Volné časy") }
        if (free.isEmpty()) {
            item { EmptyCard("Trenér teď nemá vypsané žádné volné časy.") }
        }
        free.toSortedMap().forEach { (date, slots) ->
            item(key = "free-$date") {
                Card {
                    Text(Dates.dayTitle(date).replaceFirstChar { it.titlecase(Dates.czech) }, color = P.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        slots.sortedBy { it.start }.forEach { slot ->
                            Text(
                                "${slot.start}–${slot.end}",
                                color = P.free.ink,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(P.free.background)
                                    .border(1.dp, P.free.line, RoundedCornerShape(12.dp))
                                    .clickable { requesting = slot }
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                            )
                        }
                    }
                }
            }
        }
    }

    val trainerKey = calendar?.trainer
    if (addingWindow && trainerKey != null) {
        TrainerWindowSheet(trainerKey, onDismiss = { addingWindow = false }) { message ->
            notice = message
            addingWindow = false
            scope.launch { loadCalendar() }
        }
    }
    deletingWindow?.let { window ->
        ConfirmDialog(
            title = "Smazat čas výuky?",
            text = "${windowTitle(window)} ${window.start}–${window.end}. Objednané a potvrzené lekce zůstanou.",
            confirm = "Smazat",
            onDismiss = { deletingWindow = null },
        ) {
            scope.launch {
                runCatching {
                    Api.send<MessageResponse>("DELETE", "/api/lessons/${Api.segment(trainerKey.orEmpty())}/windows", mapOf("id" to window.id))
                }
                    .onSuccess { notice = it.message }
                    .onFailure { error = it.message }
                deletingWindow = null
                loadCalendar()
            }
        }
    }

    val slot = requesting
    val data = calendar
    if (slot != null && data != null) {
        LessonRequestSheet(slot, data, onDismiss = { requesting = null }) { message ->
            notice = message
            requesting = null
            scope.launch { loadCalendar() }
        }
    }
}

@Composable
private fun LessonCard(lesson: TrainerLesson, showRequester: Boolean, actions: @Composable () -> Unit) {
    val style = when (lesson.status) {
        "confirmed" -> P.training
        "pending" -> P.cleanup
        else -> P.closed
    }
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(Dates.dayTitle(lesson.date).replaceFirstChar { it.titlecase(Dates.czech) }, color = P.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Muted("${lesson.start}–${lesson.end}")
            }
            Badge(lesson.statusLabel, style)
        }
        if (showRequester) {
            val who = listOfNotNull(lesson.guest?.takeIf { it.isNotBlank() } ?: lesson.requester, lesson.partner?.takeIf { it.isNotBlank() })
            InfoLine("Kdo", who.joinToString(" + "))
            lesson.phone?.takeIf { it.isNotBlank() }?.let { InfoLine("Telefon", it) }
        } else {
            lesson.partner?.takeIf { it.isNotBlank() }?.let { InfoLine("Partner/ka", it) }
        }
        lesson.note?.takeIf { it.isNotBlank() }?.let { Muted(it) }
        if (lesson.status == "confirmed" || lesson.status == "pending") actions()
    }
}

@Composable
private fun LessonRequestSheet(slot: LessonSlot, calendar: TrainerCalendar, onDismiss: () -> Unit, onDone: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var partner by remember { mutableStateOf(calendar.viewerPartner.orEmpty()) }
    var note by remember { mutableStateOf("") }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    BrandSheet(
        title = "Rezervovat lekci",
        subtitle = "${calendar.trainerName} · ${Dates.dayTitle(slot.date)}, ${slot.start}–${slot.end}",
        onDismiss = onDismiss,
        primaryTitle = "Poslat žádost",
        working = working,
        onPrimary = {
            working = true
            scope.launch {
                runCatching {
                    Api.send<MessageResponse>(
                        "POST",
                        "/api/lessons/${Api.segment(calendar.trainer)}",
                        mapOf(
                            "date" to slot.date,
                            "end" to slot.end,
                            "note" to note.trim(),
                            "partner" to partner.trim(),
                            "start" to slot.start,
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
            Field("Partner/ka", partner, { partner = it }, placeholder = "nepovinné")
            Field("Poznámka pro trenéra", note, { note = it }, singleLine = false, minLines = 2)
            FieldNote("Trenér žádost potvrdí nebo odmítne, dáme ti vědět.")
        }
        error?.let { ErrorBanner(it) }
    }
}
