package cz.tkkoskovi.sal

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// A calendar item's look: background, text and border.
data class KindStyle(val background: Color, val ink: Color, val line: Color)

// The web's colours (src/app/globals.css), light and dark.
data class Palette(
    val page: Color,
    val surface: Color,
    val subtle: Color,
    val line: Color,
    val ink: Color,
    val inkMuted: Color,
    val inkSoft: Color,
    val brand: Color,
    val accent: Color,
    val accentSoft: Color,
    val now: Color,
    val gradient: List<Color>,
    val training: KindStyle,
    val event: KindStyle,
    val busy: KindStyle,
    val cleanup: KindStyle,
    val free: KindStyle,
    val closed: KindStyle,
) {
    fun style(booking: Booking) = when {
        booking.isTraining -> training
        booking.isBusy -> busy
        else -> event
    }
}

private fun c(hex: Long) = Color(0xFF000000 or hex)

private val Light = Palette(
    page = c(0xF3F7FA), surface = c(0xFFFFFF), subtle = c(0xEEF4F8), line = c(0xDBE6EE),
    ink = c(0x003758), inkMuted = c(0x4F6B7E), inkSoft = c(0x8198A8), brand = c(0x003758),
    accent = c(0x008FCC), accentSoft = c(0xAFDFF9), now = c(0xD64534),
    gradient = listOf(c(0x003758), c(0x014D76), c(0x008FCC)),
    training = KindStyle(c(0xE2F3FD), c(0x003758), c(0x8FCDEF)),
    event = KindStyle(c(0xEEECFB), c(0x3C3489), c(0xB8B2EC)),
    busy = KindStyle(c(0xFDEBE5), c(0x8C2F20), c(0xEFB3A3)),
    cleanup = KindStyle(c(0xFFF3D1), c(0x6A4B00), c(0xE1B554)),
    free = KindStyle(c(0xEAF6EE), c(0x1F6040), c(0xA9D8B9)),
    closed = KindStyle(c(0xE7EDF2), c(0x4F6B7E), c(0xD2DDE6)),
)

private val Dark = Palette(
    page = c(0x071621), surface = c(0x0E2230), subtle = c(0x142B3B), line = c(0x1E3A4E),
    ink = c(0xEAF4FA), inkMuted = c(0xA8C1D1), inkSoft = c(0x7893A6), brand = c(0x2A9FD8),
    accent = c(0x1C9AD6), accentSoft = c(0xAFDFF9), now = c(0xFF7A66),
    gradient = listOf(c(0x021520), c(0x06314D), c(0x0A5A85)),
    training = KindStyle(c(0x113A55), c(0xD5EEFC), c(0x2F6F98)),
    event = KindStyle(c(0x2A2650), c(0xDCD8FF), c(0x4F47A0)),
    busy = KindStyle(c(0x3D2420), c(0xFFCFC2), c(0x8A4535)),
    cleanup = KindStyle(c(0x3A2F12), c(0xF7DC97), c(0x8A6A1F)),
    free = KindStyle(c(0x1A2E22), c(0x9FDCB6), c(0x2F6B47)),
    closed = KindStyle(c(0x0A1A25), c(0xA8C1D1), c(0x1B3448)),
)

val LocalPalette = staticCompositionLocalOf { Light }

val P: Palette
    @Composable get() = LocalPalette.current

@Composable
fun KoskoviTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val palette = if (dark) Dark else Light
    val scheme = if (dark) {
        darkColorScheme(primary = palette.accent, background = palette.page, surface = palette.surface, onSurface = palette.ink, onBackground = palette.ink)
    } else {
        lightColorScheme(primary = palette.brand, background = palette.page, surface = palette.surface, onSurface = palette.ink, onBackground = palette.ink)
    }
    CompositionLocalProvider(LocalPalette provides palette) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}

// --- Shared pieces ---

// The club's header: gradient, logo, title; reaches under the status bar.
@Composable
fun BrandHeader(title: String, subtitle: String? = null, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Brush.linearGradient(P.gradient))
            .statusBarsPadding()
            .padding(start = 18.dp, end = 12.dp, top = 10.dp, bottom = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(R.drawable.logo_mark),
            contentDescription = null,
            tint = Color.Unspecified,
            modifier = Modifier.size(width = 34.dp, height = 30.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
            if (subtitle != null) {
                Text(subtitle, color = P.accentSoft, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
        }
        trailing()
    }
}

@Composable
fun HeaderButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.16f)),
    ) {
        Icon(icon, contentDescription = label, tint = Color.White)
    }
}

@Composable
fun Card(modifier: Modifier = Modifier, padding: Int = 16, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(P.surface)
            .border(1.dp, P.line, RoundedCornerShape(18.dp))
            .padding(padding.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

@Composable
fun SectionTitle(text: String) {
    Text(text, color = P.ink, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
}

@Composable
fun Muted(text: String, size: Int = 14) {
    Text(text, color = P.inkMuted, fontSize = size.sp)
}

@Composable
fun PrimaryButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, working: Boolean = false, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled && !working,
        modifier = modifier.fillMaxWidth().height(50.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = P.brand, contentColor = Color.White),
    ) {
        if (working) {
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        } else {
            Text(text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
    }
}

@Composable
fun SecondaryButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(48.dp),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, P.line),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = P.subtle, contentColor = P.ink),
    ) {
        Text(text, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun DangerButton(text: String, modifier: Modifier = Modifier, working: Boolean = false, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        enabled = !working,
        modifier = modifier.fillMaxWidth().height(48.dp),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, P.busy.line),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = P.busy.background, contentColor = P.busy.ink),
    ) {
        Text(text, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun Badge(text: String, style: KindStyle) {
    Text(
        text,
        color = style.ink,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(style.background)
            .border(1.dp, style.line, RoundedCornerShape(50))
            .padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

@Composable
private fun Banner(text: String, style: KindStyle) {
    Text(
        text,
        color = style.ink,
        fontSize = 14.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(style.background)
            .border(1.dp, style.line, RoundedCornerShape(14.dp))
            .padding(12.dp),
    )
}

@Composable
fun ErrorBanner(text: String) = Banner(text, P.busy)

@Composable
fun NoticeBanner(text: String) = Banner(text, P.free)

@Composable
fun Field(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    placeholder: String = "",
    keyboard: KeyboardType = KeyboardType.Text,
    password: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        placeholder = { if (placeholder.isNotEmpty()) Text(placeholder, color = P.inkSoft) },
        singleLine = singleLine,
        minLines = minLines,
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboard),
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = P.accent,
            unfocusedBorderColor = P.line,
            focusedLabelColor = P.accent,
            unfocusedLabelColor = P.inkMuted,
            focusedTextColor = P.ink,
            unfocusedTextColor = P.ink,
            cursorColor = P.accent,
            focusedContainerColor = P.surface,
            unfocusedContainerColor = P.surface,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
fun FieldNote(text: String) {
    Text(text, color = P.inkSoft, fontSize = 13.sp)
}

// A choice of a few options, as the web's pill buttons.
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChoicePills(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (value, label) ->
            val on = value == selected
            Text(
                label,
                color = if (on) Color.White else P.ink,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(if (on) P.brand else P.subtle)
                    .border(1.dp, if (on) P.brand else P.line, RoundedCornerShape(50))
                    .clickable { onSelect(value) }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
    }
}

// A drop-down of times ("17:00", "17:15" …).
@Composable
fun TimePicker(label: String, value: String, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val times = if (value in Dates.quarterHours) Dates.quarterHours else (Dates.quarterHours + value).sorted()
    Box(modifier) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(P.subtle)
                .border(1.dp, P.line, RoundedCornerShape(14.dp))
                .clickable { open = true }
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Text(label, color = P.inkMuted, fontSize = 12.sp)
            Text(value, color = P.ink, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            times.forEach { time ->
                DropdownMenuItem(text = { Text(time) }, onClick = {
                    onChange(time)
                    open = false
                })
            }
        }
    }
}

// The app's pop-up window: a bottom sheet with the brand header.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrandSheet(
    title: String,
    subtitle: String? = null,
    onDismiss: () -> Unit,
    primaryTitle: String? = null,
    primaryEnabled: Boolean = true,
    working: Boolean = false,
    onPrimary: () -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = P.page,
        dragHandle = null,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(P.gradient))
                .padding(horizontal = 20.dp, vertical = 18.dp),
        ) {
            Box(
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .size(width = 40.dp, height = 5.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Color.White.copy(alpha = 0.4f)),
            )
            Spacer(Modifier.height(12.dp))
            Text(title, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            if (subtitle != null) {
                Text(subtitle, color = P.accentSoft, fontSize = 14.sp)
            }
        }
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            content()
            if (primaryTitle != null) {
                PrimaryButton(primaryTitle, enabled = primaryEnabled, working = working, onClick = onPrimary)
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

// Label and value in a sheet ("Kdy" – "čtvrtek 5. 11., 17:00–18:30").
@Composable
fun InfoLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = P.inkMuted, fontSize = 14.sp)
        Spacer(Modifier.width(12.dp))
        Text(value, color = P.ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

// Shown instead of content that needs an account.
@Composable
fun SignInPrompt(icon: ImageVector, title: String, text: String, onSignIn: () -> Unit) {
    Card(padding = 22) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier.size(84.dp).clip(CircleShape).background(P.subtle),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = P.accent, modifier = Modifier.size(40.dp))
            }
            Text(title, color = P.ink, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            Text(text, color = P.inkMuted, fontSize = 15.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            PrimaryButton("Přihlásit se", onClick = onSignIn)
        }
    }
}

@Composable
fun EmptyCard(text: String) {
    Card { Muted(text) }
}
