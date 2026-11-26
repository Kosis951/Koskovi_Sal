package cz.tkkoskovi.sal

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

// What the phone is subscribed to, as on the web and in the iPhone app:
// "lessons" (an hour before the account's own lesson in the schedule, with a
// countdown), "hall" (the hall is taken today, trainings cancelled), "cleanup".
enum class PushTopic(val title: String) {
    lessons("Moje lekce z rozpisu (hodinu předem)"),
    hall("Obsazený sál a zrušené tréninky"),
    cleanup("Sál čeká na úklid"),
}

// Notifications through Google (Firebase Cloud Messaging): the phone's token
// goes to the web, the relay on the NAS sends through Google.
object Push {
    const val CHANNEL = "hall"
    const val LESSON_CHANNEL = "lessons"

    private lateinit var prefs: SharedPreferences
    private lateinit var app: Context
    private val background = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    var topics by mutableStateOf(emptySet<PushTopic>())
        private set
    var busy by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)

    // A build without the Firebase settings (google-services.json) has none.
    val isAvailable get() = ::app.isInitialized && FirebaseApp.getApps(app).isNotEmpty()

    fun init(context: Context) {
        if (::app.isInitialized) return
        app = context.applicationContext
        prefs = app.getSharedPreferences("push", Context.MODE_PRIVATE)
        topics = prefs.getStringSet("topics", emptySet()).orEmpty()
            .mapNotNull { name -> PushTopic.entries.firstOrNull { it.name == name } }
            .toSet()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL, "Sál", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Obsazený sál, zrušené tréninky, úklid"
            }
            val lessons = NotificationChannel(LESSON_CHANNEL, "Moje lekce", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Připomínka hodinu před lekcí s odpočtem"
            }
            app.getSystemService(NotificationManager::class.java).apply {
                createNotificationChannel(channel)
                createNotificationChannel(lessons)
            }
        }
    }

    // The signed-in account changed: the server links the phone to it (for
    // reminders of the account's own lessons).
    fun accountChanged() {
        registerIfAllowed()
    }

    fun hasPermission(context: Context) =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    // On launch: Google may have changed the token, keep the server in step.
    fun registerIfAllowed() {
        if (isAvailable && topics.isNotEmpty() && hasPermission(app)) {
            background.launch { sync(test = false, quiet = true) }
        }
    }

    suspend fun set(topic: PushTopic, enabled: Boolean) {
        topics = if (enabled) topics + topic else topics - topic
        prefs.edit().putStringSet("topics", topics.map { it.name }.toSet()).apply()
        sync(test = false)
    }

    suspend fun sendTest() = sync(test = true)

    fun onNewToken(context: Context, token: String) {
        init(context)
        Api.init(context.applicationContext)
        if (topics.isNotEmpty()) {
            background.launch { send(token, test = false, quiet = true) }
        }
    }

    private suspend fun sync(test: Boolean, quiet: Boolean = false) {
        if (!isAvailable) {
            message = "Upozornění v této verzi aplikace nejsou zapnutá."
            return
        }
        val token = token()
        if (token == null) {
            if (!quiet) message = "Telefon se nepodařilo přihlásit k upozorněním. Zkontroluj připojení a služby Google."
            return
        }
        send(token, test, quiet)
    }

    private suspend fun send(token: String, test: Boolean, quiet: Boolean) {
        busy = true
        runCatching {
            Api.send<MessageResponse>(
                "POST",
                "/api/push/native",
                mapOf(
                    "platform" to "android",
                    "test" to test,
                    "token" to token,
                    "topics" to topics.map { it.name },
                ),
            )
        }
            .onSuccess { message = if (test) "Zkušební upozornění je na cestě." else null }
            .onFailure { if (!quiet) message = it.message }
        busy = false
    }

    private suspend fun token(): String? = suspendCancellableCoroutine { continuation ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            continuation.resume(if (task.isSuccessful) task.result else null)
        }
    }

    // While the app is open Google hands the message to the app, which shows it.
    @SuppressLint("MissingPermission")
    fun show(context: Context, title: String, body: String, tag: String?) {
        init(context)
        if (!hasPermission(context)) return

        val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val open = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF003758.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()

        runCatching { NotificationManagerCompat.from(context).notify(tag, (tag ?: title).hashCode(), notification) }
    }
}

// The reminder of the dancer's own lesson: stays in the notifications with a
// countdown to the start (Android's counterpart of the Dynamic Island) and
// goes away when the lesson ends.
@SuppressLint("MissingPermission")
internal fun Push.showLesson(context: Context, title: String, body: String, startsAt: Long, endsAt: Long) {
    init(context)
    if (!hasPermission(context)) return
    val now = System.currentTimeMillis()
    if (endsAt <= now) return

    val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val open = PendingIntent.getActivity(context, 1, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val builder = NotificationCompat.Builder(context, Push.LESSON_CHANNEL)
        .setSmallIcon(R.drawable.ic_notification)
        .setColor(0xFF003758.toInt())
        .setContentTitle(title)
        .setContentText(body)
        .setSubText("Lekce začíná za")
        .setCategory(NotificationCompat.CATEGORY_REMINDER)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(open)
        .setTimeoutAfter(endsAt - now)

    if (startsAt > now) {
        builder.setWhen(startsAt).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
    }

    runCatching { NotificationManagerCompat.from(context).notify("lesson", startsAt.hashCode(), builder.build()) }
}

class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) = Push.onNewToken(applicationContext, token)

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["kind"] == "lesson") {
            val startsAt = message.data["startsAt"]?.toLongOrNull() ?: return
            val endsAt = message.data["endsAt"]?.toLongOrNull() ?: startsAt
            Push.showLesson(
                applicationContext,
                title = message.data["title"] ?: "Za hodinu máš lekci",
                body = message.data["body"].orEmpty(),
                startsAt = startsAt * 1000,
                endsAt = endsAt * 1000,
            )
            return
        }

        val title = message.notification?.title ?: message.data["title"] ?: return
        val body = message.notification?.body ?: message.data["body"].orEmpty()
        Push.show(applicationContext, title, body, message.notification?.tag)
    }
}
