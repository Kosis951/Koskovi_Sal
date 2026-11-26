package cz.tkkoskovi.sal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

// The header of a page inside a tab (Správa → Akce): back arrow and title.
@Composable
fun SubHeader(title: String, subtitle: String? = null, onBack: () -> Unit, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Brush.linearGradient(P.gradient))
            .statusBarsPadding()
            .padding(start = 6.dp, end = 12.dp, top = 8.dp, bottom = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zpět", tint = Color.White)
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
            if (subtitle != null) Text(subtitle, color = P.accentSoft, fontSize = 13.sp)
        }
        trailing()
    }
}

// A switch with a title and an optional explanation.
@Composable
fun ToggleRow(title: String, checked: Boolean, detail: String? = null, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = P.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            if (detail != null) Text(detail, color = P.inkMuted, fontSize = 13.sp)
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = P.accent, checkedThumbColor = Color.White),
        )
    }
}

// A day ("YYYY-MM-DD") picked from a calendar.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(label: String, value: String, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }

    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(P.subtle)
            .border(1.dp, P.line, RoundedCornerShape(14.dp))
            .clickable { open = true }
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(label, color = P.inkMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        Text(Dates.dayTitle(value), color = P.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    }

    if (open) {
        val millis = Dates.date(value)?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli()
        val state = rememberDatePickerState(initialSelectedDateMillis = millis)
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let {
                        onChange(LocalDate.ofInstant(Instant.ofEpochMilli(it), ZoneOffset.UTC).toString())
                    }
                    open = false
                }) { Text("Vybrat") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Zpět") } },
        ) {
            DatePicker(state = state, showModeToggle = false)
        }
    }
}

// A number with minus and plus ("Lekcí: 10").
@Composable
fun CountStepper(label: String, value: Int, range: IntRange, onChange: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("$label: $value", color = P.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        StepButton(Icons.Filled.Remove, "Méně", value > range.first) { onChange(value - 1) }
        Spacer(Modifier.width(8.dp))
        StepButton(Icons.Filled.Add, "Více", value < range.last) { onChange(value + 1) }
    }
}

@Composable
private fun StepButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, enabled: Boolean, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.size(40.dp).clip(CircleShape).background(P.subtle),
    ) {
        Icon(icon, contentDescription = label, tint = if (enabled) P.ink else P.inkSoft)
    }
}

// "Smazat …?" in the middle of the screen.
@Composable
fun ConfirmDialog(
    title: String,
    confirm: String,
    text: String? = null,
    destructive: Boolean = true,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, fontWeight = FontWeight.Bold) },
        text = text?.let { { Text(it) } },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                onConfirm()
            }) {
                Text(confirm, color = if (destructive) P.busy.ink else P.accent, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Zpět") } },
        containerColor = P.surface,
    )
}

// Loading, error and "nothing here" of a list.
@Composable
fun ListState(loading: Boolean, error: String?, empty: Boolean, emptyText: String) {
    if (error != null) ErrorBanner(error)
    if (loading && empty) {
        Box(Modifier.fillMaxWidth().padding(vertical = 30.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = P.accent)
        }
    } else if (empty && error == null) {
        EmptyCard(emptyText)
    }
}
