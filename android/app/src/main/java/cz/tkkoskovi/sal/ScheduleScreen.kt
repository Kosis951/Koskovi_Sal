package cz.tkkoskovi.sal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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

class ScheduleModel {
    var schedule by mutableStateOf<PublicScheduleResponse?>(null)
        private set
    var days by mutableStateOf<List<ScheduleDay>>(emptyList())
        private set
    var error by mutableStateOf<String?>(null)

    val isPublished get() = schedule?.published == true

    // The server's list of the dancer's lessons (null: an older web).
    val mineKeys: Set<String>? get() = schedule?.mine?.toSet()

    // A lesson can be asked to be cancelled until a week before the visiting
    // trainer's first day, and to be moved until two days before it (the
    // organiser may not manage it). Later only in person with the organiser.
    // The web checks the same.
    val cancelUntil: String?
        get() = days.mapNotNull { it.dateKey }.minOrNull()?.let { Dates.addDays(-7, it) }

    val canCancel get() = cancelUntil?.let { Dates.todayKey() <= it } == true

    fun canMove(date: String) = Dates.todayKey() <= Dates.addDays(-2, date)

    suspend fun load() {
        runCatching { Api.get<PublicScheduleResponse>("/api/rozpis") }
            .onSuccess {
                schedule = it
                // Hall managers also get the unpublished draft; that is for Správa only.
                days = if (it.published) ScheduleParser.parse(it.body, Dates.todayKey()) else emptyList()
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

    fun isMine(day: ScheduleDay, row: ScheduleRow): Boolean {
        if (row.kind != RowKind.Lesson) return false
        model.mineKeys?.let { return "${day.dateKey}|${row.start}" in it }
        return name != null && ScheduleParser.belongsTo(row.text, name)
    }

    fun isPast(day: ScheduleDay, row: ScheduleRow): Boolean {
        val key = day.dateKey ?: return false
        return key < today || (key == today && Dates.minutes(row.end ?: "00:00") <= now)
    }

    ScreenScaffold(header = {
        BrandHeader("Rozpis", model.schedule?.title?.takeIf { model.isPublished && it.isNotBlank() } ?: "Externí trenér") {
            HeaderButton(Icons.Filled.Refresh, "Obnovit") { scope.launch { model.load() } }
        }
    }, onRefresh = { model.load() }) {
        model.error?.let { item { ErrorBanner(it) } }
        notice?.let { item { NoticeBanner(it) } }

        if (model.schedule != null && !model.isPublished) {
            item {
                Card {
                    SectionTitle("Není naplánován externí trenér")
                    Muted("Až přijede, najdeš tu jeho rozpis a tvoje lekce se zvýrazní.")
                }
            }
            return@ScreenScaffold
        }

        // "Is this you?" – lessons found by the account's surname.
        model.schedule?.linkSuggestion?.takeIf { session.isSignedIn }?.let { suggestion ->
            item {
                Card {
                    SectionTitle("Tohle jsi ty?")
                    Text(suggestion, color = P.accent, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Muted("V rozpisu jsme našli tvoje příjmení. Když potvrdíš, budeš tu mít své lekce (i partnerovy) a připomínky k nim.")
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        listOf(true to "Ano, to jsem já", false to "Nejsem").forEach { (confirm, label) ->
                            val action = {
                                scope.launch {
                                    runCatching {
                                        Api.send<MessageResponse>("POST", "/api/account/schedule-link", mapOf("confirm" to confirm))
                                    }
                                        .onSuccess { notice = it.message }
                                        .onFailure { model.error = it.message }
                                    model.load()
                                }
                                Unit
                            }
                            if (confirm) PrimaryButton(label, Modifier.weight(1f), onClick = action)
                            else SecondaryButton(label, Modifier.weight(1f), onClick = action)
                        }
                    }
                }
            }
        }

        // The dancer's own lessons, found by their name in the schedule.
        item {
            Card {
                SectionTitle("Moje lekce")
                if (!session.isSignedIn) {
                    Muted("Přihlas se a propoj účet se svým jménem v rozpisu – tvoje lekce se tu ukážou samy.")
                    SecondaryButton("Přihlásit se", onClick = onSignIn)
                } else if (name == null && model.days.none { day -> day.rows.any { isMine(day, it) } }) {
                    Muted("Najdeme tě podle příjmení z profilu, nebo napiš, jak tě trenér v rozpisu píše.")
                    SecondaryButton("Napsat jméno z rozpisu") { naming = true }
                } else {
                    val mine = model.days.flatMap { day -> day.rows.filter { isMine(day, it) }.map { RowRef(day, it) } }
                    if (mine.isEmpty()) {
                        Muted("V rozpisu teď nejsi (hledáme „${name.orEmpty()}“).")
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
                        if (name != null) "Jméno v rozpisu: $name · změnit" else "Zadat jméno z rozpisu ručně",
                        color = P.accent,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable { naming = true },
                    )
                }
            }
        }

        if (model.days.isNotEmpty()) {
            item {
                Card {
                    Muted(
                        (if (model.canCancel) {
                            "Nemůžeš na lekci? Klepni na svůj řádek: zrušit ji jde do ${model.cancelUntil?.let { Dates.dayTitle(it) }} (týden před příjezdem trenéra), "
                        } else {
                            "Zrušit lekci už přes rozpis nejde (šlo týden před příjezdem trenéra). "
                        }) + "o přesun můžeš požádat nejpozději 2 dny před lekcí – nemusí ale vyjít. Potom už jen po osobní domluvě s organizátorem.",
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
                        val canRequest = row.kind == RowKind.Lesson && !past && day.dateKey != null &&
                            (model.canCancel || model.canMove(day.dateKey))
                        ScheduleRowView(row, past, current, isMine(day, row)) {
                            if (canRequest) requesting = RowRef(day, row)
                        }
                    }
                }
            }
        }
    }

    requesting?.let { ref ->
        val date = ref.day.dateKey.orEmpty()
        ScheduleRequestSheet(ref, session, model.canCancel, model.canMove(date), onDismiss = { requesting = null }) { message ->
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
internal fun ScheduleRowView(row: ScheduleRow, past: Boolean, current: Boolean, mine: Boolean, onClick: () -> Unit) {
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
private fun ScheduleRequestSheet(
    ref: RowRef,
    session: SessionModel,
    canCancel: Boolean,
    canMove: Boolean,
    onDismiss: () -> Unit,
    onDone: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var kind by remember { mutableStateOf(if (canCancel) "cancel" else "move") }
    val kinds = listOfNotNull(if (canCancel) "cancel" to "Zrušit" else null, if (canMove) "move" to "Přesunout" else null)
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
            if (kinds.size > 1) {
                ChoicePills(kinds, kind) { kind = it }
            }
            if (!canCancel) {
                Muted("Zrušit lekci už přes rozpis nejde (šlo týden před příjezdem trenéra) – jen po osobní domluvě s organizátorem.")
            }
            if (kind == "move") {
                Text(
                    "Přesun nemusí jít – záleží na volných časech trenéra. Dokud ho nepotvrdíme, lekce platí.",
                    color = P.cleanup.ink,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(P.cleanup.background, androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
                        .padding(12.dp),
                )
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
