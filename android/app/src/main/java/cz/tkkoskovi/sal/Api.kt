package cz.tkkoskovi.sal

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class ApiException(message: String) : Exception(message)

@Serializable
data class MessageResponse(val message: String? = null)

// The web's own API. The login is the web's session cookie, kept in the
// app's preferences between launches.
object Api {
    val baseUrl = "https://${BuildConfig.WEB_HOST}"

    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        isLenient = true
    }

    private val jsonType = "application/json".toMediaType()
    private lateinit var jar: PrefsCookieJar
    private lateinit var client: OkHttpClient

    fun init(context: Context) {
        if (::client.isInitialized) return
        jar = PrefsCookieJar(context.getSharedPreferences("cookies", Context.MODE_PRIVATE))
        client = OkHttpClient.Builder()
            .cookieJar(jar)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
    }

    fun clearCookies() = jar.clear()

    fun web(path: String) = baseUrl + path

    // A path segment such as a trainer's name ("Šárka" → "%C5%A0%C3%A1rka").
    fun segment(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    suspend fun raw(method: String, path: String, body: Map<String, Any?>? = null): String = withContext(Dispatchers.IO) {
        val payload = body?.let { toJson(it).toString().toRequestBody(jsonType) }
            ?: if (method == "POST" || method == "PUT" || method == "PATCH") "{}".toRequestBody(jsonType) else null

        val request = Request.Builder()
            .url(baseUrl + path)
            .header("Accept", "application/json")
            .method(method, payload)
            .build()

        val response = try {
            client.newCall(request).execute()
        } catch (error: IOException) {
            throw ApiException("Nepodařilo se spojit se serverem. Zkontroluj připojení.")
        }

        response.use {
            val text = it.body?.string().orEmpty()
            if (!it.isSuccessful) {
                val message = runCatching {
                    json.parseToJsonElement(text).jsonObject["message"]?.jsonPrimitive?.contentOrNull
                }.getOrNull()
                throw ApiException(message ?: defaultMessage(it.code))
            }
            text
        }
    }

    suspend inline fun <reified T> get(path: String): T = decode(raw("GET", path))

    suspend inline fun <reified T> send(method: String, path: String, body: Map<String, Any?>? = null): T =
        decode(raw(method, path, body))

    inline fun <reified T> decode(text: String): T = try {
        json.decodeFromString<T>(text.ifBlank { "{}" })
    } catch (error: IllegalArgumentException) {
        throw ApiException("Server odpověděl nečekaně. Zkus aplikaci aktualizovat.")
    }

    private fun defaultMessage(status: Int) = when (status) {
        401 -> "Přihlas se prosím."
        403 -> "K tomu nemáš oprávnění."
        404 -> "Nenalezeno."
        429 -> "Příliš mnoho pokusů, zkus to za chvíli."
        else -> "Něco se nepovedlo (chyba $status)."
    }

    private fun toJson(value: Any?): JsonElement = when (value) {
        null -> JsonNull
        is JsonElement -> value
        is String -> JsonPrimitive(value)
        is Boolean -> JsonPrimitive(value)
        is Number -> JsonPrimitive(value)
        is Map<*, *> -> JsonObject(value.entries.associate { (key, item) -> key.toString() to toJson(item) })
        is List<*> -> JsonArray(value.map { toJson(it) })
        else -> JsonPrimitive(value.toString())
    }
}

// Cookies survive app restarts (the web's login lasts weeks).
private class PrefsCookieJar(private val prefs: SharedPreferences) : CookieJar {
    private val cookies = mutableMapOf<String, Cookie>()

    init {
        val base = Api.baseUrl.toHttpUrl()
        prefs.all.forEach { (key, value) ->
            val cookie = (value as? String)?.let { Cookie.parse(base, it) }
            if (cookie != null && cookie.expiresAt > System.currentTimeMillis()) cookies[key] = cookie
        }
    }

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val editor = prefs.edit()
        for (cookie in cookies) {
            val key = "${cookie.domain}|${cookie.path}|${cookie.name}"
            if (cookie.expiresAt <= System.currentTimeMillis()) {
                this.cookies.remove(key)
                editor.remove(key)
            } else {
                this.cookies[key] = cookie
                // Session cookies are kept too: the app is the browser here.
                editor.putString(key, cookie.toString())
            }
        }
        editor.apply()
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        return cookies.values.filter { it.expiresAt > now && it.matches(url) }
    }

    @Synchronized
    fun clear() {
        cookies.clear()
        prefs.edit().clear().apply()
    }
}
