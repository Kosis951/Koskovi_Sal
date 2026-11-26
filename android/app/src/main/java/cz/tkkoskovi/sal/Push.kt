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
// "hall" (the hall is taken today, trainings cancelled) and "cleanup".
enum class PushTopic(val title: String) {
    hall("Obsazený sál a zrušené tréninky"),
    cleanup("Sál čeká na úklid"),
}

// Notifications through Google (Firebase Cloud Messaging): the phone's token
// goes to the web, the relay on the NAS sends through Google.
object Push {
    const val CHANNEL = "hall"

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
            app.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
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

class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) = Push.onNewToken(applicationContext, token)

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: return
        val body = message.notification?.body ?: message.data["body"].orEmpty()
        Push.show(applicationContext, title, body, message.notification?.tag)
    }
}
