package cz.tkkoskovi.sal

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PrivacyTip
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Support
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@Composable
fun AccountScreen(session: SessionModel) {
    if (!session.isSignedIn) {
        LoginScreen(session)
        return
    }

    val scope = rememberCoroutineScope()
    val uri = LocalUriHandler.current
    var notice by remember { mutableStateOf<String?>(null) }
    var editingProfile by remember { mutableStateOf(false) }
    var changingPassword by remember { mutableStateOf(false) }

    ScreenScaffold(header = { BrandHeader("Účet", session.displayName) }) {
        notice?.let { item { NoticeBanner(it) } }

        item {
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(56.dp).clip(CircleShape).background(Brush.linearGradient(P.gradient)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            session.displayName.take(1).uppercase(),
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(session.displayName, color = P.ink, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold)
                        Muted("@${session.username.orEmpty()} · ${session.role?.label ?: ""}")
                        session.scheduleName?.let { Muted("V rozpisu: $it", 13) }
                    }
                }
            }
        }

        item {
            Card(padding = 6) {
                LinkRow(Icons.Filled.Person, "Upravit profil") { editingProfile = true }
                LinkRow(Icons.Filled.Lock, "Změnit heslo") { changingPassword = true }
                if (session.role?.canManageBookings == true) {
                    LinkRow(Icons.Filled.Badge, "Správa sálu na webu") { uri.openUri(Api.web("/admin")) }
                }
            }
        }

        item {
            Card(padding = 6) {
                LinkRow(Icons.Filled.Public, "Web sálu") { uri.openUri(Api.web("/")) }
                LinkRow(Icons.Filled.Support, "Podpora") { uri.openUri("https://app.tkkoskovi.cz/support") }
                LinkRow(Icons.Filled.PrivacyTip, "Ochrana soukromí") { uri.openUri("https://app.tkkoskovi.cz/privacy") }
            }
        }

        item {
            DangerButton("Odhlásit se") { scope.launch { session.signOut() } }
        }

        item {
            Text(
                "TK Koškovi ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
                color = P.inkSoft,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }

    if (editingProfile) {
        ProfileSheet(onDismiss = { editingProfile = false }) { message ->
            notice = message
            editingProfile = false
            scope.launch { session.refresh() }
        }
    }

    if (changingPassword) {
        PasswordSheet(onDismiss = { changingPassword = false }) { message ->
            notice = message
            changingPassword = false
        }
    }
}

@Composable
private fun LinkRow(icon: ImageVector, title: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = P.accent)
        Spacer(Modifier.width(12.dp))
        Text(title, color = P.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = P.inkSoft)
    }
}

// Full-screen sign-in on the club's gradient.
@Composable
private fun LoginScreen(session: SessionModel) {
    val scope = rememberCoroutineScope()
    val uri = LocalUriHandler.current
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var registering by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .background(Brush.linearGradient(P.gradient))
            .statusBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(28.dp))
        Icon(
            painter = painterResource(R.drawable.logo_mark),
            contentDescription = null,
            tint = Color.Unspecified,
            modifier = Modifier.size(width = 86.dp, height = 76.dp),
        )
        Text("TK Koškovi", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
        Text("Taneční sál · lekce · rozpis", color = P.accentSoft, fontSize = 15.sp)
        Spacer(Modifier.height(10.dp))

        Card(padding = 18) {
            Text("Přihlášení", color = P.ink, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
            Field("Uživatelské jméno", username, { username = it })
            Field("Heslo", password, { password = it }, password = true)
            error?.let { ErrorBanner(it) }
            PrimaryButton("Přihlásit se", enabled = username.isNotBlank() && password.isNotEmpty(), working = working) {
                working = true
                scope.launch {
                    runCatching { session.signIn(username.trim(), password) }
                        .onSuccess { error = null }
                        .onFailure { error = it.message }
                    working = false
                }
            }
        }

        Text("Ještě nemáš účet?", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
        SecondaryButton("Zaregistrovat se") { registering = true }
        Text(
            "Ochrana soukromí",
            color = P.accentSoft,
            fontSize = 13.sp,
            modifier = Modifier.clickable { uri.openUri("https://app.tkkoskovi.cz/privacy") }.padding(8.dp),
        )
    }

    if (registering) {
        RegisterSheet(session, onDismiss = { registering = false })
    }
}

@Composable
private fun RegisterSheet(session: SessionModel, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var scheduleName by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordAgain by remember { mutableStateOf("") }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    BrandSheet(
        title = "Registrace",
        subtitle = "Účet je hned aktivní",
        onDismiss = onDismiss,
        primaryTitle = "Vytvořit účet",
        primaryEnabled = displayName.isNotBlank() && email.isNotBlank() && username.isNotBlank() && password.isNotEmpty(),
        working = working,
        onPrimary = {
            if (password != passwordAgain) {
                error = "Hesla se neshodují."
            } else {
                working = true
                scope.launch {
                    runCatching {
                        Api.send<MessageResponse>(
                            "POST",
                            "/api/auth/register",
                            mapOf(
                                "displayName" to displayName.trim(),
                                "email" to email.trim(),
                                "password" to password,
                                "scheduleName" to scheduleName.trim(),
                                "username" to username.trim(),
                            ),
                        )
                        session.refresh()
                    }
                        .onSuccess { onDismiss() }
                        .onFailure { error = it.message }
                    working = false
                }
            }
        },
    ) {
        Card {
            Field("Jméno a příjmení", displayName, { displayName = it })
            Field("E-mail", email, { email = it }, keyboard = KeyboardType.Email)
            Field("Jméno v rozpisu", scheduleName, { scheduleName = it }, placeholder = "nepovinné, např. Novák")
            FieldNote("Podle něj ti v rozpisu externího trenéra ukážeme tvoje lekce.")
        }
        Card {
            Field("Uživatelské jméno", username, { username = it })
            FieldNote("Malá písmena, číslice, tečka, pomlčka.")
            Field("Heslo", password, { password = it }, password = true)
            Field("Heslo znovu", passwordAgain, { passwordAgain = it }, password = true)
        }
        error?.let { ErrorBanner(it) }
    }
}

@Composable
private fun ProfileSheet(onDismiss: () -> Unit, onSaved: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var partnerName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var scheduleName by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(false) }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        runCatching { Api.get<ProfileResponse>("/api/account/profile").profile }
            .onSuccess {
                displayName = it.displayName.orEmpty()
                email = it.email.orEmpty()
                partnerName = it.partnerName.orEmpty()
                phone = it.phone.orEmpty()
                scheduleName = it.scheduleName.orEmpty()
            }
            .onFailure { error = it.message }
        loaded = true
    }

    BrandSheet(
        title = "Profil",
        subtitle = "Jak tě uvidí trenéři a správci",
        onDismiss = onDismiss,
        primaryTitle = "Uložit",
        primaryEnabled = loaded,
        working = working,
        onPrimary = {
            working = true
            scope.launch {
                runCatching {
                    Api.send<MessageResponse>(
                        "PUT",
                        "/api/account/profile",
                        mapOf(
                            "displayName" to displayName.trim(),
                            "email" to email.trim(),
                            "partnerName" to partnerName.trim(),
                            "phone" to phone.trim(),
                            "scheduleName" to scheduleName.trim(),
                        ),
                    )
                }
                    .onSuccess { onSaved(it.message ?: "Profil je uložený.") }
                    .onFailure { error = it.message }
                working = false
            }
        },
    ) {
        Card {
            Field("Jméno a příjmení", displayName, { displayName = it })
            Field("E-mail", email, { email = it }, keyboard = KeyboardType.Email)
            Field("Telefon", phone, { phone = it }, keyboard = KeyboardType.Phone)
        }
        Card {
            Field("Partner/ka", partnerName, { partnerName = it }, placeholder = "nepovinné")
            Field("Jméno v rozpisu", scheduleName, { scheduleName = it }, placeholder = "např. Novák")
            FieldNote("Podle jména v rozpisu ti ukážeme tvoje lekce u externího trenéra.")
        }
        error?.let { ErrorBanner(it) }
    }
}

@Composable
private fun PasswordSheet(onDismiss: () -> Unit, onSaved: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var repeated by remember { mutableStateOf("") }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    BrandSheet(
        title = "Změna hesla",
        onDismiss = onDismiss,
        primaryTitle = "Změnit heslo",
        primaryEnabled = current.isNotEmpty() && new.isNotEmpty(),
        working = working,
        onPrimary = {
            if (new != repeated) {
                error = "Nová hesla se neshodují."
            } else {
                working = true
                scope.launch {
                    runCatching {
                        Api.send<MessageResponse>(
                            "POST",
                            "/api/account/password",
                            mapOf("currentPassword" to current, "newPassword" to new),
                        )
                    }
                        .onSuccess { onSaved(it.message ?: "Heslo je změněné.") }
                        .onFailure { error = it.message }
                    working = false
                }
            }
        },
    ) {
        Card {
            Field("Současné heslo", current, { current = it }, password = true)
            Field("Nové heslo", new, { new = it }, password = true)
            Field("Nové heslo znovu", repeated, { repeated = it }, password = true)
        }
        error?.let { ErrorBanner(it) }
    }
}
