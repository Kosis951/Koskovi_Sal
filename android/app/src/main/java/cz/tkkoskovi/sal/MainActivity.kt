package cz.tkkoskovi.sal

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import kotlinx.coroutines.launch
import java.text.Normalizer

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.init(applicationContext)
        enableEdgeToEdge()
        setContent {
            KoskoviTheme { App() }
        }
    }
}

// Who is signed in, as the web's /api/auth/session says.
class SessionModel {
    var info by mutableStateOf<SessionInfo?>(null)
        private set

    val isSignedIn get() = info?.authenticated == true
    val role get() = Role.of(info?.role)
    val username get() = info?.username
    val displayName get() = info?.displayName ?: info?.username.orEmpty()
    val scheduleName get() = info?.scheduleName?.trim()?.takeIf { it.isNotEmpty() }

    suspend fun refresh() {
        runCatching { Api.get<SessionInfo>("/api/auth/session") }.onSuccess { info = it }
    }

    suspend fun signIn(username: String, password: String) {
        Api.send<MessageResponse>("POST", "/api/auth/login", mapOf("password" to password, "username" to username))
        refresh()
    }

    suspend fun signOut() {
        runCatching { Api.send<MessageResponse>("POST", "/api/auth/logout") }
        // The cookie goes away even when the server could not be reached.
        Api.clearCookies()
        info = SessionInfo(authenticated = false)
    }

    // Trainers may change only what they added themselves; trainings are
    // changed by hall managers only.
    fun canEdit(booking: Booking): Boolean {
        val role = role ?: return false
        if (!role.canAddBookings) return false
        if (role.canManageBookings) return true
        val createdBy = booking.createdBy ?: return false
        val username = username ?: return false
        return !booking.isTraining && fold(createdBy) == fold(username)
    }

    private fun fold(value: String) =
        Normalizer.normalize(value, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()
}

private enum class Tab(val title: String, val icon: ImageVector) {
    Calendar("Kalendář", Icons.Filled.CalendarMonth),
    Lessons("Lekce", Icons.Filled.Groups),
    Schedule("Rozpis", Icons.Filled.ListAlt),
    Account("Účet", Icons.Filled.AccountCircle),
}

@Composable
fun App() {
    val session = remember { SessionModel() }
    val hall = remember { HallModel() }
    val schedule = remember { ScheduleModel() }
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableStateOf(Tab.Calendar) }

    LaunchedEffect(Unit) {
        session.refresh()
    }

    // The schedule tab appears once the visiting trainer's schedule is
    // published; checked whenever the app comes back.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        scope.launch {
            schedule.load()
            hall.load()
        }
    }

    val tabs = Tab.entries.filter { it != Tab.Schedule || schedule.isPublished }
    if (tab !in tabs) tab = Tab.Calendar
    val openAccount = { tab = Tab.Account }

    Column(Modifier.fillMaxSize().background(P.page)) {
        Box(Modifier.weight(1f)) {
            when (tab) {
                Tab.Calendar -> CalendarScreen(hall, session, openAccount)
                Tab.Lessons -> LessonsScreen(session, openAccount)
                Tab.Schedule -> ScheduleScreen(schedule, session, openAccount)
                Tab.Account -> AccountScreen(session)
            }
        }
        NavigationBar(containerColor = P.surface) {
            tabs.forEach { item ->
                NavigationBarItem(
                    selected = item == tab,
                    onClick = { tab = item },
                    icon = { Icon(item.icon, contentDescription = null) },
                    label = { Text(item.title) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = P.brand,
                        selectedTextColor = P.brand,
                        indicatorColor = P.accentSoft.copy(alpha = 0.5f),
                        unselectedIconColor = P.inkSoft,
                        unselectedTextColor = P.inkSoft,
                    ),
                )
            }
        }
    }
}

// A screen: header, then content scrolling under it.
@Composable
fun ScreenScaffold(
    header: @Composable () -> Unit,
    content: LazyListScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        header()
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}
