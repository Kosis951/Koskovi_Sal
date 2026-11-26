package cz.tkkoskovi.sal

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BeachAccess
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.ManageAccounts
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

// Hall administration in the app (as Správa on the web and in the iPhone
// app): for the hall's managers; users only for the main administrator.
enum class AdminPage(val title: String) {
    Bookings("Akce"),
    Trainings("Pravidelné tréninky"),
    Holidays("Prázdniny"),
    Schedule("Rozpis"),
    Requests("Žádosti z rozpisu"),
    Users("Uživatelé"),
    History("Historie změn"),
}

@Composable
fun AdminScreen(session: SessionModel) {
    var page by rememberSaveable { mutableStateOf<AdminPage?>(null) }
    val back = { page = null }

    BackHandler(enabled = page != null) { page = null }

    when (page) {
        null -> AdminHome(session) { page = it }
        AdminPage.Bookings -> AdminBookings(session, back)
        AdminPage.Trainings -> AdminTrainings(back)
        AdminPage.Holidays -> AdminHolidays(back)
        AdminPage.Schedule -> AdminSchedule(back)
        AdminPage.Requests -> AdminRequests(back)
        AdminPage.Users -> AdminUsers(back)
        AdminPage.History -> AdminHistory(back)
    }
}

@Composable
private fun AdminHome(session: SessionModel, open: (AdminPage) -> Unit) {
    ScreenScaffold(header = { BrandHeader("Správa", session.role?.label) }) {
        item { SectionTitle("Sál") }
        item {
            Card(padding = 6) {
                AdminLink(Icons.Filled.CalendarMonth, "Akce", "Nadcházející akce v sále") { open(AdminPage.Bookings) }
                AdminLink(Icons.Filled.Repeat, "Pravidelné tréninky", "Přidat, upravit, pozastavit") { open(AdminPage.Trainings) }
                AdminLink(Icons.Filled.BeachAccess, "Prázdniny", "Období bez tréninků") { open(AdminPage.Holidays) }
            }
        }
        item { SectionTitle("Externí trenér") }
        item {
            Card(padding = 6) {
                AdminLink(Icons.Filled.EditNote, "Rozpis", "Text rozpisu a zveřejnění") { open(AdminPage.Schedule) }
                AdminLink(Icons.Filled.Inbox, "Žádosti o zrušení a přesun", "Z veřejného rozpisu") { open(AdminPage.Requests) }
            }
        }
        item { SectionTitle("Lidé a historie") }
        item {
            Card(padding = 6) {
                if (session.role == Role.admin) {
                    AdminLink(Icons.Filled.ManageAccounts, "Uživatelé", "Účty, role, hesla") { open(AdminPage.Users) }
                }
                AdminLink(Icons.Filled.History, "Historie změn", "Kdo co změnil, vrácení změny") { open(AdminPage.History) }
            }
        }
    }
}

@Composable
private fun AdminLink(icon: ImageVector, title: String, detail: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(Brush.linearGradient(P.gradient)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = P.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Text(detail, color = P.inkMuted, fontSize = 12.sp)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = P.inkSoft)
    }
}

// --- Upcoming one-off bookings ---

@Composable
private fun AdminBookings(session: SessionModel, onBack: () -> Unit) {
    val hall = remember { HallModel() }
    var detail by remember { mutableStateOf<Booking?>(null) }
    var adding by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    val today = Dates.todayKey()
    val upcoming = hall.bookings
        .filter { !it.isTraining && it.date >= today }
        .sortedWith(compareBy({ it.date }, { it.start }))

    LaunchedEffect(Unit) { hall.load() }

    ScreenScaffold(
        header = {
            SubHeader(AdminPage.Bookings.title, "Správa", onBack) {
                HeaderButton(Icons.Filled.Add, "Přidat akci") { adding = true }
            }
        },
        onRefresh = { hall.load() },
    ) {
        notice?.let { item { NoticeBanner(it) } }
        item { ListState(hall.isLoading, hall.error, upcoming.isEmpty(), "Žádné nadcházející akce.") }
        upcoming.forEach { booking ->
            item(key = booking.id) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(
                        Modifier
                            .size(width = 48.dp, height = 54.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(P.subtle),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(Dates.shortWeekday(booking.date), color = P.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text(Dates.dayNumber(booking.date), color = P.accent, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold)
                    }
                    Spacer(Modifier.width(12.dp))
                    Box(Modifier.weight(1f)) {
                        DayItemRow(DayItem.Reserved(booking)) { detail = booking }
                    }
                }
            }
        }
    }

    detail?.let { booking ->
        BookingDetailSheet(booking, hall, session, onDismiss = { detail = null }, onSignIn = {}) { message ->
            notice = message
            detail = null
        }
    }

    if (adding) {
        AddBookingSheet(hall, today, onDismiss = { adding = false }) {
            notice = "Akce je v kalendáři."
            adding = false
        }
    }
}

// --- Regular trainings ---

@Composable
private fun AdminTrainings(onBack: () -> Unit) {
    var trainings by remember { mutableStateOf<List<RecurringTraining>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<RecurringTraining?>(null) }
    var adding by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        loading = true
        runCatching { Api.get<TrainingsResponse>("/api/recurring-trainings").trainings }
            .onSuccess {
                trainings = it
                error = null
            }
            .onFailure { error = it.message }
        loading = false
    }

    LaunchedEffect(Unit) { load() }

    ScreenScaffold(
        header = {
            SubHeader(AdminPage.Trainings.title, "Správa", onBack) {
                HeaderButton(Icons.Filled.Add, "Přidat trénink") { adding = true }
            }
        },
        onRefresh = { load() },
    ) {
        notice?.let { item { NoticeBanner(it) } }
        item { ListState(loading, error, trainings.isEmpty(), "Žádné pravidelné tréninky.") }
        (1..7).forEach { weekday ->
            val day = trainings.filter { it.weekday == weekday }.sortedBy { it.start }
            if (day.isNotEmpty()) {
                item(key = "day-$weekday") {
                    Card {
                        Text(weekdayNames[weekday], color = P.ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        day.forEach { training -> TrainingRow(training) { editing = training } }
                    }
                }
            }
        }
    }

    val done: (String) -> Unit = { message ->
        notice = message
        editing = null
        adding = false
        scope.launch { load() }
    }

    editing?.let { training -> TrainingSheet(training, onDismiss = { editing = null }, onDone = done) }
    if (adding) TrainingSheet(null, onDismiss = { adding = false }, onDone = done)
}

@Composable
private fun TrainingRow(training: RecurringTraining, onClick: () -> Unit) {
    val style = P.training
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(style.background)
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(54.dp)) {
            Text(training.start, color = style.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text(training.end, color = style.ink.copy(alpha = 0.75f), fontSize = 12.sp)
        }
        Column(Modifier.weight(1f)) {
            Text(
                training.alternateTitle?.takeIf { it.isNotBlank() }?.let { "${training.title} / $it" } ?: training.title,
                color = style.ink,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
            )
            training.trainer?.takeIf { it.isNotBlank() }?.let { Text(it, color = style.ink, fontSize = 12.sp) }
        }
        val status = training.status
        if (status != null && status.state != "active") {
            Badge(status.label, if (status.state == "paused") P.cleanup else P.closed)
        }
    }
}

@Composable
private fun TrainingSheet(training: RecurringTraining?, onDismiss: () -> Unit, onDone: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val today = Dates.todayKey()
    var title by remember { mutableStateOf(training?.title.orEmpty()) }
    var alternateTitle by remember { mutableStateOf(training?.alternateTitle.orEmpty()) }
    var trainer by remember { mutableStateOf(training?.trainer.orEmpty()) }
    var weekday by remember { mutableIntStateOf(training?.weekday ?: 1) }
    var start by remember { mutableStateOf(training?.start ?: "17:00") }
    var end by remember { mutableStateOf(training?.end ?: "18:00") }
    var hasPeriod by remember { mutableStateOf(training?.validFrom != null || training?.validUntil != null) }
    var validFrom by remember { mutableStateOf(training?.validFrom ?: today) }
    var validUntil by remember { mutableStateOf(training?.validUntil ?: today) }
    var isCourse by remember { mutableStateOf(training?.lessonCount != null) }
    var lessonCount by remember { mutableIntStateOf(training?.lessonCount ?: 10) }
    var isPaused by remember { mutableStateOf(training?.pausedFrom != null) }
    var pausedFrom by remember { mutableStateOf(training?.pausedFrom ?: today) }
    var pausedUntil by remember { mutableStateOf(training?.pausedUntil ?: today) }
    var working by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    BrandSheet(
        title = if (training == null) "Nový trénink" else "Upravit trénink",
        subtitle = training?.title,
        onDismiss = onDismiss,
        primaryTitle = "Uložit",
        primaryEnabled = title.isNotBlank(),
        working = working,
        onPrimary = {
            working = true
            val payload = mutableMapOf<String, Any?>(
                "alternateTitle" to alternateTitle.trim(),
                "end" to end,
                "start" to start,
                "title" to title.trim(),
                "trainer" to trainer.trim(),
                "weekday" to weekday,
            )
            if (hasPeriod || isCourse) payload["validFrom"] = validFrom
            if (hasPeriod && !isCourse) payload["validUntil"] = validUntil
            if (isCourse) payload["lessonCount"] = lessonCount
            if (isPaused) {
                payload["pausedFrom"] = pausedFrom
                payload["pausedUntil"] = pausedUntil
            }
            training?.let { payload["key"] = it.key }
            scope.launch {
                runCatching { Api.send<MessageResponse>(if (training == null) "POST" else "PUT", "/api/recurring-trainings", payload) }
                    .onSuccess { onDone(if (training == null) "Trénink je přidaný." else "Trénink je uložený.") }
                    .onFailure { error = it.message }
                working = false
            }
        },
    ) {
        Card {
            Field("Název", title, { title = it }, placeholder = "např. Junioři")
            Field("Střídavý název (každý druhý týden)", alternateTitle, { alternateTitle = it }, placeholder = "nepovinné")
            Field("Trenér", trainer, { trainer = it }, placeholder = "nepovinné")
        }
        Card {
            Text("Den", color = P.inkMuted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            ChoicePills((1..7).map { it.toString() to weekdayNames[it].take(2) }, weekday.toString()) { weekday = it.toInt() }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TimePicker("Od", start, Modifier.weight(1f)) { start = it }
                TimePicker("Do", end, Modifier.weight(1f)) { end = it }
            }
        }
        Card {
            ToggleRow("Jen v určitém období", hasPeriod) { hasPeriod = it }
            if (hasPeriod || isCourse) DateField("Od", validFrom) { validFrom = it }
            if (hasPeriod && !isCourse) DateField("Do", validUntil) { validUntil = it }
            ToggleRow("Kurz na počet lekcí", isCourse) { isCourse = it }
            if (isCourse) CountStepper("Lekcí", lessonCount, 1..200) { lessonCount = it }
            training?.status?.let { FieldNote(statusText(it)) }
        }
        Card {
            ToggleRow("Pozastavit", isPaused, "Trénink v tom období neproběhne.") { isPaused = it }
            if (isPaused) {
                DateField("Od", pausedFrom) { pausedFrom = it }
                DateField("Do", pausedUntil) { pausedUntil = it }
            }
        }
        error?.let { ErrorBanner(it) }
        if (training != null) {
            DangerButton("Smazat trénink") { confirmingDelete = true }
        }
    }

    if (confirmingDelete && training != null) {
        ConfirmDialog(
            title = "Smazat trénink ${training.title}?",
            text = "Trénink zmizí z kalendáře ve všech týdnech.",
            confirm = "Smazat",
            onDismiss = { confirmingDelete = false },
        ) {
            scope.launch {
                runCatching { Api.send<MessageResponse>("DELETE", "/api/recurring-trainings", mapOf("key" to training.key)) }
                    .onSuccess { onDone("Trénink je smazaný.") }
                    .onFailure { error = it.message }
            }
        }
    }
}

private fun statusText(status: TrainingStatus): String {
    val parts = mutableListOf("Stav: ${status.label.lowercase()}")
    if (status.heldLessons != null && status.remainingLessons != null) {
        parts += "proběhlo ${status.heldLessons}, zbývá ${status.remainingLessons}"
    }
    status.lastDate?.let { parts += "poslední ${Dates.dayTitle(it)}" }
    return parts.joinToString(" · ")
}

// --- Holidays ---

@Composable
private fun AdminHolidays(onBack: () -> Unit) {
    var holidays by remember { mutableStateOf<List<Holiday>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var adding by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<Holiday?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        loading = true
        runCatching { Api.get<HolidaysResponse>("/api/recurring-holidays").holidays }
            .onSuccess {
                holidays = it
                error = null
            }
            .onFailure { error = it.message }
        loading = false
    }

    LaunchedEffect(Unit) { load() }

    ScreenScaffold(
        header = {
            SubHeader(AdminPage.Holidays.title, "Správa", onBack) {
                HeaderButton(Icons.Filled.Add, "Přidat prázdniny") { adding = true }
            }
        },
        onRefresh = { load() },
    ) {
        item { ListState(loading, error, holidays.isEmpty(), "Žádné prázdniny. Tréninky běží každý týden.") }
        holidays.sortedBy { it.start }.forEach { holiday ->
            item(key = holiday.id) {
                Card(padding = 14) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.BeachAccess, contentDescription = null, tint = P.cleanup.ink)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(holiday.label, color = P.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                            Muted("${Dates.dayTitle(holiday.start)} – ${Dates.dayTitle(holiday.end)}", 13)
                        }
                        IconButton(onClick = { deleting = holiday }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Smazat prázdniny", tint = P.busy.ink)
                        }
                    }
                }
            }
        }
    }

    if (adding) {
        HolidaySheet(onDismiss = { adding = false }) {
            adding = false
            scope.launch { load() }
        }
    }

    deleting?.let { holiday ->
        ConfirmDialog(
            title = "Smazat ${holiday.label}?",
            text = "Tréninky v tom období se zase objeví.",
            confirm = "Smazat",
            onDismiss = { deleting = null },
        ) {
            scope.launch {
                runCatching { Api.send<MessageResponse>("DELETE", "/api/recurring-holidays", mapOf("id" to holiday.id)) }
                    .onFailure { error = it.message }
                load()
            }
        }
    }
}

@Composable
private fun HolidaySheet(onDismiss: () -> Unit, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var label by remember { mutableStateOf("Prázdniny") }
    var start by remember { mutableStateOf(Dates.todayKey()) }
    var end by remember { mutableStateOf(Dates.todayKey()) }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    BrandSheet(
        title = "Nové prázdniny",
        subtitle = "Tréninky v tom období neproběhnou",
        onDismiss = onDismiss,
        primaryTitle = "Přidat",
        primaryEnabled = label.isNotBlank(),
        working = working,
        onPrimary = {
            if (end < start) {
                error = "Konec musí být stejný den nebo po začátku."
            } else {
                working = true
                scope.launch {
                    runCatching {
                        Api.send<MessageResponse>(
                            "POST",
                            "/api/recurring-holidays",
                            mapOf("end" to end, "label" to label.trim(), "start" to start),
                        )
                    }
                        .onSuccess { onDone() }
                        .onFailure { error = it.message }
                    working = false
                }
            }
        },
    ) {
        Card {
            Field("Název", label, { label = it })
            DateField("Od", start) {
                start = it
                if (end < it) end = it
            }
            DateField("Do", end) { end = it }
        }
        error?.let { ErrorBanner(it) }
    }
}

// --- The visiting trainer's schedule ---

@Composable
private fun AdminSchedule(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var published by remember { mutableStateOf(false) }
    var cancelTrainings by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var preview by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    val days = remember(text) { ScheduleParser.parse(text, Dates.todayKey()) }

    suspend fun load() {
        runCatching { Api.get<ScheduleDraft>("/api/rozpis") }
            .onSuccess {
                title = it.title
                text = it.body
                published = it.published
                cancelTrainings = it.cancelTrainings ?: false
                loaded = true
                error = null
            }
            .onFailure { error = it.message }
    }

    LaunchedEffect(Unit) { load() }

    ScreenScaffold(header = { SubHeader(AdminPage.Schedule.title, "Správa", onBack) }) {
        notice?.let { item { NoticeBanner(it) } }
        error?.let { item { ErrorBanner(it) } }
        item {
            Card {
                Field("Nadpis", title, { title = it }, placeholder = "Externí trenér")
                Text("Rozpis (jak ho trenér pošle)", color = P.inkMuted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    enabled = loaded,
                    minLines = 10,
                    textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, color = P.ink),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = P.accent,
                        unfocusedBorderColor = P.line,
                        focusedContainerColor = P.subtle,
                        unfocusedContainerColor = P.subtle,
                        cursorColor = P.accent,
                    ),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 240.dp),
                )
                FieldNote("Řádek s datem (5.11.) začíná den, řádky „10:00–10:45 – Jméno“ jsou lekce. Oběd a pauza se poznají, GROUP je seminář.")
                ToggleRow("Zveřejnit", published, "Uvidí ho všichni i bez přihlášení, propíše se do kalendáře sálu.") { published = it }
                ToggleRow("Zrušit tréninky v té době", cancelTrainings, "Jinak poběží tréninky vedle bloku trenéra.") { cancelTrainings = it }
            }
        }
        item {
            PrimaryButton("Uložit", enabled = loaded, working = saving) {
                saving = true
                scope.launch {
                    runCatching {
                        Api.send<MessageResponse>(
                            "PUT",
                            "/api/rozpis",
                            mapOf(
                                "body" to text,
                                "cancelTrainings" to cancelTrainings,
                                "published" to published,
                                "title" to title.trim(),
                            ),
                        )
                    }
                        .onSuccess {
                            notice = it.message ?: "Uloženo."
                            error = null
                        }
                        .onFailure { error = it.message }
                    saving = false
                }
            }
        }
        item {
            Card {
                Row(
                    Modifier.fillMaxWidth().clickable { preview = !preview },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Náhled (${days.size} dní)", color = P.ink, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text(if (preview) "Skrýt" else "Ukázat", color = P.accent, fontWeight = FontWeight.SemiBold)
                }
                if (preview) {
                    days.forEach { day ->
                        day.dateKey?.let {
                            Text(
                                Dates.dayTitle(it).replaceFirstChar { c -> c.titlecase(Dates.czech) },
                                color = P.ink,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(top = 6.dp),
                            )
                        }
                        day.rows.forEach { row -> ScheduleRowView(row, past = false, current = false, mine = false) {} }
                    }
                }
            }
        }
    }
}

// --- Requests to cancel or move a lesson from the schedule ---

@Composable
private fun AdminRequests(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val uri = LocalUriHandler.current
    var requests by remember { mutableStateOf<List<ScheduleRequest>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showAll by remember { mutableStateOf(false) }
    val shown = requests
        .filter { showAll || it.status == "pending" }
        .sortedWith(compareBy({ it.date }, { it.start }))

    suspend fun load() {
        loading = true
        runCatching { Api.get<ScheduleRequestsResponse>("/api/rozpis/zadosti").requests }
            .onSuccess {
                requests = it
                error = null
            }
            .onFailure { error = it.message }
        loading = false
    }

    LaunchedEffect(Unit) { load() }

    ScreenScaffold(header = { SubHeader(AdminPage.Requests.title, "Správa", onBack) }, onRefresh = { load() }) {
        item {
            ChoicePills(listOf("pending" to "Čekající", "all" to "Všechny"), if (showAll) "all" else "pending") {
                showAll = it == "all"
            }
        }
        item { ListState(loading, error, shown.isEmpty(), "Žádné žádosti.") }
        shown.forEach { request ->
            item(key = request.id) {
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Badge(if (request.kind == "move") "Přesun" else "Zrušení", if (request.kind == "move") P.event else P.busy)
                        Spacer(Modifier.weight(1f))
                        if (request.status == "done") Badge("Vyřízeno", P.free)
                    }
                    Text(
                        "${request.lessonName} · ${Dates.dayTitle(request.date)} ${request.start}–${request.end}",
                        color = P.ink,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Muted("Žádá: ${request.requesterName}")
                    request.preferred?.takeIf { it.isNotBlank() }?.let { Muted("Hodilo by se: $it") }
                    request.note?.takeIf { it.isNotBlank() }?.let { Muted(it, 13) }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        val phone = request.phone?.filter { it.isDigit() }.orEmpty()
                        if (phone.isNotEmpty()) {
                            Box(
                                Modifier
                                    .weight(1f)
                                    .height(48.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(Color(0xFF26AD61))
                                    .clickable { uri.openUri("https://wa.me/$phone") },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("WhatsApp", color = Color.White, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        SecondaryButton(if (request.status == "done") "Vrátit" else "Vyřízeno", Modifier.weight(1f)) {
                            scope.launch {
                                runCatching {
                                    Api.send<MessageResponse>(
                                        "PATCH",
                                        "/api/rozpis/zadosti/${Api.segment(request.id)}",
                                        mapOf("status" to if (request.status == "done") "pending" else "done"),
                                    )
                                }.onFailure { error = it.message }
                                load()
                            }
                        }
                    }
                }
            }
        }
    }
}

// --- Users (main administrator only) ---

@Composable
private fun AdminUsers(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var users by remember { mutableStateOf<List<AdminUser>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var search by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<AdminUser?>(null) }
    var adding by remember { mutableStateOf(false) }
    val query = search.trim().lowercase()
    val filtered = if (query.isEmpty()) users else users.filter {
        listOf(it.username, it.displayName.orEmpty(), it.email.orEmpty()).joinToString(" ").lowercase().contains(query)
    }

    suspend fun load() {
        loading = true
        runCatching { Api.get<AdminUsersResponse>("/api/admin-users").users }
            .onSuccess {
                users = it
                error = null
            }
            .onFailure { error = it.message }
        loading = false
    }

    LaunchedEffect(Unit) { load() }

    ScreenScaffold(
        header = {
            SubHeader("${AdminPage.Users.title} (${users.size})", "Správa", onBack) {
                HeaderButton(Icons.Filled.PersonAdd, "Přidat uživatele") { adding = true }
            }
        },
        onRefresh = { load() },
    ) {
        notice?.let { item { NoticeBanner(it) } }
        item { Field("Hledat", search, { search = it }, placeholder = "jméno nebo e-mail") }
        item { ListState(loading, error, users.isEmpty(), "Zatím žádní uživatelé.") }
        filtered.forEach { user ->
            item(key = user.username) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(P.surface)
                        .border(1.dp, P.line, RoundedCornerShape(18.dp))
                        .clickable { editing = user }
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(40.dp).clip(CircleShape).background(Brush.linearGradient(P.gradient)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text((user.displayName ?: user.username).take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(user.displayName ?: user.username, color = P.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            listOfNotNull(user.username, user.email).joinToString(" · "),
                            color = P.inkMuted,
                            fontSize = 12.sp,
                            maxLines = 1,
                        )
                    }
                    Badge(user.roleValue?.label ?: user.role, roleStyle(user.roleValue))
                }
            }
        }
    }

    val done: (String) -> Unit = { message ->
        notice = message
        editing = null
        adding = false
        scope.launch { load() }
    }

    editing?.let { user -> UserSheet(user, onDismiss = { editing = null }, onDone = done) }
    if (adding) UserSheet(null, onDismiss = { adding = false }, onDone = done)
}

@Composable
private fun roleStyle(role: Role?): KindStyle = when (role) {
    Role.admin -> P.busy
    Role.manager -> P.event
    Role.trainer -> P.free
    else -> P.training
}

// Edit an account (role, new password, delete) or add one (user == null).
@Composable
private fun UserSheet(user: AdminUser?, onDismiss: () -> Unit, onDone: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var username by remember { mutableStateOf("") }
    var role by remember { mutableStateOf(user?.role ?: "viewer") }
    var password by remember { mutableStateOf("") }
    var working by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val isMainAdmin = user?.roleValue == Role.admin

    BrandSheet(
        title = if (user == null) "Nový uživatel" else user.displayName ?: user.username,
        subtitle = user?.username,
        onDismiss = onDismiss,
        primaryTitle = "Uložit",
        primaryEnabled = user != null || (username.trim().length >= 3 && password.length >= 8),
        working = working,
        onPrimary = {
            val payload = mutableMapOf<String, Any?>("username" to (user?.username ?: username.trim()))
            if (!isMainAdmin && (user == null || role != user.role)) payload["role"] = role
            if (password.isNotEmpty()) payload["password"] = password

            if (password.isNotEmpty() && password.length < 8) {
                error = "Heslo musí mít aspoň 8 znaků."
            } else if (payload.size == 1) {
                onDismiss()
            } else {
                working = true
                scope.launch {
                    runCatching { Api.send<MessageResponse>("POST", "/api/admin-users", payload) }
                        .onSuccess { onDone(it.message ?: "Uloženo.") }
                        .onFailure { error = it.message }
                    working = false
                }
            }
        },
    ) {
        if (user != null) {
            Card {
                InfoLine("Přihlašovací jméno", user.username)
                user.email?.let { InfoLine("E-mail", it) }
                user.createdAt?.let { InfoLine("Vytvořen", Dates.dateTime(it)) }
                user.createdBy?.let { InfoLine("Kým / jak", it) }
            }
        } else {
            Card { Field("Přihlašovací jméno", username, { username = it }, placeholder = "jméno") }
        }
        if (!isMainAdmin) {
            Card {
                Text("Role", color = P.inkMuted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                ChoicePills(listOf("viewer" to "Tanečník", "trainer" to "Trenér", "manager" to "Správa sálu"), role) { role = it }
            }
        }
        Card {
            Field(
                if (user == null) "Heslo (aspoň 8 znaků)" else "Nové heslo",
                password,
                { password = it },
                placeholder = if (user == null) "heslo" else "nevyplněno = beze změny",
                password = true,
            )
            if (user != null) FieldNote("Nové heslo předej uživateli osobně, dosavadní přestane platit.")
        }
        error?.let { ErrorBanner(it) }
        if (user != null && !isMainAdmin) {
            DangerButton("Smazat účet") { confirmingDelete = true }
        }
    }

    if (confirmingDelete && user != null) {
        ConfirmDialog(
            title = "Smazat účet ${user.username}?",
            text = "Účet se už nepřihlásí. Jeho lekce a akce zůstanou.",
            confirm = "Smazat",
            onDismiss = { confirmingDelete = false },
        ) {
            scope.launch {
                runCatching { Api.send<MessageResponse>("DELETE", "/api/admin-users", mapOf("username" to user.username)) }
                    .onSuccess { onDone(it.message ?: "Účet je smazaný.") }
                    .onFailure { error = it.message }
            }
        }
    }
}

// --- History with undo ---

@Composable
private fun AdminHistory(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var entries by remember { mutableStateOf<List<AuditEntry>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var undoing by remember { mutableStateOf<AuditEntry?>(null) }

    suspend fun load() {
        loading = true
        runCatching { Api.get<AuditLogResponse>("/api/audit-log").entries }
            .onSuccess {
                entries = it
                error = null
            }
            .onFailure { error = it.message }
        loading = false
    }

    LaunchedEffect(Unit) { load() }

    ScreenScaffold(header = { SubHeader(AdminPage.History.title, "Správa", onBack) }, onRefresh = { load() }) {
        notice?.let { item { NoticeBanner(it) } }
        item { ListState(loading, error, entries.isEmpty(), "Zatím žádné změny.") }
        entries.forEachIndexed { index, entry ->
            item(key = "$index-${entry.timestamp}") {
                Card(padding = 12) {
                    Row(verticalAlignment = Alignment.Top) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("${entry.actor} · ${entry.actionLabel}", color = P.inkMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Text(entry.detail("title") ?: entry.bookingId.orEmpty(), color = P.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            entry.detail("date")?.let {
                                Muted("${Dates.dayTitle(it)} ${entry.detail("start").orEmpty()}–${entry.detail("end").orEmpty()}", 13)
                            }
                            Text(Dates.dateTime(entry.timestamp), color = P.inkSoft, fontSize = 11.sp)
                        }
                        if (entry.canUndo) {
                            Text(
                                "Vrátit",
                                color = P.accent,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(P.subtle)
                                    .clickable { undoing = entry }
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                            )
                        }
                    }
                }
            }
        }
    }

    undoing?.let { entry ->
        ConfirmDialog(
            title = "Vrátit tuhle změnu?",
            confirm = "Vrátit změnu",
            destructive = false,
            onDismiss = { undoing = null },
        ) {
            scope.launch {
                runCatching { Api.send<MessageResponse>("POST", "/api/audit-log/undo", mapOf("timestamp" to entry.timestamp)) }
                    .onSuccess { notice = it.message ?: "Změna je vrácená." }
                    .onFailure { error = it.message }
                load()
            }
        }
    }
}
