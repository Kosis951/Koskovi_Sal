package cz.tkkoskovi.sal

import android.content.Context
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.IntOffset
import kotlin.math.abs
import kotlin.math.roundToInt
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@Composable
fun CalendarScreen(hall: HallModel, session: SessionModel, onSignIn: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("app", Context.MODE_PRIVATE) }
    var day by rememberSaveable { mutableStateOf(Dates.todayKey()) }
    var month by rememberSaveable { mutableStateOf(prefs.getString("calendar.mode", "week") == "month") }
    var detail by remember { mutableStateOf<Booking?>(null) }
    var cancelled by remember { mutableStateOf<CancellationNotice?>(null) }
    var adding by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    val role = session.role

    ScreenScaffold(header = {
        BrandHeader("Sál", "TK Koškovi") {
            if (role?.canAddBookings == true) {
                HeaderButton(Icons.Filled.Add, "Přidat akci") { adding = true }
                Spacer(Modifier.width(8.dp))
            }
            HeaderButton(Icons.Filled.Refresh, "Obnovit") { scope.launch { hall.load() } }
        }
    }, onRefresh = { hall.load() }) {
        hall.error?.let { item { ErrorBanner(it) } }
        notice?.let { item { NoticeBanner(it) } }

        if (hall.hasLoaded) {
            item {
                HallStatusCard(hall.status(), canClean = session.isSignedIn) { booking ->
                    scope.launch {
                        notice = runCatching { hall.markCleaned(booking) }.getOrElse { hall.error = it.message; null }
                    }
                }
            }
        }

        item {
            CalendarCard(hall, day, month, onMode = {
                month = it
                prefs.edit().putString("calendar.mode", if (it) "month" else "week").apply()
            }) { day = it }
        }

        val hours = hall.hours(day)
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(Dates.dayTitle(day).replaceFirstChar { it.titlecase(Dates.czech) }, color = P.ink, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                    Muted(if (hours != null) "Otevřeno ${hours.start}–${hours.end} · volno ${formatHours(hall.freeHours(day))}" else "Sál je zavřený")
                }
            }
        }

        if (hours != null) {
            item { OccupancyBar(hall, day, hours) }
        }

        val items = hall.items(day)
        if (hours == null && items.isEmpty()) {
            item { EmptyCard("V tento den je sál zavřený.") }
        }
        items.forEach { entry ->
            item(key = entry.key) {
                DayItemRow(entry) {
                    when (entry) {
                        is DayItem.Reserved -> detail = entry.booking
                        is DayItem.Cancelled -> cancelled = entry.notice
                        is DayItem.Free -> if (role?.canAddBookings == true) adding = true
                    }
                }
            }
        }

        item { CalendarLegend() }
    }

    detail?.let { booking ->
        BookingDetailSheet(booking, hall, session, onDismiss = { detail = null }, onSignIn = onSignIn) { message ->
            notice = message
            detail = null
        }
    }

    cancelled?.let { item ->
        BrandSheet(
            title = "Zrušený trénink",
            subtitle = "${Dates.dayTitle(item.date)}, ${item.start}–${item.end}",
            onDismiss = { cancelled = null },
        ) {
            Card {
                Text(item.title, color = P.ink, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Muted("Tento pravidelný trénink v tento den odpadá.")
            }
            if (role?.canManageBookings == true) {
                SecondaryButton("Vrátit trénink zpět") {
                    scope.launch {
                        runCatching { hall.reinstate(item) }
                            .onSuccess { notice = "Trénink je zpět v kalendáři." }
                            .onFailure { hall.error = it.message }
                        cancelled = null
                    }
                }
            }
        }
    }

    if (adding) {
        AddBookingSheet(hall, day, onDismiss = { adding = false }) {
            notice = "Akce je v kalendáři."
            adding = false
        }
    }
}

private fun formatHours(hours: Double): String =
    if (hours % 1.0 == 0.0) "${hours.toInt()} h" else "${hours.toString().replace('.', ',')} h"

@Composable
private fun HallStatusCard(status: HallStatus, canClean: Boolean, onClean: (Booking) -> Unit) {
    val style = when (status.tone) {
        Tone.Free -> P.free
        Tone.Busy -> P.busy
        Tone.Cleanup -> P.cleanup
        Tone.Closed -> P.closed
    }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(style.background)
            .border(1.dp, style.line, RoundedCornerShape(18.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(style.ink))
            Spacer(Modifier.width(8.dp))
            Text("Právě teď", color = style.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
        Text(status.title, color = style.ink, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
        Text(status.detail, color = style.ink, fontSize = 14.sp)
        val booking = status.cleanupBooking
        if (booking != null && canClean) {
            PrimaryButton("Sál je uklizený") { onClean(booking) }
        }
    }
}

// The week strip or month grid; swiping it (or the arrows) moves to the next
// or previous week/month, and the days follow the finger.
@Composable
private fun CalendarCard(hall: HallModel, selected: String, month: Boolean, onMode: (Boolean) -> Unit, onSelect: (String) -> Unit) {
    val today = Dates.todayKey()
    val haptics = LocalHapticFeedback.current
    var drag by remember { mutableFloatStateOf(0f) }
    var forward by remember { mutableStateOf(true) }
    val period = if (month) selected.take(7) else Dates.weekStart(selected)

    fun step(direction: Int) {
        forward = direction > 0
        drag = 0f
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        onSelect(if (month) Dates.addMonths(direction.toLong(), selected) else Dates.addDays(7L * direction, selected))
    }

    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { step(-1) }) {
                Icon(Icons.Filled.ChevronLeft, contentDescription = "Předchozí", tint = P.ink)
            }
            Text(
                Dates.monthTitle(selected),
                color = P.ink,
                fontSize = 17.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.weight(1f).clickable { onSelect(today) },
                textAlign = TextAlign.Center,
            )
            IconButton(onClick = { step(1) }) {
                Icon(Icons.Filled.ChevronRight, contentDescription = "Další", tint = P.ink)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Muted("Celý měsíc", 13)
            Spacer(Modifier.width(8.dp))
            Switch(
                checked = month,
                onCheckedChange = onMode,
                colors = SwitchDefaults.colors(checkedTrackColor = P.brand),
            )
            Spacer(Modifier.weight(1f))
            if (selected != today) {
                Text(
                    "Dnes",
                    color = P.accent,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { onSelect(today) }.padding(8.dp),
                )
            }
        }

        AnimatedContent(
            targetState = month to period,
            transitionSpec = {
                val direction = if (forward) 1 else -1
                (slideInHorizontally { it * direction } + fadeIn()) togetherWith
                    (slideOutHorizontally { -it * direction } + fadeOut())
            },
            modifier = Modifier
                .fillMaxWidth()
                .clipToBounds()
                .offset { IntOffset(drag.roundToInt(), 0) }
                .pointerInput(selected, month) {
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            if (abs(drag) > 30.dp.toPx()) step(if (drag < 0) 1 else -1) else drag = 0f
                        },
                        onDragCancel = { drag = 0f },
                    ) { change, amount ->
                        change.consume()
                        drag += amount * 0.5f
                    }
                },
            label = "calendar",
        ) { (isMonth, shown) ->
            val anchor = if (isMonth) "$shown-01" else shown
            val days = if (isMonth) Dates.monthGrid(anchor) else Dates.week(anchor)
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth()) {
                    days.take(7).forEach {
                        Text(Dates.shortWeekday(it), color = P.inkSoft, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                    }
                }
                days.chunked(7).forEach { week ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        week.forEach { key ->
                            DayCell(
                                key = key,
                                selected = key == selected,
                                today = key == today,
                                faded = isMonth && key.take(7) != shown,
                                closed = hall.hasLoaded && hall.hours(key) == null,
                                kinds = hall.kinds(key),
                                modifier = Modifier.weight(1f),
                            ) { onSelect(key) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(
    key: String,
    selected: Boolean,
    today: Boolean,
    faded: Boolean,
    closed: Boolean,
    kinds: List<DayKind>,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val background = when {
        selected -> P.brand
        today -> P.subtle
        else -> Color.Transparent
    }
    val ink = when {
        selected -> Color.White
        faded || closed -> P.inkSoft
        else -> P.ink
    }
    Column(
        modifier
            .aspectRatio(0.85f)
            .clip(RoundedCornerShape(12.dp))
            .background(background)
            .border(1.dp, if (today && !selected) P.accent else Color.Transparent, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(Dates.dayNumber(key), color = ink, fontSize = 16.sp, fontWeight = if (today || selected) FontWeight.ExtraBold else FontWeight.SemiBold)
        Spacer(Modifier.height(3.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.height(6.dp)) {
            kinds.forEach { kind ->
                Box(
                    Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(if (selected) Color.White else dotColor(kind)),
                )
            }
        }
    }
}

@Composable
private fun dotColor(kind: DayKind): Color = when (kind) {
    DayKind.Training -> P.accent
    DayKind.Event -> P.event.ink
    DayKind.Busy -> P.busy.ink
    DayKind.Cleanup -> P.cleanup.line
}

// The opening hours as a strip, with bookings filled in.
@Composable
private fun OccupancyBar(hall: HallModel, day: String, hours: OpeningHours) {
    val open = Dates.minutes(hours.start)
    val close = Dates.minutes(hours.end)
    val span = (close - open).coerceAtLeast(1).toFloat()
    val today = day == Dates.todayKey()
    val now = Dates.minutes(Dates.nowTime())
    val bookings = hall.bookings(day)
    val trainingStyle = P.training
    val eventStyle = P.event
    val busyStyle = P.busy

    Card(padding = 14) {
        Text("Obsazenost", color = P.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .height(26.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(P.free.background)
                .border(1.dp, P.free.line, RoundedCornerShape(8.dp)),
        ) {
            val width = maxWidth
            bookings.forEach { booking ->
                val start = (Dates.minutes(booking.start).coerceIn(open, close) - open) / span
                val end = (Dates.minutes(booking.end).coerceIn(open, close) - open) / span
                if (end > start) {
                    val style = when {
                        booking.isTraining -> trainingStyle
                        booking.isBusy -> busyStyle
                        else -> eventStyle
                    }
                    Box(
                        Modifier
                            .offset(x = width * start)
                            .width(width * (end - start))
                            .fillMaxHeight()
                            .background(style.line),
                    )
                }
            }
            if (today && now in open..close) {
                Box(
                    Modifier
                        .offset(x = width * ((now - open) / span))
                        .width(2.dp)
                        .fillMaxHeight()
                        .background(P.now),
                )
            }
        }
        Row(Modifier.fillMaxWidth()) {
            Text(hours.start, color = P.inkSoft, fontSize = 12.sp)
            Spacer(Modifier.weight(1f))
            Text(Dates.time((open + close) / 2 / 30 * 30), color = P.inkSoft, fontSize = 12.sp)
            Spacer(Modifier.weight(1f))
            Text(hours.end, color = P.inkSoft, fontSize = 12.sp)
        }
    }
}

@Composable
private fun CalendarLegend() {
    Card(padding = 14) {
        Text("Legenda", color = P.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        LegendLine(P.accent, P.training, "Trénink")
        LegendLine(P.event.ink, P.event, "Akce, seminář, soustředění")
        LegendLine(P.busy.ink, P.busy, "Obsazeno")
        LegendLine(P.cleanup.line, P.cleanup, "Čeká na úklid")
        LegendLine(P.free.ink, P.free, "Volno")
    }
}

@Composable
private fun LegendLine(dot: Color, style: KindStyle, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(dot))
        Spacer(Modifier.width(8.dp))
        Box(
            Modifier
                .size(width = 26.dp, height = 12.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(style.background)
                .border(1.dp, style.line, RoundedCornerShape(4.dp)),
        )
        Spacer(Modifier.width(10.dp))
        Text(label, color = P.inkMuted, fontSize = 14.sp)
    }
}

@Composable
internal fun DayItemRow(item: DayItem, onClick: () -> Unit) {
    val style: KindStyle
    val title: String
    val time: String
    val label: String
    var cleanup = false
    var struck = false

    when (item) {
        is DayItem.Reserved -> {
            style = if (item.booking.waitsForCleanup) P.cleanup else P.style(item.booking)
            title = item.booking.title
            time = "${item.booking.start}–${item.booking.end}"
            label = item.booking.kindLabel
            cleanup = item.booking.waitsForCleanup
        }
        is DayItem.Cancelled -> {
            style = P.closed
            title = item.notice.title
            time = "${item.notice.start}–${item.notice.end}"
            label = "Zrušeno"
            struck = true
        }
        is DayItem.Free -> {
            style = P.free
            title = "Volno"
            time = "${item.start}–${item.end}"
            label = "Volno"
        }
    }

    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(style.background)
            .border(1.dp, style.line, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(time, color = style.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.width(96.dp))
        Column(Modifier.weight(1f)) {
            Text(
                title,
                color = style.ink,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                textDecoration = if (struck) androidx.compose.ui.text.style.TextDecoration.LineThrough else null,
            )
            if (cleanup) Text("Čeká na úklid", color = style.ink, fontSize = 12.sp)
        }
        Badge(label, style)
    }
}

@Composable
internal fun BookingDetailSheet(
    booking: Booking,
    hall: HallModel,
    session: SessionModel,
    onDismiss: () -> Unit,
    onSignIn: () -> Unit,
    onDone: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var title by remember { mutableStateOf(booking.title) }
    var start by remember { mutableStateOf(booking.start) }
    var end by remember { mutableStateOf(booking.end) }
    var confirmDelete by remember { mutableStateOf(false) }
    val canEdit = session.canEdit(booking)

    fun perform(action: suspend () -> String) {
        working = true
        scope.launch {
            runCatching { action() }
                .onSuccess { onDone(it) }
                .onFailure { error = it.message }
            working = false
        }
    }

    BrandSheet(
        title = booking.title,
        subtitle = "${booking.kindLabel} · ${Dates.dayTitle(booking.date)}",
        onDismiss = onDismiss,
        primaryTitle = if (editing) "Uložit změny" else null,
        working = working,
        onPrimary = {
            if (Dates.minutes(start) >= Dates.minutes(end)) {
                error = "Konec musí být později než začátek."
            } else {
                perform {
                    if (title.trim() != booking.title) hall.rename(booking, title.trim())
                    if (start != booking.start || end != booking.end) hall.move(booking, start, end)
                    "Změny jsou uložené."
                }
            }
        },
    ) {
        Card {
            InfoLine("Kdy", "${booking.start}–${booking.end}")
            InfoLine("Typ", booking.kindLabel)
            booking.organizer?.takeIf { it.isNotBlank() }?.let { InfoLine("Pořádá", it) }
            booking.trainer?.takeIf { it.isNotBlank() }?.let { InfoLine("Trenér", it) }
            booking.note?.takeIf { it.isNotBlank() }?.let {
                Muted(it)
            }
            if (booking.cleanupRequired == true) {
                InfoLine("Úklid", if (booking.cleanedAt != null) "Uklizeno" else "Čeká na úklid")
            }
        }

        if (booking.waitsForCleanup) {
            if (session.isSignedIn) {
                SecondaryButton("Sál je uklizený") { perform { hall.markCleaned(booking) } }
            } else {
                SecondaryButton("Přihlas se a označ úklid") {
                    onDismiss()
                    onSignIn()
                }
            }
        }

        if (canEdit) {
            if (editing) {
                Card {
                    Field("Název", title, { title = it })
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        TimePicker("Od", start, Modifier.weight(1f)) { start = it }
                        TimePicker("Do", end, Modifier.weight(1f)) { end = it }
                    }
                }
            } else {
                SecondaryButton("Upravit") { editing = true }
            }
            if (confirmDelete) {
                Muted("Opravdu smazat? Tohle nejde vrátit.")
                DangerButton("Ano, smazat", working = working) {
                    perform {
                        hall.delete(booking)
                        if (booking.isTraining) "Trénink v tento den odpadá." else "Smazáno."
                    }
                }
            } else {
                DangerButton(if (booking.isTraining) "Zrušit trénink v tento den" else "Smazat") { confirmDelete = true }
            }
        }

        error?.let { ErrorBanner(it) }
    }
}

@Composable
internal fun AddBookingSheet(hall: HallModel, date: String, onDismiss: () -> Unit, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var eventType by remember { mutableStateOf("seminar") }
    var day by remember { mutableStateOf(date) }
    var start by remember { mutableStateOf("17:00") }
    var end by remember { mutableStateOf("18:30") }
    var note by remember { mutableStateOf("") }
    var cleanup by remember { mutableStateOf(false) }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    BrandSheet(
        title = "Nová akce",
        subtitle = "Zapíše se rovnou do kalendáře",
        onDismiss = onDismiss,
        primaryTitle = "Přidat do kalendáře",
        primaryEnabled = name.isNotBlank(),
        working = working,
        onPrimary = {
            if (Dates.minutes(start) >= Dates.minutes(end)) {
                error = "Konec musí být později než začátek."
            } else {
                working = true
                scope.launch {
                    runCatching { hall.addBooking(name.trim(), day, start, end, eventType, note.trim(), cleanup) }
                        .onSuccess { onDone() }
                        .onFailure { error = it.message }
                    working = false
                }
            }
        },
    ) {
        Card {
            Field("Název", name, { name = it }, placeholder = "např. Seminář latina")
            ChoicePills(
                listOf("seminar" to "Seminář", "soustredeni" to "Soustředění", "obsazeno" to "Obsazeno"),
                eventType,
            ) { eventType = it }
            if (eventType == "obsazeno") FieldNote("Pravidelné tréninky v té době odpadnou.")
        }
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { day = Dates.addDays(-1, day) }) { Icon(Icons.Filled.ChevronLeft, "Předchozí den", tint = P.ink) }
                Text(Dates.dayTitle(day), color = P.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                IconButton(onClick = { day = Dates.addDays(1, day) }) { Icon(Icons.Filled.ChevronRight, "Další den", tint = P.ink) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TimePicker("Od", start, Modifier.weight(1f)) { start = it }
                TimePicker("Do", end, Modifier.weight(1f)) { end = it }
            }
        }
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Po akci uklidit", color = P.ink, fontWeight = FontWeight.SemiBold)
                    FieldNote("Sál se ukáže jako „čeká na úklid“.")
                }
                Switch(checked = cleanup, onCheckedChange = { cleanup = it }, colors = SwitchDefaults.colors(checkedTrackColor = P.brand))
            }
            Field("Poznámka", note, { note = it }, singleLine = false, minLines = 2)
        }
        error?.let { ErrorBanner(it) }
    }
}
