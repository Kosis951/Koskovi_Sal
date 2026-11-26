package cz.tkkoskovi.sal

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import java.net.URLEncoder

// A dancing couple with two accounts: one asks, the other accepts, and both
// then see the lessons of either of them. Only names are shown.

@Serializable
data class PartnerPerson(val id: String = "", val name: String = "", val username: String = "")

@Serializable
data class Partnerships(
    val partner: PartnerPerson? = null,
    val incoming: List<PartnerPerson> = emptyList(),
    val outgoing: List<PartnerPerson> = emptyList(),
    val message: String? = null,
)

@Serializable
data class FoundPeople(val people: List<PartnerPerson> = emptyList())

@Composable
fun PartnerCard() {
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<Partnerships?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var searching by remember { mutableStateOf(false) }
    var confirmingEnd by remember { mutableStateOf(false) }

    suspend fun load() {
        runCatching { Api.get<Partnerships>("/api/account/partners") }.onSuccess { state = it }
    }

    fun respond(id: String, action: String) {
        scope.launch {
            runCatching { Api.send<Partnerships>("PATCH", "/api/account/partners/${Api.segment(id)}", mapOf("action" to action)) }
                .onSuccess {
                    state = it
                    message = it.message
                }
                .onFailure { message = it.message }
        }
    }

    LaunchedEffect(Unit) { load() }

    Card {
        SectionTitle("Partner/ka")
        val partner = state?.partner
        if (partner != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(partner.name, color = P.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Badge("Spojeno", P.free)
            }
            Muted("Vidíte společně svoje lekce z rozpisu a oběma chodí připomínky.", 13)
            Text(
                "Ukončit partnerství",
                color = P.busy.ink,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable { confirmingEnd = true },
            )
        } else {
            state?.incoming.orEmpty().forEach { person ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(P.training.background)
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("${person.name} tě žádá o partnerství", color = P.ink, fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PrimaryButton("Přijmout", Modifier.weight(1f)) { respond(person.id, "accept") }
                        SecondaryButton("Odmítnout", Modifier.weight(1f)) { respond(person.id, "decline") }
                    }
                }
            }
            state?.outgoing.orEmpty().forEach { person ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(person.name, color = P.ink, fontWeight = FontWeight.SemiBold)
                        Muted("Čeká na potvrzení", 12)
                    }
                    Text(
                        "Zrušit",
                        color = P.accent,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable { respond(person.id, "cancel") }.padding(8.dp),
                    )
                }
            }
            Muted("Tančíte každý na svůj účet? Najdi partnera/ku podle příjmení a pošli žádost – pak uvidíte lekce společně.", 13)
            SecondaryButton("Najít partnera/ku") { searching = true }
        }
        message?.let { Text(it, color = P.accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
    }

    if (searching) {
        PartnerSearchSheet(onDismiss = { searching = false }) { text ->
            searching = false
            message = text
            scope.launch { load() }
        }
    }

    if (confirmingEnd) {
        ConfirmDialog(
            title = "Ukončit partnerství?",
            text = "Přestanete vidět lekce toho druhého.",
            confirm = "Ukončit",
            onDismiss = { confirmingEnd = false },
        ) {
            state?.partner?.id?.let { respond(it, "end") }
        }
    }
}

@Composable
private fun PartnerSearchSheet(onDismiss: () -> Unit, onSent: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var people by remember { mutableStateOf<List<PartnerPerson>>(emptyList()) }
    var searched by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    BrandSheet(
        title = "Najít partnera/ku",
        subtitle = "Podle příjmení, vidíš jen jména",
        onDismiss = onDismiss,
        primaryTitle = "Hledat",
        primaryEnabled = query.trim().length >= 2,
        onPrimary = {
            scope.launch {
                val wanted = URLEncoder.encode(query.trim(), "UTF-8")
                runCatching { Api.get<FoundPeople>("/api/account/partners/search?q=$wanted").people }
                    .onSuccess {
                        people = it
                        searched = true
                        error = null
                    }
                    .onFailure { error = it.message }
            }
        },
    ) {
        Card { Field("Příjmení", query, { query = it }, placeholder = "např. Dvořáková") }
        if (searched && people.isEmpty()) {
            EmptyCard("Nikoho jsme nenašli. Partner/ka si musí v profilu vyplnit příjmení.")
        }
        people.forEach { person ->
            Card(padding = 14) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(person.name, color = P.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Spacer(Modifier.padding(4.dp))
                    Text(
                        "Poslat žádost",
                        color = P.accent,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.clickable {
                            scope.launch {
                                runCatching { Api.send<Partnerships>("POST", "/api/account/partners", mapOf("username" to person.username)) }
                                    .onSuccess { onSent(it.message ?: "Žádost je odeslaná.") }
                                    .onFailure { error = it.message }
                            }
                        },
                    )
                }
            }
        }
        error?.let { ErrorBanner(it) }
    }
}
